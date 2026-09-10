class ValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
    this.name = 'ValidationError';
  }
}

class ValidationService {
  static validateUserId(userId) {
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      throw new ValidationError('Invalid user ID', 400);
    }
  }

  static validateDebtId(debtId) {
    if (!debtId || typeof debtId !== 'string' || debtId.trim() === '') {
      throw new ValidationError('Invalid debt ID', 400);
    }
  }

  static validateProposalId(proposalId) {
    if (!proposalId || typeof proposalId !== 'string' || proposalId.trim() === '') {
      throw new ValidationError('Invalid proposal ID', 400);
    }
  }

  static validateDebtCreation(debtorId, creditorId, amount, reason) {
    if (!debtorId || !creditorId) {
      throw new ValidationError('Debtor and creditor IDs are required', 400);
    }
    if (debtorId === creditorId) {
      throw new ValidationError('Debtor and creditor cannot be the same person', 400);
    }
    if (!amount || amount <= 0 || isNaN(amount)) {
      throw new ValidationError('Amount must be a valid positive number', 400);
    }
    if (!reason || typeof reason !== 'string' || reason.trim() === '') {
      throw new ValidationError('Reason is required', 400);
    }
  }

  static validateAmount(amount) {
    const parsedAmount = parseFloat(amount);
    if (!amount || parsedAmount <= 0 || isNaN(parsedAmount)) {
      throw new ValidationError('Amount must be a valid positive number', 400);
    }
    return parsedAmount;
  }

  static validateSettlementProposal(firstDebtId, secondDebtId, amount) {
    if (!firstDebtId || !secondDebtId) {
      throw new ValidationError('Both debt IDs are required', 400);
    }
    if (firstDebtId === secondDebtId) {
      throw new ValidationError('Settlement must involve two different debts', 400);
    }
    if (!amount || amount <= 0 || isNaN(amount)) {
      throw new ValidationError('Amount must be a valid positive number', 400);
    }
  }

  static validateApproval(proposalId, userId, approved) {
    if (!proposalId || typeof proposalId !== 'string' || proposalId.trim() === '') {
      throw new ValidationError('Invalid proposal ID', 400);
    }
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      throw new ValidationError('Invalid user ID', 400);
    }
    if (typeof approved !== 'boolean') {
      throw new ValidationError('Approval status must be a boolean', 400);
    }
  }

  static validatePayment(debtId, payerId, receiverId, amount) {
    if (!debtId || !payerId || !receiverId) {
      throw new ValidationError('Debt ID, payer ID, and receiver ID are required', 400);
    }
    if (payerId === receiverId) {
      throw new ValidationError('Payer and receiver cannot be the same person', 400);
    }
    if (!amount || amount <= 0 || isNaN(amount)) {
      throw new ValidationError('Amount must be a valid positive number', 400);
    }
  }
}

module.exports = { ValidationService, ValidationError };