// ══════════════════════════════════════════════════════════════════
// lib/scanner.js — quickScan satu saham untuk batch scanner
// Ringan: hanya daily, tidak fetch fundamental/AI
// ══════════════════════════════════════════════════════════════════
const { computeAll }       = require('./indicators');
const { cacheGet, cacheSet } = require('./cache');
const { scoreL2PriceAction, scoreL3Momentum } = require('./scoring');
const log                  = require('./logger');

// Crash blocker: cek cache IHSG
function isMarketCrashing() {
  const changePct = cacheGet('ihsg:changePct');
  return changePct != null && changePct < -8;
}

async function quickScan(ticker, candles) {
  if (!candles || candles.length < 20) return null;
  try {
    const indicators = computeAll(candles);
    const { rsi, macd, volumeRatio, trend, bb, position52w, divergence, candlestick, obv, levels, adx } = indicators;
    const cur     = candles[candles.length-1].close;
    const isCrash = isMarketCrashing();
    const signals = [];

    // ── BREAKOUT ──────────────────────────────────────────────────
    const nearResist = indicators.levels?.resistance?.[0];
    if (nearResist && cur > nearResist * 0.99 && cur < nearResist * 1.03 && volumeRatio?.isSpike) {
      if (!isCrash) signals.push({ type:'breakout', strength:'high', label:'Breakout resistance', detail:`Harga menembus ${nearResist.toLocaleString('id-ID')} dengan volume ${volumeRatio.ratio}x` });
    }

    // ── VOLUME SPIKE ──────────────────────────────────────────────
    if (volumeRatio?.ratio >= 2.5) {
      signals.push({ type:'volume_spike', strength: volumeRatio.ratio>=4?'high':'medium', label:'Volume spike', detail:`Volume ${volumeRatio.ratio}x di atas MA20 (${volumeRatio.label})` });
    }

    // ── OVERSOLD ──────────────────────────────────────────────────
    if (rsi != null && rsi < 35) {
      if (!isCrash) signals.push({ type:'oversold', strength: rsi<25?'high':'medium', label:'Oversold', detail:`RSI ${rsi} — potensi technical rebound` });
    }

    // ── GOLDEN CROSS ──────────────────────────────────────────────
    if (trend?.crossover === 'golden_cross') {
      if (!isCrash) signals.push({ type:'golden_cross', strength:'high', label:'Golden Cross', detail:'EMA20 memotong EMA50 ke atas — sinyal trend bullish' });
    }

    // ── DEATH CROSS ───────────────────────────────────────────────
    if (trend?.crossover === 'death_cross') {
      signals.push({ type:'death_cross', strength:'high', label:'Death Cross', detail:'EMA20 memotong EMA50 ke bawah — sinyal trend bearish' });
    }

    // ── ACCUMULATION ──────────────────────────────────────────────
    if (obv?.trend === 'rising' && rsi != null && rsi < 50 && volumeRatio?.ratio >= 1.2) {
      if (!isCrash) signals.push({ type:'accumulation', strength:'medium', label:'Akumulasi', detail:`OBV naik tapi harga belum — potensi akumulasi smart money` });
    }

    // ── MACD CROSS ────────────────────────────────────────────────
    if (macd?.crossover === 'golden_cross') {
      if (!isCrash) signals.push({ type:'macd_cross', strength:'medium', label:'MACD Cross', detail:`MACD golden cross — momentum mulai positif` });
    }
    if (macd?.crossover === 'death_cross') {
      signals.push({ type:'macd_death_cross', strength:'medium', label:'MACD Death Cross', detail:'MACD death cross — momentum melemah' });
    }

    // ── DIVERGENCE ────────────────────────────────────────────────
    if (divergence?.detected) {
      if (divergence.bias === 'bullish' && !isCrash)
        signals.push({ type:'divergence', strength:'medium', label:'Bullish Divergence', detail: divergence.summary });
      if (divergence.bias === 'bearish')
        signals.push({ type:'divergence_bear', strength:'medium', label:'Bearish Divergence', detail: divergence.summary });
    }

    // ── FIBONACCI KEY LEVEL ───────────────────────────────────────
    if (indicators.fibonacci?.atKeyLevel) {
      const label = cur <= indicators.fibonacci.nearSupport * 1.01 ? 'Di support Fibonacci' : 'Di resistance Fibonacci';
      const type  = cur <= indicators.fibonacci.nearSupport * 1.01 ? 'fib_support' : 'fib_resist';
      if (type === 'fib_support' && !isCrash)
        signals.push({ type, strength:'medium', label, detail: indicators.fibonacci.narrative });
    }

    // ── BB SQUEEZE ────────────────────────────────────────────────
    if (bb?.isSqueeze) {
      if (!isCrash) signals.push({ type:'bb_squeeze', strength:'medium', label:'BB Squeeze', detail:`Bandwidth ${bb.bandwidth}% — breakout imminent` });
    }

    // ── CANDLESTICK PATTERNS ──────────────────────────────────────
    if (candlestick?.topPattern && candlestick.topPattern.strength === 'high') {
      const p = candlestick.topPattern;
      if (p.type === 'bullish' && !isCrash)
        signals.push({ type:'candle_bullish', strength:'medium', label: p.name, detail: p.signal });
      if (p.type === 'bearish')
        signals.push({ type:'candle_bearish', strength:'medium', label: p.name, detail: p.signal });
    }

    if (!signals.length) return null;

    // Score cepat dari L2+L3
    const l2 = scoreL2PriceAction(indicators);
    const l3 = scoreL3Momentum(indicators);
    const quickScore = parseFloat(((l2.score * 0.5 + l3.score * 0.5)).toFixed(1));

    return { ticker, signals, quickScore, rsi, macd: macd ? { trend: macd.trend, crossover: macd.crossover, slopeLabel: macd.slopeLabel } : null, volumeRatio: volumeRatio?.ratio, trendLabel: trend?.label };
  } catch (e) {
    log.warn('scanner', `quickScan error ${ticker}: ${e.message}`);
    return null;
  }
}

module.exports = { quickScan, isMarketCrashing };
