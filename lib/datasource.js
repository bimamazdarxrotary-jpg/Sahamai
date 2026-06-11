// ══════════════════════════════════════════════════════════════════
// lib/datasource.js — Multi-timeframe price fetcher
// Daily (primary), Weekly, Monthly
// Primary: Yahoo Finance | Fallback: Stooq
// ══════════════════════════════════════════════════════════════════
const log = require('./logger');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json,text/html,*/*',
  'Accept-Language': 'en-US,en;q=0.9'
};

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Yahoo Finance ─────────────────────────────────────────────────
async function fetchYahoo(ticker, interval, range) {
  const symbol  = ticker.endsWith('.JK') ? ticker : `${ticker}.JK`;
  const url     = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${range}&events=div,splits`;
  const res     = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Yahoo ${interval} HTTP ${res.status}`);
  const json    = await res.json();
  const result  = json?.chart?.result?.[0];
  if (!result) throw new Error(`Yahoo ${interval}: no result`);
  const ts      = result.timestamp || [];
  const q       = result.indicators?.quote?.[0] || {};
  if (!ts.length || !q.close?.length) throw new Error(`Yahoo ${interval}: empty data`);
  const candles = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i], v = q.volume?.[i];
    if (c == null || isNaN(c) || c <= 0) continue;
    candles.push({ time: ts[i]*1000, open: Math.round(o||c), high: Math.round(h||c), low: Math.round(l||c), close: Math.round(c), volume: v||0 });
  }
  if (!candles.length) throw new Error(`Yahoo ${interval}: all null`);
  return candles;
}

// ── Stooq fallback (daily only) ───────────────────────────────────
async function fetchStooq(ticker) {
  const sym  = ticker.toLowerCase().replace('.jk','');
  const url  = `https://stooq.com/q/d/l/?s=${sym}.jk&i=d`;
  const res  = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Stooq HTTP ${res.status}`);
  const text = await res.text();
  if (!text || text.includes('No data')) throw new Error('Stooq: no data');
  const lines   = text.trim().split('\n').slice(1);
  const candles = [];
  for (const line of lines) {
    const [date,o,h,l,c,v] = line.split(',');
    if (!c || isNaN(parseFloat(c))) continue;
    const ts = new Date(date.trim()).getTime();
    if (isNaN(ts)) continue;
    candles.push({ time: ts, open: Math.round(parseFloat(o||c)), high: Math.round(parseFloat(h||c)), low: Math.round(parseFloat(l||c)), close: Math.round(parseFloat(c)), volume: parseInt(v||0) });
  }
  if (!candles.length) throw new Error('Stooq: parse failed');
  return candles.sort((a,b) => a.time - b.time).slice(-200);
}

// ── Weekly dari daily (aggregasi) ─────────────────────────────────
function aggregateToWeekly(dailyCandles) {
  if (!dailyCandles || !dailyCandles.length) return [];
  const weeks = {};
  for (const c of dailyCandles) {
    const d   = new Date(c.time);
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    const mon = new Date(d); mon.setDate(d.getDate() + diff);
    const key = `${mon.getFullYear()}-${String(mon.getMonth()+1).padStart(2,'0')}-${String(mon.getDate()).padStart(2,'0')}`;
    if (!weeks[key]) weeks[key] = { time: mon.getTime(), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
    else {
      weeks[key].high   = Math.max(weeks[key].high,   c.high);
      weeks[key].low    = Math.min(weeks[key].low,    c.low);
      weeks[key].close  = c.close;
      weeks[key].volume += c.volume || 0;
    }
  }
  return Object.values(weeks).sort((a,b) => a.time - b.time);
}

// ── Monthly dari daily (aggregasi) ────────────────────────────────
function aggregateToMonthly(dailyCandles) {
  if (!dailyCandles || !dailyCandles.length) return [];
  const months = {};
  for (const c of dailyCandles) {
    const d   = new Date(c.time);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    if (!months[key]) months[key] = { time: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
    else {
      months[key].high   = Math.max(months[key].high,   c.high);
      months[key].low    = Math.min(months[key].low,    c.low);
      months[key].close  = c.close;
      months[key].volume += c.volume || 0;
    }
  }
  return Object.values(months).sort((a,b) => a.time - b.time);
}

// ── Sanitasi data (corporate action guard) ────────────────────────
function sanitizeCandles(candles) {
  if (!candles || !candles.length) return candles;
  const result = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) { result.push(candles[i]); continue; }
    const prev = candles[i-1], cur = candles[i];
    const chg  = Math.abs((cur.close - prev.close) / prev.close * 100);
    if (chg > 30) { log.warn('datasource', `Gap >30% di ${new Date(cur.time).toISOString().slice(0,10)}, diduga corp action`); }
    result.push(cur);
  }
  return result;
}

// ── Main: fetch dengan retry + fallback ───────────────────────────
async function fetchWithRetry(fn, retries, delay) {
  for (let i = 0; i <= retries; i++) {
    try { return await fn(); }
    catch (e) { if (i === retries) throw e; await sleep(delay * (i + 1)); }
  }
}

// Fetch daily + cari apakah index
async function fetchDailyCandles(ticker) {
  const isIndex = ticker === 'IHSG' || ticker === '^JKSE';
  const yahooTicker = isIndex ? '^JKSE' : ticker;

  let candles;
  try {
    // Fetch 14 bulan daily untuk dapat 200 candle
    candles = await fetchWithRetry(() => fetchYahoo(yahooTicker, '1d', '14mo'), 1, 500);
  } catch (e) {
    log.warn('datasource', `Yahoo daily gagal: ${e.message}, fallback Stooq`);
    if (!isIndex) candles = await fetchWithRetry(() => fetchStooq(ticker), 1, 500);
    else throw e;
  }
  return sanitizeCandles(candles);
}

// ── fetchPriceDataWithFallback — entry point utama ────────────────
// Mengembalikan daily, weekly, monthly candles sekaligus
async function fetchPriceDataWithFallback(ticker) {
  const isIndex = ticker === 'IHSG' || ticker === '^JKSE';

  const dailyCandles = await fetchDailyCandles(ticker);
  if (!dailyCandles.length) throw new Error(`Tidak ada data harga untuk ${ticker}`);

  // Weekly & Monthly dari agregasi daily (lebih reliable vs Yahoo weekly yang kadang gap)
  const weeklyCandles  = aggregateToWeekly(dailyCandles);
  const monthlyCandles = aggregateToMonthly(dailyCandles);

  const last    = dailyCandles[dailyCandles.length - 1];
  const prev    = dailyCandles[dailyCandles.length - 2];
  const change    = prev ? Math.round(last.close - prev.close) : 0;
  const changePct = prev ? parseFloat(((last.close - prev.close) / prev.close * 100).toFixed(2)) : 0;

  return {
    ticker,
    isIndex,
    candles:        dailyCandles,
    weeklyCandles,
    monthlyCandles,
    current:        last.close,
    change,
    changePct,
    high:           last.high,
    low:            last.low,
    volume:         last.volume,
    history:        dailyCandles.slice(-60),   // untuk chart frontend
    candleCount:    { daily: dailyCandles.length, weekly: weeklyCandles.length, monthly: monthlyCandles.length }
  };
}

module.exports = { fetchPriceDataWithFallback, aggregateToWeekly, aggregateToMonthly };
