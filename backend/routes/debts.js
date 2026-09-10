const express = require('express');
const router = express.Router();
const { ValidationService, ValidationError } = require('../services/validationService');

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

router.get('/', (req, res) => {
  try {
    const db = req.app.locals.db;
    const debts = db.all(`
      SELECT 
        d.id, d.debtor_id, d.creditor_id, d.original_amount, d.paid_amount, d.remaining_amount,
        d.reason, d.status, d.created_at, d.updated_at,
        u1.name as debtor_name, u2.name as creditor_name
      FROM debts d
      JOIN users u1 ON d.debtor_id = u1.id
      JOIN users u2 ON d.creditor_id = u2.id
      ORDER BY d.created_at DESC
    `);
    res.json({ success: true, data: debts });
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const db = req.app.locals.db;
    ValidationService.validateDebtId(req.params.id);
    
    const debt = db.get(`
      SELECT 
        d.id, d.debtor_id, d.creditor_id, d.original_amount, d.paid_amount, d.remaining_amount,
        d.reason, d.status, d.created_at, d.updated_at,
        u1.name as debtor_name, u2.name as creditor_name
      FROM debts d
      JOIN users u1 ON d.debtor_id = u1.id
      JOIN users u2 ON d.creditor_id = u2.id
      WHERE d.id = ?
    `, [req.params.id]);
    
    if (!debt) {
      return res.status(404).json({ error: true, message: 'Debt not found' });
    }

    // Get payment history for this debt
    const payments = db.all(`
      SELECT id, payer_id, receiver_id, amount, payment_date, note
      FROM payment_history
      WHERE debt_id = ?
      ORDER BY payment_date DESC
    `, [req.params.id]);
    
    res.json({ success: true, data: { ...debt, payments } });
  } catch (error) {
    const status = error instanceof ValidationError ? error.status : 500;
    res.status(status).json({ error: true, message: error.message });
  }
});

router.post('/', (req, res) => {
  try {
    const db = req.app.locals.db;
    const { debtor_id, creditor_id, amount, reason } = req.body;
    
    ValidationService.validateDebtCreation(debtor_id, creditor_id, amount, reason);
    
    // Check if users exist
    const debtor = db.get('SELECT id FROM users WHERE id = ?', [debtor_id]);
    const creditor = db.get('SELECT id FROM users WHERE id = ?', [creditor_id]);
    
    if (!debtor || !creditor) {
      return res.status(404).json({ error: true, message: 'One or both users not found' });
    }

    const debtId = generateId();
    const validatedAmount = ValidationService.validateAmount(amount);
    
    db.run(
      `INSERT INTO debts (id, debtor_id, creditor_id, original_amount, paid_amount, remaining_amount, reason, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [debtId, debtor_id, creditor_id, validatedAmount, 0, validatedAmount, reason, 'active']
    );

    // Add activity log
    const activityId = generateId();
    db.run(
      `INSERT INTO activity_log (id, user_id, activity_type, related_debt_id, description, amount, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      [activityId, debtor_id, 'DEBT_CREATED', debtId, `Debt created: ${reason}`, validatedAmount]
    );
    
    const newDebt = db.get(
      `SELECT d.id, d.debtor_id, d.creditor_id, d.original_amount, d.paid_amount, d.remaining_amount, d.reason, d.status, d.created_at,
              u1.name as debtor_name, u2.name as creditor_name
       FROM debts d
       JOIN users u1 ON d.debtor_id = u1.id
       JOIN users u2 ON d.creditor_id = u2.id
       WHERE d.id = ?`,
      [debtId]
    );
    
    res.status(201).json({ success: true, data: newDebt });
  } catch (error) {
    const status = error instanceof ValidationError ? error.status : 500;
    res.status(status).json({ error: true, message: error.message });
  }
});

module.exports = router;
