// ══════════════════════════════════════════════════════════════════
// lib/structure.js — Market Structure Engine
// Deteksi tren, breakout, HH/LL, setup, struktur market IHSG
// ══════════════════════════════════════════════════════════════════


// ── Konstanta threshold ───────────────────────────────────────────
const BREAKOUT_VOL_CONFIRM_RATIO = 1.5;  // breakout valid jika volume > 1.5x avg
const BREAKOUT_PROXIMITY_PCT     = 0.02; // dianggap dekat resistance/support jika < 2%

/**
 * Deteksi swing points (HH, HL, LH, LL)
 * @param {Object[]} candles
 * @param {number} lookback jumlah candle kanan-kiri
 */
function detectSwings(candles, lookback) {
  // Lookback dinamis: makin banyak data makin besar lookback
  // Mencegah false positive di saham volatil IHSG
  if (!lookback) {
    lookback = candles.length >= 60 ? 5 : candles.length >= 30 ? 4 : 3;
  }
  const swings = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i];
    const before = candles.slice(i - lookback, i);
    const after  = candles.slice(i + 1, i + lookback + 1);

    const isHigh = before.every(x => x.high <= c.high) && after.every(x => x.high <= c.high);
    const isLow  = before.every(x => x.low  >= c.low)  && after.every(x => x.low  >= c.low);

    if (isHigh) swings.push({ index: i, type: 'high', price: c.high, date: c.date });
    if (isLow)  swings.push({ index: i, type: 'low',  price: c.low,  date: c.date });
  }
  return swings;
}

/**
 * Analisis Higher High / Lower Low
 */
function analyzeHHLL(candles) {
  const swings = detectSwings(candles, 3);
  const highs  = swings.filter(s => s.type === 'high').slice(-4);
  const lows   = swings.filter(s => s.type === 'low').slice(-4);

  if (highs.length < 2 || lows.length < 2) {
    return { pattern: 'insufficient_data', highs, lows };
  }

  const lastHigh = highs[highs.length - 1].price;
  const prevHigh = highs[highs.length - 2].price;
  const lastLow  = lows[lows.length - 1].price;
  const prevLow  = lows[lows.length - 2].price;

  const hh = lastHigh > prevHigh; // Higher High
  const hl = lastLow  > prevLow;  // Higher Low
  const lh = lastHigh < prevHigh; // Lower High
  const ll = lastLow  < prevLow;  // Lower Low

  let pattern;
  if (hh && hl)       pattern = 'uptrend';        // HH + HL = uptrend
  else if (lh && ll)  pattern = 'downtrend';       // LH + LL = downtrend
  else if (hh && ll)  pattern = 'broadening';      // melebar
  else if (lh && hl)  pattern = 'consolidation';   // menyempit
  else                pattern = 'mixed';

  return { pattern, hh, hl, lh, ll, lastHigh, lastLow, prevHigh, prevLow };
}

/**
 * Deteksi Breakout
 * @returns {{ isBreakout: boolean, type: string, level: number, confirmed: boolean }}
 */
function detectBreakout(candles, indicators) {
  if (!candles || candles.length < 20) return null;

  const last      = candles[candles.length - 1];
  const prev      = candles.slice(-20, -1);
  const maxHigh   = prev.reduce((m, c) => c.high > m ? c.high : m, prev[0].high);
  const minLow    = prev.reduce((m, c) => c.low < m ? c.low : m, prev[0].low);
  const avgVol    = prev.reduce((a, c) => a + c.volume, 0) / prev.length;

  const bullBreak = last.close > maxHigh;
  const bearBreak = last.close < minLow;
  const volConfirm = last.volume > avgVol * BREAKOUT_VOL_CONFIRM_RATIO;

  if (!bullBreak && !bearBreak) {
    // Cek proximity (dekat resistance/support)
    const proximityBull = (maxHigh - last.close) / last.close < BREAKOUT_PROXIMITY_PCT;
    const proximityBear = (last.close - minLow)  / last.close < BREAKOUT_PROXIMITY_PCT;
    return {
      isBreakout: false,
      type:       proximityBull ? 'approaching_resistance' : proximityBear ? 'approaching_support' : 'none',
      level:      proximityBull ? maxHigh : proximityBear ? minLow : null,
      confirmed:  false
    };
  }

  return {
    isBreakout: true,
    type:       bullBreak ? 'bullish_breakout' : 'bearish_breakdown',
    level:      bullBreak ? maxHigh : minLow,
    confirmed:  volConfirm,           // breakout valid jika volume > 1.5× avg
    isFake:     !volConfirm,          // tanpa volume = potensi fake breakout
    breakoutPct: parseFloat(
      (bullBreak
        ? (last.close - maxHigh) / maxHigh * 100
        : (minLow - last.close)  / minLow  * 100
      ).toFixed(2)
    )
  };
}

/**
 * Deteksi Setup Trading
 */
function detectSetup(candles, indicators, volumeData) {
  if (!candles || candles.length < 20) return [];

  const setups = [];
  const last   = candles[candles.length - 1];
  const rsi    = indicators?.rsi;
  const bb     = indicators?.bb;
  const maData = indicators?.ma;
  const trend  = indicators?.trend;
  const accDist = volumeData?.accDist;

  // ── BREAKOUT SETUP ───────────────────────────────────────────────
  const breakout = detectBreakout(candles, indicators);
  if (breakout?.isBreakout && breakout.confirmed) {
    setups.push({
      type:       'breakout',
      direction:  breakout.type === 'bullish_breakout' ? 'long' : 'short',
      confidence: 'high',
      reason:     `${breakout.type === 'bullish_breakout' ? 'Breakout' : 'Breakdown'} di level ${breakout.level?.toLocaleString('id-ID')} dengan konfirmasi volume.`
    });
  }

  // ── PULLBACK SETUP ───────────────────────────────────────────────
  if (maData?.aboveMA50 && maData?.ma20 && last.close < maData.ma20 * 1.02 && last.close > maData.ma20 * 0.98) {
    setups.push({
      type:       'pullback',
      direction:  'long',
      confidence: 'medium',
      reason:     `Pullback ke MA20 (${maData.ma20?.toLocaleString('id-ID')}) dalam uptrend — zona beli potensial.`
    });
  }

  // ── OVERSOLD REVERSAL ────────────────────────────────────────────
  if (rsi && rsi < 30 && accDist?.bias === 'accumulation') {
    setups.push({
      type:       'reversal',
      direction:  'long',
      confidence: 'medium',
      reason:     `RSI oversold (${rsi}) dengan pola akumulasi — potensi reversal bullish.`
    });
  }

  // ── OVERBOUGHT / DISTRIBUSI ──────────────────────────────────────
  if (rsi && rsi > 70 && accDist?.bias === 'distribution') {
    setups.push({
      type:       'reversal',
      direction:  'short',
      confidence: 'medium',
      reason:     `RSI overbought (${rsi}) dengan pola distribusi — potensi koreksi.`
    });
  }

  // ── GOLDEN CROSS ─────────────────────────────────────────────────
  if (maData?.type === 'golden_cross') {
    setups.push({
      type:       'ma_crossover',
      direction:  'long',
      confidence: 'high',
      reason:     `Golden Cross MA20 menembus MA50 — sinyal uptrend kuat.`
    });
  }

  // ── DEATH CROSS ──────────────────────────────────────────────────
  if (maData?.type === 'death_cross') {
    setups.push({
      type:       'ma_crossover',
      direction:  'short',
      confidence: 'high',
      reason:     `Death Cross MA20 di bawah MA50 — sinyal downtrend kuat.`
    });
  }

  // ── BOLLINGER SQUEEZE ────────────────────────────────────────────
  if (bb && bb.bandwidth < 5) {
    setups.push({
      type:       'squeeze',
      direction:  'neutral',
      confidence: 'low',
      reason:     `Bollinger Band menyempit (bandwidth ${bb.bandwidth}%) — potensi ledakan volatilitas segera.`
    });
  }

  return setups;
}

/**
 * Analisis tren keseluruhan
 */
function analyzeTrend(candles, indicators) {
  if (!candles || candles.length < 20) return null;

  const hhll   = analyzeHHLL(candles);
  const maData = indicators?.ma;
  const adx    = indicators?.trend;
  const last   = candles[candles.length - 1];

  // Hitung tren dari berbagai sinyal
  let bullSignals = 0, bearSignals = 0;

  if (hhll.pattern === 'uptrend')   bullSignals += 2;
  if (hhll.pattern === 'downtrend') bearSignals += 2;
  if (maData?.aboveMA20)            bullSignals++;
  if (!maData?.aboveMA20)           bearSignals++;
  if (maData?.aboveMA50)            bullSignals++;
  if (!maData?.aboveMA50)           bearSignals++;
  if (maData?.ma20vs50 === 'bullish_alignment') bullSignals++;
  if (maData?.ma20vs50 === 'bearish_alignment') bearSignals++;

  const totalSignals = bullSignals + bearSignals;
  const bullPct = totalSignals ? (bullSignals / totalSignals * 100) : 50;

  let direction;
  if      (bullPct >= 70) direction = 'uptrend';
  else if (bullPct <= 30) direction = 'downtrend';
  else                    direction = 'sideways';

  return {
    direction,
    strength:   adx?.strength || 'unknown',
    adx:        adx?.adx || null,
    hhll,
    bullSignals,
    bearSignals,
    confidence: Math.round(Math.abs(bullPct - 50) * 2) // 0–100
  };
}

/**
 * Main: Analisis struktur market
 */
function analyzeStructure(candles, indicators, volumeData) {
  if (!candles || candles.length < 10) return { error: 'Data tidak cukup' };

  const trend    = analyzeTrend(candles, indicators);
  const breakout = detectBreakout(candles, indicators);
  const setups   = detectSetup(candles, indicators, volumeData);
  const hhll     = analyzeHHLL(candles);

  // Market phase
  let phase;
  if (breakout?.isBreakout && breakout.confirmed) {
    phase = breakout.type === 'bullish_breakout' ? 'markup' : 'markdown';
  } else if (trend?.direction === 'uptrend' && trend?.strength === 'strong') {
    phase = 'markup';
  } else if (trend?.direction === 'downtrend' && trend?.strength === 'strong') {
    phase = 'markdown';
  } else if (volumeData?.accDist?.bias === 'accumulation') {
    phase = 'accumulation';
  } else if (volumeData?.accDist?.bias === 'distribution') {
    phase = 'distribution';
  } else {
    phase = 'consolidation';
  }

  // Consolidation range — berguna untuk squeeze breakout
  const recent20 = candles.slice(-20);
  const rangeHigh = Math.max(...recent20.map(c => c.high));
  const rangeLow  = Math.min(...recent20.map(c => c.low));
  const rangePct  = rangeHigh && rangeLow ? parseFloat(((rangeHigh - rangeLow) / rangeLow * 100).toFixed(2)) : null;

  // Phase confidence 0–100
  let phaseConfidence = 50;
  if (breakout?.isBreakout && breakout.confirmed) phaseConfidence = 90;
  else if (breakout?.isBreakout && breakout.isFake) phaseConfidence = 40;
  else if (trend?.strength === 'very_strong') phaseConfidence = 80;
  else if (trend?.strength === 'strong') phaseConfidence = 70;
  else if (trend?.strength === 'no_trend') phaseConfidence = 30;

  return {
    trend,
    breakout,
    setups,
    hhll,
    phase,
    phaseLabel: {
      markup:        'Fase Markup — Harga dalam tren naik aktif',
      markdown:      'Fase Markdown — Harga dalam tren turun aktif',
      accumulation:  'Fase Akumulasi — Smart money kemungkinan mengumpulkan posisi',
      distribution:  'Fase Distribusi — Smart money kemungkinan melepas posisi',
      consolidation: 'Fase Konsolidasi — Pasar sideways menunggu katalis'
    }[phase],
    phaseConfidence,
    consolidationRange: { high: rangeHigh, low: rangeLow, rangePct }
  };
}

module.exports = { analyzeStructure };
