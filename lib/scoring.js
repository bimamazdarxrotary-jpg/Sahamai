// ══════════════════════════════════════════════════════════════════
// lib/scoring.js — Deterministic Scoring System
// Score dihitung matematis, bukan dari AI. Konsisten & explainable.
// ══════════════════════════════════════════════════════════════════

/**
 * Trend Score (0–10)
 * Berdasarkan: arah tren, MA alignment, ADX strength
 */
function scoreTrend(indicators, structure) {
  let score = 5;
  const reasons = [];
  const ma    = indicators?.ma;
  const trend = indicators?.trend || structure?.trend;
  const hhll  = structure?.hhll;

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

  return { score: clamp(score), reasons };
}

/**
 * Volume Score (0–10)
 * Berdasarkan: spike, acc/dist, OBV, konfirmasi
 */
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

/**
 * Momentum Score (0–10)
 * Berdasarkan: RSI, MACD, Stochastic
 */
function scoreMomentum(indicators) {
  let score = 5;
  const reasons = [];
  const rsi   = indicators?.rsi;
  const macd  = indicators?.macd;
  const stoch = indicators?.stoch;
  const bb    = indicators?.bb;

  // RSI
  if (rsi != null) {
    if (rsi < 30)       { score += 2; reasons.push(`RSI oversold (${rsi})`); }
    else if (rsi < 40)  { score += 1; reasons.push(`RSI mendekati oversold (${rsi})`); }
    else if (rsi > 70)  { score -= 2; reasons.push(`RSI overbought (${rsi})`); }
    else if (rsi > 60)  { score += 1; reasons.push(`RSI bullish zone (${rsi})`); }
    else if (rsi >= 45 && rsi <= 55) { reasons.push(`RSI netral (${rsi})`); }
  }

  // MACD
  if (macd) {
    if (macd.trend === 'bullish')                { score += 1; reasons.push('MACD bullish'); }
    else                                         { score -= 1; reasons.push('MACD bearish'); }
    if (macd.crossover === 'golden_cross')       { score += 2; reasons.push('MACD golden cross'); }
    else if (macd.crossover === 'death_cross')   { score -= 2; reasons.push('MACD death cross'); }
    if (macd.histogram > 0 && macd.histogram > macd.signal * 0.1)
                                                 { score += 1; reasons.push('Histogram positif & membesar'); }
  }

  // Stochastic
  if (stoch) {
    if (stoch.signal === 'oversold')  { score += 1; reasons.push('Stochastic oversold'); }
    if (stoch.signal === 'overbought'){ score -= 1; reasons.push('Stochastic overbought'); }
    if (stoch.signal === 'bullish')   { score += 0.5; }
  }

  // Bollinger
  if (bb) {
    if (bb.position === 'oversold_zone')  { score += 1; reasons.push('Harga di lower Bollinger Band'); }
    if (bb.position === 'overbought_zone'){ score -= 1; reasons.push('Harga di upper Bollinger Band'); }
  }

  return { score: clamp(Math.round(score)), reasons };
}

/**
 * Risk Score (0–10, 10 = risiko paling tinggi)
 * Berdasarkan: ATR, BB bandwidth, posisi vs 52W, overextended
 */
function scoreRisk(indicators, priceData) {
  let risk = 3; // baseline rendah
  const reasons = [];
  const atr = indicators?.atr;
  const bb  = indicators?.bb;
  const rsi = indicators?.rsi;

  // ATR — volatilitas
  if (atr?.atrPct > 5)       { risk += 3; reasons.push(`Volatilitas sangat tinggi (ATR ${atr.atrPct}%)`); }
  else if (atr?.atrPct > 3)  { risk += 2; reasons.push(`Volatilitas tinggi (ATR ${atr.atrPct}%)`); }
  else if (atr?.atrPct > 1.5){ risk += 1; reasons.push(`Volatilitas sedang`); }
  else                        { reasons.push('Volatilitas rendah'); }

  // RSI extreme
  if (rsi > 80)  { risk += 2; reasons.push(`RSI sangat overbought (${rsi}) — rawan koreksi`); }
  if (rsi < 20)  { risk += 1; reasons.push(`RSI sangat oversold — rawan volatilitas`); }

  // Posisi 52W
  if (priceData?.high52w && priceData?.current) {
    const pctFrom52wHigh = (priceData.high52w - priceData.current) / priceData.high52w * 100;
    if (pctFrom52wHigh < 3) { risk += 1; reasons.push('Mendekati 52W High — rawan profit taking'); }
  }

  // BB overbought
  if (bb?.position === 'overbought_zone') { risk += 1; reasons.push('Harga di upper Bollinger Band'); }
  if (bb?.bandwidth > 15)                 { risk += 1; reasons.push('Volatilitas BB sangat lebar'); }

  return { score: clamp(risk), reasons };
}

/**
 * Setup Score (0–10)
 * Berdasarkan kualitas trading setup yang terdeteksi
 */
function scoreSetup(structure) {
  const setups = structure?.setups || [];
  if (!setups.length) return { score: 3, reasons: ['Tidak ada setup clear'] };

  const highConf   = setups.filter(s => s.confidence === 'high');
  const medConf    = setups.filter(s => s.confidence === 'medium');
  const multiDir   = new Set(setups.map(s => s.direction)).size > 1;

  let score = 3;
  const reasons = [];

  score += highConf.length * 2;
  score += medConf.length * 1;
  if (multiDir) { score -= 1; reasons.push('Setup bertentangan arah'); }

  const bestSetup = highConf[0] || medConf[0];
  if (bestSetup) reasons.push(`Setup: ${bestSetup.type} (${bestSetup.confidence})`);

  return { score: clamp(score), reasons };
}

/**
 * Final Score gabungan
 * Bobot: Trend 30%, Volume 25%, Momentum 25%, Setup 20%
 */
export function computeScore(indicators, volumeData, structure, priceData) {
  const trendS   = scoreTrend(indicators, structure);
  const volumeS  = scoreVolume(volumeData);
  const momentumS = scoreMomentum(indicators);
  const riskS    = scoreRisk(indicators, priceData);
  const setupS   = scoreSetup(structure);

  // Weighted final score (0–10)
  const weighted = (
    trendS.score    * 0.30 +
    volumeS.score   * 0.25 +
    momentumS.score * 0.25 +
    setupS.score    * 0.20
  );

  const finalScore = clamp(Math.round(weighted));

  // Rekomendasi sintetis berdasarkan score
  const recommendation =
    finalScore >= 8 ? 'BELI'
  : finalScore >= 6 ? 'AKUMULASI'
  : finalScore >= 4 ? 'TAHAN'
  : finalScore >= 2 ? 'KURANGI'
  : 'JUAL';

  // Confidence level
  const spread = Math.abs(finalScore - 5);
  const confidence =
    spread >= 4 ? 'High'
  : spread >= 2 ? 'Medium'
  : 'Low';

  // Risk/reward
  const riskReward = riskS.score <= 3
    ? 'Favorable'
    : riskS.score <= 6 ? 'Moderate'
    : 'Unfavorable';

  return {
    final:          finalScore,
    recommendation,
    confidence,
    riskReward,
    breakdown: {
      trend:    { score: trendS.score,    reasons: trendS.reasons },
      volume:   { score: volumeS.score,   reasons: volumeS.reasons },
      momentum: { score: momentumS.score, reasons: momentumS.reasons },
      risk:     { score: riskS.score,     reasons: riskS.reasons },
      setup:    { score: setupS.score,    reasons: setupS.reasons }
    },
    label: `${finalScore}/10 — ${recommendation} (${confidence} Confidence)`
  };
}

function clamp(v, min = 0, max = 10) {
  return Math.max(min, Math.min(max, v));
}
