// ══════════════════════════════════════════════════════════════════
// api/scanner.js — Scanner Endpoint
// Scan saham IHSG untuk setup: breakout, volume spike, dll
// ══════════════════════════════════════════════════════════════════

const { computeAll }       = require('../lib/indicators');
const { analyzeVolume }    = require('../lib/volume');
const { analyzeStructure } = require('../lib/structure');
const { computeScore }     = require('../lib/scoring');
const { quickScan }        = require('../lib/scanner');
const { cacheGet, cacheSet } = require('../lib/cache');
const { fetchPriceDataWithFallback } = require('../lib/datasource');
const { applyCompression } = require('../lib/compress');
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
// fetchCandles: wrapper tipis pakai datasource.js (Yahoo → Stooq fallback)
async function fetchCandles(ticker) {
  try {
    const data = await fetchPriceDataWithFallback(ticker, false);
    if (!data || !data.candles || data.candles.length < 20) return null;
    if (data.source && data.source !== 'yahoo') {
      console.log('[SCANNER FALLBACK]', ticker, '->', data.source);
    }
    return {
      ticker,
      candles:   data.candles,
      lastClose: data.current,
      prevClose: data.prevClose
    };
  } catch (e) {
    console.warn('[SCANNER] fetchCandles gagal:', ticker, e.message);
    return null;
  }
}


function scanOneTicker(ticker, candleData) {
  if (!candleData || !candleData.candles || candleData.candles.length < 20) return null;

  const candles  = candleData.candles;
  const metadata = IDX_STOCKS[ticker] || null;

  const prev      = candleData.prevClose || candleData.lastClose;
  const changePct = prev ? parseFloat(((candleData.lastClose - prev) / prev * 100).toFixed(2)) : 0;

  const indicators = computeAll(candles);
  const volumeData = analyzeVolume(candles);
  const structure  = analyzeStructure(candles, indicators, volumeData);
  const scoring    = computeScore(indicators, volumeData, structure, { current: candleData.lastClose });
  const { signals } = quickScan(ticker, candles, indicators, volumeData, structure, scoring, changePct, cacheGet);

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
    // v4: tambah field MA dan SMF untuk UI chips
    ema9:           indicators.ma ? indicators.ma.ema9  : null,
    sma50:          indicators.ma ? indicators.ma.sma50 : null,
    maAlignment:    indicators.ma ? indicators.ma.alignment : null,
    smfBias:        indicators.smartMoney ? indicators.smartMoney.bias  : null,
    smfRatio:       indicators.smartMoney ? indicators.smartMoney.ratio : null,
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
        // v4: tambah konfirmasi SMF — lebih akurat dari sebelumnya
        const smfOk    = !r.smfBias || r.smfBias === 'strong_buying' || r.smfBias === 'mild_buying';
        return hasBull && rsiOk && r.score >= 6 && notDeath && smfOk;
      }).sort((a, b) => b.score - a.score);
    }

    default:
      // Filter berdasarkan signal type (breakout, volume_spike, oversold, dll)
      return results.filter(r => r.signals.some(s => s.type === filter));
  }
}

async function runScan(filter, res) {
  const startTime = Date.now();
  const isStreaming = res && res.write && typeof res.write === 'function';

  // Universe: semua Utama + batch rotasi Pengembangan
  const universe = UTAMA_UNIVERSE.concat(getPengembanganBatch());
  console.log('[SCANNER] Universe:', universe.length, '(Utama=' + UTAMA_UNIVERSE.length + ' + Pengembangan batch=' + PENGEMBANGAN_BATCH_SIZE + ')');

  // Fetch dalam batch 60 paralel agar progressive
  const BATCH_SIZE = 60;
  const raw = [];

  for (let batchStart = 0; batchStart < universe.length; batchStart += BATCH_SIZE) {
    if (Date.now() - startTime > VERCEL_DEADLINE) {
      console.warn('[SCANNER] Mendekati deadline, berhenti di batch', batchStart);
      break;
    }

    const batch   = universe.slice(batchStart, batchStart + BATCH_SIZE);
    const fetched = await Promise.all(batch.map(fetchCandles));

    for (let i = 0; i < batch.length; i++) {
      if (!fetched[i]) continue;
      const result = scanOneTicker(batch[i], fetched[i]);
      if (result) raw.push(result);
    }

    // Progressive: kirim partial hasil setelah batch pertama selesai
    if (isStreaming && batchStart === 0 && raw.length > 0) {
      const partial = applyFilter([...raw].sort((a, b) => b.score - a.score), filter);
      try {
        res.write('data: ' + JSON.stringify({
          type:      'partial',
          results:   partial.slice(0, 20),
          total:     partial.length,
          progress:  Math.round((batchStart + BATCH_SIZE) / universe.length * 100)
        }) + '\n\n');
      } catch (e) { /* client disconnected */ }
    }
  }

  // Sort by score sebelum filter agar urutan konsisten
  raw.sort((a, b) => b.score - a.score);

  // ── Agregat return per sektor dari hasil scan ─────────────────
  // Simpan ke cache agar lib/context.js bisa pakai data peer nyata
  try {
    const sectorMap = {};
    for (const r of raw) {
      if (!r.sector || r.sector === 'Unknown') continue;
      if (!sectorMap[r.sector]) sectorMap[r.sector] = [];
      sectorMap[r.sector].push(r.changePct);
    }
    const sectorStats = {};
    for (const [sector, returns] of Object.entries(sectorMap)) {
      if (returns.length < 2) continue;
      const sorted = [...returns].sort((a, b) => a - b);
      const mid    = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
      const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
      sectorStats[sector] = {
        median:    parseFloat(median.toFixed(2)),
        avg:       parseFloat(avg.toFixed(2)),
        count:     returns.length,
        updatedAt: new Date().toISOString()
      };
    }
    if (Object.keys(sectorStats).length > 0) {
      cacheSet('sector:returns', sectorStats, 30 * 60 * 1000); // TTL 30 menit
      console.log('[SCANNER] Sector returns cached:', Object.keys(sectorStats).length, 'sektor');
    }
  } catch (e) {
    console.warn('[SCANNER] Gagal cache sector returns:', e.message);
  }

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
  const isStream = req.query && req.query.stream === 'true';

  // Terapkan gzip compression — skip untuk SSE (streaming)
  if (!isStream) applyCompression(req, res);

  const cacheKey = 'scanner:' + filter;
  const cached   = cacheGet(cacheKey);
  if (cached) {
    console.log('[SCANNER CACHE HIT]', filter);
    return res.status(200).json(Object.assign({}, cached, { fromCache: true }));
  }

  console.log('[SCANNER START] filter=' + filter + ' stream=' + isStream);
  try {
    if (isStream) {
      // SSE mode — progressive loading
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      const data = await runScan(filter, res);
      cacheSet(cacheKey, data, CACHE_TTL);
      // Kirim hasil final
      res.write('data: ' + JSON.stringify(Object.assign({}, data, { type: 'complete', fromCache: false })) + '\n\n');
      res.end();
    } else {
      const data = await runScan(filter, null);
      cacheSet(cacheKey, data, CACHE_TTL);
      console.log('[SCANNER DONE]', data.total, 'results dari', data.universe, 'universe');
      return res.status(200).json(data);
    }
  } catch (e) {
    console.error('[SCANNER ERROR]', e.message);
    if (isStream) {
      res.write('data: ' + JSON.stringify({ type: 'error', error: e.message }) + '\n\n');
      res.end();
    } else {
      return res.status(500).json({ error: 'Scanner gagal: ' + e.message });
    }
  }
};
