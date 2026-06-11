// ══════════════════════════════════════════════════════════════════
// api/analyze.js — Endpoint POST /api/analyze
// Orchestrator 7 layer: data → indicators → scoring → risk → AI
// ══════════════════════════════════════════════════════════════════
const { fetchPriceDataWithFallback }    = require('../lib/datasource');
const { computeAll }                    = require('../lib/indicators');
const { computeScore }                  = require('../lib/scoring');
const { calculateRisk }                 = require('../lib/risk');
const { callAI }                        = require('../lib/ai');
const { fetchMarketContext }            = require('../lib/context');
const { fetchNewsData }                 = require('../lib/news');
const { fetchForeignFlow }              = require('../lib/foreign');
const { detectBandar }                  = require('../lib/bandar');
const { cacheGet, cacheSet }            = require('../lib/cache');
const { validateTicker }                = require('../lib/validation');
const { compress }                      = require('../lib/compress');
const log                               = require('../lib/logger');
const stocks                            = require('../data/idx-stocks.json');

// Rate limit in-memory
const rateLimitMap = new Map();
function checkRateLimit(ip) {
  const now  = Date.now();
  const key  = `rl:${ip}`;
  const data = rateLimitMap.get(key) || { count: 0, reset: now + 60000 };
  if (now > data.reset) { data.count = 0; data.reset = now + 60000; }
  data.count++;
  rateLimitMap.set(key, data);
  return data.count <= 10;
}

module.exports = async function handler(req, res) {
  const start = Date.now();

  // CORS
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  // Rate limit
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) return res.status(429).json({ error: 'Terlalu banyak request. Coba lagi dalam 1 menit.' });

  // Validasi input
  const body   = req.body || {};
  const ticker = (body.ticker || '').toUpperCase().trim();
  const modal  = body.modal  || null;
  const riskPct = body.riskPct || 2;

  const validation = validateTicker(ticker);
  if (!validation.valid) return res.status(400).json({ error: validation.message });

  // Cache check
  const cacheKey = `analysis:${ticker}`;
  const cached   = cacheGet(cacheKey);
  if (cached) {
    log.info('analyze', `[CACHE HIT] ${ticker}`);
    const payload = { ...cached, fromCache: true, latencyMs: Date.now() - start };
    return compress(req, res, payload);
  }

  log.info('analyze', `[START] ${ticker} ip=${ip}`);

  try {
    // ── STEP 1: Fetch harga (daily + weekly + monthly) ─────────────
    const priceData = await fetchPriceDataWithFallback(ticker);
    const { candles, weeklyCandles, monthlyCandles } = priceData;

    if (!candles || candles.length < 10) {
      return res.status(404).json({ error: `Data harga tidak tersedia untuk ${ticker}` });
    }

    // Set IHSG changePct ke cache untuk crash blocker
    if (priceData.isIndex) {
      cacheSet('ihsg:changePct', priceData.changePct, 10 * 60 * 1000);
    }

    // ── STEP 2: Hitung indikator (semua layer teknikal) ────────────
    const indicators = computeAll(candles, weeklyCandles, monthlyCandles);

    // ── STEP 3: Fetch data paralel ─────────────────────────────────
    const stockMeta = stocks[ticker] || {};
    const isIndex   = priceData.isIndex;

    const [marketContext, newsData, foreignData] = await Promise.all([
      (!isIndex && candles.length >= 5)
        ? fetchMarketContext(ticker, stockMeta.sector).catch(e => { log.warn('analyze','context err:',e.message); return null; })
        : Promise.resolve(null),
      fetchNewsData(ticker, stockMeta.sector, stockMeta.subsector).catch(e => { log.warn('analyze','news err:',e.message); return null; }),
      (!isIndex)
        ? fetchForeignFlow(ticker).catch(e => { log.warn('analyze','foreign err:',e.message); return null; })
        : Promise.resolve(null)
    ]);

    // ── STEP 4: Fundamental data (dari JSON statis) ────────────────
    const fundamentalData = stockMeta.fundamental || { noData: true };

    // ── STEP 5: Bandar detection ───────────────────────────────────
    const bandarData = !isIndex ? detectBandar(candles) : null;

    // ── STEP 6: Scoring 7 layer ────────────────────────────────────
    // Risk dihitung dengan scoring sementara dulu untuk entry/SL/TP
    const scoringPrelim = computeScore(indicators, foreignData, marketContext, fundamentalData, newsData?.emiten || [], null);
    const riskData = !isIndex
      ? calculateRisk(priceData.current, indicators.atr, indicators.levels, indicators.fibonacci, scoringPrelim.recommendation, modal, riskPct)
      : null;

    // Scoring final dengan risk quality
    const scoring = computeScore(indicators, foreignData, marketContext, fundamentalData, newsData?.emiten || [], riskData);

    // ── STEP 7: Crash guard ────────────────────────────────────────
    const ihsgChangePct = cacheGet('ihsg:changePct');
    const isCrash       = ihsgChangePct != null && ihsgChangePct < -8;
    let   crashWarning  = null;
    if (isCrash && ['BELI','AKUMULASI'].includes(scoring.recommendation)) {
      scoring.recommendation = 'TAHAN';
      scoring.final          = Math.min(scoring.final, 4.4);
      crashWarning           = `PERINGATAN: IHSG turun ${ihsgChangePct}% hari ini. Semua sinyal beli ditahan sampai kondisi market stabil.`;
    }

    // ── STEP 8: AI narasi ──────────────────────────────────────────
    const aiResult = await callAI({
      ticker, priceData, indicators, scoring, riskData,
      fundamentalData, newsData, foreignData, contextData: marketContext, bandarData
    });

    // ── STEP 9: Build response ─────────────────────────────────────
    const latencyMs = Date.now() - start;

    const response = {
      ticker,
      name:          stockMeta.name   || ticker,
      sector:        stockMeta.sector || null,
      subsector:     stockMeta.subsector || null,
      board:         stockMeta.board  || null,

      // Harga
      current:       priceData.current,
      change:        priceData.change,
      changePct:     priceData.changePct,
      high:          priceData.high,
      low:           priceData.low,
      volume:        priceData.volume,
      candleCount:   priceData.candleCount,
      history:       priceData.history,  // 60 candle untuk chart

      // 7 layer scoring
      scoring,

      // Layer 2 & 3 — indikator
      indicators: {
        trend:       indicators.trend,
        ma:          indicators.ma,
        bb:          indicators.bb,
        rsi:         indicators.rsi,
        macd:        indicators.macd,
        atr:         indicators.atr,
        volumeRatio: indicators.volumeRatio,
        obv:         indicators.obv,
        divergence:  indicators.divergence,
        levels:      indicators.levels,
        position52w: indicators.position52w,
        fibonacci:   indicators.fibonacci,
        candlestick: indicators.candlestick,
        adx:         indicators.adx,
        trendSummary: indicators.trendSummary,
        // Multi-TF
        weekly:      indicators.weekly,
        monthly:     indicators.monthly
      },

      // Layer 4
      foreignData:   foreignData  || null,
      marketContext: marketContext || null,

      // Layer 5
      fundamental:   fundamentalData.noData ? null : fundamentalData,

      // Layer 6
      news:          newsData || null,

      // Layer 7
      risk:          riskData || null,

      // Smart money
      bandar:        bandarData || null,

      // AI
      ai:            aiResult || null,
      crashWarning,
      isIndex,
      fromCache:     false,
      latencyMs
    };

    // Cache & kirim
    cacheSet(cacheKey, response, 5 * 60 * 1000);
    log.info('analyze', `[DONE] ${ticker} ${latencyMs}ms score=${scoring.final} rec=${scoring.recommendation}`);
    return compress(req, res, response);

  } catch (err) {
    log.error('analyze', `[ERROR] ${ticker}:`, err.message);
    const status = err.message?.includes('tidak tersedia') ? 404 : 500;
    return res.status(status).json({ error: err.message || 'Terjadi kesalahan server' });
  }
};
