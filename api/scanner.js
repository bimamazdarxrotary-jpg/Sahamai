// ══════════════════════════════════════════════════════════════════
// api/scanner.js — Scanner Endpoint
// Scan saham IHSG untuk setup: breakout, volume spike, dll
// ══════════════════════════════════════════════════════════════════

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const { computeAll }       = require('../lib/indicators');
const { analyzeVolume }    = require('../lib/volume');
const { analyzeStructure } = require('../lib/structure');
const { computeScore }     = require('../lib/scoring');
const { quickScan }        = require('../lib/scanner');
const { cacheGet, cacheSet } = require('../lib/cache');
const IDX_STOCKS           = require('../data/idx-stocks.json');

// ── Bangun universe dari idx-stocks.json ──────────────────────────
// Utama: SEMUA (349 saham) — likuid, layak di-scan selalu
// Pengembangan: di-rotasi per batch agar semua 270 saham
//   terjangkau tanpa melebihi batas waktu Vercel
const _buildUniverses = function() {
  const utama = [], pengembangan = [];
  for (const ticker of Object.keys(IDX_STOCKS)) {
    const data = IDX_STOCKS[ticker];
    if (!data || data.sector === 'Indeks') continue;
    if (data.board === 'Utama') utama.push(ticker);
    else if (data.board === 'Pengembangan') pengembangan.push(ticker);
  }
  return { utama, pengembangan };
};
const { utama: UTAMA_UNIVERSE, pengembangan: PENGEMBANGAN_UNIVERSE } = _buildUniverses();

// Pengembangan dirotasi: setiap request ambil batch berbeda
// sehingga dalam ~3 request, semua 270 saham Pengembangan terjangkau
const PENGEMBANGAN_BATCH_SIZE = 80;
let _pengembangBatchIdx = 0;
function getPengembanganBatch() {
  const start = (_pengembangBatchIdx * PENGEMBANGAN_BATCH_SIZE) % PENGEMBANGAN_UNIVERSE.length;
  _pengembangBatchIdx++;
  const batch = [];
  for (let i = 0; i < PENGEMBANGAN_BATCH_SIZE; i++) {
    batch.push(PENGEMBANGAN_UNIVERSE[(start + i) % PENGEMBANGAN_UNIVERSE.length]);
  }
  return batch;
}

const CACHE_TTL       = 10 * 60 * 1000; // 10 menit
const FETCH_TIMEOUT   = 4000;            // 4 detik per saham (lebih ketat)
const VERCEL_DEADLINE = 24000;           // 24 detik — batas aman dari maxDuration 30s

// ── Fetch dengan timeout ──────────────────────────────────────────
function fetchWithTimeout(url, options, timeoutMs) {
  return new Promise(function(resolve) {
    const timer = setTimeout(function() { resolve(null); }, timeoutMs);
    fetch(url, options).then(function(res) {
      clearTimeout(timer);
      resolve(res);
    }).catch(function(e) {
      clearTimeout(timer);
      console.warn('[SCANNER] Fetch error:', e && e.message);
      resolve(null);
    });
  });
}

async function fetchCandles(ticker) {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + ticker + '.JK?interval=1d&range=3mo';
  try {
    const res = await fetchWithTimeout(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' }
    }, FETCH_TIMEOUT);

    if (!res || !res.ok) return null;

    const json       = await res.json();
    const result     = json && json.chart && json.chart.result && json.chart.result[0];
    const meta       = result && result.meta;
    const quotes     = result && result.indicators && result.indicators.quote && result.indicators.quote[0];
    const timestamps = result && result.timestamp;
    if (!meta || !quotes || !timestamps) return null;

    const candles = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (!quotes.close[i]) continue;
      candles.push({
        date:   new Date(timestamps[i] * 1000).toISOString().split('T')[0],
        open:   Math.round(quotes.open   && quotes.open[i]   ? quotes.open[i]   : quotes.close[i]),
        high:   Math.round(quotes.high   && quotes.high[i]   ? quotes.high[i]   : quotes.close[i]),
        low:    Math.round(quotes.low    && quotes.low[i]    ? quotes.low[i]    : quotes.close[i]),
        close:  Math.round(quotes.close[i]),
        volume: quotes.volume && quotes.volume[i] ? quotes.volume[i] : 0
      });
    }
    if (candles.length < 20) return null;

    // Gunakan regularMarketPrice dari meta sebagai harga terakhir yang akurat
    // (lebih fresh dari candle terakhir yang bisa saja data kemarin)
    const lastClose = meta.regularMarketPrice
      ? Math.round(meta.regularMarketPrice)
      : candles[candles.length - 1].close;

    // Gunakan chartPreviousClose dari meta sebagai harga penutupan sebelumnya
    // (akurat untuk hitung changePct hari ini)
    const prevClose = meta.chartPreviousClose
      ? Math.round(meta.chartPreviousClose)
      : (candles.length >= 2 ? candles[candles.length - 2].close : lastClose);

    // Sanity check: jika changePct > 25% kemungkinan data error, fallback ke candle
    const rawChangePct = prevClose ? ((lastClose - prevClose) / prevClose * 100) : 0;
    const finalPrevClose = Math.abs(rawChangePct) > 25
      ? (candles.length >= 2 ? candles[candles.length - 2].close : lastClose)
      : prevClose;

    return {
      ticker,
      candles,
      lastClose,
      prevClose: finalPrevClose
    };
  } catch (e) {
    console.warn('[SCANNER] fetchCandles gagal:', e.message);
    return null;
  }
}

function scanOneTicker(ticker, candleData) {
  if (!candleData || !candleData.candles || candleData.candles.length < 20) return null;

  const candles  = candleData.candles;
  const metadata = IDX_STOCKS[ticker] || null;

  const indicators = computeAll(candles);
  const volumeData = analyzeVolume(candles);
  const structure  = analyzeStructure(candles, indicators, volumeData);
  const scoring    = computeScore(indicators, volumeData, structure, { current: candleData.lastClose });
  const { signals } = quickScan(ticker, candles, indicators, volumeData, structure, scoring);

  if (!signals.length) return null;

  const prev      = candleData.prevClose || candleData.lastClose;
  const changePct = prev ? parseFloat(((candleData.lastClose - prev) / prev * 100).toFixed(2)) : 0;

  return {
    ticker,
    name:           metadata ? metadata.name   : ticker,
    sector:         metadata ? metadata.sector  : 'Unknown',
    board:          metadata ? metadata.board   : 'Unknown',
    lastClose:      candleData.lastClose,
    changePct,
    isUp:           changePct >= 0,
    score:          scoring ? scoring.final          : 5,
    recommendation: scoring ? scoring.recommendation : 'TAHAN',
    confidence:     scoring ? scoring.confidence     : 'Low',
    rsi:            indicators.rsi,
    signals,
    topSignal:      signals[0]
  };
}

// ── Filter backend — pindah dari client ke server ─────────────────
function applyFilter(results, filter) {
  if (!filter || filter === 'all') return results;

  switch (filter) {
    case 'bullish':
      return results.filter(r => r.score >= 6 || r.recommendation === 'BELI' || r.recommendation === 'AKUMULASI');

    case 'naik':
      return results
        .filter(r => r.isUp && r.changePct > 0)
        .sort((a, b) => b.changePct - a.changePct);

    case 'ready_pump': {
      return results.filter(r => {
        const hasBull  = r.signals.some(s => s.direction === 'long' && (s.strength === 'high' || s.strength === 'medium'));
        const rsiOk    = r.rsi == null || (r.rsi < 45 && r.rsi > 10);
        const notDeath = !r.signals.some(s => s.type === 'death_cross');
        return hasBull && rsiOk && r.score >= 6 && notDeath;
      }).sort((a, b) => b.score - a.score);
    }

    default:
      // Filter berdasarkan signal type (breakout, volume_spike, oversold, dll)
      return results.filter(r => r.signals.some(s => s.type === filter));
  }
}

async function runScan(filter) {
  const startTime = Date.now();

  // Universe: semua Utama + batch rotasi Pengembangan
  const universe = UTAMA_UNIVERSE.concat(getPengembanganBatch());
  console.log('[SCANNER] Universe:', universe.length, '(Utama=' + UTAMA_UNIVERSE.length + ' + Pengembangan batch=' + PENGEMBANGAN_BATCH_SIZE + ')');

  // Fetch semua paralel
  const fetchedAll = await Promise.all(universe.map(fetchCandles));
  console.log('[SCANNER] Fetch selesai dalam', Date.now() - startTime, 'ms');

  const raw = [];
  for (let i = 0; i < universe.length; i++) {
    if (Date.now() - startTime > VERCEL_DEADLINE) {
      console.warn('[SCANNER] Mendekati deadline, berhenti di indeks', i);
      break;
    }
    if (!fetchedAll[i]) continue;
    const result = scanOneTicker(universe[i], fetchedAll[i]);
    if (result) raw.push(result);
  }

  // Sort by score sebelum filter agar urutan konsisten
  raw.sort((a, b) => b.score - a.score);

  const results = applyFilter(raw, filter);

  return {
    results,
    total:        results.length,
    totalRaw:     raw.length,
    universe:     universe.length,
    utamaCount:   UTAMA_UNIVERSE.length,
    pengembanganBatch: PENGEMBANGAN_BATCH_SIZE,
    filter:       filter || 'all',
    scannedAt:    new Date().toISOString(),
    scanMs:       Date.now() - startTime
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const filter   = (req.query && req.query.filter) || (req.body && req.body.filter) || 'all';
  const cacheKey = 'scanner:' + filter;
  const cached   = cacheGet(cacheKey);
  if (cached) {
    console.log('[SCANNER CACHE HIT]', filter);
    return res.status(200).json(Object.assign({}, cached, { fromCache: true }));
  }

  console.log('[SCANNER START] filter=' + filter);
  try {
    const data = await runScan(filter);
    cacheSet(cacheKey, data, CACHE_TTL);
    console.log('[SCANNER DONE]', data.total, 'results dari', data.universe, 'universe');
    return res.status(200).json(data);
  } catch (e) {
    console.error('[SCANNER ERROR]', e.message);
    return res.status(500).json({ error: 'Scanner gagal: ' + e.message });
  }
};
