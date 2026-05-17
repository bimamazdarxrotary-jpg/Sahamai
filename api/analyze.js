// ══════════════════════════════════════════════════════════════════
// api/analyze.js — Main Handler (Refactored)
// Orkestrasi: validate → fetch price → compute indicators →
//             analyze volume → analyze structure → score → AI → respond
// ══════════════════════════════════════════════════════════════════

import { validateTicker, validateAIOutput } from '../lib/validation.js';
import { computeAll }                        from '../lib/indicators.js';
import { analyzeVolume }                     from '../lib/volume.js';
import { analyzeStructure }                  from '../lib/structure.js';
import { computeScore }                      from '../lib/scoring.js';
import { callAI }                            from '../lib/ai.js';
import { cacheGet, cacheSet, TTL }           from '../lib/cache.js';

// ── Rate Limiting sederhana (in-memory) ───────────────────────────
const rateLimitMap = new Map();
function isRateLimited(ip) {
  const now    = Date.now();
  const window = 60 * 1000; // 1 menit
  const max    = 10;         // max 10 request/menit
  const hits   = (rateLimitMap.get(ip) || []).filter(t => now - t < window);
  hits.push(now);
  rateLimitMap.set(ip, hits);
  return hits.length > max;
}

// ── Fetch harga dari Yahoo Finance ────────────────────────────────
async function fetchPriceData(ticker, isIndex) {
  const cacheKey = `price:${ticker}`;
  const cached   = cacheGet(cacheKey);
  if (cached) return cached;

  const symbol = isIndex
    ? (ticker === 'IHSG' ? '%5EJKSE' : '%5EJKLQ45')
    : `${ticker}.JK`;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=6mo`;
  const res  = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) return null;

  const json       = await res.json();
  const result     = json?.chart?.result?.[0];
  const meta       = result?.meta;
  const quotes     = result?.indicators?.quote?.[0];
  const timestamps = result?.timestamp;

  if (!meta || !quotes || !timestamps) return null;

  const { close: closes, high: highs, low: lows, open: opens, volume: volumes } = quotes;

  // Build OHLCV candles
  const candles = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (closes[i] == null) continue;
    candles.push({
      date:   new Date(timestamps[i] * 1000).toISOString().split('T')[0],
      open:   Math.round(opens?.[i]   || closes[i]),
      high:   Math.round(highs[i]   || closes[i]),
      low:    Math.round(lows[i]    || closes[i]),
      close:  Math.round(closes[i]),
      volume: volumes[i] || 0
    });
  }

  if (!candles.length) return null;

  const lastClose  = meta.regularMarketPrice || candles[candles.length - 1].close;
  const prevClose  = meta.chartPreviousClose  || candles[candles.length - 2]?.close || lastClose;
  const change     = lastClose - prevClose;
  const changePct  = prevClose ? parseFloat((change / prevClose * 100).toFixed(2)) : 0;

  const priceData = {
    current:   Math.round(lastClose),
    prevClose: Math.round(prevClose),
    change:    Math.round(change),
    changePct,
    isUp:      change >= 0,
    high52w:   meta.fiftyTwoWeekHigh ? Math.round(meta.fiftyTwoWeekHigh) : null,
    low52w:    meta.fiftyTwoWeekLow  ? Math.round(meta.fiftyTwoWeekLow)  : null,
    volume:    meta.regularMarketVolume || candles[candles.length - 1].volume || null,
    marketCap: meta.marketCap || null,
    currency:  meta.currency || 'IDR',
    candles,                          // OHLCV lengkap untuk chart
    history:   candles.slice(-60)     // 60 hari untuk chart
  };

  cacheSet(cacheKey, priceData, TTL.price);
  return priceData;
}

// ── Build price context string untuk AI prompt ────────────────────
function buildPriceContext(priceData, indicators) {
  if (!priceData) return 'Data harga real-time tidak tersedia.';

  const { current, changePct, isUp, high52w, low52w, volume, marketCap, currency } = priceData;
  const ma = indicators?.ma || {};

  const pct52wHigh = high52w ? ((high52w - current) / high52w * 100).toFixed(1) : null;
  const pct52wLow  = low52w  ? ((current - low52w)  / low52w  * 100).toFixed(1) : null;

  return `DATA PASAR REAL-TIME (FAKTUAL — JANGAN UBAH):
- Harga saat ini : ${currency} ${current.toLocaleString('id-ID')}
- Perubahan hari : ${isUp ? '+' : ''}${priceData.change.toLocaleString('id-ID')} (${isUp ? '+' : ''}${changePct}%)
- 52W High       : ${high52w?.toLocaleString('id-ID') || 'N/A'}${pct52wHigh ? ` (${pct52wHigh}% di atas harga sekarang)` : ''}
- 52W Low        : ${low52w?.toLocaleString('id-ID') || 'N/A'}${pct52wLow  ? ` (${pct52wLow}% di bawah harga sekarang)` : ''}
- Volume         : ${volume?.toLocaleString('id-ID') || 'N/A'}
- Market Cap     : ${marketCap ? (marketCap / 1e12).toFixed(2) + ' T IDR' : 'N/A'}`;
}

// ── Main Handler ──────────────────────────────────────────────────
export default async function handler(req, res) {
  const startTime = Date.now();

  // ── Security headers ───────────────────────────────────────────
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Rate limiting ──────────────────────────────────────────────
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Terlalu banyak request. Tunggu sebentar.' });
  }

  // ── Validasi input ─────────────────────────────────────────────
  const tickerRaw = req.body?.ticker;
  const validation = validateTicker(tickerRaw);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  const { ticker, isIndex, metadata } = validation;

  // ── Cek cache analisis ─────────────────────────────────────────
  const analysisCacheKey = `analysis:${ticker}`;
  const cachedAnalysis   = cacheGet(analysisCacheKey);
  if (cachedAnalysis) {
    console.log(`[CACHE HIT] ${ticker} — ${Date.now() - startTime}ms`);
    return res.status(200).json({ ...cachedAnalysis, fromCache: true });
  }

  // ── 1. Fetch harga ─────────────────────────────────────────────
  let priceData = null;
  try {
    priceData = await fetchPriceData(ticker, isIndex);
  } catch (e) {
    console.error(`[PRICE ERROR] ${ticker}:`, e.message);
  }

  const candles = priceData?.candles || [];

  // ── 2. Hitung semua indikator matematis ───────────────────────
  const indicators = candles.length >= 5 ? computeAll(candles) : {};
  console.log(`[INDICATORS] ${ticker}: RSI=${indicators?.rsi}, MA20=${indicators?.ma?.ma20}`);

  // ── 3. Analisis volume ─────────────────────────────────────────
  const volumeData = candles.length >= 5 ? analyzeVolume(candles) : null;

  // ── 4. Analisis struktur market ────────────────────────────────
  const structure = candles.length >= 10 ? analyzeStructure(candles, indicators, volumeData) : null;

  // ── 5. Scoring deterministik ───────────────────────────────────
  const scoring = computeScore(indicators, volumeData, structure, priceData);
  console.log(`[SCORE] ${ticker}: ${scoring.final}/10 → ${scoring.recommendation}`);

  // ── 6. Build price context untuk AI ───────────────────────────
  const priceContext = buildPriceContext(priceData, indicators);

  // ── 7. Call AI (hanya interpretasi, bukan hitung indikator) ───
  let parsed;
  try {
    const rawAI = await callAI({
      ticker, metadata, isIndex,
      priceData, priceContext,
      indicators, volumeData, structure, scoring
    });

    const validation = validateAIOutput(rawAI);
    if (!validation.valid) {
      console.error(`[AI PARSE ERROR] ${ticker}:`, validation.error);
      return res.status(502).json({ error: 'Format respons AI tidak valid. Coba lagi.' });
    }
    parsed = validation.parsed;
  } catch (err) {
    console.error(`[AI ERROR] ${ticker}:`, err.message);
    return res.status(502).json({ error: err.message || 'AI tidak merespons. Coba lagi.' });
  }

  // ── 8. Override dengan data terverifikasi ──────────────────────
  // Metadata dari IDX DB selalu menang atas output AI
  if (metadata) {
    parsed.namaLengkap = `PT ${metadata.name}`;
    parsed.sektor      = metadata.sector + (metadata.subsector ? ` — ${metadata.subsector}` : '');
  }

  // ── 9. Inject data terkomputasi ke response ────────────────────
  const response = {
    ...parsed,

    // Data harga
    priceData: priceData ? {
      current:   priceData.current,
      prevClose: priceData.prevClose,
      change:    priceData.change,
      changePct: priceData.changePct,
      isUp:      priceData.isUp,
      high52w:   priceData.high52w,
      low52w:    priceData.low52w,
      volume:    priceData.volume,
      marketCap: priceData.marketCap,
      currency:  priceData.currency,
      history:   priceData.history,
      candles:   priceData.candles   // OHLCV untuk TradingView chart
    } : null,

    // Indikator matematis (override jika AI salah hitung)
    indicators: {
      rsi:   indicators.rsi,
      ma20:  indicators.ma?.ma20,
      ma50:  indicators.ma?.ma50,
      macd:  indicators.macd,
      bb:    indicators.bb,
      atr:   indicators.atr,
      stoch: indicators.stoch,
      levels: indicators.levels
    },

    // Volume intelligence
    volumeData: volumeData ? {
      bias:      volumeData.accDist?.bias,
      isSpike:   volumeData.spike?.isSpike,
      spikeRatio: volumeData.spike?.ratio,
      narrative: volumeData.narrative,
      score:     volumeData.score
    } : null,

    // Market structure
    structureData: structure ? {
      phase:      structure.phase,
      phaseLabel: structure.phaseLabel,
      trend:      structure.trend?.direction,
      setups:     structure.setups
    } : null,

    // Scoring deterministik
    scoringData: scoring,

    // Meta
    ticker,
    generatedAt: new Date().toISOString(),
    latencyMs:   Date.now() - startTime,
    fromCache:   false
  };

  // ── 10. Cache hasil ────────────────────────────────────────────
  cacheSet(analysisCacheKey, response, TTL.analysis);

  console.log(`[DONE] ${ticker} — ${Date.now() - startTime}ms`);
  return res.status(200).json(response);
}
