// ══════════════════════════════════════════════════════════════════
// lib/datasource.js — Multi-source price data fetcher
// Urutan fallback: Yahoo Finance → Stooq → null
// ══════════════════════════════════════════════════════════════════

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const FETCH_TIMEOUT = 8000;

function sleep(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

async function fetchWithTimeout(url, options, timeoutMs) {
  timeoutMs = timeoutMs || FETCH_TIMEOUT;
  return new Promise(function(resolve) {
    const timer = setTimeout(function() { resolve(null); }, timeoutMs);
    fetch(url, options).then(function(res) {
      clearTimeout(timer);
      resolve(res);
    }).catch(function() {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

// Retry dengan exponential backoff — max 2 retry
async function fetchWithRetry(url, options, maxRetry) {
  maxRetry = maxRetry || 2;
  for (let i = 0; i <= maxRetry; i++) {
    const res = await fetchWithTimeout(url, options);
    if (res && res.ok) return res;
    // Jangan retry untuk 4xx (client error)
    if (res && res.status >= 400 && res.status < 500) return res;
    if (i < maxRetry) {
      const delay = Math.pow(2, i) * 500; // 500ms, 1000ms
      console.warn('[DATASOURCE] Retry', i + 1, '/', maxRetry, 'untuk', url.split('?')[0], 'delay', delay + 'ms');
      await sleep(delay);
    }
  }
  return null;
}

// ── Normalisasi candles — output format standar ───────────────────
function buildPriceResult(candles, meta) {
  if (!candles || candles.length < 5) return null;

  const lastClose = candles[candles.length - 1].close;
  let prevClose   = candles.length >= 2 ? candles[candles.length - 2].close : lastClose;
  let change      = lastClose - prevClose;
  let changePct   = prevClose ? parseFloat((change / prevClose * 100).toFixed(2)) : 0;

  // Sanity check > 25% = corporate action / data error
  if (Math.abs(changePct) > 25) {
    const prev3 = candles.length >= 3 ? candles[candles.length - 3].close : lastClose;
    prevClose   = prev3;
    change      = lastClose - prevClose;
    changePct   = prevClose ? parseFloat((change / prevClose * 100).toFixed(2)) : 0;
    if (Math.abs(changePct) > 25) { change = 0; changePct = 0; }
  }

  const source = meta && meta.source ? meta.source : 'unknown';
  console.log('[DATASOURCE] buildPriceResult OK —', source, candles.length, 'candles, last close:', lastClose);

  return {
    current:   lastClose,   // expose langsung untuk scoring.scoreRisk likuiditas check
    prevClose: Math.round(prevClose),
    change:    Math.round(change),
    changePct,
    isUp:      change >= 0,
    high52w:   meta && meta.high52w ? Math.round(meta.high52w) : null,
    low52w:    meta && meta.low52w  ? Math.round(meta.low52w)  : null,
    volume:    candles[candles.length - 1].volume || null,
    marketCap: meta && meta.marketCap ? meta.marketCap : null,
    currency:  'IDR',
    candles,
    history:   candles.slice(-60),
    source
  };
}

// ── SOURCE 1: Yahoo Finance ───────────────────────────────────────
async function fetchFromYahoo(symbol, range) {
  range = range || '6mo';
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + symbol + '?interval=1d&range=' + range;

  try {
    const res = await fetchWithRetry(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' }
    }, 2);

    if (!res || !res.ok) return null;

    const json       = await res.json().catch(() => null);
    const result     = json && json.chart && json.chart.result && json.chart.result[0];
    const meta       = result && result.meta;
    const quotes     = result && result.indicators && result.indicators.quote && result.indicators.quote[0];
    const timestamps = result && result.timestamp;

    if (!meta || !quotes || !timestamps) return null;

    const candles = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (quotes.close[i] == null) continue;
      candles.push({
        date:   new Date(timestamps[i] * 1000).toISOString().split('T')[0],
        open:   Math.round(quotes.open   && quotes.open[i]   ? quotes.open[i]   : quotes.close[i]),
        high:   Math.round(quotes.high   && quotes.high[i]   ? quotes.high[i]   : quotes.close[i]),
        low:    Math.round(quotes.low    && quotes.low[i]    ? quotes.low[i]    : quotes.close[i]),
        close:  Math.round(quotes.close[i]),
        volume: quotes.volume && quotes.volume[i] ? quotes.volume[i] : 0
      });
    }

    if (candles.length < 5) return null;

    return buildPriceResult(candles, {
      high52w:   meta.fiftyTwoWeekHigh,
      low52w:    meta.fiftyTwoWeekLow,
      marketCap: meta.marketCap,
      source:    'yahoo'
    });
  } catch (e) {
    console.warn('[DATASOURCE] Yahoo error:', e.message);
    return null;
  }
}

// ── SOURCE 2: Stooq ───────────────────────────────────────────────
// Format: https://stooq.com/q/d/l/?s=BBCA.JK&i=d
// Return: CSV dengan header Date,Open,High,Low,Close,Volume
async function fetchFromStooq(ticker, isIndex) {
  // Stooq pakai suffix berbeda untuk IDX
  let symbol;
  if (isIndex) {
    symbol = ticker === 'IHSG' ? '^jkse' : '^jklq45';
  } else {
    symbol = ticker.toLowerCase() + '.jk';
  }

  const url = 'https://stooq.com/q/d/l/?s=' + symbol + '&i=d';

  try {
    const res = await fetchWithTimeout(url, {
      headers: { 'User-Agent': USER_AGENT }
    }, FETCH_TIMEOUT);

    if (!res || !res.ok) return null;

    const csv  = await res.text().catch(() => null);
    if (!csv || csv.includes('No data') || csv.trim().length < 50) return null;

    const lines   = csv.trim().split('\n');
    const header  = lines[0].toLowerCase();
    if (!header.includes('date') || !header.includes('close')) return null;

    const cols    = header.split(',');
    const iDate   = cols.indexOf('date');
    const iOpen   = cols.indexOf('open');
    const iHigh   = cols.indexOf('high');
    const iLow    = cols.indexOf('low');
    const iClose  = cols.indexOf('close');
    const iVol    = cols.indexOf('volume');

    const candles = [];
    // Stooq return ascending — ambil 130 hari terakhir
    const dataLines = lines.slice(1).filter(l => l.trim()).slice(-130);

    for (const line of dataLines) {
      const parts = line.split(',');
      const close = parseFloat(parts[iClose]);
      if (!close || isNaN(close)) continue;

      // Beberapa emiten kecil di Stooq hanya punya close — fallback OHLV ke close/0
      const open   = iOpen  >= 0 ? parseFloat(parts[iOpen])  : NaN;
      const high   = iHigh  >= 0 ? parseFloat(parts[iHigh])  : NaN;
      const low    = iLow   >= 0 ? parseFloat(parts[iLow])   : NaN;
      const vol    = iVol   >= 0 ? parseInt(parts[iVol])     : 0;

      candles.push({
        date:   parts[iDate] ? parts[iDate].trim() : '',
        open:   Math.round(!isNaN(open)  && open  > 0 ? open  : close),
        high:   Math.round(!isNaN(high)  && high  > 0 ? high  : close),
        low:    Math.round(!isNaN(low)   && low   > 0 ? low   : close),
        close:  Math.round(close),
        volume: !isNaN(vol) ? vol : 0
      });
    }

    if (candles.length < 5) return null;

    console.log('[DATASOURCE] Stooq berhasil untuk', ticker, '—', candles.length, 'candles');
    return buildPriceResult(candles, { source: 'stooq' });
  } catch (e) {
    console.warn('[DATASOURCE] Stooq error:', e.message);
    return null;
  }
}

// ── Main: fetch dengan fallback otomatis ──────────────────────────
async function fetchPriceDataWithFallback(ticker, isIndex) {
  // Build Yahoo symbol
  const yahooSymbol = isIndex
    ? (ticker === 'IHSG' ? '%5EJKSE' : '%5EJKLQ45')
    : ticker + '.JK';

  // Coba Yahoo dulu
  const yahooData = await fetchFromYahoo(yahooSymbol, isIndex ? '1y' : '6mo');
  if (yahooData && yahooData.candles && yahooData.candles.length >= 20) {
    return yahooData;
  }

  // Yahoo gagal — fallback ke Stooq
  console.warn('[DATASOURCE] Yahoo gagal untuk', ticker, '— fallback ke Stooq');
  const stooqData = await fetchFromStooq(ticker, isIndex);
  if (stooqData && stooqData.candles && stooqData.candles.length >= 20) {
    return stooqData;
  }

  // Semua gagal
  console.error('[DATASOURCE] Semua sumber gagal untuk', ticker);
  return null;
}

module.exports = { fetchPriceDataWithFallback };
