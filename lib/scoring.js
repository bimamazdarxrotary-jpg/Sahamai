// ══════════════════════════════════════════════════════════════════
// lib/scoring.js — Deterministic Scoring System
// Score dihitung matematis, bukan dari AI. Konsisten & explainable.
// Upgrade: manfaatkan MFI, Divergence, Fibonacci, Candlestick, RS
// ══════════════════════════════════════════════════════════════════

function clamp(v, min = 0, max = 10) {
  return Math.max(min, Math.min(max, v));
}

// ── Trend Score (0–10) ────────────────────────────────────────────
function scoreTrend(indicators, structure) {
  let score = 5;
  const reasons = [];
  const ma    = indicators?.ma;
  const trend = indicators?.trend || structure?.trend;
  const hhll  = structure?.hhll;
  const rs    = indicators?.relStrength;

  if (ma?.aboveMA20)  { score += 1; reasons.push('Di atas MA20'); }
  else                { score -= 1; reasons.push('Di bawah MA20'); }

  if (ma?.aboveMA50)  { score += 1; reasons.push('Di atas MA50'); }
  else                { score -= 1; reasons.push('Di bawah MA50'); }

  if (ma?.ma20vs50 === 'bullish_alignment') { score += 1; reasons.push('MA20 > MA50'); }
  if (ma?.ma20vs50 === 'bearish_alignment') { score -= 1; reasons.push('MA20 < MA50'); }

  if (trend?.strength === 'very_strong') { score += 2; reasons.push('ADX sangat kuat'); }
  else if (trend?.strength === 'strong') { score += 1; reasons.push('ADX kuat'); }
  else if (trend?.strength === 'no_trend') { score -= 1; reasons.push('Tidak ada tren'); }

  if (hhll?.pattern === 'uptrend')   { score += 1; reasons.push('HH+HL terkonfirmasi'); }
  if (hhll?.pattern === 'downtrend') { score -= 1; reasons.push('LH+LL terkonfirmasi'); }

  if (ma?.type === 'golden_cross') { score += 2; reasons.push('Golden Cross'); }
  if (ma?.type === 'death_cross')  { score -= 2; reasons.push('Death Cross'); }

  // NEW: Relative Strength
  if (rs?.trend === 'outperform') { score += 1; reasons.push(`RS kuat (${rs.rsScore}/100)`); }
  if (rs?.trend === 'underperform') { score -= 1; reasons.push(`RS lemah (${rs.rsScore}/100)`); }

  return { score: clamp(score), reasons };
}

// ── Volume Score (0–10) ───────────────────────────────────────────
function scoreVolume(volumeData) {
  if (!volumeData) return { score: 5, reasons: ['Data volume tidak tersedia'] };
  return {
    score:   clamp(volumeData.score ?? 5),
    reasons: [
      volumeData.accDist?.bias ? `Pattern: ${volumeData.accDist.bias}` : null,
      volumeData.spike?.isSpike ? `Volume spike ${volumeData.spike.ratio}× rata-rata` : null,
      volumeData.confirmation?.signal?.replace(/_/g, ' ') || null,
      volumeData.obv?.trend ? `OBV ${volumeData.obv.trend}` : null
    ].filter(Boolean)
  };
}

// ── Momentum Score (0–10) ─────────────────────────────────────────
function scoreMomentum(indicators) {
  let score = 5;
  const reasons = [];
  const rsiVal  = indicators?.rsi;
  const macd    = indicators?.macd;
  const stoch   = indicators?.stoch;
  const bb      = indicators?.bb;
  const mfiData = indicators?.mfi;
  const divData = indicators?.divergence;
  const csData  = indicators?.candlestick;

  // RSI
  if (rsiVal != null) {
    if (rsiVal < 30)      { score += 2; reasons.push(`RSI oversold (${rsiVal})`); }
    else if (rsiVal < 40) { score += 1; reasons.push(`RSI mendekati oversold (${rsiVal})`); }
    else if (rsiVal > 70) { score -= 2; reasons.push(`RSI overbought (${rsiVal})`); }
    else if (rsiVal > 60) { score += 1; reasons.push(`RSI bullish zone (${rsiVal})`); }
  }

  // MACD
  if (macd) {
    if (macd.trend === 'bullish')              { score += 1; reasons.push('MACD bullish'); }
    else                                       { score -= 1; reasons.push('MACD bearish'); }
    if (macd.crossover === 'golden_cross')     { score += 2; reasons.push('MACD golden cross'); }
    else if (macd.crossover === 'death_cross') { score -= 2; reasons.push('MACD death cross'); }
    if (macd.histogram > 0 && macd.histogram > macd.signal * 0.1)
                                               { score += 1; reasons.push('Histogram positif & membesar'); }
  }

  // Stochastic
  if (stoch) {
    if (stoch.signal === 'oversold')   { score += 1; reasons.push('Stochastic oversold'); }
    if (stoch.signal === 'overbought') { score -= 1; reasons.push('Stochastic overbought'); }
    if (stoch.signal === 'bullish')    { score += 0.5; }
  }

  // Bollinger
  if (bb) {
    if (bb.position === 'oversold_zone')   { score += 1; reasons.push('Harga di lower BB'); }
    if (bb.position === 'overbought_zone') { score -= 1; reasons.push('Harga di upper BB'); }
  }

  // NEW: MFI — lebih akurat dari RSI karena pakai volume
  if (mfiData?.mfi != null) {
    if (mfiData.mfi < 20)      { score += 2; reasons.push(`MFI oversold (${mfiData.mfi}) — akumulasi volume`); }
    else if (mfiData.mfi < 30) { score += 1; reasons.push(`MFI mendekati oversold (${mfiData.mfi})`); }
    else if (mfiData.mfi > 80) { score -= 2; reasons.push(`MFI overbought (${mfiData.mfi}) — distribusi volume`); }
    else if (mfiData.mfi > 60) { score += 1; reasons.push(`MFI bullish zone (${mfiData.mfi})`); }
  }

  // NEW: Divergence — sinyal reversal paling powerful
  if (divData?.detected) {
    if (divData.bias === 'bullish') {
      score += 2;
      reasons.push('Bullish divergence — reversal naik potensial');
    } else if (divData.bias === 'bearish') {
      score -= 2;
      reasons.push('Bearish divergence — reversal turun potensial');
    }
  }

  // NEW: Candlestick pattern
  if (csData?.topPattern) {
    const p = csData.topPattern;
    if (p.type === 'bullish' && p.strength === 'high')   { score += 2; reasons.push(`${p.name} — bullish kuat`); }
    else if (p.type === 'bullish' && p.strength === 'medium') { score += 1; reasons.push(`${p.name} — bullish`); }
    else if (p.type === 'bearish' && p.strength === 'high')  { score -= 2; reasons.push(`${p.name} — bearish kuat`); }
    else if (p.type === 'bearish' && p.strength === 'medium') { score -= 1; reasons.push(`${p.name} — bearish`); }
  }

  return { score: clamp(Math.round(score)), reasons };
}

// ── Risk Score (0–10, makin tinggi makin berisiko) ────────────────
function scoreRisk(indicators, priceData) {
  let risk = 3;
  const reasons = [];
  const atrData = indicators?.atr;
  const bb      = indicators?.bb;
  const rsiVal  = indicators?.rsi;
  const fibData = indicators?.fibonacci;

  // ATR volatilitas
  if (atrData?.atrPct > 5)        { risk += 3; reasons.push(`Volatilitas sangat tinggi (ATR ${atrData.atrPct}%)`); }
  else if (atrData?.atrPct > 3)   { risk += 2; reasons.push(`Volatilitas tinggi (ATR ${atrData.atrPct}%)`); }
  else if (atrData?.atrPct > 1.5) { risk += 1; reasons.push('Volatilitas sedang'); }
  else                             { reasons.push('Volatilitas rendah'); }

  // RSI extreme
  if (rsiVal > 80) { risk += 2; reasons.push(`RSI sangat overbought (${rsiVal})`); }
  if (rsiVal < 20) { risk += 1; reasons.push(`RSI sangat oversold`); }

  // Posisi vs 52W High
  if (priceData?.high52w && priceData?.current) {
    const pctFrom52wHigh = (priceData.high52w - priceData.current) / priceData.high52w * 100;
    if (pctFrom52wHigh < 3) { risk += 1; reasons.push('Mendekati 52W High — rawan profit taking'); }
  }

  // BB
  if (bb?.position === 'overbought_zone') { risk += 1; reasons.push('Harga di upper Bollinger Band'); }
  if (bb?.bandwidth > 15)                 { risk += 1; reasons.push('BB sangat lebar — volatil'); }

  // NEW: Fibonacci — harga di dekat resistance kunci = risiko lebih tinggi
  if (fibData?.atKeyLevel && fibData?.positionPct > 75) {
    risk += 1;
    reasons.push('Harga di level Fibonacci kritis — rawan reversal');
  }
  // Harga di zona low Fibonacci = risiko lebih rendah (sudah turun banyak)
  if (fibData?.positionPct < 25) {
    risk = Math.max(0, risk - 1);
    reasons.push('Harga di zona Fibonacci bawah — sudah diskon');
  }

  return { score: clamp(risk), reasons };
}

// ── Setup Score (0–10) ────────────────────────────────────────────
function scoreSetup(structure, indicators) {
  const setups = structure?.setups || [];
  const pivots = indicators?.pivots;
  const fib    = indicators?.fibonacci;

  let score = 3;
  const reasons = [];

  if (!setups.length && !pivots && !fib) {
    return { score: 3, reasons: ['Tidak ada setup clear'] };
  }

  const highConf = setups.filter(s => s.confidence === 'high');
  const medConf  = setups.filter(s => s.confidence === 'medium');
  const multiDir = new Set(setups.map(s => s.direction)).size > 1;

  score += highConf.length * 2;
  score += medConf.length * 1;
  if (multiDir) { score -= 1; reasons.push('Setup bertentangan arah'); }

  const bestSetup = highConf[0] || medConf[0];
  if (bestSetup) reasons.push(`Setup: ${bestSetup.type} (${bestSetup.confidence})`);

  // NEW: Pivot support — harga bounce dari S1/S2 = setup bagus
  if (pivots) {
    const current = structure?.trend ? null : null; // tidak perlu current price di sini
    if (pivots.position === 'between_S1_P') {
      score += 1;
      reasons.push('Harga di antara Pivot dan S1 — zona support');
    }
    if (pivots.position === 'between_P_R1') {
      score += 1;
      reasons.push('Harga di antara Pivot dan R1 — momentum positif');
    }
  }

  // NEW: Fibonacci level support — entry di dekat level kunci
  if (fib?.atKeyLevel) {
    score += 1;
    reasons.push(`Harga di level Fibonacci kunci (${fib.zone?.replace(/_/g,' ')})`);
  }

  return { score: clamp(score), reasons };
}

// ── Final Score gabungan ──────────────────────────────────────────
// ── Bobot scoring (total harus = 1.0) ────────────────────────────
const WEIGHT_TREND    = 0.28; // Trend: 28%
const WEIGHT_VOLUME   = 0.22; // Volume: 22%
const WEIGHT_MOMENTUM = 0.28; // Momentum: 28% — dinaikkan karena ada MFI + divergence + candlestick
const WEIGHT_SETUP    = 0.22; // Setup: 22%

function computeScore(indicators, volumeData, structure, priceData) {
  const trendS    = scoreTrend(indicators, structure);
  const volumeS   = scoreVolume(volumeData);
  const momentumS = scoreMomentum(indicators);
  const riskS     = scoreRisk(indicators, priceData);
  const setupS    = scoreSetup(structure, indicators);

  const weighted = (
    trendS.score    * WEIGHT_TREND    +
    volumeS.score   * WEIGHT_VOLUME   +
    momentumS.score * WEIGHT_MOMENTUM +
    setupS.score    * WEIGHT_SETUP
  );

  const finalScore = clamp(Math.round(weighted));

  const recommendation =
    finalScore >= 8 ? 'BELI'
  : finalScore >= 6 ? 'AKUMULASI'
  : finalScore >= 4 ? 'TAHAN'
  : finalScore >= 2 ? 'KURANGI'
  : 'JUAL';

  const spread = Math.abs(finalScore - 5);
  const confidence =
    spread >= 4 ? 'High'
  : spread >= 2 ? 'Medium'
  : 'Low';

  const riskReward = riskS.score <= 3 ? 'Favorable'
                   : riskS.score <= 6 ? 'Moderate'
                   : 'Unfavorable';

  return {
    final: finalScore,
    recommendation,
    confidence,
    riskReward,
    breakdown: {
      trend:    { score: trendS.score,    reasons: trendS.reasons    },
      volume:   { score: volumeS.score,   reasons: volumeS.reasons   },
      momentum: { score: momentumS.score, reasons: momentumS.reasons },
      risk:     { score: riskS.score,     reasons: riskS.reasons     },
      setup:    { score: setupS.score,    reasons: setupS.reasons    }
    },
    label: `${finalScore}/10 — ${recommendation} (${confidence} Confidence)`
  };
}

module.exports = { computeScore };
