/**
 * SmartSettle Algorithm Service
 * Implements the core settlement chain detection and recommendation logic
 */

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

class SettlementService {
  /**
   * Find settlement chains in the debt network
   * Algorithm: Detects A->B->C chains where debts can be settled
   */
  static findSettlementChains(db) {
    try {
      // Get all active debts with user details
      const debts = db.all(`
        SELECT 
          d.id,
          d.debtor_id,
          d.creditor_id,
          d.original_amount,
          d.paid_amount,
          d.remaining_amount,
          d.reason,
          d.status,
          d.created_at,
          u1.name as debtor_name,
          u2.name as creditor_name
        FROM debts d
        JOIN users u1 ON d.debtor_id = u1.id
        JOIN users u2 ON d.creditor_id = u2.id
        WHERE d.status IN ('active', 'partially_paid')
        AND d.remaining_amount > 0
        ORDER BY d.created_at
      `);

      const chains = [];

      // Look for two-debt chains: A owes B, B owes C
      for (let i = 0; i < debts.length; i++) {
        for (let j = 0; j < debts.length; j++) {
          if (i !== j) {
            const debt1 = debts[i]; // A owes B
            const debt2 = debts[j]; // B owes C

            // Check if creditor of first debt is debtor of second debt
            if (debt1.creditor_id === debt2.debtor_id) {
              // Found chain: debt1.debtor -> debt1.creditor -> debt2.creditor
              const settlementAmount = Math.min(
                debt1.remaining_amount,
                debt2.remaining_amount
              );

              if (settlementAmount > 0) {
                chains.push({
                  type: 'two_debt_chain',
                  first_debt: {
                    id: debt1.id,
                    from: debt1.debtor_name,
                    from_id: debt1.debtor_id,
                    to: debt1.creditor_name,
                    to_id: debt1.creditor_id,
                    amount: debt1.remaining_amount
                  },
                  second_debt: {
                    id: debt2.id,
                    from: debt2.debtor_name,
                    from_id: debt2.debtor_id,
                    to: debt2.creditor_name,
                    to_id: debt2.creditor_id,
                    amount: debt2.remaining_amount
                  },
                  settlement: {
                    from_id: debt1.debtor_id,
                    from_name: debt1.debtor_name,
                    middle_id: debt1.creditor_id,
                    middle_name: debt1.creditor_name,
                    to_id: debt2.creditor_id,
                    to_name: debt2.creditor_name,
                    amount: settlementAmount,
                    description: `Direct payment from ${debt1.debtor_name} to ${debt2.creditor_name}, reducing intermediate debt`
                  }
                });
              }
            }
          }
        }
      }

      return chains;
    } catch (error) {
      console.error('Error finding settlement chains:', error);
      throw error;
    }
  }

  /**
   * Create a settlement proposal
   */
  static createProposal(db, firstDebtId, secondDebtId, settlementAmount) {
    try {
      // Get debt details
      const debt1 = db.get(
        'SELECT debtor_id, creditor_id, remaining_amount FROM debts WHERE id = ?',
        [firstDebtId]
      );
      const debt2 = db.get(
        'SELECT debtor_id, creditor_id, remaining_amount FROM debts WHERE id = ?',
        [secondDebtId]
      );

      if (!debt1 || !debt2) {
        throw new Error('Debt not found');
      }

      // Validate chain
      if (debt1.creditor_id !== debt2.debtor_id) {
        throw new Error('Invalid chain: debts do not form a valid settlement route');
      }

      // Validate amount
      if (settlementAmount <= 0) {
        throw new Error('Settlement amount must be greater than 0');
      }

      if (settlementAmount > debt1.remaining_amount) {
        throw new Error('Settlement amount exceeds first debt remaining balance');
      }

      if (settlementAmount > debt2.remaining_amount) {
        throw new Error('Settlement amount exceeds second debt remaining balance');
      }

      const proposalId = generateId();

      db.run(
        `INSERT INTO settlement_proposals 
        (id, first_debt_id, second_debt_id, from_user_id, middle_user_id, to_user_id, amount, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          proposalId,
          firstDebtId,
          secondDebtId,
          debt1.debtor_id,
          debt1.creditor_id,
          debt2.creditor_id,
          settlementAmount,
          'pending'
        ]
      );

      // Add activity log
      const activityId = generateId();
      db.run(
        `INSERT INTO activity_log 
        (id, user_id, activity_type, related_proposal_id, description, amount, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          activityId,
          debt1.debtor_id,
          'SETTLEMENT_PROPOSED',
          proposalId,
          `Settlement proposal created: ₹${settlementAmount}`,
          settlementAmount
        ]
      );

      return proposalId;
    } catch (error) {
      console.error('Error creating proposal:', error);
      throw error;
    }
  }

  /**
   * Add approval record for a proposal
   */
  static addApproval(db, proposalId, userId, approved) {
    try {
      const proposal = db.get(
        'SELECT * FROM settlement_proposals WHERE id = ?',
        [proposalId]
      );

      if (!proposal) {
        throw new Error('Proposal not found');
      }

      if (proposal.status !== 'pending') {
        throw new Error(`Cannot approve a ${proposal.status} proposal`);
      }

      // Check if user is involved in the settlement
      const isInvolved = [
        proposal.from_user_id,
        proposal.middle_user_id,
        proposal.to_user_id
      ].includes(userId);

      if (!isInvolved) {
        throw new Error('User is not involved in this settlement');
      }

      const approvalId = generateId();

      db.run(
        `INSERT OR REPLACE INTO approval_records 
        (id, proposal_id, user_id, approved, approved_at, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        [approvalId, proposalId, userId, approved ? 1 : 0, new Date().toISOString()]
      );

      // Add activity log
      const activityId = generateId();
      const action = approved ? 'SETTLEMENT_APPROVED' : 'SETTLEMENT_REJECTED';
      const description = approved 
        ? `Settlement proposal approved by user` 
        : `Settlement proposal rejected by user`;
      
      db.run(
        `INSERT INTO activity_log 
        (id, user_id, activity_type, related_proposal_id, description, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        [activityId, userId, action, proposalId, description]
      );

      return approvalId;
    } catch (error) {
      console.error('Error adding approval:', error);
      throw error;
    }
  }

  /**
   * Check if all required approvals are in place
   */
  static checkAllApprovalsComplete(db, proposalId) {
    try {
      const proposal = db.get(
        'SELECT * FROM settlement_proposals WHERE id = ?',
        [proposalId]
      );

      if (!proposal) {
        throw new Error('Proposal not found');
      }

      const requiredUsers = [
        proposal.from_user_id,
        proposal.middle_user_id,
        proposal.to_user_id
      ];

      const approvals = db.all(
        'SELECT user_id, approved FROM approval_records WHERE proposal_id = ?',
        [proposalId]
      );

      if (approvals.length !== requiredUsers.length) {
        return false;
      }

      return approvals.every(a => a.approved === 1);
    } catch (error) {
      console.error('Error checking approvals:', error);
      throw error;
    }
  }

  /**
   * Finalize settlement and update debt balances
   */
  static finalizeSettlement(db, proposalId) {
    try {
      const proposal = db.get(
        'SELECT * FROM settlement_proposals WHERE id = ?',
        [proposalId]
      );

      if (!proposal) {
        throw new Error('Proposal not found');
      }

      if (proposal.status !== 'pending') {
        throw new Error(`Cannot finalize a ${proposal.status} proposal`);
      }

      if (!this.checkAllApprovalsComplete(db, proposalId)) {
        throw new Error('Not all required approvals are in place');
      }

      return db.transaction(() => {
        // Get the two debts
        const debt1 = db.get('SELECT * FROM debts WHERE id = ?', [proposal.first_debt_id]);
        const debt2 = db.get('SELECT * FROM debts WHERE id = ?', [proposal.second_debt_id]);

        const amount = proposal.amount;

        // Update debt 1: reduce remaining amount
        const newRemaining1 = debt1.remaining_amount - amount;
        const newPaid1 = debt1.paid_amount + amount;
        const newStatus1 = newRemaining1 === 0 ? 'settled' : 'partially_paid';

        db.run(
          `UPDATE debts 
          SET paid_amount = ?, remaining_amount = ?, status = ?, updated_at = datetime('now')
          WHERE id = ?`,
          [newPaid1, newRemaining1, newStatus1, proposal.first_debt_id]
        );

        // Update debt 2: reduce remaining amount
        const newRemaining2 = debt2.remaining_amount - amount;
        const newPaid2 = debt2.paid_amount + amount;
        const newStatus2 = newRemaining2 === 0 ? 'settled' : 'partially_paid';

        db.run(
          `UPDATE debts 
          SET paid_amount = ?, remaining_amount = ?, status = ?, updated_at = datetime('now')
          WHERE id = ?`,
          [newPaid2, newRemaining2, newStatus2, proposal.second_debt_id]
        );

        // Record the settlement in payment_history
        const paymentId = generateId();
        db.run(
          `INSERT INTO payment_history 
          (id, debt_id, payer_id, receiver_id, amount, payment_date, note, created_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'), ?, datetime('now'))`,
          [
            paymentId,
            proposal.first_debt_id,
            proposal.from_user_id,
            proposal.to_user_id,
            amount,
            `Settlement via ${proposal.middle_user_id}`
          ]
        );

        // Record in settlement_history
        const settlementId = generateId();
        db.run(
          `INSERT INTO settlement_history 
          (id, proposal_id, from_user_id, middle_user_id, to_user_id, amount, settlement_date, status, description, created_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, datetime('now'))`,
          [
            settlementId,
            proposalId,
            proposal.from_user_id,
            proposal.middle_user_id,
            proposal.to_user_id,
            amount,
            'completed',
            `Settlement completed: Direct payment channel established`
          ]
        );

        // Update proposal status
        db.run(
          `UPDATE settlement_proposals SET status = ?, updated_at = datetime('now') WHERE id = ?`,
          ['completed', proposalId]
        );

        // Add activity logs
        const activityId = generateId();
        db.run(
          `INSERT INTO activity_log 
          (id, user_id, activity_type, related_settlement_id, description, amount, created_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
          [
            activityId,
            proposal.from_user_id,
            'SETTLEMENT_COMPLETED',
            settlementId,
            `Settlement finalized: ₹${amount} transferred`,
            amount
          ]
        );

        return {
          settlementId,
          paymentId,
          amount,
          debt1Updated: { remaining: newRemaining1, status: newStatus1 },
          debt2Updated: { remaining: newRemaining2, status: newStatus2 }
        };
      })();
    } catch (error) {
      console.error('Error finalizing settlement:', error);
      throw error;
    }
  }
}

module.exports = SettlementService;
