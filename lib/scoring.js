// ══════════════════════════════════════════════════════════════════
// lib/scoring.js — Deterministic Scoring System
// v3: penalti likuiditas, time-weighted, sesuai indikator baru
// ══════════════════════════════════════════════════════════════════

function clamp(v, min, max) {
  min = min == null ? 0 : min;
  max = max == null ? 10 : max;
  return Math.max(min, Math.min(max, v));
}

// ── Trend Score (0–10) ────────────────────────────────────────────
function scoreTrend(indicators, structure) {
  let score = 5;
  const reasons = [];
  const ma    = indicators && indicators.ma;
  const trend = (indicators && indicators.trend) || (structure && structure.trend);
  const hhll  = structure && structure.hhll;
  const rs    = indicators && indicators.relStrength;
  const p52   = indicators && indicators.position52w;

  if (ma && ma.aboveMA20) { score += 1; reasons.push('Di atas MA20'); }
  else if (ma)            { score -= 1; reasons.push('Di bawah MA20'); }

  if (ma && ma.aboveMA50) { score += 1; reasons.push('Di atas MA50'); }
  else if (ma)            { score -= 1; reasons.push('Di bawah MA50'); }

  if (ma && ma.ma20vs50 === 'bullish_alignment') { score += 1; reasons.push('MA20 > MA50 (bullish)'); }
  if (ma && ma.ma20vs50 === 'bearish_alignment') { score -= 1; reasons.push('MA20 < MA50 (bearish)'); }

  if (trend && trend.strength === 'very_strong') { score += 2; reasons.push('ADX sangat kuat (' + trend.adx + ')'); }
  else if (trend && trend.strength === 'strong') { score += 1; reasons.push('ADX kuat (' + (trend.adx || '') + ')'); }
  else if (trend && trend.strength === 'no_trend') { score -= 1; reasons.push('ADX lemah — tidak ada tren'); }

  if (hhll && hhll.pattern === 'uptrend')   { score += 1; reasons.push('HH+HL terkonfirmasi'); }
  if (hhll && hhll.pattern === 'downtrend') { score -= 1; reasons.push('LH+LL terkonfirmasi'); }

  if (ma && ma.type === 'golden_cross') { score += 2; reasons.push('Golden Cross MA20/MA50'); }
  if (ma && ma.type === 'death_cross')  { score -= 2; reasons.push('Death Cross MA20/MA50'); }

  // Relative Strength
  if (rs && rs.trend === 'outperform')   { score += 1; reasons.push('RS kuat (' + rs.rsScore + '/100)'); }
  if (rs && rs.trend === 'underperform') { score -= 1; reasons.push('RS lemah (' + rs.rsScore + '/100)'); }

  // 52W position — konteks penting untuk risk
  if (p52) {
    if (p52.isNearHigh) { score -= 1; reasons.push('Dekat 52W High (' + p52.positionPct + '%) — rawan profit taking'); }
    if (p52.isNearLow)  { score += 1; reasons.push('Dekat 52W Low (' + p52.positionPct + '%) — potensi value'); }
  }

  return { score: clamp(score), reasons };
}

// ── Volume Score (0–10) ───────────────────────────────────────────
function scoreVolume(volumeData, indicators) {
  if (!volumeData) return { score: 5, reasons: ['Data volume tidak tersedia'] };

  let score = volumeData.score != null ? clamp(volumeData.score) : 5;
  const reasons = [];

  if (volumeData.accDist && volumeData.accDist.bias)
    reasons.push('Pattern: ' + volumeData.accDist.bias);

  // RVOL — lebih akurat dari simple spike
  const rvol = indicators && indicators.rvol;
  if (rvol) {
    if (rvol.rvol >= 2 && volumeData.accDist && volumeData.accDist.bias === 'accumulation') {
      score = Math.min(10, score + 1);
      reasons.push('RVOL ' + rvol.rvol + 'x — volume akumulasi signifikan');
    } else if (rvol.rvol >= 2 && volumeData.accDist && volumeData.accDist.bias === 'distribution') {
      score = Math.max(0, score - 1);
      reasons.push('RVOL ' + rvol.rvol + 'x — volume distribusi signifikan');
    } else if (rvol.rvol >= 1.5) {
      reasons.push('RVOL ' + rvol.rvol + 'x — volume di atas normal');
    }
  } else if (volumeData.spike && volumeData.spike.isSpike) {
    reasons.push('Volume spike ' + volumeData.spike.ratio + 'x rata-rata');
  }

  if (volumeData.confirmation && volumeData.confirmation.signal)
    reasons.push(volumeData.confirmation.signal.replace(/_/g, ' '));

  // OBV dari indicators
  const obvData = indicators && indicators.obv;
  if (obvData) {
    if (obvData.trend === 'rising')  reasons.push('OBV rising — akumulasi');
    if (obvData.trend === 'falling') reasons.push('OBV falling — distribusi');
    if (obvData.divergence === 'bullish_divergence') {
      score = Math.min(10, score + 1);
      reasons.push('OBV bullish divergence — akumulasi stealth');
    }
  } else if (volumeData.obv) {
    reasons.push('OBV ' + volumeData.obv.trend);
  }

  return { score: clamp(score), reasons };
}

// ── Momentum Score (0–10) ─────────────────────────────────────────
function scoreMomentum(indicators) {
  let score = 5;
  const reasons = [];
  const rsiVal = indicators && indicators.rsi;
  const macdI  = indicators && indicators.macd;
  const bb     = indicators && indicators.bb;
  const divData = indicators && indicators.divergence;
  const csData  = indicators && indicators.candlestick;

  // RSI (Wilder — lebih akurat dari versi lama)
  if (rsiVal != null) {
    if      (rsiVal < 30) { score += 2; reasons.push('RSI oversold (' + rsiVal + ') — peluang entry'); }
    else if (rsiVal < 40) { score += 1; reasons.push('RSI mendekati oversold (' + rsiVal + ')'); }
    else if (rsiVal > 70) { score -= 2; reasons.push('RSI overbought (' + rsiVal + ') — rawan koreksi'); }
    else if (rsiVal > 60) { score += 1; reasons.push('RSI zona bullish (' + rsiVal + ')'); }
  }

  // MACD
  if (macdI) {
    if (macdI.trend === 'bullish')             { score += 1; reasons.push('MACD bullish'); }
    else                                       { score -= 1; reasons.push('MACD bearish'); }
    if (macdI.crossover === 'golden_cross')    { score += 2; reasons.push('MACD golden cross'); }
    else if (macdI.crossover === 'death_cross'){ score -= 2; reasons.push('MACD death cross'); }
    if (macdI.histogram > 0)                  { score += 1; reasons.push('MACD histogram positif'); }
  }

  // Bollinger Bands — hanya untuk squeeze detection
  if (bb) {
    if (bb.isSqueeze)                        { reasons.push('BB squeeze — potensi ledakan volatilitas'); }
    if (bb.position === 'oversold_zone')     { score += 1; reasons.push('Harga di lower BB'); }
    if (bb.position === 'overbought_zone')   { score -= 1; reasons.push('Harga di upper BB'); }
  }

  // Divergence — sinyal reversal paling powerful
  if (divData && divData.detected) {
    if (divData.bias === 'bullish') { score += 2; reasons.push('Bullish divergence — potensi reversal naik'); }
    else if (divData.bias === 'bearish') { score -= 2; reasons.push('Bearish divergence — potensi reversal turun'); }
  }

  // Candlestick dengan konteks (sudah divalidasi di indicators.js)
  if (csData && csData.topPattern) {
    const p = csData.topPattern;
    if      (p.type === 'bullish' && p.strength === 'high')   { score += 2; reasons.push(p.name + ' — bullish kuat'); }
    else if (p.type === 'bullish' && p.strength === 'medium') { score += 1; reasons.push(p.name + ' — bullish'); }
    else if (p.type === 'bearish' && p.strength === 'high')   { score -= 2; reasons.push(p.name + ' — bearish kuat'); }
    else if (p.type === 'bearish' && p.strength === 'medium') { score -= 1; reasons.push(p.name + ' — bearish'); }
  }

  return { score: clamp(Math.round(score)), reasons };
}

// ── Risk Score (0–10, makin tinggi = makin berisiko) ──────────────
function scoreRisk(indicators, priceData, volumeData) {
  let risk = 1;
  const reasons = [];
  const atrData = indicators && indicators.atr;
  const bb      = indicators && indicators.bb;
  const rsiVal  = indicators && indicators.rsi;
  const fibData = indicators && indicators.fibonacci;
  const p52     = indicators && indicators.position52w;

  // ATR volatilitas
  if (atrData) {
    if      (atrData.atrPct > 8) { risk += 3; reasons.push('Volatilitas ekstrem ATR ' + atrData.atrPct + '%'); }
    else if (atrData.atrPct > 5) { risk += 2; reasons.push('Volatilitas tinggi ATR ' + atrData.atrPct + '%'); }
    else if (atrData.atrPct > 3) { risk += 1; reasons.push('Volatilitas moderat ATR ' + atrData.atrPct + '%'); }
    else                         { reasons.push('Volatilitas rendah ATR ' + (atrData.atrPct || 0) + '%'); }
  }

  // RSI extreme
  if (rsiVal != null) {
    if (rsiVal > 80) { risk += 2; reasons.push('RSI sangat overbought (' + rsiVal + ')'); }
    if (rsiVal < 20) { risk += 1; reasons.push('RSI sangat oversold — pantau tekanan jual'); }
  }

  // 52W position — lebih akurat dari priceData.high52w
  if (p52) {
    if (p52.pctFromHigh < 3) { risk += 1; reasons.push('Mendekati 52W High — rawan profit taking'); }
  } else if (priceData && priceData.high52w && priceData.current) {
    const pctFrom52wHigh = (priceData.high52w - priceData.current) / priceData.high52w * 100;
    if (pctFrom52wHigh < 3) { risk += 1; reasons.push('Mendekati 52W High'); }
  }

  // BB
  if (bb) {
    if (bb.position === 'overbought_zone') { risk += 1; reasons.push('Harga di upper BB'); }
    if (bb.bandwidth > 20)                 { risk += 1; reasons.push('BB sangat lebar — volatil'); }
  }

  // Fibonacci
  if (fibData && fibData.atKeyLevel && fibData.positionPct > 75) {
    risk += 1; reasons.push('Harga di level Fibonacci kritis — rawan reversal');
  }
  if (fibData && fibData.positionPct < 25) {
    risk = Math.max(0, risk - 1); reasons.push('Harga di zona Fibonacci bawah — sudah diskon');
  }

  // PENALTI LIKUIDITAS — saham gorengan / illikuid lebih berisiko
  // Pakai RVOL median volume sebagai proxy likuiditas
  const rvol = indicators && indicators.rvol;
  if (rvol && rvol.medianVolume) {
    const medianVol = rvol.medianVolume;
    // Estimasi nilai transaksi: volume median × harga
    const current   = priceData && priceData.current;
    const dailyValue = current ? medianVol * current : 0;
    if (dailyValue > 0 && dailyValue < 500000000) { // < Rp 500 juta/hari
      risk += 2; reasons.push('Likuiditas sangat rendah (<Rp500jt/hari) — spread lebar, rawan manipulasi');
    } else if (dailyValue > 0 && dailyValue < 2000000000) { // < Rp 2 miliar/hari
      risk += 1; reasons.push('Likuiditas rendah (<Rp2M/hari) — hati-hati di exit');
    }
  } else if (volumeData && volumeData.avgDailyVol) {
    // Fallback dari bandar data
    if (parseFloat(volumeData.avgDailyVol) < 0.05) {
      risk += 1; reasons.push('Volume harian rendah — likuiditas terbatas');
    }
  }

  return { score: clamp(risk), reasons };
}

// ── Setup Score (0–10) ────────────────────────────────────────────
function scoreSetup(structure, indicators) {
  const setups = (structure && structure.setups) || [];
  const fib    = indicators && indicators.fibonacci;
  const p52    = indicators && indicators.position52w;

  let score = 3;
  const reasons = [];

  const highConf = setups.filter(s => s.confidence === 'high');
  const medConf  = setups.filter(s => s.confidence === 'medium');
  const multiDir = new Set(setups.map(s => s.direction)).size > 1;

  score += highConf.length * 2;
  score += medConf.length  * 1;
  if (multiDir) { score -= 1; reasons.push('Setup bertentangan arah'); }

  const bestSetup = highConf[0] || medConf[0];
  if (bestSetup) reasons.push('Setup: ' + bestSetup.type + ' (' + bestSetup.confidence + ')');

  // Fibonacci level support — entry di dekat level kunci
  if (fib && fib.atKeyLevel) {
    score += 1;
    reasons.push('Harga di level Fibonacci kunci (' + (fib.zone || '').replace(/_/g, ' ') + ')');
  }
  if (fib && fib.positionPct < 30 && fib.positionPct > 5) {
    score += 1;
    reasons.push('Zona Fibonacci bawah — area entry menarik');
  }

  // 52W low zone = setup menarik untuk swing
  if (p52 && p52.isNearLow) {
    score += 1;
    reasons.push('Dekat 52W Low — potensi reversal / value play');
  }

  return { score: clamp(score), reasons };
}

// ── Final Score ───────────────────────────────────────────────────
const WEIGHT_TREND    = 0.30; // Trend: 30%
const WEIGHT_VOLUME   = 0.20; // Volume: 20%
const WEIGHT_MOMENTUM = 0.30; // Momentum: 30%
const WEIGHT_SETUP    = 0.20; // Setup: 20%
const RISK_PENALTY_MAX = 0.15; // max 15% penalty

function computeScore(indicators, volumeData, structure, priceData) {
  const trendS    = scoreTrend(indicators, structure);
  const volumeS   = scoreVolume(volumeData, indicators);
  const momentumS = scoreMomentum(indicators);
  const riskS     = scoreRisk(indicators, priceData, volumeData);
  const setupS    = scoreSetup(structure, indicators);

  const rawWeighted = (
    trendS.score    * WEIGHT_TREND    +
    volumeS.score   * WEIGHT_VOLUME   +
    momentumS.score * WEIGHT_MOMENTUM +
    setupS.score    * WEIGHT_SETUP
  );

  const riskPenaltyFactor = 1 - (riskS.score / 10) * RISK_PENALTY_MAX;
  const weighted          = rawWeighted * riskPenaltyFactor;
  const finalScore        = clamp(Math.round(weighted));

  const recommendation =
    finalScore >= 8 ? 'BELI'
  : finalScore >= 6 ? 'AKUMULASI'
  : finalScore >= 4 ? 'TAHAN'
  : finalScore >= 2 ? 'KURANGI'
  : 'JUAL';

  const spread     = Math.abs(finalScore - 5);
  const confidence = spread >= 4 ? 'High' : spread >= 2 ? 'Medium' : 'Low';
  const riskReward = riskS.score <= 3 ? 'Favorable'
                   : riskS.score <= 6 ? 'Moderate'
                   : 'Unfavorable';

  return {
    final: finalScore,
    recommendation,
    confidence,
    riskReward,
    breakdown: {
      trend:    { score: trendS.score,    weight: WEIGHT_TREND,     reasons: trendS.reasons    },
      volume:   { score: volumeS.score,   weight: WEIGHT_VOLUME,    reasons: volumeS.reasons   },
      momentum: { score: momentumS.score, weight: WEIGHT_MOMENTUM,  reasons: momentumS.reasons },
      risk:     { score: riskS.score,     weight: RISK_PENALTY_MAX,
                  penaltyApplied: parseFloat(((1 - riskPenaltyFactor) * 100).toFixed(1)) + '%',
                  reasons: riskS.reasons },
      setup:    { score: setupS.score,    weight: WEIGHT_SETUP,     reasons: setupS.reasons    }
    },
    weights: { trend: WEIGHT_TREND, volume: WEIGHT_VOLUME, momentum: WEIGHT_MOMENTUM, setup: WEIGHT_SETUP },
    label:   finalScore + '/10 — ' + recommendation + ' (' + confidence + ' Confidence)'
  };
}

module.exports = { computeScore };
