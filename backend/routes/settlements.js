const express = require('express');
const router = express.Router();
const SettlementService = require('../services/settlementService');
const { ValidationService, ValidationError } = require('../services/validationService');

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

router.get('/', (req, res) => {
  try {
    const db = req.app.locals.db;
    const proposals = db.all(`
      SELECT 
        sp.id, sp.first_debt_id, sp.second_debt_id, sp.from_user_id, sp.middle_user_id, sp.to_user_id,
        sp.amount, sp.status, sp.created_at, sp.updated_at,
        u1.name as from_name, u2.name as middle_name, u3.name as to_name
      FROM settlement_proposals sp
      JOIN users u1 ON sp.from_user_id = u1.id
      JOIN users u2 ON sp.middle_user_id = u2.id
      JOIN users u3 ON sp.to_user_id = u3.id
      ORDER BY sp.created_at DESC
    `);
    res.json({ success: true, data: proposals });
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
});

router.get('/chains', (req, res) => {
  try {
    const db = req.app.locals.db;
    const chains = SettlementService.findSettlementChains(db);
    res.json({ success: true, data: chains });
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const db = req.app.locals.db;
    ValidationService.validateProposalId(req.params.id);
    
    const proposal = db.get(`
      SELECT 
        sp.id, sp.first_debt_id, sp.second_debt_id, sp.from_user_id, sp.middle_user_id, sp.to_user_id,
        sp.amount, sp.status, sp.created_at, sp.updated_at,
        u1.name as from_name, u2.name as middle_name, u3.name as to_name
      FROM settlement_proposals sp
      JOIN users u1 ON sp.from_user_id = u1.id
      JOIN users u2 ON sp.middle_user_id = u2.id
      JOIN users u3 ON sp.to_user_id = u3.id
      WHERE sp.id = ?
    `, [req.params.id]);
    
    if (!proposal) {
      return res.status(404).json({ error: true, message: 'Proposal not found' });
    }

    // Get approvals
    const approvals = db.all(`
      SELECT ar.id, ar.user_id, ar.approved, ar.approved_at, u.name
      FROM approval_records ar
      JOIN users u ON ar.user_id = u.id
      WHERE ar.proposal_id = ?
    `, [req.params.id]);
    
    res.json({ success: true, data: { ...proposal, approvals } });
  } catch (error) {
    const status = error instanceof ValidationError ? error.status : 500;
    res.status(status).json({ error: true, message: error.message });
  }
});

router.post('/proposals', (req, res) => {
  try {
    const db = req.app.locals.db;
    const { first_debt_id, second_debt_id, amount } = req.body;
    
    ValidationService.validateSettlementProposal(first_debt_id, second_debt_id, amount);
    const validatedAmount = ValidationService.validateAmount(amount);
    
    const proposalId = SettlementService.createProposal(db, first_debt_id, second_debt_id, validatedAmount);
    
    const proposal = db.get(`
      SELECT 
        sp.id, sp.first_debt_id, sp.second_debt_id, sp.from_user_id, sp.middle_user_id, sp.to_user_id,
        sp.amount, sp.status, sp.created_at,
        u1.name as from_name, u2.name as middle_name, u3.name as to_name
      FROM settlement_proposals sp
      JOIN users u1 ON sp.from_user_id = u1.id
      JOIN users u2 ON sp.middle_user_id = u2.id
      JOIN users u3 ON sp.to_user_id = u3.id
      WHERE sp.id = ?
    `, [proposalId]);
    
    res.status(201).json({ success: true, data: proposal });
  } catch (error) {
    const status = error instanceof ValidationError ? error.status : 500;
    res.status(status).json({ error: true, message: error.message });
  }
});

router.post('/:id/approve', (req, res) => {
  try {
    const db = req.app.locals.db;
    const { user_id } = req.body;
    
    ValidationService.validateApproval(req.params.id, user_id, true);
    
    SettlementService.addApproval(db, req.params.id, user_id, true);
    
    const proposal = db.get(`
      SELECT 
        sp.id, sp.first_debt_id, sp.second_debt_id, sp.from_user_id, sp.middle_user_id, sp.to_user_id,
        sp.amount, sp.status, sp.created_at,
        u1.name as from_name, u2.name as middle_name, u3.name as to_name
      FROM settlement_proposals sp
      JOIN users u1 ON sp.from_user_id = u1.id
      JOIN users u2 ON sp.middle_user_id = u2.id
      JOIN users u3 ON sp.to_user_id = u3.id
      WHERE sp.id = ?
    `, [req.params.id]);
    
    const approvals = db.all(`
      SELECT ar.id, ar.user_id, ar.approved, ar.approved_at, u.name
      FROM approval_records ar
      JOIN users u ON ar.user_id = u.id
      WHERE ar.proposal_id = ?
    `, [req.params.id]);
    
    res.json({ success: true, data: { ...proposal, approvals } });
  } catch (error) {
    const status = error instanceof ValidationError ? error.status : 500;
    res.status(status).json({ error: true, message: error.message });
  }
});

router.post('/:id/reject', (req, res) => {
  try {
    const db = req.app.locals.db;
    const { user_id } = req.body;
    
    ValidationService.validateApproval(req.params.id, user_id, false);
    
    SettlementService.addApproval(db, req.params.id, user_id, false);
    
    // Update proposal status to rejected
    db.run(
      'UPDATE settlement_proposals SET status = ?, updated_at = datetime("now") WHERE id = ?',
      ['rejected', req.params.id]
    );
    
    const proposal = db.get(`
      SELECT 
        sp.id, sp.first_debt_id, sp.second_debt_id, sp.from_user_id, sp.middle_user_id, sp.to_user_id,
        sp.amount, sp.status, sp.created_at,
        u1.name as from_name, u2.name as middle_name, u3.name as to_name
      FROM settlement_proposals sp
      JOIN users u1 ON sp.from_user_id = u1.id
      JOIN users u2 ON sp.middle_user_id = u2.id
      JOIN users u3 ON sp.to_user_id = u3.id
      WHERE sp.id = ?
    `, [req.params.id]);
    
    res.json({ success: true, data: proposal });
  } catch (error) {
    const status = error instanceof ValidationError ? error.status : 500;
    res.status(status).json({ error: true, message: error.message });
  }
});

router.post('/:id/finalize', (req, res) => {
  try {
    const db = req.app.locals.db;
    
    ValidationService.validateProposalId(req.params.id);
    
    const result = SettlementService.finalizeSettlement(db, req.params.id);
    
    const proposal = db.get(`
      SELECT 
        sp.id, sp.first_debt_id, sp.second_debt_id, sp.from_user_id, sp.middle_user_id, sp.to_user_id,
        sp.amount, sp.status, sp.created_at,
        u1.name as from_name, u2.name as middle_name, u3.name as to_name
      FROM settlement_proposals sp
      JOIN users u1 ON sp.from_user_id = u1.id
      JOIN users u2 ON sp.middle_user_id = u2.id
      JOIN users u3 ON sp.to_user_id = u3.id
      WHERE sp.id = ?
    `, [req.params.id]);
    
    res.json({ success: true, data: { proposal, result } });
  } catch (error) {
    const status = error instanceof ValidationError ? error.status : 500;
    res.status(status).json({ error: true, message: error.message });
  }
});

module.exports = router;
