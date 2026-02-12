// ============================================================
// REVERSE DCF CALCULATION ENGINE
// Replicates the Excel Terminal PE method exactly
// ============================================================

/**
 * Calculate implied equity value using Terminal PE method.
 * 
 * Formula from Excel:
 * = PAT*(1+g)*((1-(1+g)^n*(1+r)^(-n))/(r-g)) + (PAT*(1+g)^n * exitPE) / (1+r)^n
 * 
 * Where:
 * - PAT = Current year Profit After Tax (in Cr)
 * - g = Growth rate (as decimal, e.g., 15 = 15%)
 * - r = Discount rate / Cost of equity (as decimal)
 * - n = Forecast period in years
 * - exitPE = Terminal PE multiple at end of forecast period
 * 
 * Two components:
 * 1. PV of earnings during forecast period (growing annuity)
 * 2. PV of terminal value (PAT at end of period × exit PE, discounted back)
 */
function calculateImpliedEquityValue(currentPAT, growthRatePct, discountRatePct, forecastPeriod, exitPE) {
  if (currentPAT <= 0 || exitPE <= 0 || forecastPeriod <= 0) return 0;
  
  const g = growthRatePct / 100;
  const r = discountRatePct / 100;
  const n = forecastPeriod;

  // Component 1: PV of earnings during forecast period
  let pvEarnings = 0;
  if (Math.abs(r - g) < 0.0001) {
    // Edge case: discount rate ≈ growth rate → use sum directly
    for (let t = 1; t <= n; t++) {
      pvEarnings += (currentPAT * Math.pow(1 + g, t)) / Math.pow(1 + r, t);
    }
  } else {
    // Standard growing annuity formula
    pvEarnings = currentPAT * (1 + g) * ((1 - Math.pow(1 + g, n) * Math.pow(1 + r, -n)) / (r - g));
  }

  // Component 2: PV of terminal value
  const terminalPAT = currentPAT * Math.pow(1 + g, n);
  const terminalValue = (terminalPAT * exitPE) / Math.pow(1 + r, n);

  return pvEarnings + terminalValue;
}

/**
 * Solve for implied growth rate using bisection method.
 * This replaces Excel's Goal Seek functionality.
 * 
 * Finds the growth rate 'g' such that:
 * calculateImpliedEquityValue(PAT, g, r, n, exitPE) = MarketCap
 * 
 * @returns growth rate as percentage (e.g., 15.5 for 15.5%)
 */
function solveImpliedGrowthRate(currentPAT, marketCap, discountRatePct, forecastPeriod, exitPE) {
  if (currentPAT <= 0 || marketCap <= 0 || exitPE <= 0) return null;

  let low = -90;   // -90% (extreme decline)
  let high = 200;  // 200% (extreme growth)
  const target = marketCap;
  const maxIterations = 500;
  const tolerance = marketCap * 0.00001; // 0.001% of market cap

  for (let i = 0; i < maxIterations; i++) {
    const mid = (low + high) / 2;
    const val = calculateImpliedEquityValue(currentPAT, mid, discountRatePct, forecastPeriod, exitPE);

    if (Math.abs(val - target) < tolerance) return Math.round(mid * 100) / 100;
    
    if (val < target) low = mid;
    else high = mid;
  }

  return Math.round(((low + high) / 2) * 100) / 100;
}

/**
 * Generate year-by-year projected PAT schedule
 */
function generateProjections(currentPAT, growthRatePct, forecastPeriod) {
  const g = growthRatePct / 100;
  const projections = [];
  
  for (let t = 1; t <= forecastPeriod; t++) {
    projections.push({
      year: t,
      pat: currentPAT * Math.pow(1 + g, t),
    });
  }
  
  return projections;
}

/**
 * Get default assumptions based on market cap and sector
 */
function getDefaultAssumptions(marketCapCr, sector) {
  let forecastYears, discountRate, patCagr, category;

  if (marketCapCr < 500) {
    forecastYears = 20; discountRate = 20; patCagr = 25; category = 'Micro Cap';
  } else if (marketCapCr < 5000) {
    forecastYears = 20; discountRate = 20; patCagr = 25; category = 'Small Cap';
  } else if (marketCapCr < 20000) {
    forecastYears = 15; discountRate = 18; patCagr = 18; category = 'Mid Cap';
  } else if (marketCapCr < 50000) {
    forecastYears = 15; discountRate = 16; patCagr = 15; category = 'Large-Mid Cap';
  } else if (marketCapCr < 200000) {
    forecastYears = 10; discountRate = 15; patCagr = 12; category = 'Large Cap';
  } else {
    forecastYears = 10; discountRate = 13; patCagr = 10; category = 'Mega Cap';
  }

  const SECTOR_PE = {
    'fmcg': 45, 'it': 22, 'information technology': 22, 'pharma': 30, 'pharmaceutical': 30,
    'healthcare': 30, 'bank': 15, 'banking': 15, 'nbfc': 20,
    'financial': 18, 'insurance': 35, 'auto': 20, 'automobile': 20,
    'chemical': 25, 'capital goods': 25, 'cement': 25, 'construction': 18,
    'consumer durable': 35, 'consumer': 30, 'diversified': 20,
    'energy': 12, 'fertilizer': 15, 'infrastructure': 15, 'logistics': 25,
    'media': 25, 'entertainment': 25, 'metal': 12, 'mining': 12,
    'oil': 10, 'gas': 10, 'petroleum': 10, 'power': 10, 'utility': 10,
    'real estate': 15, 'realty': 15, 'retail': 40, 'sugar': 15,
    'telecom': 20, 'textile': 15, 'tourism': 25, 'hotel': 25, 'hospitality': 25,
    'trading': 12, 'manufacturing': 22, 'technology': 30, 'software': 25,
  };

  let exitPE = 20; // default
  if (sector) {
    const s = sector.toLowerCase();
    for (const [key, val] of Object.entries(SECTOR_PE)) {
      if (s.includes(key)) { exitPE = val; break; }
    }
  }

  return {
    forecastYears,
    discountRate,
    terminalGrowth: 4,
    exitPE,
    expectedPatCagr: patCagr,
    category,
  };
}

/**
 * Get investment signal based on expectation gap
 */
function getSignal(expectationGap) {
  if (expectationGap === null || expectationGap === undefined) return 'N/A';
  if (expectationGap > 5) return 'Strong Buy';
  if (expectationGap > 2) return 'Buy';
  if (expectationGap < -5) return 'Sell';
  if (expectationGap < -2) return 'Caution';
  return 'Hold';
}

/**
 * Full analysis for a stock — runs the complete reverse DCF
 */
function analyzeStock(stockData, customAssumptions = {}) {
  const mcapCr = stockData.marketCapCr || (stockData.cmp * stockData.sharesOutstandingCr);
  const defaults = getDefaultAssumptions(mcapCr, stockData.sector);
  
  const assumptions = {
    forecastYears: customAssumptions.forecastYears || defaults.forecastYears,
    discountRate: customAssumptions.discountRate || defaults.discountRate,
    terminalGrowth: customAssumptions.terminalGrowth || defaults.terminalGrowth,
    exitPE: customAssumptions.exitPE || defaults.exitPE,
    expectedPatCagr: customAssumptions.expectedPatCagr || defaults.expectedPatCagr,
  };

  const impliedGrowthRate = solveImpliedGrowthRate(
    stockData.currentPAT,
    mcapCr,
    assumptions.discountRate,
    assumptions.forecastYears,
    assumptions.exitPE
  );

  const impliedEquityValue = calculateImpliedEquityValue(
    stockData.currentPAT,
    assumptions.expectedPatCagr,
    assumptions.discountRate,
    assumptions.forecastYears,
    assumptions.exitPE
  );

  const expectationGap = assumptions.expectedPatCagr - (impliedGrowthRate || 0);
  const upside = mcapCr > 0 ? ((impliedEquityValue / mcapCr) - 1) * 100 : 0;

  const projections = generateProjections(
    stockData.currentPAT,
    impliedGrowthRate || 0,
    assumptions.forecastYears
  );

  return {
    symbol: stockData.symbol,
    name: stockData.name,
    sector: stockData.sector,
    cmp: stockData.cmp,
    marketCapCr: mcapCr,
    currentPAT: stockData.currentPAT,
    mcapCategory: defaults.category,
    assumptions,
    results: {
      impliedGrowthRate,
      impliedEquityValue,
      expectationGap,
      upside,
      signal: getSignal(expectationGap),
    },
    projections,
    defaults,
  };
}

module.exports = {
  calculateImpliedEquityValue,
  solveImpliedGrowthRate,
  generateProjections,
  getDefaultAssumptions,
  getSignal,
  analyzeStock,
};
