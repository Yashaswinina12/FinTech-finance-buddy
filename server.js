const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const Database = require('./backend/db/database');
const { seedDatabase } = require('./backend/db/seed');

// Initialize database
const db = new Database();
db.initialize();
seedDatabase(db);

// Import routes
const userRoutes = require('./backend/routes/users');
const debtRoutes = require('./backend/routes/debts');
const settlementRoutes = require('./backend/routes/settlements');
const paymentRoutes = require('./backend/routes/payments');
const historyRoutes = require('./backend/routes/history');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Store db in app for route access
app.locals.db = db;

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'SmartSettle API is running' });
});

// API Routes
app.use('/api/users', userRoutes);
app.use('/api/debts', debtRoutes);
app.use('/api/settlements', settlementRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/history', historyRoutes);

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'frontend')));

// Serve index.html for all other routes (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: true,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
app.listen(PORT, () => {
  console.log('\n========================================');
  console.log('  SmartSettle - Smart Debt Settlement');
  console.log('========================================');
  console.log(`\n✓ Server running at: http://localhost:${PORT}`);
  console.log('✓ Database initialized');
  console.log('✓ Demo data loaded\n');
  console.log('Open http://localhost:' + PORT + ' in your browser\n');
});

module.exports = app;
