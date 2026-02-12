// ============================================================
// STOCK API ROUTES
// ============================================================
const express = require('express');
const router = express.Router();
const { getDB } = require('../db');
const dcfEngine = require('../dcf-engine');
const dataFetcher = require('../data-fetcher');

// ---- SEARCH STOCKS ----
router.get('/search', (req, res) => {
  try {
    const { q, limit = 20 } = req.query;
    if (!q || q.length < 1) return res.json([]);
    
    const results = dataFetcher.searchStocks(q, parseInt(limit));
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- GET STOCK DETAILS ----
router.get('/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const stock = await dataFetcher.getStock(symbol.toUpperCase());
    
    if (!stock) {
      return res.status(404).json({ error: 'Stock not found' });
    }
    
    res.json(stock);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- GET STOCK WITH FULL DCF ANALYSIS ----
router.get('/:symbol/analysis', async (req, res) => {
  try {
    const { symbol } = req.params;
    const stock = await dataFetcher.getStock(symbol.toUpperCase());
    
    if (!stock) {
      return res.status(404).json({ error: 'Stock not found' });
    }

    // Custom assumptions from query params
    const customAssumptions = {};
    if (req.query.forecastYears) customAssumptions.forecastYears = parseFloat(req.query.forecastYears);
    if (req.query.discountRate) customAssumptions.discountRate = parseFloat(req.query.discountRate);
    if (req.query.exitPE) customAssumptions.exitPE = parseFloat(req.query.exitPE);
    if (req.query.expectedPatCagr) customAssumptions.expectedPatCagr = parseFloat(req.query.expectedPatCagr);
    if (req.query.terminalGrowth) customAssumptions.terminalGrowth = parseFloat(req.query.terminalGrowth);

    const stockData = {
      symbol: stock.symbol,
      name: stock.name,
      sector: stock.sector,
      cmp: stock.cmp,
      marketCapCr: stock.market_cap_cr,
      sharesOutstandingCr: stock.shares_outstanding_cr,
      currentPAT: stock.pat_fy_cr,
    };

    const analysis = dcfEngine.analyzeStock(stockData, customAssumptions);
    
    // Merge in CAGR and PE data
    analysis.historicalData = {
      revCagr3y: stock.rev_cagr_3y,
      revCagr5y: stock.rev_cagr_5y,
      revCagr10y: stock.rev_cagr_10y,
      patCagr3y: stock.pat_cagr_3y,
      patCagr5y: stock.pat_cagr_5y,
      patCagr10y: stock.pat_cagr_10y,
      medianPE3y: stock.median_pe_3y,
      medianPE5y: stock.median_pe_5y,
      medianPE10y: stock.median_pe_10y,
      currentPE: stock.current_pe,
      revenueFyCr: stock.revenue_fy_cr,
    };
    
    res.json(analysis);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- BATCH ANALYSIS (for screener) ----
router.post('/batch-analysis', async (req, res) => {
  try {
    const { symbols, assumptions } = req.body;
    if (!symbols || !Array.isArray(symbols)) {
      return res.status(400).json({ error: 'symbols array required' });
    }

    const db = getDB();
    const results = [];

    for (const symbol of symbols.slice(0, 50)) { // Max 50 at a time
      const stock = db.prepare('SELECT * FROM stocks WHERE symbol = ?').get(symbol);
      if (!stock || !stock.pat_fy_cr) continue;

      const analysis = dcfEngine.analyzeStock({
        symbol: stock.symbol,
        name: stock.name,
        sector: stock.sector,
        cmp: stock.cmp,
        marketCapCr: stock.market_cap_cr,
        currentPAT: stock.pat_fy_cr,
      }, assumptions || {});

      results.push({
        ...analysis,
        currentPE: stock.current_pe,
        patCagr3y: stock.pat_cagr_3y,
      });
    }

    // Sort by expectation gap (best opportunities first)
    results.sort((a, b) => (b.results?.expectationGap || 0) - (a.results?.expectationGap || 0));
    
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- TOP STOCKS BY SECTOR ----
router.get('/sector/:sector', (req, res) => {
  try {
    const db = getDB();
    const stocks = db.prepare(`
      SELECT * FROM stocks 
      WHERE sector LIKE ? AND pat_fy_cr > 0
      ORDER BY market_cap_cr DESC
      LIMIT 50
    `).all(`%${req.params.sector}%`);
    
    res.json(stocks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- LIST ALL STOCKS (paginated) ----
router.get('/', (req, res) => {
  try {
    const db = getDB();
    const { page = 1, limit = 50, sector, minMcap, maxMcap, sortBy = 'market_cap_cr', order = 'DESC' } = req.query;
    
    let where = ['1=1'];
    const params = [];
    
    if (sector) { where.push('sector LIKE ?'); params.push(`%${sector}%`); }
    if (minMcap) { where.push('market_cap_cr >= ?'); params.push(parseFloat(minMcap)); }
    if (maxMcap) { where.push('market_cap_cr <= ?'); params.push(parseFloat(maxMcap)); }
    
    const validSorts = ['market_cap_cr', 'cmp', 'current_pe', 'symbol', 'pat_fy_cr'];
    const sort = validSorts.includes(sortBy) ? sortBy : 'market_cap_cr';
    const dir = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    const stocks = db.prepare(`
      SELECT * FROM stocks 
      WHERE ${where.join(' AND ')}
      ORDER BY ${sort} ${dir}
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), offset);
    
    const total = db.prepare(`SELECT COUNT(*) as c FROM stocks WHERE ${where.join(' AND ')}`).get(...params);
    
    res.json({
      stocks,
      total: total.c,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total.c / parseInt(limit)),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
