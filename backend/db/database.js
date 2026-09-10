const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class SmartSettleDatabase {
  constructor() {
    const dbPath = path.join(__dirname, '../../data/smartsettle.db');
    
    // Ensure data directory exists
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
  }

  initialize() {
    // Create users table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        email TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create debts table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS debts (
        id TEXT PRIMARY KEY,
        debtor_id TEXT NOT NULL,
        creditor_id TEXT NOT NULL,
        original_amount REAL NOT NULL,
        paid_amount REAL DEFAULT 0,
        remaining_amount REAL NOT NULL,
        reason TEXT,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (debtor_id) REFERENCES users(id),
        FOREIGN KEY (creditor_id) REFERENCES users(id),
        CHECK (original_amount > 0),
        CHECK (remaining_amount >= 0)
      )
    `);

    // Create payment_history table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS payment_history (
        id TEXT PRIMARY KEY,
        debt_id TEXT NOT NULL,
        payer_id TEXT NOT NULL,
        receiver_id TEXT NOT NULL,
        amount REAL NOT NULL,
        payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        note TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (debt_id) REFERENCES debts(id),
        FOREIGN KEY (payer_id) REFERENCES users(id),
        FOREIGN KEY (receiver_id) REFERENCES users(id),
        CHECK (amount > 0)
      )
    `);

    // Create settlement_proposals table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settlement_proposals (
        id TEXT PRIMARY KEY,
        first_debt_id TEXT NOT NULL,
        second_debt_id TEXT NOT NULL,
        from_user_id TEXT NOT NULL,
        middle_user_id TEXT NOT NULL,
        to_user_id TEXT NOT NULL,
        amount REAL NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (first_debt_id) REFERENCES debts(id),
        FOREIGN KEY (second_debt_id) REFERENCES debts(id),
        FOREIGN KEY (from_user_id) REFERENCES users(id),
        FOREIGN KEY (middle_user_id) REFERENCES users(id),
        FOREIGN KEY (to_user_id) REFERENCES users(id),
        CHECK (amount > 0)
      )
    `);

    // Create approval_records table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS approval_records (
        id TEXT PRIMARY KEY,
        proposal_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        approved BOOLEAN,
        approved_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (proposal_id) REFERENCES settlement_proposals(id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(proposal_id, user_id)
      )
    `);

    // Create settlement_history table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settlement_history (
        id TEXT PRIMARY KEY,
        proposal_id TEXT NOT NULL,
        from_user_id TEXT NOT NULL,
        middle_user_id TEXT NOT NULL,
        to_user_id TEXT NOT NULL,
        amount REAL NOT NULL,
        settlement_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'completed',
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (proposal_id) REFERENCES settlement_proposals(id),
        FOREIGN KEY (from_user_id) REFERENCES users(id),
        FOREIGN KEY (middle_user_id) REFERENCES users(id),
        FOREIGN KEY (to_user_id) REFERENCES users(id),
        CHECK (amount > 0)
      )
    `);

    // Create activity_log table for complete history
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        activity_type TEXT NOT NULL,
        related_debt_id TEXT,
        related_proposal_id TEXT,
        related_payment_id TEXT,
        related_settlement_id TEXT,
        description TEXT NOT NULL,
        amount REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (related_debt_id) REFERENCES debts(id),
        FOREIGN KEY (related_proposal_id) REFERENCES settlement_proposals(id),
        FOREIGN KEY (related_payment_id) REFERENCES payment_history(id),
        FOREIGN KEY (related_settlement_id) REFERENCES settlement_history(id)
      )
    `);
  }

  run(sql, params = []) {
    const stmt = this.db.prepare(sql);
    return stmt.run(...params);
  }

  get(sql, params = []) {
    const stmt = this.db.prepare(sql);
    return stmt.get(...params);
  }

  all(sql, params = []) {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }

  exec(sql) {
    return this.db.exec(sql);
  }

  transaction(fn) {
    const transaction = this.db.transaction(fn);
    return transaction();
  }

  close() {
    this.db.close();
  }
}

module.exports = SmartSettleDatabase;
