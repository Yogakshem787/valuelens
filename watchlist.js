// ============================================================
// WATCHLIST ROUTES
// ============================================================
const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const { getDB } = require('../db');
const dcfEngine = require('../dcf-engine');
const { authMiddleware } = require('./auth');

// All watchlist routes require authentication
router.use(authMiddleware);

// ---- GET ALL WATCHLISTS ----
router.get('/', (req, res) => {
  try {
    const db = getDB();
    const watchlists = db.prepare(`
      SELECT w.*, COUNT(wi.id) as item_count
      FROM watchlists w
      LEFT JOIN watchlist_items wi ON wi.watchlist_id = w.id
      WHERE w.user_id = ?
      GROUP BY w.id
      ORDER BY w.created_at
    `).all(req.userId);
    
    res.json(watchlists);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- CREATE WATCHLIST ----
router.post('/', (req, res) => {
  try {
    const { name } = req.body;
    const db = getDB();
    const id = uuid();
    
    db.prepare('INSERT INTO watchlists (id, user_id, name) VALUES (?, ?, ?)').run(id, req.userId, name || 'My List');
    
    res.json({ id, user_id: req.userId, name: name || 'My List' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- GET WATCHLIST ITEMS WITH LIVE DATA ----
router.get('/:watchlistId/items', (req, res) => {
  try {
    const db = getDB();
    
    // Verify ownership
    const wl = db.prepare('SELECT * FROM watchlists WHERE id = ? AND user_id = ?').get(req.params.watchlistId, req.userId);
    if (!wl) return res.status(404).json({ error: 'Watchlist not found' });

    const items = db.prepare(`
      SELECT wi.*, s.name, s.sector, s.cmp, s.market_cap_cr, s.pat_fy_cr, 
             s.current_pe, s.revenue_fy_cr, s.pat_cagr_3y, s.pat_cagr_5y
      FROM watchlist_items wi
      JOIN stocks s ON s.symbol = wi.symbol
      WHERE wi.watchlist_id = ?
      ORDER BY wi.added_at DESC
    `).all(req.params.watchlistId);

    // Recalculate implied growth with latest prices
    const enrichedItems = items.map(item => {
      const mcapCr = item.market_cap_cr || (item.cmp * (item.shares_outstanding_cr || 0));
      
      if (item.pat_fy_cr > 0) {
        const impliedGrowth = dcfEngine.solveImpliedGrowthRate(
          item.pat_fy_cr, mcapCr,
          item.discount_rate, item.forecast_years, item.exit_pe
        );
        
        const impliedValue = dcfEngine.calculateImpliedEquityValue(
          item.pat_fy_cr, item.expected_pat_cagr,
          item.discount_rate, item.forecast_years, item.exit_pe
        );

        const expectationGap = item.expected_pat_cagr - (impliedGrowth || 0);

        return {
          ...item,
          implied_growth_rate: impliedGrowth,
          implied_equity_value: impliedValue,
          expectation_gap: expectationGap,
          signal: dcfEngine.getSignal(expectationGap),
          upside: mcapCr > 0 ? ((impliedValue / mcapCr) - 1) * 100 : 0,
        };
      }
      return item;
    });

    res.json(enrichedItems);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- ADD ITEM TO WATCHLIST ----
router.post('/:watchlistId/items', (req, res) => {
  try {
    const db = getDB();
    const { symbol, forecastYears, discountRate, terminalGrowth, exitPE, expectedPatCagr, notes } = req.body;
    
    // Verify ownership
    const wl = db.prepare('SELECT * FROM watchlists WHERE id = ? AND user_id = ?').get(req.params.watchlistId, req.userId);
    if (!wl) return res.status(404).json({ error: 'Watchlist not found' });

    // Get stock data for initial calculation
    const stock = db.prepare('SELECT * FROM stocks WHERE symbol = ?').get(symbol.toUpperCase());
    if (!stock) return res.status(404).json({ error: 'Stock not found' });

    const defaults = dcfEngine.getDefaultAssumptions(stock.market_cap_cr, stock.sector);
    const fy = forecastYears || defaults.forecastYears;
    const dr = discountRate || defaults.discountRate;
    const tg = terminalGrowth || defaults.terminalGrowth;
    const pe = exitPE || defaults.exitPE;
    const ec = expectedPatCagr || defaults.expectedPatCagr;

    // Calculate
    const impliedGrowth = dcfEngine.solveImpliedGrowthRate(stock.pat_fy_cr, stock.market_cap_cr, dr, fy, pe);
    const impliedValue = dcfEngine.calculateImpliedEquityValue(stock.pat_fy_cr, ec, dr, fy, pe);
    const gap = ec - (impliedGrowth || 0);

    const id = uuid();
    db.prepare(`
      INSERT OR REPLACE INTO watchlist_items 
      (id, watchlist_id, symbol, forecast_years, discount_rate, terminal_growth, exit_pe, expected_pat_cagr,
       implied_growth_rate, implied_equity_value, expectation_gap, signal, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.params.watchlistId, symbol.toUpperCase(), fy, dr, tg, pe, ec,
           impliedGrowth, impliedValue, gap, dcfEngine.getSignal(gap), notes || '');

    res.json({ id, symbol: symbol.toUpperCase(), message: 'Added to watchlist' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- UPDATE WATCHLIST ITEM ASSUMPTIONS ----
router.put('/:watchlistId/items/:itemId', (req, res) => {
  try {
    const db = getDB();
    const { forecastYears, discountRate, terminalGrowth, exitPE, expectedPatCagr, notes } = req.body;
    
    const item = db.prepare(`
      SELECT wi.*, s.pat_fy_cr, s.market_cap_cr 
      FROM watchlist_items wi JOIN stocks s ON s.symbol = wi.symbol
      WHERE wi.id = ? AND wi.watchlist_id = ?
    `).get(req.params.itemId, req.params.watchlistId);
    
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const fy = forecastYears || item.forecast_years;
    const dr = discountRate || item.discount_rate;
    const pe = exitPE || item.exit_pe;
    const ec = expectedPatCagr || item.expected_pat_cagr;

    const impliedGrowth = dcfEngine.solveImpliedGrowthRate(item.pat_fy_cr, item.market_cap_cr, dr, fy, pe);
    const impliedValue = dcfEngine.calculateImpliedEquityValue(item.pat_fy_cr, ec, dr, fy, pe);
    const gap = ec - (impliedGrowth || 0);

    db.prepare(`
      UPDATE watchlist_items SET 
        forecast_years = ?, discount_rate = ?, terminal_growth = ?, exit_pe = ?, expected_pat_cagr = ?,
        implied_growth_rate = ?, implied_equity_value = ?, expectation_gap = ?, signal = ?,
        notes = COALESCE(?, notes), updated_at = datetime('now')
      WHERE id = ?
    `).run(fy, dr, terminalGrowth || item.terminal_growth, pe, ec,
           impliedGrowth, impliedValue, gap, dcfEngine.getSignal(gap), notes, req.params.itemId);

    res.json({ message: 'Updated', impliedGrowth, expectationGap: gap });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- REMOVE ITEM FROM WATCHLIST ----
router.delete('/:watchlistId/items/:itemId', (req, res) => {
  try {
    const db = getDB();
    db.prepare('DELETE FROM watchlist_items WHERE id = ? AND watchlist_id = ?').run(req.params.itemId, req.params.watchlistId);
    res.json({ message: 'Removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- DELETE WATCHLIST ----
router.delete('/:watchlistId', (req, res) => {
  try {
    const db = getDB();
    db.prepare('DELETE FROM watchlist_items WHERE watchlist_id = ?').run(req.params.watchlistId);
    db.prepare('DELETE FROM watchlists WHERE id = ? AND user_id = ?').run(req.params.watchlistId, req.userId);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
