const { v4: uuidv4 } = require('crypto').randomUUID ? { v4: () => require('crypto').randomUUID() } : require('uuid');

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

function seedDatabase(db) {
  // Check if users already exist
  const existingUsers = db.all('SELECT COUNT(*) as count FROM users');
  if (existingUsers[0].count > 0) {
    console.log('✓ Database already seeded, skipping seed data');
    return;
  }

  console.log('⏳ Seeding demo data...');

  db.transaction(() => {
    // Create users
    const userA_id = 'user_a';
    const userB_id = 'user_b';
    const userC_id = 'user_c';

    db.run(
      `INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, datetime('now'))`,
      [userA_id, 'User A', 'usera@smartsettle.local']
    );
    db.run(
      `INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, datetime('now'))`,
      [userB_id, 'User B', 'userb@smartsettle.local']
    );
    db.run(
      `INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, datetime('now'))`,
      [userC_id, 'User C', 'userc@smartsettle.local']
    );

    // Create debts for the demo scenario
    // Debt 1: C owes A ₹5,000
    const debt1_id = generateId();
    db.run(
      `INSERT INTO debts (id, debtor_id, creditor_id, original_amount, paid_amount, remaining_amount, reason, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [debt1_id, userC_id, userA_id, 5000, 0, 5000, 'Shared trip expense', 'active']
    );

    // Debt 2: A owes B ₹50,000
    const debt2_id = generateId();
    db.run(
      `INSERT INTO debts (id, debtor_id, creditor_id, original_amount, paid_amount, remaining_amount, reason, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [debt2_id, userA_id, userB_id, 50000, 0, 50000, 'Personal loan', 'active']
    );

    // Add activity log entries
    const activity1_id = generateId();
    db.run(
      `INSERT INTO activity_log (id, user_id, activity_type, related_debt_id, description, amount, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      [activity1_id, userC_id, 'DEBT_CREATED', debt1_id, 'Debt created: C owes A ₹5,000', 5000]
    );

    const activity2_id = generateId();
    db.run(
      `INSERT INTO activity_log (id, user_id, activity_type, related_debt_id, description, amount, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      [activity2_id, userA_id, 'DEBT_CREATED', debt2_id, 'Debt created: A owes B ₹50,000', 50000]
    );

    console.log('✓ Demo users created (A, B, C)');
    console.log('✓ Demo debts created');
    console.log('  - C owes A: ₹5,000 (Shared trip expense)');
    console.log('  - A owes B: ₹50,000 (Personal loan)');
    console.log('✓ Activity log initialized');
  })();
}

module.exports = { seedDatabase };
