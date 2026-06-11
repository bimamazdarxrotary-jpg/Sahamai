// ══════════════════════════════════════════════════════════════════
// api/scanner.js — GET /api/scanner
// Batch scan universe IDX Papan Utama + rotasi Pengembangan
// SSE streaming untuk progress real-time
// ══════════════════════════════════════════════════════════════════
const { fetchPriceDataWithFallback } = require('../lib/datasource');
const { quickScan, isMarketCrashing } = require('../lib/scanner');
const { cacheGet, cacheSet }          = require('../lib/cache');
const log                             = require('../lib/logger');
const stocks                          = require('../data/idx-stocks.json');

// Rotasi batch Pengembangan
let _pengembangBatchIdx = 0;
const PENGEMBANGAN_BATCH_SIZE = 80;

function getTickerUniverse() {
  const tickers = Object.keys(stocks);
  const utama   = tickers.filter(t => stocks[t].board === 'Utama'        && stocks[t].sector !== 'Indeks');
  const dev     = tickers.filter(t => stocks[t].board === 'Pengembangan' && stocks[t].sector !== 'Indeks');
  const start   = (_pengembangBatchIdx * PENGEMBANGAN_BATCH_SIZE) % dev.length;
  const batch   = dev.slice(start, start + PENGEMBANGAN_BATCH_SIZE);
  _pengembangBatchIdx++;
  return [...utama, ...batch];
}

function applyFilter(results, filter) {
  if (!filter || filter === 'all') return results;
  switch (filter) {
    case 'bullish':
    case 'naik':
      return results.filter(r => r.signals.some(s => ['breakout','golden_cross','accumulation','oversold','macd_cross','divergence','fib_support','bb_squeeze','candle_bullish'].includes(s.type)));
    case 'bearish':
    case 'turun':
      return results.filter(r => r.signals.some(s => ['death_cross','macd_death_cross','divergence_bear','fib_resist','candle_bearish'].includes(s.type)));
    case 'ready_pump':
      return results.filter(r => r.quickScore >= 6 && (r.rsi == null || r.rsi < 50) && !r.signals.some(s=>s.type==='death_cross'));
    case 'volume_spike':
      return results.filter(r => r.signals.some(s => s.type === 'volume_spike' && s.strength === 'high'));
    case 'oversold':
      return results.filter(r => r.signals.some(s => s.type === 'oversold'));
    case 'breakout':
      return results.filter(r => r.signals.some(s => s.type === 'breakout'));
    case 'golden_cross':
      return results.filter(r => r.signals.some(s => s.type === 'golden_cross'));
    case 'death_cross':
      return results.filter(r => r.signals.some(s => s.type === 'death_cross'));
    case 'accumulation':
      return results.filter(r => r.signals.some(s => s.type === 'accumulation'));
    default:
      return results.filter(r => r.signals.some(s => s.type === filter));
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const filter  = req.query.filter || 'all';
  const cacheKey = `scanner:${filter}`;
  const cached   = cacheGet(cacheKey);
  if (cached) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json({ ...cached, fromCache: true });
  }

  // SSE setup
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders?.();

  const send = (data) => {
    try { res.write(`data: ${JSON.stringify(data)}\n\n`); }
    catch (_) {}
  };

  const universe = getTickerUniverse();
  const total    = universe.length;
  const results  = [];
  const TIMEOUT  = 4000;  // per saham
  const DEADLINE = Date.now() + 24000;

  log.info('scanner', `Scan ${total} tickers, filter=${filter}`);
  send({ type: 'start', total, filter, crashMode: isMarketCrashing() });

  let done = 0;
  // Proses secara paralel batch 12
  const BATCH = 12;
  for (let i = 0; i < universe.length; i += BATCH) {
    if (Date.now() > DEADLINE) {
      log.warn('scanner', `Deadline tercapai di ${i}/${total}`);
      break;
    }
    const chunk = universe.slice(i, i + BATCH);
    const tasks = chunk.map(async (ticker) => {
      try {
        const priceData = await Promise.race([
          fetchPriceDataWithFallback(ticker),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT))
        ]);
        if (!priceData?.candles?.length) return;
        const result = await quickScan(ticker, priceData.candles);
        if (!result) return;
        const meta = stocks[ticker] || {};
        results.push({
          ...result,
          name:      meta.name    || ticker,
          sector:    meta.sector  || null,
          board:     meta.board   || null,
          current:   priceData.current,
          changePct: priceData.changePct,
          volume:    priceData.volume
        });
        send({ type: 'progress', ticker, done: ++done, total, hasSignal: true });
      } catch (_) {
        send({ type: 'progress', ticker, done: ++done, total, hasSignal: false });
      }
    });
    await Promise.all(tasks);
  }

  const filtered = applyFilter(results, filter)
    .sort((a, b) => b.quickScore - a.quickScore)
    .slice(0, 100);

  const payload = { type: 'done', total: filtered.length, scanned: done, results: filtered, filter, crashMode: isMarketCrashing() };
  cacheSet(cacheKey, { results: filtered, filter, scanned: done }, 15 * 60 * 1000);
  send(payload);
  res.end();
};
