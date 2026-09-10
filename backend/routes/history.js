const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  try {
    const db = req.app.locals.db;
    const history = db.all(`
      SELECT id, user_id, activity_type, related_debt_id, related_proposal_id, 
             related_payment_id, related_settlement_id, description, amount, created_at
      FROM activity_log
      ORDER BY created_at DESC
    `);
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
});

router.get('/settlements', (req, res) => {
  try {
    const db = req.app.locals.db;
    const settlements = db.all(`
      SELECT 
        sh.id, sh.proposal_id, sh.from_user_id, sh.middle_user_id, sh.to_user_id, sh.amount,
        sh.settlement_date, sh.status, sh.description,
        u1.name as from_name, u2.name as middle_name, u3.name as to_name
      FROM settlement_history sh
      JOIN users u1 ON sh.from_user_id = u1.id
      JOIN users u2 ON sh.middle_user_id = u2.id
      JOIN users u3 ON sh.to_user_id = u3.id
      ORDER BY sh.settlement_date DESC
    `);
    res.json({ success: true, data: settlements });
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
});

router.get('/activity/timeline', (req, res) => {
  try {
    const db = req.app.locals.db;
    const timeline = db.all(`
      SELECT id, user_id, activity_type, description, amount, created_at
      FROM activity_log
      ORDER BY created_at DESC
      LIMIT 100
    `);
    res.json({ success: true, data: timeline });
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
});

module.exports = router;
