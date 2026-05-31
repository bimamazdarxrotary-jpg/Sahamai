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

// Bangun SCAN_UNIVERSE dari idx-stocks.json — selalu sync dengan database
// Filter: hanya board Utama dan Pengembangan (exclude Indeks)
// Prioritaskan saham Utama dulu, lalu Pengembangan, max 200 saham
const _buildScanUniverse = function() {
  const utama = [];
  const pengembangan = [];
  for (const ticker of Object.keys(IDX_STOCKS)) {
    const data = IDX_STOCKS[ticker];
    if (!data || data.sector === 'Indeks') continue;
    if (data.board === 'Utama') utama.push(ticker);
    else if (data.board === 'Pengembangan') pengembangan.push(ticker);
  }
  // Prioritas Utama semua + Pengembangan sampai max 200
  const combined = utama.concat(pengembangan);
  return combined.slice(0, 200);
};
const SCAN_UNIVERSE = _buildScanUniverse();

const CACHE_TTL       = 10 * 60 * 1000; // 10 menit
const FETCH_TIMEOUT   = 5000;            // FIX 3: 5 detik timeout per saham
const VERCEL_DEADLINE = 8500;            // berhenti fetch setelah 8.5 detik (batas Vercel 10 detik)

// FIX 3: Fetch dengan timeout agar tidak nunggu Yahoo terlalu lama
function fetchWithTimeout(url, options, timeoutMs) {
  return new Promise(function(resolve) {
    const timer = setTimeout(function() { resolve(null); }, timeoutMs);
    fetch(url, options).then(function(res) {
      clearTimeout(timer);
      resolve(res);
    }).catch(function(e) {
      clearTimeout(timer);
      console.warn('[SCANNER] Fetch timeout/error:', e && e.message);
      resolve(null);
    });
  });
}

async function fetchCandles(ticker) {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + ticker + '.JK?interval=1d&range=3mo';
  try {
    const res = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json'
      }
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
        open:   Math.round(quotes.open  && quotes.open[i]   ? quotes.open[i]   : quotes.close[i]),
        high:   Math.round(quotes.high  && quotes.high[i]   ? quotes.high[i]   : quotes.close[i]),
        low:    Math.round(quotes.low   && quotes.low[i]    ? quotes.low[i]    : quotes.close[i]),
        close:  Math.round(quotes.close[i]),
        volume: quotes.volume && quotes.volume[i] ? quotes.volume[i] : 0
      });
    }
    if (candles.length < 20) return null;

    return {
      ticker:    ticker,
      candles:   candles,
      lastClose: candles[candles.length - 1].close,
      lastVol:   candles[candles.length - 1].volume
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

  // Gunakan quickScan dari lib/scanner.js — tidak duplikasi logika sinyal
  const { signals } = quickScan(ticker, candles, indicators, volumeData, structure, scoring);

  if (!signals.length) return null;

  // Change pct
  let changePct = 0;
  if (candles.length >= 2) {
    const prev = candles[candles.length - 2].close;
    changePct = prev ? parseFloat(((candleData.lastClose - prev) / prev * 100).toFixed(2)) : 0;
  }

  return {
    ticker:         ticker,
    name:           metadata ? metadata.name : ticker,
    sector:         metadata ? metadata.sector : 'Unknown',
    lastClose:      candleData.lastClose,
    changePct:      changePct,
    isUp:           changePct >= 0,
    score:          scoring ? scoring.final : 5,
    recommendation: scoring ? scoring.recommendation : 'TAHAN',
    confidence:     scoring ? scoring.confidence : 'Low',
    rsi:            indicators.rsi,
    signals:        signals,
    topSignal:      signals[0]
  };
}

// FIX 3: Fetch SEMUA saham paralel, bukan per batch berurutan
// Jauh lebih cepat — semua request jalan serentak, dibatasi deadline Vercel
async function runScan(filter) {
  const startTime = Date.now();
  const universe  = SCAN_UNIVERSE;

  // Fetch semua sekaligus (paralel penuh)
  const fetchedAll = await Promise.all(universe.map(fetchCandles));

  const results = [];
  for (let i = 0; i < universe.length; i++) {
    // Berhenti proses jika sudah mendekati deadline Vercel
    if (Date.now() - startTime > VERCEL_DEADLINE) {
      console.warn('[SCANNER] Mendekati deadline, berhenti di indeks ' + i);
      break;
    }

    if (!fetchedAll[i]) continue;
    const result = scanOneTicker(universe[i], fetchedAll[i]);
    if (!result) continue;

    if (filter && filter !== 'all') {
      const match = result.signals.some(function(s) { return s.type === filter; });
      if (!match) continue;
    }

    results.push(result);
  }

  results.sort(function(a, b) { return b.score - a.score; });

  return {
    results:   results,
    total:     results.length,
    universe:  universe.length,
    filter:    filter || 'all',
    scannedAt: new Date().toISOString()
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

  console.log('[SCANNER START]', filter);
  try {
    const data = await runScan(filter);
    cacheSet(cacheKey, data, CACHE_TTL);
    console.log('[SCANNER DONE]', data.total, 'results');
    return res.status(200).json(data);
  } catch (e) {
    console.error('[SCANNER ERROR]', e.message);
    return res.status(500).json({ error: 'Scanner gagal: ' + e.message });
  }
};
