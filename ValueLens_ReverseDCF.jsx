import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";

/* ================================================================
   VALUELENS — Reverse DCF Screener for Indian Stocks
   Interactive Application with Full Calculation Engine
   ================================================================ */

// ═══════════════════════════════════════════════════════
// CONFIGURATION & CONSTANTS
// ═══════════════════════════════════════════════════════
const SECTOR_PE = {
  "Oil & Gas":10, "IT":22, "Banks":15, "NBFC":20, "FMCG":45,
  "Pharma":30, "Healthcare":30, "Auto":20, "Consumer Durables":35,
  "Chemicals":25, "Capital Goods":25, "Cement":25, "Construction":18,
  "Diversified":20, "Energy":12, "Financial Services":18, "Insurance":35,
  "Infrastructure":15, "Logistics":25, "Media":25, "Metal":12,
  "Power":10, "Realty":15, "Retail":40, "Telecom":20,
  "Textiles":15, "Technology":30, "Manufacturing":22,
};

function getSectorPE(s) {
  if (!s) return 20;
  for (const [k,v] of Object.entries(SECTOR_PE))
    if (s.toLowerCase().includes(k.toLowerCase())) return v;
  return 20;
}

function getMcapInfo(m) {
  if (m<500)    return {label:"Micro Cap",  fy:20, dr:20, cagr:25, color:"#7c3aed"};
  if (m<5000)   return {label:"Small Cap",  fy:20, dr:20, cagr:25, color:"#8b5cf6"};
  if (m<20000)  return {label:"Mid Cap",    fy:15, dr:18, cagr:18, color:"#0891b2"};
  if (m<50000)  return {label:"Large-Mid",  fy:15, dr:16, cagr:15, color:"#0ea5e9"};
  if (m<200000) return {label:"Large Cap",  fy:10, dr:15, cagr:12, color:"#059669"};
  return               {label:"Mega Cap",   fy:10, dr:13, cagr:10, color:"#047857"};
}

// ═══════════════════════════════════════════════════════
// REVERSE DCF ENGINE (replicates your Excel exactly)
// Formula: PAT*(1+g)*((1-(1+g)^n*(1+r)^(-n))/(r-g)) + (PAT*(1+g)^n * exitPE)/(1+r)^n
// ═══════════════════════════════════════════════════════
function calcValue(pat, gPct, rPct, n, pe) {
  if (pat<=0||pe<=0||n<=0) return 0;
  const g=gPct/100, r=rPct/100;
  let pv=0;
  if (Math.abs(r-g)<1e-4) {
    for (let t=1;t<=n;t++) pv+=(pat*Math.pow(1+g,t))/Math.pow(1+r,t);
  } else {
    pv=pat*(1+g)*((1-Math.pow(1+g,n)*Math.pow(1+r,-n))/(r-g));
  }
  return pv+(pat*Math.pow(1+g,n)*pe)/Math.pow(1+r,n);
}

function solveGrowth(pat, mcap, rPct, n, pe) {
  if (pat<=0||mcap<=0||pe<=0) return null;
  let lo=-80, hi=150;
  for (let i=0;i<400;i++) {
    const mid=(lo+hi)/2;
    const v=calcValue(pat,mid,rPct,n,pe);
    if (Math.abs(v-mcap)<mcap*0.00001) return Math.round(mid*100)/100;
    if (v<mcap) lo=mid; else hi=mid;
  }
  return Math.round(((lo+hi)/2)*100)/100;
}

function getSignal(gap) {
  if (gap==null) return {t:"N/A",c:"#6b7280",bg:"#f3f4f6"};
  if (gap>5)  return {t:"Strong Buy",c:"#047857",bg:"#d1fae5"};
  if (gap>2)  return {t:"Buy",c:"#059669",bg:"#ecfdf5"};
  if (gap<-5) return {t:"Sell",c:"#dc2626",bg:"#fee2e2"};
  if (gap<-2) return {t:"Caution",c:"#d97706",bg:"#fef3c7"};
  return {t:"Hold",c:"#6b7280",bg:"#f3f4f6"};
}

// ═══════════════════════════════════════════════════════
// SAMPLE STOCK DATA (in production → fetched from API)
// ═══════════════════════════════════════════════════════
const STOCKS = [
  {sym:"RELIANCE",name:"Reliance Industries Ltd",sec:"Oil & Gas",cmp:1285.5,shr:677.02,pat:79020,rev:966382,r3:18.2,r5:14.5,r10:12.1,p3:15.8,p5:12.3,p10:14.2,mpe3:26.5,mpe5:28.2,mpe10:22.8,pe:23.5},
  {sym:"TCS",name:"Tata Consultancy Services",sec:"IT",cmp:3845.2,shr:36.15,pat:47790,rev:255324,r3:14.1,r5:12.8,r10:11.5,p3:12.5,p5:11.2,p10:10.8,mpe3:30.2,mpe5:28.5,mpe10:26.1,pe:29.1},
  {sym:"HDFCBANK",name:"HDFC Bank Limited",sec:"Banks",cmp:1812.3,shr:380.36,pat:64062,rev:349785,r3:32.5,r5:22.1,r10:18.4,p3:22.1,p5:18.5,p10:19.2,mpe3:20.5,mpe5:22.1,mpe10:24.8,pe:20.8},
  {sym:"INFY",name:"Infosys Limited",sec:"IT",cmp:1580.75,shr:41.42,pat:26960,rev:162981,r3:13.8,r5:14.2,r10:12.1,p3:10.2,p5:11.8,p10:10.5,mpe3:25.8,mpe5:24.2,mpe10:21.5,pe:24.3},
  {sym:"ICICIBANK",name:"ICICI Bank Limited",sec:"Banks",cmp:1346.7,shr:71.52,pat:49698,rev:236817,r3:28.5,r5:22.8,r10:16.2,p3:40.1,p5:35.2,p10:22.5,mpe3:18.2,mpe5:20.5,mpe10:18.8,pe:19.4},
  {sym:"HINDUNILVR",name:"Hindustan Unilever Ltd",sec:"FMCG",cmp:2380.5,shr:23.49,pat:10282,rev:60580,r3:8.2,r5:10.5,r10:9.8,p3:7.5,p5:11.2,p10:12.8,mpe3:58.2,mpe5:62.5,mpe10:55.8,pe:54.5},
  {sym:"BHARTIARTL",name:"Bharti Airtel Limited",sec:"Telecom",cmp:1685.2,shr:57.19,pat:17602,rev:161780,r3:18.5,r5:16.2,r10:10.8,p3:85.2,p5:0,p10:0,mpe3:45.2,mpe5:55.8,mpe10:48.2,pe:54.8},
  {sym:"BAJFINANCE",name:"Bajaj Finance Limited",sec:"NBFC",cmp:8520.5,shr:6.19,pat:14920,rev:55684,r3:28.5,r5:25.2,r10:32.1,p3:22.5,p5:18.8,p10:28.5,mpe3:38.5,mpe5:42.8,mpe10:48.2,pe:35.4},
  {sym:"TITAN",name:"Titan Company Limited",sec:"Consumer Durables",cmp:3280.5,shr:8.87,pat:3850,rev:51084,r3:28.5,r5:22.8,r10:18.5,p3:25.2,p5:21.5,p10:22.8,mpe3:72.5,mpe5:68.2,mpe10:58.5,pe:75.5},
  {sym:"NESTLEIND",name:"Nestle India Limited",sec:"FMCG",cmp:2218.8,shr:9.64,pat:3132,rev:19128,r3:12.5,r5:11.8,r10:10.2,p3:9.0,p5:14.2,p10:15.8,mpe3:72.5,mpe5:78.2,mpe10:65.5,pe:68.3},
  {sym:"DMART",name:"Avenue Supermarts Ltd",sec:"Retail",cmp:3628.8,shr:6.51,pat:3168,rev:53742,r3:22.8,r5:18.5,r10:28.2,p3:15.7,p5:14.2,p10:25.8,mpe3:85.2,mpe5:95.5,mpe10:78.2,pe:74.6},
  {sym:"MARICO",name:"Marico Limited",sec:"FMCG",cmp:722.6,shr:12.98,pat:1737,rev:10199,r3:10.5,r5:9.2,r10:7.8,p3:9.3,p5:10.5,p10:12.2,mpe3:52.8,mpe5:48.5,mpe10:42.2,pe:54.0},
  {sym:"HCLTECH",name:"HCL Technologies Ltd",sec:"IT",cmp:1683.1,shr:27.14,pat:17758,rev:109857,r3:15.8,r5:14.2,r10:12.5,p3:9.5,p5:10.8,p10:11.2,mpe3:22.5,mpe5:20.8,mpe10:18.5,pe:25.7},
  {sym:"ASIANPAINT",name:"Asian Paints Limited",sec:"Consumer Durables",cmp:2285.5,shr:9.59,pat:4750,rev:35494,r3:10.8,r5:12.5,r10:13.2,p3:5.2,p5:8.5,p10:14.8,mpe3:62.5,mpe5:68.2,mpe10:55.8,pe:46.2},
  {sym:"TATAMOTORS",name:"Tata Motors Limited",sec:"Auto",cmp:685.2,shr:36.61,pat:31808,rev:437927,r3:22.5,r5:15.8,r10:8.5,p3:125.5,p5:45.2,p10:18.5,mpe3:12.5,mpe5:15.8,mpe10:18.2,pe:7.9},
  {sym:"SUNPHARMA",name:"Sun Pharmaceutical Ind",sec:"Pharma",cmp:1752.8,shr:23.99,pat:12280,rev:52369,r3:15.2,r5:14.8,r10:12.5,p3:32.5,p5:28.2,p10:18.5,mpe3:32.5,mpe5:28.8,mpe10:25.2,pe:34.2},
  {sym:"WIPRO",name:"Wipro Limited",sec:"IT",cmp:305.8,shr:52.36,pat:11880,rev:89818,r3:8.5,r5:10.2,r10:8.8,p3:2.5,p5:5.8,p10:7.2,mpe3:18.5,mpe5:20.2,mpe10:16.8,pe:13.5},
  {sym:"POLICYBZR",name:"PB Fintech Ltd",sec:"Financial Services",cmp:1579,shr:4.63,pat:831,rev:4245,r3:42.5,r5:35.8,r10:0,p3:0,p5:0,p10:0,mpe3:0,mpe5:0,mpe10:0,pe:88.0},
  {sym:"MANKIND",name:"Mankind Pharma Ltd",sec:"Pharma",cmp:2062.1,shr:4.13,pat:1980,rev:12290,r3:14.2,r5:15.5,r10:18.2,p3:13.5,p5:14.8,p10:18.5,mpe3:38.5,mpe5:0,mpe10:0,pe:43.0},
  {sym:"AXISBANK",name:"Axis Bank Limited",sec:"Banks",cmp:1120.5,shr:31.05,pat:27885,rev:118752,r3:22.5,r5:18.2,r10:14.5,p3:71.3,p5:42.8,p10:15.2,mpe3:15.2,mpe5:18.5,mpe10:22.8,pe:12.5},
  {sym:"KOTAKBANK",name:"Kotak Mahindra Bank",sec:"Banks",cmp:2085.5,shr:19.89,pat:22998,rev:82521,r3:25.8,r5:20.2,r10:18.5,p3:16.0,p5:18.2,p10:20.5,mpe3:22.8,mpe5:28.5,mpe10:32.2,pe:18.1},
  {sym:"MARUTI",name:"Maruti Suzuki India",sec:"Auto",cmp:12450,shr:3.14,pat:13630,rev:144260,r3:22.5,r5:12.8,r10:10.5,p3:35.2,p5:18.5,p10:14.2,mpe3:28.5,mpe5:32.8,mpe10:28.2,pe:28.7},
  {sym:"ULTRACEMCO",name:"UltraTech Cement Ltd",sec:"Cement",cmp:11250,shr:2.89,pat:8520,rev:72680,r3:18.5,r5:15.2,r10:12.8,p3:22.5,p5:18.2,p10:14.5,mpe3:35.5,mpe5:38.2,mpe10:32.8,pe:38.2},
  {sym:"LT",name:"Larsen & Toubro Ltd",sec:"Capital Goods",cmp:3580,shr:13.71,pat:15200,rev:243000,r3:22.8,r5:12.5,r10:10.2,p3:18.5,p5:14.2,p10:12.8,mpe3:32.5,mpe5:28.8,mpe10:25.2,pe:32.3},
];

// ═══════════════════════════════════════════════════════
// FORMATTING HELPERS
// ═══════════════════════════════════════════════════════
const fCr = v => {
  if (v==null||isNaN(v)) return "—";
  if (Math.abs(v)>=1e5) return `₹${(v/1e5).toFixed(1)}L Cr`;
  if (Math.abs(v)>=1e3) return `₹${(v/1e3).toFixed(1)}K Cr`;
  return `₹${v.toFixed(0)} Cr`;
};
const fP = v => v!=null&&!isNaN(v) ? `${v.toFixed(1)}%` : "—";
const fPr = v => v!=null ? `₹${v.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}` : "—";

// ═══════════════════════════════════════════════════════
// MAIN APP COMPONENT
// ═══════════════════════════════════════════════════════
export default function App() {
  const [sel, setSel] = useState(null);
  const [tab, setTab] = useState("screener");
  const [watchlist, setWatchlist] = useState([]);
  const [query, setQuery] = useState("");
  const [dropOpen, setDropOpen] = useState(false);
  const searchRef = useRef(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return STOCKS.slice(0,8);
    const q = query.toLowerCase();
    return STOCKS.filter(s =>
      s.sym.toLowerCase().includes(q)||s.name.toLowerCase().includes(q)||s.sec.toLowerCase().includes(q)
    ).slice(0,10);
  }, [query]);

  useEffect(() => {
    const h = e => { if (searchRef.current && !searchRef.current.contains(e.target)) setDropOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const addToWatchlist = useCallback((sym, inputs, ig) => {
    const s = STOCKS.find(x => x.sym === sym);
    if (!s) return;
    const mcap = s.cmp * s.shr;
    const iv = calcValue(s.pat, inputs.ec, inputs.dr, inputs.fy, inputs.pe);
    const item = { sym, cmp: s.cmp, mcap, ig, iv, gap: inputs.ec - (ig||0), inputs:{...inputs}, sec: s.sec, name: s.name };
    setWatchlist(prev => {
      const idx = prev.findIndex(w => w.sym === sym);
      if (idx >= 0) { const u = [...prev]; u[idx] = item; return u; }
      return [...prev, item];
    });
    setTab("watchlist");
  }, []);

  return (
    <div style={{minHeight:"100vh",background:"#f8f9fb",fontFamily:"'Segoe UI','system-ui',sans-serif",color:"#0f172a"}}>
      {/* ─── HEADER ─── */}
      <header style={{background:"linear-gradient(135deg,#0c1220 0%,#162032 50%,#1a2744 100%)",borderBottom:"1px solid rgba(255,255,255,0.06)",position:"sticky",top:0,zIndex:100}}>
        <div style={{maxWidth:1280,margin:"0 auto",padding:"0 28px",display:"flex",alignItems:"center",justifyContent:"space-between",height:68}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:40,height:40,borderRadius:11,background:"linear-gradient(135deg,#f59e0b,#f97316)",display:"flex",alignItems:"center",justifyContent:"center",color:"#0c1220",fontWeight:800,fontSize:15,fontFamily:"monospace"}}>V$</div>
            <div>
              <div style={{color:"#f1f5f9",fontSize:20,fontWeight:800,letterSpacing:"-0.5px",lineHeight:1.2}}>ValueLens</div>
              <div style={{color:"#94a3b8",fontSize:11,fontWeight:500,letterSpacing:"0.3px"}}>Reverse DCF Screener • Indian Stocks</div>
            </div>
          </div>
          <nav style={{display:"flex",gap:3,background:"rgba(255,255,255,0.06)",borderRadius:11,padding:3}}>
            {["screener","watchlist"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding:"8px 20px",borderRadius:9,border:"none",cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:"inherit",
                background:tab===t?"rgba(245,158,11,0.15)":"transparent",
                color:tab===t?"#f59e0b":"#94a3b8",transition:"all 0.2s",
                display:"flex",alignItems:"center",gap:8
              }}>
                {t==="screener"?"📊 Screener":"⭐ Watchlist"}
                {t==="watchlist"&&watchlist.length>0&&<span style={{background:"#f59e0b",color:"#0c1220",borderRadius:20,padding:"1px 7px",fontSize:11,fontWeight:700}}>{watchlist.length}</span>}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* ─── MAIN CONTENT ─── */}
      <main style={{maxWidth:1280,margin:"0 auto",padding:"28px 28px 80px"}}>
        {tab === "screener" && (
          <>
            {/* Hero + Search */}
            <div style={{textAlign:"center",marginBottom:36}}>
              <h2 style={{fontSize:32,fontWeight:800,letterSpacing:"-1px",color:"#0f172a",margin:"0 0 10px",lineHeight:1.2}}>
                What growth is the market pricing in?
              </h2>
              <p style={{fontSize:15,color:"#64748b",maxWidth:580,margin:"0 auto 24px",lineHeight:1.5}}>
                Discover the PAT CAGR embedded in any Indian stock's current market price using Exit PE-based Reverse DCF
              </p>
              {/* Search */}
              <div ref={searchRef} style={{position:"relative",maxWidth:600,margin:"0 auto"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,background:"#fff",border:"2px solid "+(dropOpen?"#f59e0b":"#e2e8f0"),borderRadius:14,padding:"12px 18px",transition:"all 0.2s",boxShadow:"0 2px 12px rgba(0,0,0,0.04)"}}>
                  <span style={{color:"#94a3b8",fontSize:18}}>🔍</span>
                  <input placeholder="Search stock by name, symbol, or sector…" value={query}
                    onChange={e => {setQuery(e.target.value);setDropOpen(true)}} onFocus={() => setDropOpen(true)}
                    style={{flex:1,border:"none",outline:"none",fontSize:15,fontWeight:500,color:"#0f172a",background:"transparent",fontFamily:"inherit"}} />
                  {query && <button onClick={() => {setQuery("");setDropOpen(false)}} style={{border:"none",background:"#f1f5f9",borderRadius:7,width:26,height:26,cursor:"pointer",color:"#64748b",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>}
                </div>
                {dropOpen && filtered.length>0 && (
                  <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#fff",border:"2px solid #e2e8f0",borderRadius:14,marginTop:6,padding:6,zIndex:50,boxShadow:"0 12px 40px rgba(0,0,0,0.12)",maxHeight:400,overflowY:"auto"}}>
                    {filtered.map(s => (
                      <div key={s.sym} onClick={() => {setSel(s);setQuery(s.sym);setDropOpen(false)}}
                        style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",borderRadius:9,cursor:"pointer",transition:"background 0.15s",background:sel?.sym===s.sym?"#fef3c7":"transparent"}}
                        onMouseEnter={e => e.currentTarget.style.background=sel?.sym===s.sym?"#fef3c7":"#f8fafc"}
                        onMouseLeave={e => e.currentTarget.style.background=sel?.sym===s.sym?"#fef3c7":"transparent"}>
                        <div><span style={{fontWeight:700,fontSize:14,color:"#0f172a",marginRight:10}}>{s.sym}</span><span style={{fontSize:13,color:"#64748b"}}>{s.name}</span></div>
                        <span style={{fontSize:11,color:"#94a3b8",background:"#f1f5f9",padding:"3px 9px",borderRadius:6,fontWeight:600}}>{s.sec}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {sel ? (
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:22,alignItems:"start"}}>
                <StockInfo stock={sel} />
                <DCFCalculator stock={sel} onSave={addToWatchlist} />
              </div>
            ) : (
              <QuickPicks stocks={STOCKS} onSelect={s => {setSel(s);setQuery(s.sym)}} />
            )}
          </>
        )}

        {tab === "watchlist" && (
          <WatchlistPanel list={watchlist} setList={setWatchlist} onGo={s => {setSel(s);setQuery(s.sym);setTab("screener")}} stocks={STOCKS} />
        )}
      </main>

      <footer style={{borderTop:"1px solid #e2e8f0",padding:"20px 28px",textAlign:"center"}}>
        <p style={{fontSize:12,color:"#94a3b8",margin:0}}>ValueLens © 2025 — Not financial advice. Always verify with your broker.</p>
      </footer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// STOCK INFO PANEL
// ═══════════════════════════════════════════════════════
function StockInfo({ stock: s }) {
  const mcap = s.cmp * s.shr;
  const info = getMcapInfo(mcap);
  return (
    <div style={{background:"#fff",borderRadius:18,padding:26,border:"1px solid #e2e8f0",boxShadow:"0 1px 8px rgba(0,0,0,0.03)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:22}}>
        <div>
          <h2 style={{fontSize:26,fontWeight:800,letterSpacing:"-0.8px",margin:0}}>{s.sym}</h2>
          <p style={{fontSize:13,color:"#64748b",margin:"3px 0 0",fontWeight:500}}>{s.name}</p>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:22,fontWeight:800,fontFamily:"monospace"}}>{fPr(s.cmp)}</div>
          <span style={{display:"inline-block",marginTop:5,padding:"3px 10px",borderRadius:7,background:"linear-gradient(135deg,#fef3c7,#fde68a)",color:"#92400e",fontSize:11,fontWeight:700}}>{s.sec}</span>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:22}}>
        {[
          ["Market Cap", fCr(mcap), <span style={{color:info.color,fontSize:11,fontWeight:600}}>{info.label}</span>],
          ["Latest FY Revenue", fCr(s.rev)],
          ["Latest FY PAT", fCr(s.pat)],
          ["Current PE", s.pe ? `${s.pe}x` : "—"],
        ].map(([l,v,sub],i) => (
          <div key={i} style={{background:"#f8fafc",borderRadius:12,padding:"14px 16px"}}>
            <div style={{fontSize:10,color:"#94a3b8",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.4px"}}>{l}</div>
            <div style={{fontSize:17,fontWeight:800,fontFamily:"monospace",marginTop:3}}>{v}</div>
            {sub && <div style={{marginTop:2}}>{sub}</div>}
          </div>
        ))}
      </div>

      <div style={{borderTop:"1px solid #f1f5f9",paddingTop:18}}>
        <div style={{fontSize:12,fontWeight:700,color:"#334155",textTransform:"uppercase",letterSpacing:"0.4px",marginBottom:10}}>Historical CAGR</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <CAGRRow label="Revenue" v3={s.r3} v5={s.r5} v10={s.r10} />
          <CAGRRow label="PAT" v3={s.p3} v5={s.p5} v10={s.p10} />
        </div>
        <div style={{fontSize:12,fontWeight:700,color:"#334155",textTransform:"uppercase",letterSpacing:"0.4px",margin:"16px 0 10px"}}>Median TTM PE</div>
        <div style={{display:"flex",gap:8}}>
          {[["3Y",s.mpe3],["5Y",s.mpe5],["10Y",s.mpe10]].map(([l,v]) => (
            <Pill key={l} label={l} value={v>0?`${v}x`:"—"} color="#64748b" />
          ))}
        </div>
      </div>
    </div>
  );
}

function CAGRRow({label,v3,v5,v10}) {
  return (
    <div>
      <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:5}}>{label}</div>
      <div style={{display:"flex",gap:8}}>
        {[["3Y",v3],["5Y",v5],["10Y",v10]].map(([l,v]) => {
          const c = v>15?"#059669":v>0?"#0891b2":"#dc2626";
          return <Pill key={l} label={l} value={v>0?`${v}%`:"—"} color={c} />;
        })}
      </div>
    </div>
  );
}

function Pill({label,value,color}) {
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"7px 12px",borderRadius:9,border:`1.5px solid ${color}25`,background:color+"08",minWidth:52}}>
      <span style={{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.4px",color}}>{label}</span>
      <span style={{fontSize:15,fontWeight:800,fontFamily:"monospace",color}}>{value}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// DCF CALCULATOR PANEL
// ═══════════════════════════════════════════════════════
function DCFCalculator({ stock: s, onSave }) {
  const mcap = s.cmp * s.shr;
  const info = getMcapInfo(mcap);
  const spe = getSectorPE(s.sec);

  const [inp, setInp] = useState({ fy: info.fy, dr: info.dr, tg: 4, pe: spe, ec: info.cagr });

  useEffect(() => {
    const i2 = getMcapInfo(s.cmp * s.shr);
    setInp({ fy: i2.fy, dr: i2.dr, tg: 4, pe: getSectorPE(s.sec), ec: i2.cagr });
  }, [s.sym]);

  const ig = useMemo(() => solveGrowth(s.pat, mcap, inp.dr, inp.fy, inp.pe), [s.pat, mcap, inp.dr, inp.fy, inp.pe]);
  const iv = useMemo(() => calcValue(s.pat, inp.ec, inp.dr, inp.fy, inp.pe), [s.pat, inp]);
  const upside = mcap > 0 ? ((iv / mcap) - 1) * 100 : 0;
  const gap = inp.ec - (ig || 0);
  const sig = getSignal(gap);

  const set = (k, v) => setInp(p => ({...p, [k]: parseFloat(v)||0}));

  return (
    <div style={{background:"#fff",borderRadius:18,padding:26,border:"1px solid #e2e8f0",boxShadow:"0 1px 8px rgba(0,0,0,0.03)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <h3 style={{fontSize:19,fontWeight:800,margin:0}}>Reverse DCF Analysis</h3>
        <span style={{padding:"5px 14px",borderRadius:9,fontWeight:700,fontSize:13,background:sig.bg,color:sig.c}}>{sig.t}</span>
      </div>

      {/* Implied Growth Display */}
      <div style={{background:"linear-gradient(135deg,#0c1220,#1e293b)",borderRadius:14,padding:"22px 24px",marginBottom:22}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{color:"#94a3b8",fontSize:13,fontWeight:600}}>Market Implied PAT CAGR</span>
          <span style={{color:"#f59e0b",fontSize:34,fontWeight:900,fontFamily:"monospace",letterSpacing:"-1px"}}>{ig!=null?fP(ig):"N/A"}</span>
        </div>
        <p style={{color:"#64748b",fontSize:12,margin:"10px 0 0",lineHeight:1.5}}>
          Market is pricing in {ig!=null?fP(ig):"N/A"} PAT growth over {inp.fy}yrs at {inp.pe}x exit PE with {inp.dr}% discount rate
        </p>
      </div>

      {/* Inputs */}
      <div style={{marginBottom:22}}>
        <div style={{fontSize:13,fontWeight:700,color:"#334155",margin:"0 0 3px"}}>DCF Assumptions</div>
        <div style={{fontSize:11,color:"#94a3b8",margin:"0 0 14px"}}>Defaults: {info.label} / {s.sec}. Change any input for instant recalculation.</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Inp label="Forecast Period (yrs)" val={inp.fy} onChange={v => set("fy",v)} />
          <Inp label="Discount Rate (%)" val={inp.dr} onChange={v => set("dr",v)} step={0.5} />
          <Inp label="Terminal Growth (%)" val={inp.tg} onChange={v => set("tg",v)} step={0.5} />
          <Inp label="Exit PE Multiple" val={inp.pe} onChange={v => set("pe",v)} />
          <div style={{gridColumn:"1/-1"}}>
            <Inp label="Your Expected PAT CAGR (%)" val={inp.ec} onChange={v => set("ec",v)} step={0.5} highlight />
          </div>
        </div>
      </div>

      {/* Results */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:18}}>
        <Res label="Implied Equity Value" value={fCr(iv)} />
        <Res label="Current Market Cap" value={fCr(mcap)} />
        <Res label="Upside / Downside" value={`${upside>0?"+":""}${upside.toFixed(1)}%`} color={upside>0?"#059669":"#dc2626"} />
        <Res label="Expectation Gap" value={`${gap>0?"+":""}${gap.toFixed(1)}%`} color={gap>0?"#059669":"#dc2626"} sub="Your expected − Market implied" />
      </div>

      <button onClick={() => onSave(s.sym, inp, ig)} style={{
        display:"flex",alignItems:"center",justifyContent:"center",gap:8,width:"100%",padding:"13px",
        borderRadius:12,border:"2px solid #f59e0b",background:"linear-gradient(135deg,#fef3c7,#fde68a)",
        color:"#92400e",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s"
      }}>
        ⭐ Add to Watchlist
      </button>
    </div>
  );
}

function Inp({label,val,onChange,step=1,highlight}) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:5}}>
      <label style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.3px"}}>{label}</label>
      <input type="number" value={val} onChange={e => onChange(e.target.value)} step={step} style={{
        padding:"9px 12px",borderRadius:9,fontSize:14,fontWeight:700,fontFamily:"monospace",color:"#0f172a",outline:"none",
        border:highlight?"2px solid #f59e0b":"2px solid #e2e8f0",
        background:highlight?"#fffbeb":"#f8fafc",transition:"border-color 0.2s"
      }} />
    </div>
  );
}

function Res({label,value,color,sub}) {
  return (
    <div style={{background:"#f8fafc",borderRadius:12,padding:"12px 16px"}}>
      <div style={{fontSize:10,color:"#94a3b8",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.4px"}}>{label}</div>
      <div style={{fontSize:17,fontWeight:800,fontFamily:"monospace",color:color||"#0f172a",marginTop:2}}>{value}</div>
      {sub && <div style={{fontSize:9,color:"#94a3b8",marginTop:1}}>{sub}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// QUICK PICKS GRID
// ═══════════════════════════════════════════════════════
function QuickPicks({stocks, onSelect}) {
  return (
    <div>
      <h3 style={{fontSize:17,fontWeight:700,color:"#334155",margin:"0 0 18px",textAlign:"center"}}>Popular Stocks — Click to Analyze</h3>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
        {stocks.slice(0,16).map(s => {
          const mcap=s.cmp*s.shr, info=getMcapInfo(mcap);
          const ig=solveGrowth(s.pat,mcap,info.dr,info.fy,getSectorPE(s.sec));
          const igCol=ig>20?"#047857":ig>10?"#0891b2":ig>0?"#d97706":"#dc2626";
          return (
            <div key={s.sym} onClick={() => onSelect(s)} style={{
              background:"#fff",borderRadius:14,padding:"16px 18px",border:"1px solid #e2e8f0",
              cursor:"pointer",transition:"all 0.2s",display:"flex",flexDirection:"column",gap:6
            }}
            onMouseEnter={e => {e.currentTarget.style.borderColor="#f59e0b";e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,0.08)"}}
            onMouseLeave={e => {e.currentTarget.style.borderColor="#e2e8f0";e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontWeight:800,fontSize:14}}>{s.sym}</span>
                <span style={{fontSize:9,color:"#94a3b8",background:"#f1f5f9",padding:"2px 7px",borderRadius:5,fontWeight:600}}>{s.sec}</span>
              </div>
              <div style={{fontSize:16,fontWeight:800,fontFamily:"monospace",color:"#334155"}}>{fPr(s.cmp)}</div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:"1px solid #f1f5f9",paddingTop:7,marginTop:2}}>
                <span style={{fontSize:9,color:"#94a3b8",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.4px"}}>Implied CAGR</span>
                <span style={{fontSize:17,fontWeight:900,fontFamily:"monospace",color:igCol}}>{ig!=null?fP(ig):"N/A"}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// WATCHLIST PANEL
// ═══════════════════════════════════════════════════════
function WatchlistPanel({list, setList, onGo, stocks}) {
  const [sortBy, setSortBy] = useState("gap");
  const [sortDir, setSortDir] = useState("desc");
  const [editSym, setEditSym] = useState(null);

  const toggle = f => { if (sortBy===f) setSortDir(d => d==="asc"?"desc":"asc"); else {setSortBy(f);setSortDir("desc");} };

  const sorted = useMemo(() => [...list].sort((a,b) => {
    const av = sortBy==="gap"?a.gap:sortBy==="ig"?a.ig:sortBy==="mcap"?a.mcap:sortBy==="cmp"?a.cmp:0;
    const bv = sortBy==="gap"?b.gap:sortBy==="ig"?b.ig:sortBy==="mcap"?b.mcap:sortBy==="cmp"?b.cmp:0;
    return sortDir==="asc"?(av||0)-(bv||0):(bv||0)-(av||0);
  }), [list,sortBy,sortDir]);

  const updateItem = (sym,k,v) => {
    setList(prev => prev.map(w => {
      if (w.sym!==sym) return w;
      const u = {...w, inputs:{...w.inputs,[k]:parseFloat(v)||0}};
      const s = stocks.find(x => x.sym===sym);
      if (s) {
        const mcap=s.cmp*s.shr;
        u.ig = solveGrowth(s.pat, mcap, u.inputs.dr, u.inputs.fy, u.inputs.pe);
        u.iv = calcValue(s.pat, u.inputs.ec, u.inputs.dr, u.inputs.fy, u.inputs.pe);
        u.gap = u.inputs.ec - (u.ig||0);
      }
      return u;
    }));
  };

  if (list.length===0) return (
    <div style={{textAlign:"center",padding:"70px 40px",color:"#94a3b8",background:"#fff",borderRadius:18,border:"1px solid #e2e8f0"}}>
      <div style={{fontSize:40,marginBottom:12}}>⭐</div>
      <p style={{fontSize:17,fontWeight:700,color:"#334155",margin:"0 0 8px"}}>Your watchlist is empty</p>
      <p style={{fontSize:13,color:"#94a3b8",maxWidth:380,margin:"0 auto"}}>Search for stocks in the Screener tab, analyze them, and add them here to track daily implied growth rates</p>
    </div>
  );

  return (
    <div style={{background:"#fff",borderRadius:18,border:"1px solid #e2e8f0",overflow:"hidden",boxShadow:"0 1px 8px rgba(0,0,0,0.03)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"20px 24px",borderBottom:"1px solid #f1f5f9"}}>
        <h3 style={{fontSize:19,fontWeight:800,margin:0,display:"flex",alignItems:"center",gap:8}}>⭐ My Watchlist ({list.length})</h3>
        <button onClick={() => {
          const csv = ["Symbol,CMP,Market Cap,Implied CAGR%,Expected CAGR%,Gap%,Signal,Exit PE,Disc Rate%,Forecast Yrs",
            ...sorted.map(w => [w.sym,w.cmp,w.mcap?.toFixed(0),w.ig?.toFixed(1),w.inputs?.ec,w.gap?.toFixed(1),getSignal(w.gap).t,w.inputs?.pe,w.inputs?.dr,w.inputs?.fy].join(","))
          ].join("\n");
          const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"})); a.download=`watchlist_${new Date().toISOString().slice(0,10)}.csv`; a.click();
        }} style={{padding:"7px 14px",borderRadius:9,border:"1.5px solid #e2e8f0",background:"#f8fafc",color:"#334155",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
          📥 Export CSV
        </button>
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead>
            <tr>
              {[["sym","Stock"],["cmp","CMP"],["mcap","M.Cap"],["ig","Implied CAGR"],["ec","Expected"],["gap","Gap"],["sig","Signal"],["act",""]].map(([k,l]) => (
                <th key={k} onClick={() => k!=="act"&&k!=="sig"&&toggle(k)} style={{
                  padding:"12px 14px",textAlign:"left",fontSize:10,fontWeight:700,color:"#94a3b8",
                  textTransform:"uppercase",letterSpacing:"0.4px",borderBottom:"1px solid #f1f5f9",
                  cursor:k!=="act"?"pointer":"default",userSelect:"none"
                }}>
                  <span style={{display:"flex",alignItems:"center",gap:3}}>{l}{sortBy===k&&<span style={{color:"#f59e0b"}}>{sortDir==="asc"?"▲":"▼"}</span>}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(w => {
              const sig=getSignal(w.gap);
              return (
                <React.Fragment key={w.sym}>
                  <tr style={{cursor:"pointer",transition:"background 0.15s"}}
                    onMouseEnter={e => e.currentTarget.style.background="#fafbfc"}
                    onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                    <td onClick={() => onGo(stocks.find(x=>x.sym===w.sym))} style={td}><span style={{fontWeight:700}}>{w.sym}</span></td>
                    <td onClick={() => onGo(stocks.find(x=>x.sym===w.sym))} style={td}>{fPr(w.cmp)}</td>
                    <td onClick={() => onGo(stocks.find(x=>x.sym===w.sym))} style={td}>{fCr(w.mcap)}</td>
                    <td onClick={() => onGo(stocks.find(x=>x.sym===w.sym))} style={{...td,color:w.ig>15?"#059669":w.ig>0?"#0891b2":"#dc2626",fontWeight:700}}>{fP(w.ig)}</td>
                    <td onClick={() => onGo(stocks.find(x=>x.sym===w.sym))} style={td}>{fP(w.inputs?.ec)}</td>
                    <td onClick={() => onGo(stocks.find(x=>x.sym===w.sym))} style={{...td,color:w.gap>0?"#059669":"#dc2626",fontWeight:700}}>{w.gap>0?"+":""}{w.gap?.toFixed(1)}%</td>
                    <td onClick={() => onGo(stocks.find(x=>x.sym===w.sym))} style={td}><span style={{padding:"3px 9px",borderRadius:7,fontSize:11,fontWeight:700,background:sig.bg,color:sig.c}}>{sig.t}</span></td>
                    <td style={td}>
                      <div style={{display:"flex",gap:5}}>
                        <button onClick={() => setEditSym(editSym===w.sym?null:w.sym)} style={ib} title="Edit">✎</button>
                        <button onClick={() => setList(prev=>prev.filter(x=>x.sym!==w.sym))} style={{...ib,color:"#dc2626"}} title="Remove">✕</button>
                      </div>
                    </td>
                  </tr>
                  {editSym===w.sym && (
                    <tr><td colSpan={8} style={{padding:"10px 14px",background:"#f8fafc",borderBottom:"1px solid #f1f5f9"}}>
                      <div style={{display:"flex",gap:14,flexWrap:"wrap",alignItems:"end"}}>
                        <MI label="Forecast Yrs" val={w.inputs?.fy} onChange={v=>updateItem(w.sym,"fy",v)} />
                        <MI label="Disc Rate %" val={w.inputs?.dr} onChange={v=>updateItem(w.sym,"dr",v)} />
                        <MI label="Exit PE" val={w.inputs?.pe} onChange={v=>updateItem(w.sym,"pe",v)} />
                        <MI label="Expected CAGR %" val={w.inputs?.ec} onChange={v=>updateItem(w.sym,"ec",v)} />
                        <button onClick={() => setEditSym(null)} style={{...ib,color:"#059669",fontSize:13}}>✓ Done</button>
                      </div>
                    </td></tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const td = {padding:"12px 14px",fontSize:13,borderBottom:"1px solid #f8fafc"};
const ib = {border:"none",background:"transparent",cursor:"pointer",padding:"3px 7px",borderRadius:5,fontSize:14,color:"#64748b"};

function MI({label,val,onChange}) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:3}}>
      <span style={{fontSize:10,color:"#64748b",fontWeight:600}}>{label}</span>
      <input type="number" value={val} onChange={e=>onChange(e.target.value)}
        style={{width:75,padding:"4px 7px",border:"1.5px solid #e2e8f0",borderRadius:6,fontSize:13,fontWeight:700,fontFamily:"monospace"}} />
    </div>
  );
}
