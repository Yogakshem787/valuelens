// ============================================================
// DATABASE MODULE - SQLite for local/low-cost deployment
// ============================================================
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'valuelens.db');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

let db;

function initDB() {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // ---- STOCKS MASTER TABLE ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS stocks (
      symbol TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      isin TEXT,
      bse_code TEXT,
      nse_symbol TEXT,
      sector TEXT,
      industry TEXT,
      market_cap_cr REAL DEFAULT 0,
      cmp REAL DEFAULT 0,
      shares_outstanding_cr REAL DEFAULT 0,
      
      -- Latest financials
      revenue_fy_cr REAL DEFAULT 0,
      pat_fy_cr REAL DEFAULT 0,
      eps REAL DEFAULT 0,
      
      -- CAGR data
      rev_cagr_3y REAL,
      rev_cagr_5y REAL,
      rev_cagr_10y REAL,
      pat_cagr_3y REAL,
      pat_cagr_5y REAL,
      pat_cagr_10y REAL,
      
      -- PE data
      current_pe REAL,
      median_pe_3y REAL,
      median_pe_5y REAL,
      median_pe_10y REAL,
      
      -- Metadata
      last_price_update TEXT,
      last_financial_update TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ---- USERS TABLE ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ---- WATCHLISTS TABLE ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlists (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT DEFAULT 'Default',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // ---- WATCHLIST ITEMS TABLE ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist_items (
      id TEXT PRIMARY KEY,
      watchlist_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      
      -- Custom assumptions
      forecast_years INTEGER,
      discount_rate REAL,
      terminal_growth REAL,
      exit_pe REAL,
      expected_pat_cagr REAL,
      
      -- Cached results
      implied_growth_rate REAL,
      implied_equity_value REAL,
      expectation_gap REAL,
      signal TEXT,
      
      -- Metadata
      notes TEXT,
      added_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      
      FOREIGN KEY (watchlist_id) REFERENCES watchlists(id),
      FOREIGN KEY (symbol) REFERENCES stocks(symbol),
      UNIQUE(watchlist_id, symbol)
    )
  `);

  // ---- PRICE HISTORY TABLE (for tracking daily implied growth) ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS price_history (
      symbol TEXT NOT NULL,
      date TEXT NOT NULL,
      cmp REAL,
      market_cap_cr REAL,
      implied_growth_rate REAL,
      PRIMARY KEY (symbol, date),
      FOREIGN KEY (symbol) REFERENCES stocks(symbol)
    )
  `);

  // ---- INDEXES ----
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_stocks_sector ON stocks(sector);
    CREATE INDEX IF NOT EXISTS idx_stocks_mcap ON stocks(market_cap_cr);
    CREATE INDEX IF NOT EXISTS idx_watchlist_items_watchlist ON watchlist_items(watchlist_id);
    CREATE INDEX IF NOT EXISTS idx_price_history_date ON price_history(date);
  `);

  console.log('[DB] Database initialized successfully');
  return db;
}

function getDB() {
  if (!db) initDB();
  return db;
}

module.exports = { initDB, getDB, get db() { return getDB(); } };
