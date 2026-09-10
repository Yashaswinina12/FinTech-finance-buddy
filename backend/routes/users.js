const express = require('express');
const router = express.Router();
const { ValidationService, ValidationError } = require('../services/validationService');

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

router.get('/', (req, res) => {
  try {
    const db = req.app.locals.db;
    const users = db.all('SELECT id, name, email, created_at FROM users ORDER BY created_at');
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const db = req.app.locals.db;
    ValidationService.validateUserId(req.params.id);
    
    const user = db.get('SELECT id, name, email, created_at FROM users WHERE id = ?', [req.params.id]);
    if (!user) {
      return res.status(404).json({ error: true, message: 'User not found' });
    }
    
    res.json({ success: true, data: user });
  } catch (error) {
    const status = error instanceof ValidationError ? error.status : 500;
    res.status(status).json({ error: true, message: error.message });
  }
});

router.get('/:id/summary', (req, res) => {
  try {
    const db = req.app.locals.db;
    ValidationService.validateUserId(req.params.id);
    
    const user = db.get('SELECT id, name, email FROM users WHERE id = ?', [req.params.id]);
    if (!user) {
      return res.status(404).json({ error: true, message: 'User not found' });
    }

    // Get debts where user is debtor
    const owedByMe = db.all(
      `SELECT SUM(remaining_amount) as total FROM debts WHERE debtor_id = ? AND status IN ('active', 'partially_paid')`,
      [req.params.id]
    );

    // Get debts where user is creditor
    const owedToMe = db.all(
      `SELECT SUM(remaining_amount) as total FROM debts WHERE creditor_id = ? AND status IN ('active', 'partially_paid')`,
      [req.params.id]
    );

    // Get total paid
    const totalPaid = db.all(
      `SELECT SUM(amount) as total FROM payment_history WHERE payer_id = ?`,
      [req.params.id]
    );

    // Get total received
    const totalReceived = db.all(
      `SELECT SUM(amount) as total FROM payment_history WHERE receiver_id = ?`,
      [req.params.id]
    );

    res.json({
      success: true,
      data: {
        user,
        totalOwedByMe: owedByMe[0]?.total || 0,
        totalOwedToMe: owedToMe[0]?.total || 0,
        totalPaid: totalPaid[0]?.total || 0,
        totalReceived: totalReceived[0]?.total || 0,
        outstanding: (owedByMe[0]?.total || 0) - (owedToMe[0]?.total || 0)
      }
    });
  } catch (error) {
    const status = error instanceof ValidationError ? error.status : 500;
    res.status(status).json({ error: true, message: error.message });
  }
});

router.get('/:id/history', (req, res) => {
  try {
    const db = req.app.locals.db;
    ValidationService.validateUserId(req.params.id);
    
    const user = db.get('SELECT id, name FROM users WHERE id = ?', [req.params.id]);
    if (!user) {
      return res.status(404).json({ error: true, message: 'User not found' });
    }

    // Get money I owe
    const moneyIOwe = db.all(
      `SELECT 
        d.id, d.debtor_id, d.creditor_id, d.original_amount, d.paid_amount, d.remaining_amount,
        d.reason, d.status, d.created_at, d.updated_at,
        u.name as creditor_name
      FROM debts d
      JOIN users u ON d.creditor_id = u.id
      WHERE d.debtor_id = ?
      ORDER BY d.created_at DESC`,
      [req.params.id]
    );

    // Get money owed to me
    const moneyOwedToMe = db.all(
      `SELECT 
        d.id, d.debtor_id, d.creditor_id, d.original_amount, d.paid_amount, d.remaining_amount,
        d.reason, d.status, d.created_at, d.updated_at,
        u.name as debtor_name
      FROM debts d
      JOIN users u ON d.debtor_id = u.id
      WHERE d.creditor_id = ?
      ORDER BY d.created_at DESC`,
      [req.params.id]
    );

    // Get payment history
    const paymentHistory = db.all(
      `SELECT 
        ph.id, ph.debt_id, ph.payer_id, ph.receiver_id, ph.amount, ph.payment_date, ph.note,
        u1.name as payer_name, u2.name as receiver_name
      FROM payment_history ph
      JOIN users u1 ON ph.payer_id = u1.id
      JOIN users u2 ON ph.receiver_id = u2.id
      WHERE ph.payer_id = ? OR ph.receiver_id = ?
      ORDER BY ph.payment_date DESC`,
      [req.params.id, req.params.id]
    );

    // Get settlement history
    const settlementHistory = db.all(
      `SELECT 
        sh.id, sh.proposal_id, sh.from_user_id, sh.middle_user_id, sh.to_user_id, sh.amount,
        sh.settlement_date, sh.status, sh.description,
        u1.name as from_name, u2.name as middle_name, u3.name as to_name
      FROM settlement_history sh
      JOIN users u1 ON sh.from_user_id = u1.id
      JOIN users u2 ON sh.middle_user_id = u2.id
      JOIN users u3 ON sh.to_user_id = u3.id
      WHERE sh.from_user_id = ? OR sh.middle_user_id = ? OR sh.to_user_id = ?
      ORDER BY sh.settlement_date DESC`,
      [req.params.id, req.params.id, req.params.id]
    );

    // Get activity log
    const activityLog = db.all(
      `SELECT id, user_id, activity_type, related_debt_id, related_proposal_id, 
              related_payment_id, related_settlement_id, description, amount, created_at
      FROM activity_log
      WHERE user_id = ?
      ORDER BY created_at DESC`,
      [req.params.id]
    );

    res.json({
      success: true,
      data: {
        user,
        moneyIOwe,
        moneyOwedToMe,
        paymentHistory,
        settlementHistory,
        activityLog
      }
    });
  } catch (error) {
    const status = error instanceof ValidationError ? error.status : 500;
    res.status(status).json({ error: true, message: error.message });
  }
});

module.exports = router;
