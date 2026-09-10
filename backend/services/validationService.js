/**
 * Validation Service
 * Centralized input validation and error handling
 */

class ValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

class ValidationService {
  static validateUserId(userId) {
    if (!userId || typeof userId !== 'string') {
      throw new ValidationError('Invalid user ID');
    }
    return userId;
  }

  static validateDebtId(debtId) {
    if (!debtId || typeof debtId !== 'string') {
      throw new ValidationError('Invalid debt ID');
    }
    return debtId;
  }

  static validateProposalId(proposalId) {
    if (!proposalId || typeof proposalId !== 'string') {
      throw new ValidationError('Invalid proposal ID');
    }
    return proposalId;
  }

  static validateAmount(amount) {
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      throw new ValidationError('Amount must be a positive number');
    }
    return num;
  }

  static validateString(str, fieldName, maxLength = 500) {
    if (typeof str !== 'string' || str.trim().length === 0) {
      throw new ValidationError(`${fieldName} is required`);
    }
    if (str.length > maxLength) {
      throw new ValidationError(`${fieldName} exceeds maximum length of ${maxLength}`);
    }
    return str.trim();
  }

  static validateDebtCreation(debtorId, creditorId, amount, reason) {
    this.validateUserId(debtorId);
    this.validateUserId(creditorId);
    this.validateAmount(amount);
    this.validateString(reason, 'Reason', 200);

    if (debtorId === creditorId) {
      throw new ValidationError('Debtor and creditor must be different users');
    }

    return { debtorId, creditorId, amount, reason };
  }

  static validatePayment(debtId, amount, note) {
    this.validateDebtId(debtId);
    this.validateAmount(amount);
    if (note) {
      this.validateString(note, 'Note', 200);
    }

    return { debtId, amount, note };
  }

  static validateSettlementProposal(firstDebtId, secondDebtId, amount) {
    this.validateDebtId(firstDebtId);
    this.validateDebtId(secondDebtId);
    this.validateAmount(amount);

    if (firstDebtId === secondDebtId) {
      throw new ValidationError('Cannot create settlement between the same debt');
    }

    return { firstDebtId, secondDebtId, amount };
  }

  static validateApproval(proposalId, userId, approved) {
    this.validateProposalId(proposalId);
    this.validateUserId(userId);

    if (typeof approved !== 'boolean') {
      throw new ValidationError('Approved must be a boolean value');
    }

    return { proposalId, userId, approved };
  }
}

module.exports = { ValidationService, ValidationError };
