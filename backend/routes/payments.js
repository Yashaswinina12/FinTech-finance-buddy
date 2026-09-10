const express = require('express');
const router = express.Router();
const { ValidationService, ValidationError } = require('../services/validationService');

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

router.post('/', (req, res) => {
  try {
    const db = req.app.locals.db;
    const { debt_id, amount, note } = req.body;
    
    ValidationService.validatePayment(debt_id, amount, note);
    const validatedAmount = ValidationService.validateAmount(amount);
    
    // Get debt details
    const debt = db.get(
      'SELECT debtor_id, creditor_id, remaining_amount, paid_amount, original_amount FROM debts WHERE id = ?',
      [debt_id]
    );
    
    if (!debt) {
      return res.status(404).json({ error: true, message: 'Debt not found' });
    }

    if (debt.remaining_amount <= 0) {
      return res.status(400).json({ error: true, message: 'This debt is already settled' });
    }

    if (validatedAmount > debt.remaining_amount) {
      return res.status(400).json({ 
        error: true, 
        message: `Payment exceeds remaining balance of ₹${debt.remaining_amount}` 
      });
    }

    // Record payment
    const paymentId = generateId();
    db.run(
      `INSERT INTO payment_history (id, debt_id, payer_id, receiver_id, amount, payment_date, note, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'), ?, datetime('now'))`,
      [paymentId, debt_id, debt.debtor_id, debt.creditor_id, validatedAmount, note || null]
    );

    // Update debt
    const newPaidAmount = debt.paid_amount + validatedAmount;
    const newRemainingAmount = debt.remaining_amount - validatedAmount;
    const newStatus = newRemainingAmount === 0 ? 'settled' : 'partially_paid';

    db.run(
      `UPDATE debts SET paid_amount = ?, remaining_amount = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
      [newPaidAmount, newRemainingAmount, newStatus, debt_id]
    );

    // Add activity log
    const activityId = generateId();
    db.run(
      `INSERT INTO activity_log (id, user_id, activity_type, related_debt_id, related_payment_id, description, amount, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [activityId, debt.debtor_id, 'PAYMENT_MADE', debt_id, paymentId, `Payment of ₹${validatedAmount} recorded`, validatedAmount]
    );
    
    const updatedDebt = db.get(
      `SELECT d.id, d.debtor_id, d.creditor_id, d.original_amount, d.paid_amount, d.remaining_amount, d.reason, d.status,
              u1.name as debtor_name, u2.name as creditor_name
       FROM debts d
       JOIN users u1 ON d.debtor_id = u1.id
       JOIN users u2 ON d.creditor_id = u2.id
       WHERE d.id = ?`,
      [debt_id]
    );
    
    res.status(201).json({ 
      success: true, 
      data: { payment: { id: paymentId, amount: validatedAmount }, debt: updatedDebt }
    });
  } catch (error) {
    const status = error instanceof ValidationError ? error.status : 500;
    res.status(status).json({ error: true, message: error.message });
  }
});

module.exports = router;
