// ============================================================
// DATA FETCHER - Multi-source data fetching for Indian stocks
// ============================================================
// 
// DATA SOURCE PRIORITY:
// 1. Yahoo Finance (free, no API key) — prices, basic financials
// 2. FMP API (paid, $29/mo) — comprehensive financials, CAGR
// 3. NSE India direct API — live prices (can be rate-limited)
//
// For PRODUCTION with all features, you need FMP API ($29/month)
// For DEVELOPMENT/MVP, Yahoo Finance alone works for 80% of features
// ============================================================

const { getDB } = require('./db');
const dcfEngine = require('./dcf-engine');

const FMP_API_KEY = process.env.FMP_API_KEY;
const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const USE_YAHOO = process.env.USE_YAHOO === 'true';

// ---- NIFTY 500 STOCK LIST (Master list of Indian stocks) ----
// In production, this would be fetched from NSE. Here's a curated list.
const INDIAN_STOCKS_MASTER = require('./stock-master.json');

async function fetchWithTimeout(url, options = {}, timeout = 15000) {
  const fetch = (await import('node-fetch')).default;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ============================================================
// YAHOO FINANCE DATA FETCHER (Free)
// ============================================================

async function fetchYahooQuote(symbol) {
  try {
    const nseSymbol = `${symbol}.NS`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${nseSymbol}?interval=1d&range=1d`;
    
    const resp = await fetchWithTimeout(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ValuLens/1.0)' }
    });
    
    if (!resp.ok) return null;
    const data = await resp.json();
    const meta = data?.chart?.result?.[0]?.meta;
    
    if (!meta) return null;
    
    return {
      cmp: meta.regularMarketPrice || 0,
      previousClose: meta.previousClose || 0,
      volume: meta.regularMarketVolume || 0,
    };
  } catch (err) {
    console.warn(`[Yahoo] Failed to fetch ${symbol}:`, err.message);
    return null;
  }
}

async function fetchYahooSummary(symbol) {
  try {
    const nseSymbol = `${symbol}.NS`;
    const modules = 'price,summaryDetail,defaultKeyStatistics,financialData,summaryProfile';
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${nseSymbol}?modules=${modules}`;
    
    const resp = await fetchWithTimeout(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ValueLens/1.0)' }
    });
    
    if (!resp.ok) {
      // Try BSE
      const bseUrl = url.replace('.NS', '.BO');
      const bseResp = await fetchWithTimeout(bseUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ValueLens/1.0)' }
      });
      if (!bseResp.ok) return null;
      const bseData = await bseResp.json();
      return parseYahooSummary(bseData, symbol);
    }
    
    const data = await resp.json();
    return parseYahooSummary(data, symbol);
  } catch (err) {
    console.warn(`[Yahoo] Failed summary for ${symbol}:`, err.message);
    return null;
  }
}

function parseYahooSummary(data, symbol) {
  const result = data?.quoteSummary?.result?.[0];
  if (!result) return null;

  const price = result.price || {};
  const stats = result.defaultKeyStatistics || {};
  const financial = result.financialData || {};
  const profile = result.summaryProfile || {};
  const detail = result.summaryDetail || {};

  const marketCap = (price.marketCap?.raw || 0) / 10000000; // to Cr
  const revenue = (financial.totalRevenue?.raw || 0) / 10000000;
  const profitMargin = financial.profitMargins?.raw || 0;
  const pat = revenue * profitMargin;

  return {
    symbol,
    name: price.longName || price.shortName || symbol,
    sector: profile.sector || '',
    industry: profile.industry || '',
    cmp: price.regularMarketPrice?.raw || 0,
    marketCapCr: marketCap,
    sharesOutstandingCr: (stats.sharesOutstanding?.raw || 0) / 10000000,
    revenueFyCr: revenue,
    patFyCr: pat > 0 ? pat : 0,
    eps: detail.trailingEps?.raw || 0,
    currentPE: detail.trailingPE?.raw || 0,
    forwardPE: detail.forwardPE?.raw || 0,
  };
}

// ============================================================
// FMP API DATA FETCHER ($29/month - RECOMMENDED for production)
// ============================================================

async function fetchFMPProfile(symbol) {
  if (!FMP_API_KEY || FMP_API_KEY === 'your_fmp_api_key_here') return null;
  
  try {
    const url = `https://financialmodelingprep.com/api/v3/profile/${symbol}.NS?apikey=${FMP_API_KEY}`;
    const resp = await fetchWithTimeout(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.[0] || null;
  } catch (err) {
    console.warn(`[FMP] Failed profile for ${symbol}:`, err.message);
    return null;
  }
}

async function fetchFMPFinancials(symbol) {
  if (!FMP_API_KEY || FMP_API_KEY === 'your_fmp_api_key_here') return null;
  
  try {
    const url = `https://financialmodelingprep.com/api/v3/income-statement/${symbol}.NS?period=annual&limit=10&apikey=${FMP_API_KEY}`;
    const resp = await fetchWithTimeout(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    return data || [];
  } catch (err) {
    console.warn(`[FMP] Failed financials for ${symbol}:`, err.message);
    return null;
  }
}

/**
 * Calculate CAGR from array of annual values
 */
function calculateCAGR(values, years) {
  if (!values || values.length < years + 1) return null;
  const start = values[years]; // older value
  const end = values[0];       // latest value
  if (start <= 0 || end <= 0) return null;
  return (Math.pow(end / start, 1 / years) - 1) * 100;
}

/**
 * Compute CAGR data from FMP financial statements
 */
function computeCAGRs(financials) {
  if (!financials || financials.length === 0) return {};
  
  const revenues = financials.map(f => f.revenue / 10000000); // to Cr
  const pats = financials.map(f => f.netIncome / 10000000);

  return {
    revCagr3y: calculateCAGR(revenues, 3),
    revCagr5y: calculateCAGR(revenues, 5),
    revCagr10y: calculateCAGR(revenues, Math.min(10, revenues.length - 1)),
    patCagr3y: calculateCAGR(pats, 3),
    patCagr5y: calculateCAGR(pats, 5),
    patCagr10y: calculateCAGR(pats, Math.min(10, pats.length - 1)),
  };
}

// ============================================================
// COMBINED DATA FETCHER
// ============================================================

/**
 * Fetch complete stock data from best available source
 */
async function fetchStockData(symbol) {
  console.log(`[Data] Fetching data for ${symbol}...`);
  
  // Try FMP first (most comprehensive)
  if (FMP_API_KEY && FMP_API_KEY !== 'your_fmp_api_key_here') {
    const profile = await fetchFMPProfile(symbol);
    const financials = await fetchFMPFinancials(symbol);
    
    if (profile) {
      const cagrs = computeCAGRs(financials);
      return {
        symbol,
        name: profile.companyName || symbol,
        sector: profile.sector || '',
        industry: profile.industry || '',
        cmp: profile.price || 0,
        marketCapCr: (profile.mktCap || 0) / 10000000,
        sharesOutstandingCr: (profile.sharesOutstanding || 0) / 10000000,
        revenueFyCr: financials?.[0] ? financials[0].revenue / 10000000 : 0,
        patFyCr: financials?.[0] ? Math.max(financials[0].netIncome / 10000000, 0) : 0,
        eps: profile.eps || 0,
        currentPE: profile.pe || 0,
        ...cagrs,
        source: 'FMP',
      };
    }
  }

  // Fallback to Yahoo Finance
  const yahoo = await fetchYahooSummary(symbol);
  if (yahoo) {
    return { ...yahoo, source: 'Yahoo' };
  }

  return null;
}

// ============================================================
// DATABASE OPERATIONS
// ============================================================

/**
 * Seed the stock master list (Nifty 500 + additional stocks)
 */
async function seedStockMaster() {
  const db = getDB();
  const count = db.prepare('SELECT COUNT(*) as c FROM stocks').get();
  
  if (count.c > 0) {
    console.log(`[DB] Stock master already has ${count.c} stocks`);
    return;
  }

  console.log('[DB] Seeding stock master list...');
  
  let masterList;
  try {
    masterList = INDIAN_STOCKS_MASTER;
  } catch {
    console.log('[DB] No master list found, will seed on first search');
    return;
  }

  const insert = db.prepare(`
    INSERT OR IGNORE INTO stocks (symbol, name, sector, industry, market_cap_cr)
    VALUES (@symbol, @name, @sector, @industry, @marketCapCr)
  `);

  const insertMany = db.transaction((stocks) => {
    for (const stock of stocks) {
      insert.run({
        symbol: stock.symbol,
        name: stock.name,
        sector: stock.sector || '',
        industry: stock.industry || '',
        marketCapCr: stock.marketCapCr || 0,
      });
    }
  });

  insertMany(masterList);
  console.log(`[DB] Seeded ${masterList.length} stocks`);
}

/**
 * Update prices for all stocks in DB
 */
async function updateAllPrices() {
  const db = getDB();
  const stocks = db.prepare('SELECT symbol FROM stocks ORDER BY market_cap_cr DESC LIMIT 500').all();
  
  console.log(`[Update] Updating prices for ${stocks.length} stocks...`);
  let updated = 0;
  
  for (const { symbol } of stocks) {
    try {
      const quote = await fetchYahooQuote(symbol);
      if (quote && quote.cmp > 0) {
        db.prepare(`
          UPDATE stocks SET cmp = ?, last_price_update = datetime('now'), updated_at = datetime('now')
          WHERE symbol = ?
        `).run(quote.cmp, symbol);
        
        // Also update market cap
        const stock = db.prepare('SELECT shares_outstanding_cr FROM stocks WHERE symbol = ?').get(symbol);
        if (stock && stock.shares_outstanding_cr > 0) {
          const mcap = quote.cmp * stock.shares_outstanding_cr;
          db.prepare('UPDATE stocks SET market_cap_cr = ? WHERE symbol = ?').run(mcap, symbol);
        }
        
        updated++;
      }
      
      // Rate limit: ~2 requests per second
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.warn(`[Update] Failed for ${symbol}:`, err.message);
    }
  }
  
  console.log(`[Update] Updated ${updated}/${stocks.length} stocks`);
}

/**
 * Update full financial data for all stocks
 */
async function updateFinancials() {
  const db = getDB();
  const stocks = db.prepare('SELECT symbol FROM stocks ORDER BY market_cap_cr DESC LIMIT 200').all();
  
  console.log(`[Update] Updating financials for ${stocks.length} stocks...`);
  let updated = 0;
  
  for (const { symbol } of stocks) {
    try {
      const data = await fetchStockData(symbol);
      if (data) {
        db.prepare(`
          UPDATE stocks SET 
            name = COALESCE(?, name),
            sector = COALESCE(?, sector),
            industry = COALESCE(?, industry),
            cmp = COALESCE(?, cmp),
            market_cap_cr = COALESCE(?, market_cap_cr),
            shares_outstanding_cr = COALESCE(?, shares_outstanding_cr),
            revenue_fy_cr = COALESCE(?, revenue_fy_cr),
            pat_fy_cr = COALESCE(?, pat_fy_cr),
            eps = COALESCE(?, eps),
            current_pe = COALESCE(?, current_pe),
            rev_cagr_3y = COALESCE(?, rev_cagr_3y),
            rev_cagr_5y = COALESCE(?, rev_cagr_5y),
            rev_cagr_10y = COALESCE(?, rev_cagr_10y),
            pat_cagr_3y = COALESCE(?, pat_cagr_3y),
            pat_cagr_5y = COALESCE(?, pat_cagr_5y),
            pat_cagr_10y = COALESCE(?, pat_cagr_10y),
            last_financial_update = datetime('now'),
            updated_at = datetime('now')
          WHERE symbol = ?
        `).run(
          data.name, data.sector, data.industry,
          data.cmp, data.marketCapCr, data.sharesOutstandingCr,
          data.revenueFyCr, data.patFyCr, data.eps, data.currentPE,
          data.revCagr3y, data.revCagr5y, data.revCagr10y,
          data.patCagr3y, data.patCagr5y, data.patCagr10y,
          symbol
        );
        updated++;
      }
      
      // Rate limit
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.warn(`[Update] Failed for ${symbol}:`, err.message);
    }
  }
  
  console.log(`[Update] Updated financials for ${updated}/${stocks.length} stocks`);
}

/**
 * Search stocks in database
 */
function searchStocks(query, limit = 20) {
  const db = getDB();
  return db.prepare(`
    SELECT * FROM stocks 
    WHERE symbol LIKE ? OR name LIKE ? OR sector LIKE ?
    ORDER BY market_cap_cr DESC
    LIMIT ?
  `).all(`%${query}%`, `%${query}%`, `%${query}%`, limit);
}

/**
 * Get single stock with full data, fetching if needed
 */
async function getStock(symbol) {
  const db = getDB();
  let stock = db.prepare('SELECT * FROM stocks WHERE symbol = ?').get(symbol.toUpperCase());
  
  // If not in DB or data is stale, fetch fresh
  if (!stock || !stock.cmp || !stock.pat_fy_cr) {
    const freshData = await fetchStockData(symbol.toUpperCase());
    if (freshData) {
      if (!stock) {
        db.prepare(`
          INSERT INTO stocks (symbol, name, sector, industry, cmp, market_cap_cr, shares_outstanding_cr,
            revenue_fy_cr, pat_fy_cr, eps, current_pe, last_price_update, last_financial_update)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(
          freshData.symbol, freshData.name, freshData.sector, freshData.industry,
          freshData.cmp, freshData.marketCapCr, freshData.sharesOutstandingCr,
          freshData.revenueFyCr, freshData.patFyCr, freshData.eps, freshData.currentPE
        );
      } else {
        db.prepare(`
          UPDATE stocks SET cmp = ?, market_cap_cr = ?, revenue_fy_cr = ?, pat_fy_cr = ?,
            current_pe = ?, last_price_update = datetime('now'), updated_at = datetime('now')
          WHERE symbol = ?
        `).run(freshData.cmp, freshData.marketCapCr, freshData.revenueFyCr, freshData.patFyCr, freshData.currentPE, symbol);
      }
      
      stock = db.prepare('SELECT * FROM stocks WHERE symbol = ?').get(symbol.toUpperCase());
    }
  }
  
  return stock;
}

module.exports = {
  fetchStockData,
  fetchYahooQuote,
  fetchYahooSummary,
  seedStockMaster,
  updateAllPrices,
  updateFinancials,
  searchStocks,
  getStock,
};
