class SettlementService {
  /**
   * Find all possible settlement chains in the database
   * A chain is a sequence of debts where money can flow through multiple people
   */
  static findSettlementChains(db) {
    // Get all active debts
    const debts = db.all(`
      SELECT id, debtor_id, creditor_id, original_amount, remaining_amount, status
      FROM debts
      WHERE status IN ('active', 'partially_paid')
    `);

    if (debts.length < 2) {
      return [];
    }

    const chains = [];

    // Look for chains of length 2 (A owes B, B owes C => A can pay C directly)
    for (let i = 0; i < debts.length; i++) {
      for (let j = 0; j < debts.length; j++) {
        if (i !== j) {
          const debt1 = debts[i]; // A owes B
          const debt2 = debts[j]; // B owes C

          // Check if B is in the middle
          if (debt1.creditor_id === debt2.debtor_id) {
            const settlementAmount = Math.min(debt1.remaining_amount, debt2.remaining_amount);

            chains.push({
              chain: [debt1.debtor_id, debt1.creditor_id, debt2.creditor_id],
              firstDebtId: debt1.id,
              secondDebtId: debt2.id,
              fromUserId: debt1.debtor_id,
              middleUserId: debt1.creditor_id,
              toUserId: debt2.creditor_id,
              amount: settlementAmount,
              debts: [
                {
                  id: debt1.id,
                  from: debt1.debtor_id,
                  to: debt1.creditor_id,
                  amount: debt1.remaining_amount
                },
                {
                  id: debt2.id,
                  from: debt2.debtor_id,
                  to: debt2.creditor_id,
                  amount: debt2.remaining_amount
                }
              ]
            });
          }
        }
      }
    }

    return chains;
  }

  /**
   * Create a settlement proposal
   */
  static createProposal(db, firstDebtId, secondDebtId, amount) {
    // Get both debts to extract user IDs
    const debt1 = db.get('SELECT debtor_id, creditor_id, remaining_amount FROM debts WHERE id = ?', [firstDebtId]);
    const debt2 = db.get('SELECT debtor_id, creditor_id, remaining_amount FROM debts WHERE id = ?', [secondDebtId]);

    if (!debt1 || !debt2) {
      throw new Error('One or both debts not found');
    }

    // Validate the amount
    if (amount > debt1.remaining_amount || amount > debt2.remaining_amount) {
      throw new Error('Settlement amount exceeds remaining debt amounts');
    }

    // Extract user IDs
    const fromUserId = debt1.debtor_id;
    const middleUserId = debt1.creditor_id;
    const toUserId = debt2.creditor_id;

    // Validate chain logic
    if (middleUserId !== debt2.debtor_id) {
      throw new Error('Invalid settlement chain: middle user mismatch');
    }

    const proposalId = this.generateId();

    // Create proposal
    db.run(
      `INSERT INTO settlement_proposals 
       (id, first_debt_id, second_debt_id, from_user_id, middle_user_id, to_user_id, amount, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [proposalId, firstDebtId, secondDebtId, fromUserId, middleUserId, toUserId, amount, 'pending']
    );

    // Create approval records for all three users
    const userIds = [fromUserId, middleUserId, toUserId];
    for (const userId of userIds) {
      const approvalId = this.generateId();
      db.run(
        `INSERT INTO approval_records (id, proposal_id, user_id, approved, created_at)
         VALUES (?, ?, ?, ?, datetime('now'))`,
        [approvalId, proposalId, userId, null]
      );
    }

    return proposalId;
  }

  /**
   * Add or update an approval for a proposal
   */
  static addApproval(db, proposalId, userId, approved) {
    const approval = db.get(
      'SELECT id FROM approval_records WHERE proposal_id = ? AND user_id = ?',
      [proposalId, userId]
    );

    if (!approval) {
      throw new Error('Approval record not found');
    }

    db.run(
      `UPDATE approval_records 
       SET approved = ?, approved_at = datetime('now')
       WHERE proposal_id = ? AND user_id = ?`,
      [approved, proposalId, userId]
    );

    // Check if all approvals are done and all are true
    const approvals = db.all(
      'SELECT approved FROM approval_records WHERE proposal_id = ?',
      [proposalId]
    );

    const allApproved = approvals.every(a => a.approved === true);
    const allDone = approvals.every(a => a.approved !== null);

    if (allDone) {
      const newStatus = allApproved ? 'approved' : 'rejected';
      db.run(
        'UPDATE settlement_proposals SET status = ?, updated_at = datetime("now") WHERE id = ?',
        [newStatus, proposalId]
      );
    }
  }

  /**
   * Finalize a settlement (execute it)
   */
  static finalizeSettlement(db, proposalId) {
    const proposal = db.get(
      `SELECT first_debt_id, second_debt_id, from_user_id, middle_user_id, to_user_id, amount, status
       FROM settlement_proposals
       WHERE id = ?`,
      [proposalId]
    );

    if (!proposal) {
      throw new Error('Proposal not found');
    }

    if (proposal.status !== 'approved') {
      throw new Error('Proposal must be approved before finalization');
    }

    return db.transaction(() => {
      const { first_debt_id, second_debt_id, from_user_id, middle_user_id, to_user_id, amount } = proposal;

      // Get current debt states
      const debt1 = db.get('SELECT remaining_amount FROM debts WHERE id = ?', [first_debt_id]);
      const debt2 = db.get('SELECT remaining_amount FROM debts WHERE id = ?', [second_debt_id]);

      if (!debt1 || !debt2) {
        throw new Error('One or both debts not found');
      }

      // Validate amounts
      if (amount > debt1.remaining_amount || amount > debt2.remaining_amount) {
        throw new Error('Settlement amount exceeds current remaining amounts');
      }

      // Update debt 1: from_user pays middle_user the settlement amount
      const newRemaining1 = debt1.remaining_amount - amount;
      const newStatus1 = newRemaining1 <= 0 ? 'settled' : 'partially_paid';

      db.run(
        `UPDATE debts 
         SET remaining_amount = ?, paid_amount = paid_amount + ?, status = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [newRemaining1, amount, newStatus1, first_debt_id]
      );

      // Update debt 2: middle_user owes to_user, reduced by settlement amount
      const newRemaining2 = debt2.remaining_amount - amount;
      const newStatus2 = newRemaining2 <= 0 ? 'settled' : 'partially_paid';

      db.run(
        `UPDATE debts 
         SET remaining_amount = ?, paid_amount = paid_amount + ?, status = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [newRemaining2, amount, newStatus2, second_debt_id]
      );

      // Record payment: from_user -> to_user (skipping middle_user)
      const paymentId = this.generateId();
      db.run(
        `INSERT INTO payment_history (id, debt_id, payer_id, receiver_id, amount, payment_date, note, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'), ?, datetime('now'))`,
        [paymentId, second_debt_id, from_user_id, to_user_id, amount, `Smart settlement via ${middle_user_id}`]
      );

      // Record settlement in history
      const settlementId = this.generateId();
      db.run(
        `INSERT INTO settlement_history (id, proposal_id, from_user_id, middle_user_id, to_user_id, amount, settlement_date, status, description, created_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, datetime('now'))`,
        [
          settlementId,
          proposalId,
          from_user_id,
          middle_user_id,
          to_user_id,
          amount,
          'completed',
          `Settlement completed: ${from_user_id} paid ${to_user_id} ₹${amount} through ${middle_user_id}`
        ]
      );

      // Update proposal status
      db.run(
        'UPDATE settlement_proposals SET status = ?, updated_at = datetime("now") WHERE id = ?',
        ['finalized', proposalId]
      );

      // Add activity logs
      const activityIds = [this.generateId(), this.generateId(), this.generateId()];
      db.run(
        `INSERT INTO activity_log (id, user_id, activity_type, related_proposal_id, related_settlement_id, description, amount, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [activityIds[0], from_user_id, 'SETTLEMENT_EXECUTED', proposalId, settlementId, `Paid ₹${amount} to ${to_user_id}`, amount]
      );
      db.run(
        `INSERT INTO activity_log (id, user_id, activity_type, related_proposal_id, related_settlement_id, description, amount, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [activityIds[1], middle_user_id, 'SETTLEMENT_EXECUTED', proposalId, settlementId, `Received ₹${amount} from ${from_user_id}`, amount]
      );
      db.run(
        `INSERT INTO activity_log (id, user_id, activity_type, related_proposal_id, related_settlement_id, description, amount, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [activityIds[2], to_user_id, 'SETTLEMENT_EXECUTED', proposalId, settlementId, `Received ₹${amount} from ${from_user_id}`, amount]
      );

      return {
        success: true,
        settlementId,
        message: `Settlement completed: ${from_user_id} paid ₹${amount} to ${to_user_id}`
      };
    })();
  }

  static generateId() {
    return Math.random().toString(36).substr(2, 9);
  }
}

module.exports = SettlementService;