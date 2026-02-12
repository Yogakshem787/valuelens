# ValueLens — Reverse DCF Screener for Indian Stocks
## Complete Setup & Deployment Guide

---

## 📋 What You're Getting

| Component | Description |
|-----------|-------------|
| **React Frontend** | Interactive UI with search, DCF calculator, watchlist, export |
| **Node.js Backend** | REST API with DCF engine, auth, data fetching, cron jobs |
| **SQLite Database** | Stores stocks, users, watchlists, price history |
| **DCF Engine** | Exact replica of your Excel formula (bisection method replaces Goal Seek) |
| **Data Pipeline** | Yahoo Finance (free) + FMP API ($29/mo for production) |

---

## 🔧 STEP 1: Prerequisites

Install these on your machine:

```bash
# Node.js v18+ (https://nodejs.org)
node --version   # Should show v18+

# npm (comes with Node.js)
npm --version

# Git (optional but recommended)
git --version
```

---

## 🚀 STEP 2: Project Setup

### 2a. Create the project folder

```bash
mkdir valuelens && cd valuelens
```

### 2b. Initialize backend

```bash
npm init -y
npm install express cors helmet compression express-rate-limit node-cron \
  node-fetch@2 better-sqlite3 dotenv bcryptjs jsonwebtoken uuid
npm install --save-dev concurrently nodemon
```

### 2c. Initialize frontend

```bash
npx create-react-app frontend
cd frontend
npm install axios react-router-dom
cd ..
```

### 2d. Create `.env` file in root

```env
PORT=5000
NODE_ENV=development
JWT_SECRET=your-random-secret-string-change-this
USE_YAHOO=true
DB_PATH=./backend/data/valuelens.db

# For production (see Step 6):
# FMP_API_KEY=your_fmp_api_key_here
```

---

## 📂 STEP 3: Backend Files

Create this folder structure:

```
valuelens/
├── .env
├── package.json
├── backend/
│   ├── server.js
│   ├── db.js
│   ├── dcf-engine.js
│   ├── data-fetcher.js
│   ├── data/
│   │   └── stock-master.json
│   └── routes/
│       ├── auth.js
│       ├── stocks.js
│       └── watchlist.js
└── frontend/
    └── src/
        └── App.jsx  (replace the default)
```

I've provided all these files in the output. Copy each file to the correct location.

### Key Backend Files Summary:

**`backend/dcf-engine.js`** — The core calculation engine:
- `calcImpliedValue(pat, growthPct, discountPct, years, exitPE)` — Computes equity value
- `solveGrowth(pat, marketCap, discountPct, years, exitPE)` — Finds implied growth (replaces Goal Seek)
- `getDefaultAssumptions(marketCapCr, sector)` — Auto-assigns defaults per your rules

**`backend/data-fetcher.js`** — Multi-source data fetching:
- Yahoo Finance (free, no API key needed)
- FMP API (paid, recommended for production)
- Caches data in SQLite

**`backend/server.js`** — Express server with:
- REST API routes for stocks, auth, watchlists
- Cron jobs for daily price updates (6:30 AM IST)
- Weekly financial data refresh

---

## 🧮 STEP 4: Understanding the DCF Engine

### Your Excel Formula (replicated exactly):

```
Implied Value = PV of Earnings + PV of Terminal Value

PV of Earnings = PAT × (1+g) × [(1 - (1+g)^n × (1+r)^(-n)) / (r - g)]

PV of Terminal Value = (PAT × (1+g)^n × Exit PE) / (1+r)^n
```

Where:
- `PAT` = Latest FY Profit After Tax (Cr)
- `g` = PAT CAGR growth rate
- `r` = Discount rate (cost of equity)
- `n` = Forecast period (years)
- `Exit PE` = Terminal PE multiple

### How "Reverse DCF" Works:

Instead of assuming a growth rate and finding fair value, we:
1. Take the **current market cap** as the "target value"
2. Use bisection method to find **what growth rate** makes DCF value = market cap
3. This is the **"market implied PAT CAGR"**

### Default Assumptions (your specifications):

| Market Cap | Forecast Period | Discount Rate | Default CAGR |
|-----------|----------------|---------------|-------------|
| < ₹500 Cr (Micro) | 20 years | 20% | 25% |
| ₹500-5,000 Cr (Small) | 20 years | 20% | 25% |
| ₹5,000-20,000 Cr (Mid) | 15 years | 18% | 18% |
| ₹20,000-50,000 Cr (Large-Mid) | 15 years | 16% | 15% |
| ₹50,000-2,00,000 Cr (Large) | 10 years | 15% | 12% |
| > ₹2,00,000 Cr (Mega) | 10 years | 13% | 10% |

Exit PE is assigned per sector (FMCG: 45x, IT: 22x, Banks: 15x, etc.)

---

## 💰 STEP 5: Data API — What You Need

### FREE Option (Good for MVP):

**Yahoo Finance (unofficial API)** — No key needed, works immediately.
- Covers all NSE/BSE stocks
- Live prices, basic financials, PE ratios
- Rate limited (~2 req/sec)
- Limitations: No historical CAGR calculation, limited financial statements

### RECOMMENDED Paid Option ($29/month):

**Financial Modeling Prep (FMP)**
- Website: https://financialmodelingprep.com
- Plan: Starter ($29/month) or $199/year
- Coverage: All BSE/NSE listed stocks
- What you get: 10 years of financial statements, ratios, live prices
- Why it's best: Most comprehensive Indian data at lowest cost
- Rate limit: 300 requests/minute (more than enough)

```bash
# Sign up at: https://financialmodelingprep.com/developer/docs/
# Get your API key from the dashboard
# Add to .env: FMP_API_KEY=your_key_here
```

### Alternative Paid Options:

| API | Cost | Indian Coverage | Best For |
|-----|------|----------------|----------|
| FMP | $29/mo | Excellent (BSE+NSE) | Best value overall |
| Alpha Vantage | Free (25/day) or $50/mo | Good (.BSE suffix) | Budget option |
| Twelve Data | $29/mo | Good | Real-time prices |
| Screener.in API | Not available | — | They don't offer API |

### My Recommendation:
1. **Start free** with Yahoo Finance (already configured as default)
2. **When ready for production**, get FMP ($29/mo) for comprehensive data
3. That's all you need — total cost: **$29/month** for full production

---

## 🖥️ STEP 6: Running the Application

### Development Mode:

```bash
# Terminal 1 — Backend
cd valuelens
node backend/server.js

# Terminal 2 — Frontend
cd valuelens/frontend
npm start
```

Backend runs on `http://localhost:5000`
Frontend runs on `http://localhost:3000`

### Production Build:

```bash
# Build frontend
cd frontend && npm run build && cd ..

# Start production server (serves both API + frontend)
NODE_ENV=production node backend/server.js
```

Now everything runs on `http://localhost:5000`

---

## 🌐 STEP 7: Deployment Options

### Option A: Railway.app (Recommended — Free tier available)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

Cost: Free tier (500 hrs/month), then $5/month

### Option B: Render.com (Free tier)

1. Push code to GitHub
2. Go to render.com → New Web Service
3. Connect your repo
4. Build command: `cd frontend && npm install && npm run build`
5. Start command: `node backend/server.js`

Cost: Free tier available

### Option C: DigitalOcean App Platform ($5/month)

Best for serious production deployment with custom domain.

### Option D: VPS (Most control — $5-10/month)

```bash
# On a DigitalOcean/Hetzner VPS:
sudo apt update && sudo apt install nodejs npm nginx certbot
git clone your-repo
cd valuelens && npm install && cd frontend && npm install && npm run build && cd ..

# Setup nginx reverse proxy
# Setup SSL with certbot
# Setup pm2 for process management
pm2 start backend/server.js --name valuelens
pm2 save && pm2 startup
```

---

## 📊 STEP 8: Populating Data

### First Run — Seed stocks:

The server automatically seeds 100+ stocks from `stock-master.json` on first run.

### Fetch live data:

```bash
# The server has cron jobs that auto-run:
# - Daily 6:30 AM IST: Update all stock prices
# - Weekly Sunday 2 AM: Update financial statements

# To manually trigger:
curl http://localhost:5000/api/stocks/RELIANCE  # Fetches & caches data
```

### Bulk data population (one-time):

```bash
# Create a script to fetch all stocks:
node -e "
const fetcher = require('./backend/data-fetcher');
const stocks = require('./backend/data/stock-master.json');
(async () => {
  for (const s of stocks) {
    console.log('Fetching', s.symbol);
    await fetcher.getStock(s.symbol);
    await new Promise(r => setTimeout(r, 1500));
  }
})();
"
```

---

## 🎯 STEP 9: Key API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/stocks/search?q=reliance` | GET | Search stocks |
| `GET /api/stocks/RELIANCE` | GET | Get stock data |
| `GET /api/stocks/RELIANCE/analysis` | GET | Full DCF analysis |
| `POST /api/calculate-dcf` | POST | Custom DCF calculation |
| `POST /api/auth/register` | POST | Register user |
| `POST /api/auth/login` | POST | Login user |
| `GET /api/watchlist` | GET | Get user watchlists |
| `POST /api/watchlist/:id/items` | POST | Add to watchlist |
| `GET /api/watchlist/:id/items` | GET | Get watchlist with live data |

### Example — Calculate DCF:

```bash
curl -X POST http://localhost:5000/api/calculate-dcf \
  -H "Content-Type: application/json" \
  -d '{
    "currentPAT": 1737,
    "marketCap": 93800,
    "discountRate": 15,
    "forecastYears": 10,
    "exitPE": 45,
    "expectedPatCagr": 13
  }'
```

Response:
```json
{
  "impliedGrowthRate": 14.8,
  "impliedEquityValue": 82500,
  "expectationGap": -1.8,
  "upside": -12.0,
  "signal": "Hold"
}
```

---

## 💡 STEP 10: Future Monetization Strategy

### For selling to Screener.in:

**What makes ValueLens valuable:**
1. Real-time reverse DCF for ALL listed Indian stocks
2. Customizable assumptions per stock (not one-size-fits-all)
3. Watchlist with daily implied growth tracking
4. Historical implied growth tracking (shows how market sentiment changes)
5. Sector-wise and market-cap-wise smart defaults
6. Export functionality for institutional use

**How to make it more valuable:**
- Add sector-wise screening (e.g., "Show me all FMCG stocks where market implies <10% growth")
- Add "Opportunity Score" ranking algorithm
- Add email alerts when implied growth crosses user thresholds
- Add portfolio-level analysis
- Add institutional-quality PDF reports
- Track implied growth over time (chart how market expectations change)

**Pricing strategy if you launch independently:**
- Free: 5 stocks/day, basic analysis
- Pro (₹499/month): Unlimited stocks, watchlists, exports
- Institutional (₹2,999/month): API access, bulk screening, custom reports

---

## 🔒 Total Monthly Costs

| Item | Cost |
|------|------|
| FMP API (data) | $29/month (~₹2,400) |
| Railway/Render (hosting) | Free - $5/month |
| Domain name | ₹800/year |
| **Total** | **~₹2,500-3,000/month** |

That's it — a complete, production-ready Reverse DCF screener for all Indian stocks for under ₹3,000/month.

---

## ❓ Quick Troubleshooting

| Issue | Solution |
|-------|---------|
| `better-sqlite3` install fails | Install build tools: `npm install -g node-gyp` |
| Yahoo Finance returns null | Stock may need `.BO` suffix (BSE). Code handles this automatically. |
| CORS errors in dev | Backend already has `cors()` middleware enabled |
| Port 5000 in use | Change PORT in `.env` file |
| Frontend proxy not working | Add `"proxy": "http://localhost:5000"` to `frontend/package.json` |

---

*Built with ❤️ for Indian equity investors. This is not financial advice.*
