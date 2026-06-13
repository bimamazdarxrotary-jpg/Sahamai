// ══════════════════════════════════════════════════════════════════
// lib/scoring.js — Deterministic Scoring System v4
// Sesuai indikator baru: EMA9/SMA50, smartMoney, tanpa ADX/RS/HH-HL
// ══════════════════════════════════════════════════════════════════

function clamp(v, min, max) {
  return Math.max(min == null ? 0 : min, Math.min(max == null ? 10 : max, v));
}

// ── TREND SCORE (0–10) ────────────────────────────────────────────
function scoreTrend(indicators, structure) {
  let score = 5;
  const reasons = [];
  const ma  = indicators && indicators.ma;
  const p52 = indicators && indicators.position52w;
  const fib = indicators && indicators.fibonacci;

  // EMA9 / SMA50 position
  if (ma) {
    if (ma.aboveEMA9)  { score += 1; reasons.push('Di atas EMA9'); }
    else               { score -= 1; reasons.push('Di bawah EMA9'); }
    if (ma.aboveSMA50) { score += 1; reasons.push('Di atas SMA50'); }
    else               { score -= 1; reasons.push('Di bawah SMA50'); }
    if (ma.alignment === 'bullish') { score += 1; reasons.push('EMA9 > SMA50 (bullish alignment)'); }
    if (ma.alignment === 'bearish') { score -= 1; reasons.push('EMA9 < SMA50 (bearish alignment)'); }
    if (ma.type === 'golden_cross') { score += 2; reasons.push('Golden Cross EMA9/SMA50'); }
    if (ma.type === 'death_cross')  { score -= 2; reasons.push('Death Cross EMA9/SMA50'); }
  }

  // 52W position — konteks entry
  if (p52) {
    if (p52.isNearLow)  { score += 1; reasons.push('Dekat 52W Low (' + p52.positionPct + '%) — potensi value'); }
    if (p52.isNearHigh) { score -= 1; reasons.push('Dekat 52W High (' + p52.positionPct + '%) — rawan profit taking'); }
  }

  // Fibonacci position — trend dalam konteks retracement
  if (fib) {
    if (fib.positionPct < 30 && fib.positionPct > 5) {
      score += 1; reasons.push('Zona Fibonacci bawah — area trend reversal potensial');
    }
    if (fib.positionPct > 75) {
      score -= 1; reasons.push('Zona Fibonacci atas — rawan koreksi');
    }
  }

  return { score: clamp(score), reasons };
}

// ── VOLUME SCORE (0–10) ───────────────────────────────────────────
function scoreVolume(volumeData, indicators) {
  if (!volumeData) return { score: 5, reasons: ['Data volume tidak tersedia'] };

  let score = volumeData.score != null ? clamp(volumeData.score) : 5;
  const reasons = [];

  // OBV — konfirmasi utama
  const obvData = indicators && indicators.obv;
  if (obvData) {
    if (obvData.trend === 'rising')  { score = Math.min(10, score + 1); reasons.push('OBV rising — akumulasi'); }
    if (obvData.trend === 'falling') { score = Math.max(0,  score - 1); reasons.push('OBV falling — distribusi'); }
    if (obvData.divergence === 'bullish_divergence') {
      score = Math.min(10, score + 1); reasons.push('OBV bullish divergence — akumulasi stealth');
    }
    if (obvData.divergence === 'bearish_divergence') {
      score = Math.max(0, score - 1); reasons.push('OBV bearish divergence — distribusi tersembunyi');
    }
  }

  // RVOL — konfirmasi volume
  const rvol = indicators && indicators.rvol;
  if (rvol) {
    const isAcc  = volumeData.accDist && volumeData.accDist.bias === 'accumulation';
    const isDist = volumeData.accDist && volumeData.accDist.bias === 'distribution';
    if (rvol.rvol >= 2 && isAcc)  { score = Math.min(10, score + 1); reasons.push('RVOL ' + rvol.rvol + 'x + akumulasi'); }
    if (rvol.rvol >= 2 && isDist) { score = Math.max(0,  score - 1); reasons.push('RVOL ' + rvol.rvol + 'x + distribusi'); }
    else if (rvol.rvol >= 1.5)    { reasons.push('RVOL ' + rvol.rvol + 'x — volume di atas normal'); }
  }

  // Smart Money Flow
  const smf = indicators && indicators.smartMoney;
  if (smf) {
    if      (smf.bias === 'strong_buying')  { score = Math.min(10, score + 1); reasons.push('Smart money beli kuat (' + smf.ratio + '%)'); }
    else if (smf.bias === 'mild_buying')    { reasons.push('Smart money cenderung beli (' + smf.ratio + '%)'); }
    else if (smf.bias === 'strong_selling') { score = Math.max(0,  score - 1); reasons.push('Smart money jual kuat (' + smf.ratio + '%)'); }
    else if (smf.bias === 'mild_selling')   { reasons.push('Smart money cenderung jual (' + smf.ratio + '%)'); }
  } else if (volumeData.accDist) {
    reasons.push('Pattern: ' + volumeData.accDist.bias);
  }

  return { score: clamp(score), reasons };
}

// ── MOMENTUM SCORE (0–10) ─────────────────────────────────────────
function scoreMomentum(indicators) {
  let score = 5;
  const reasons = [];
  const rsiVal = indicators && indicators.rsi;
  const macdI  = indicators && indicators.macd;
  const bb     = indicators && indicators.bb;
  const divData = indicators && indicators.divergence;
  const csData  = indicators && indicators.candlestick;

  // RSI (Wilder)
  if (rsiVal != null) {
    if      (rsiVal < 30) { score += 2; reasons.push('RSI oversold (' + rsiVal + ') — peluang entry'); }
    else if (rsiVal < 40) { score += 1; reasons.push('RSI mendekati oversold (' + rsiVal + ')'); }
    else if (rsiVal > 70) { score -= 2; reasons.push('RSI overbought (' + rsiVal + ') — rawan koreksi'); }
    else if (rsiVal > 60) { score += 1; reasons.push('RSI zona bullish (' + rsiVal + ')'); }
  }

  // MACD
  if (macdI) {
    if (macdI.trend === 'bullish')              { score += 1; reasons.push('MACD bullish'); }
    else                                        { score -= 1; reasons.push('MACD bearish'); }
    if (macdI.crossover === 'golden_cross')     { score += 2; reasons.push('MACD golden cross'); }
    else if (macdI.crossover === 'death_cross') { score -= 2; reasons.push('MACD death cross'); }
    if (macdI.histogram > 0)                   { score += 1; reasons.push('MACD histogram positif'); }
  }

  // Bollinger Bands
  if (bb) {
    if (bb.isSqueeze)                     { reasons.push('BB squeeze — potensi breakout volatilitas'); }
    if (bb.position === 'oversold_zone')  { score += 1; reasons.push('Harga di lower BB'); }
    if (bb.position === 'overbought_zone'){ score -= 1; reasons.push('Harga di upper BB'); }
  }

  // Divergence — sinyal reversal terkuat
  if (divData && divData.detected) {
    if (divData.bias === 'bullish')      { score += 2; reasons.push('Bullish divergence — potensi reversal naik'); }
    else if (divData.bias === 'bearish') { score -= 2; reasons.push('Bearish divergence — potensi reversal turun'); }
  }

  // Candlestick (sudah divalidasi konteks di indicators.js)
  if (csData && csData.topPattern) {
    const p = csData.topPattern;
    if      (p.type === 'bullish' && p.strength === 'high')   { score += 2; reasons.push(p.name + ' — bullish kuat'); }
    else if (p.type === 'bullish' && p.strength === 'medium') { score += 1; reasons.push(p.name + ' — bullish'); }
    else if (p.type === 'bearish' && p.strength === 'high')   { score -= 2; reasons.push(p.name + ' — bearish kuat'); }
    else if (p.type === 'bearish' && p.strength === 'medium') { score -= 1; reasons.push(p.name + ' — bearish'); }
  }

  return { score: clamp(Math.round(score)), reasons };
}

// ── RISK SCORE (0–10, makin tinggi = makin berisiko) ──────────────
function scoreRisk(indicators, priceData, volumeData) {
  let risk = 1;
  const reasons = [];
  const atrData = indicators && indicators.atr;
  const bb      = indicators && indicators.bb;
  const rsiVal  = indicators && indicators.rsi;
  const fibData = indicators && indicators.fibonacci;
  const p52     = indicators && indicators.position52w;
  const rvol    = indicators && indicators.rvol;
  const ma      = indicators && indicators.ma;

  // ATR volatilitas
  if (atrData) {
    if      (atrData.atrPct > 8) { risk += 3; reasons.push('Volatilitas ekstrem ATR ' + atrData.atrPct + '%'); }
    else if (atrData.atrPct > 5) { risk += 2; reasons.push('Volatilitas tinggi ATR '  + atrData.atrPct + '%'); }
    else if (atrData.atrPct > 3) { risk += 1; reasons.push('Volatilitas moderat ATR ' + atrData.atrPct + '%'); }
    else                          { reasons.push('Volatilitas rendah ATR ' + (atrData.atrPct||0) + '%'); }
  }

  // RSI extreme
  if (rsiVal != null) {
    if (rsiVal > 80) { risk += 2; reasons.push('RSI sangat overbought (' + rsiVal + ')'); }
    if (rsiVal < 20) { risk += 1; reasons.push('RSI sangat oversold — pantau tekanan jual'); }
  }

  // BB overbought / terlalu lebar
  if (bb) {
    if (bb.position === 'overbought_zone') { risk += 1; reasons.push('Harga di upper BB'); }
    if (bb.bandwidth > 20)                 { risk += 1; reasons.push('BB sangat lebar — volatil'); }
  }

  // Death cross — tren turun aktif, risk lebih tinggi
  if (ma && ma.type === 'death_cross') {
    risk += 2; reasons.push('Death Cross EMA9/SMA50 — sinyal downtrend aktif');
  } else if (ma && ma.alignment === 'bearish' && !ma.aboveSMA50) {
    risk += 1; reasons.push('Di bawah SMA50 dengan alignment bearish');
  }

  // 52W position
  if (p52) {
    if (p52.pctFromHigh < 3) { risk += 1; reasons.push('Mendekati 52W High — rawan profit taking'); }
  } else if (priceData && priceData.high52w && priceData.current) {
    if ((priceData.high52w - priceData.current) / priceData.high52w * 100 < 3)
      { risk += 1; reasons.push('Mendekati 52W High'); }
  }

  // Fibonacci — harga di level kritis atas
  if (fibData) {
    if (fibData.atKeyLevel && fibData.positionPct > 75) { risk += 1; reasons.push('Harga di level Fibonacci kritis — rawan reversal'); }
    if (fibData.positionPct < 25)                       { risk = Math.max(0, risk - 1); reasons.push('Harga di zona Fibonacci bawah — sudah diskon'); }
  }

  // PENALTI LIKUIDITAS — proxy: median volume × harga
  if (rvol && rvol.medianVolume && priceData && priceData.current) {
    const dailyVal = rvol.medianVolume * priceData.current;
    if      (dailyVal < 500000000)  { risk += 2; reasons.push('Likuiditas sangat rendah (<Rp500jt/hari)'); }
    else if (dailyVal < 2000000000) { risk += 1; reasons.push('Likuiditas rendah (<Rp2M/hari)'); }
  }

  return { score: clamp(risk), reasons };
}

// ── SETUP SCORE (0–10) ────────────────────────────────────────────
function scoreSetup(structure, indicators) {
  const setups = (structure && structure.setups) || [];
  const fib    = indicators && indicators.fibonacci;
  const p52    = indicators && indicators.position52w;
  const ts     = indicators && indicators.trendSummary;

  let score = 3;
  const reasons = [];

  const highConf = setups.filter(s => s.confidence === 'high');
  const medConf  = setups.filter(s => s.confidence === 'medium');
  score += highConf.length * 2;
  score += medConf.length  * 1;
  if (new Set(setups.map(s => s.direction)).size > 1) { score -= 1; reasons.push('Setup bertentangan arah'); }
  const best = highConf[0] || medConf[0];
  if (best) reasons.push('Setup: ' + best.type + ' (' + best.confidence + ')');

  if (fib) {
    if (fib.atKeyLevel)                               { score += 1; reasons.push('Di level Fibonacci kunci'); }
    if (fib.positionPct < 30 && fib.positionPct > 5) { score += 1; reasons.push('Zona Fibonacci bawah — entry menarik'); }
  }

  if (p52 && p52.isNearLow) { score += 1; reasons.push('Dekat 52W Low — potensi reversal / value play'); }

  // BB squeeze = setup breakout potensial
  if (indicators && indicators.bb && indicators.bb.isSqueeze) {
    score += 1; reasons.push('BB squeeze — setup breakout volatilitas');
  }

  // trendSummary — konfirmasi agregasi tren dari computeAll (v4)
  if (ts) {
    if      (ts === 'bullish' || ts === 'strong_bullish') { score += 1; reasons.push('Trend summary bullish — konfirmasi multi-indikator'); }
    else if (ts === 'bearish' || ts === 'strong_bearish') { score -= 1; reasons.push('Trend summary bearish — tekanan jual multi-indikator'); }
  }

  return { score: clamp(score), reasons };
}

// ── FINAL SCORE ───────────────────────────────────────────────────
const WEIGHT_TREND    = 0.30;
const WEIGHT_VOLUME   = 0.20;
const WEIGHT_MOMENTUM = 0.30;
const WEIGHT_SETUP    = 0.20;
const RISK_MAX        = 0.15;

function computeScore(indicators, volumeData, structure, priceData) {
  const tS = scoreTrend(indicators, structure);
  const vS = scoreVolume(volumeData, indicators);
  const mS = scoreMomentum(indicators);
  const rS = scoreRisk(indicators, priceData, volumeData);
  const sS = scoreSetup(structure, indicators);

  const raw        = tS.score * WEIGHT_TREND + vS.score * WEIGHT_VOLUME + mS.score * WEIGHT_MOMENTUM + sS.score * WEIGHT_SETUP;
  const penalty    = 1 - (rS.score / 10) * RISK_MAX;
  const final      = clamp(Math.round(raw * penalty));
  const rec        = final >= 8 ? 'BELI' : final >= 6 ? 'AKUMULASI' : final >= 4 ? 'TAHAN' : final >= 2 ? 'KURANGI' : 'JUAL';
  const spread     = Math.abs(final - 5);
  const confidence = spread >= 4 ? 'High' : spread >= 2 ? 'Medium' : 'Low';
  const riskReward = rS.score <= 3 ? 'Favorable' : rS.score <= 6 ? 'Moderate' : 'Unfavorable';

  return {
    final, recommendation: rec, confidence, riskReward,
    breakdown: {
      trend:    { score: tS.score, weight: WEIGHT_TREND,    reasons: tS.reasons },
      volume:   { score: vS.score, weight: WEIGHT_VOLUME,   reasons: vS.reasons },
      momentum: { score: mS.score, weight: WEIGHT_MOMENTUM, reasons: mS.reasons },
      risk:     { score: rS.score, weight: RISK_MAX,
                  penaltyApplied: parseFloat(((1 - penalty) * 100).toFixed(1)) + '%',
                  reasons: rS.reasons },
      setup:    { score: sS.score, weight: WEIGHT_SETUP,    reasons: sS.reasons }
    },
    weights: { trend: WEIGHT_TREND, volume: WEIGHT_VOLUME, momentum: WEIGHT_MOMENTUM, setup: WEIGHT_SETUP },
    label:   final + '/10 — ' + rec + ' (' + confidence + ' Confidence)'
  };
}

module.exports = { computeScore };
