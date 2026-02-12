// ============================================================
// VALUELENS BACKEND SERVER
// ============================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cron = require('node-cron');

const { initDB, db } = require('./db');
const dcfEngine = require('./dcf-engine');
const dataFetcher = require('./data-fetcher');
const authRoutes = require('./routes/auth');
const stockRoutes = require('./routes/stocks');
const watchlistRoutes = require('./routes/watchlist');

const PORT = process.env.PORT || 5000;
const app = express();

// ---- MIDDLEWARE ----
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// ---- ROUTES ----
app.use('/api/auth', authRoutes);
app.use('/api/stocks', stockRoutes);
app.use('/api/watchlist', watchlistRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// DCF calculation endpoint (stateless - no DB needed)
app.post('/api/calculate-dcf', (req, res) => {
  try {
    const { currentPAT, marketCap, discountRate, forecastYears, exitPE, expectedPatCagr } = req.body;

    const impliedGrowth = dcfEngine.solveImpliedGrowthRate(
      currentPAT, marketCap, discountRate, forecastYears, exitPE
    );

    const impliedValue = dcfEngine.calculateImpliedEquityValue(
      currentPAT, expectedPatCagr, discountRate, forecastYears, exitPE
    );

    const expectationGap = expectedPatCagr - (impliedGrowth || 0);
    const upside = marketCap > 0 ? ((impliedValue / marketCap) - 1) * 100 : 0;

    res.json({
      impliedGrowthRate: impliedGrowth,
      impliedEquityValue: impliedValue,
      expectationGap,
      upside,
      signal: dcfEngine.getSignal(expectationGap),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get default assumptions for a stock
app.get('/api/defaults', (req, res) => {
  const { marketCapCr, sector } = req.query;
  const defaults = dcfEngine.getDefaultAssumptions(parseFloat(marketCapCr) || 0, sector || '');
  res.json(defaults);
});

// Serve frontend in production
app.use(express.static(path.join(__dirname, '../frontend/build')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
});

// ---- STARTUP ----
async function start() {
  // Initialize database
  initDB();
  
  // Seed stock master list if empty
  await dataFetcher.seedStockMaster();
  
  // Schedule daily price updates (6:30 AM IST = 1:00 AM UTC)
  cron.schedule('0 1 * * 1-5', async () => {
    console.log('[CRON] Starting daily price update...');
    await dataFetcher.updateAllPrices();
    console.log('[CRON] Daily price update complete.');
  });

  // Schedule weekly financial data update (Sunday 2 AM IST)
  cron.schedule('30 20 * * 0', async () => {
    console.log('[CRON] Starting weekly financial data update...');
    await dataFetcher.updateFinancials();
    console.log('[CRON] Weekly financial update complete.');
  });

  app.listen(PORT, () => {
    console.log(`\n🚀 ValueLens server running on port ${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   API: http://localhost:${PORT}/api/health`);
    console.log(`   Frontend: http://localhost:${PORT}\n`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
