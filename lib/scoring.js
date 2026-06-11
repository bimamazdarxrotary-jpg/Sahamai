// ══════════════════════════════════════════════════════════════════
// lib/scoring.js — Scoring 7 layer, deterministik
// Output: skor 0–10 per layer + total + rekomendasi
// ══════════════════════════════════════════════════════════════════

// Bobot per layer (total = 1.0)
const WEIGHTS = {
  l1_data:       0.00,   // L1 hanya penentu kualitas data, tidak masuk skor
  l2_priceAction: 0.22,  // EMA alignment, BB, S/R, trend direction
  l3_momentum:   0.23,   // RSI, MACD slope, volume ratio
  l4_sentiment:  0.18,   // Net foreign, IHSG, sektor
  l5_fundamental: 0.15,  // Revenue, DER, cashflow, EPS
  l6_news:       0.10,   // Sentimen berita
  l7_risk:       0.12    // R/R ratio, kualitas entry
};

// ── L2: Price Action ──────────────────────────────────────────────
function scoreL2PriceAction(indicators) {
  if (!indicators) return { score: 5, breakdown: [], label: 'N/A' };
  const { trend, bb, position52w, candlestick, ma, adx, divergence } = indicators;
  let score = 5;
  const breakdown = [];

  // EMA alignment dari trendDir (0–10 deterministik)
  if (trend?.score != null) {
    const trendContrib = (trend.score - 5) * 0.6;
    score += trendContrib;
    breakdown.push({ item: `EMA alignment (${trend.label})`, contrib: parseFloat(trendContrib.toFixed(2)) });
  }

  // Bollinger Bands
  if (bb) {
    if (bb.bandPct < 20)  { score += 0.5; breakdown.push({ item: 'BB: oversold zone', contrib: 0.5 }); }
    if (bb.bandPct > 80)  { score -= 0.5; breakdown.push({ item: 'BB: overbought zone', contrib: -0.5 }); }
    if (bb.isSqueeze)     { score += 0.3; breakdown.push({ item: 'BB squeeze — breakout imminent', contrib: 0.3 }); }
  }

  // 52-Week position
  if (position52w) {
    if (position52w.isNearLow)  { score += 0.5; breakdown.push({ item: '52W low zone — potential value', contrib: 0.5 }); }
    if (position52w.isNearHigh) { score -= 0.4; breakdown.push({ item: '52W high zone — rawan profit taking', contrib: -0.4 }); }
  }

  // Candlestick patterns
  if (candlestick?.patterns?.length) {
    const bullPats = candlestick.patterns.filter(p => p.type === 'bullish');
    const bearPats = candlestick.patterns.filter(p => p.type === 'bearish');
    const bullScore = bullPats.reduce((s,p) => s + (p.strength==='high'?0.6:0.4), 0);
    const bearScore = bearPats.reduce((s,p) => s + (p.strength==='high'?0.6:0.4), 0);
    const net = Math.min(1.2, bullScore) - Math.min(1.2, bearScore);
    if (net !== 0) { score += net; breakdown.push({ item: `Candlestick: ${candlestick.summary}`, contrib: parseFloat(net.toFixed(2)) }); }
  }

  // ADX trend strength
  if (adx) {
    if (adx.strength === 'very_strong' && adx.trend === 'uptrend')   { score += 0.5; breakdown.push({ item: 'ADX very_strong uptrend', contrib: 0.5 }); }
    if (adx.strength === 'strong'      && adx.trend === 'uptrend')   { score += 0.3; breakdown.push({ item: 'ADX strong uptrend', contrib: 0.3 }); }
    if (adx.strength === 'very_strong' && adx.trend === 'downtrend') { score -= 0.5; breakdown.push({ item: 'ADX very_strong downtrend', contrib: -0.5 }); }
  }

  // Divergence
  if (divergence?.detected) {
    if (divergence.bias === 'bullish') { score += 0.5; breakdown.push({ item: `Bullish divergence (${divergence.divergences.map(d=>d.indicator).join(',')})`, contrib: 0.5 }); }
    if (divergence.bias === 'bearish') { score -= 0.5; breakdown.push({ item: `Bearish divergence (${divergence.divergences.map(d=>d.indicator).join(',')})`, contrib: -0.5 }); }
  }

  score = Math.max(0, Math.min(10, score));
  return { score: parseFloat(score.toFixed(1)), breakdown, label: score>=7?'Bullish':score>=4?'Netral':'Bearish' };
}

// ── L3: Momentum ──────────────────────────────────────────────────
function scoreL3Momentum(indicators) {
  if (!indicators) return { score: 5, breakdown: [], label: 'N/A' };
  const { rsi, macd, volumeRatio, obv, weekly, monthly } = indicators;
  let score = 5;
  const breakdown = [];

  // RSI
  if (rsi != null) {
    if      (rsi < 30)              { score += 1.5; breakdown.push({ item: `RSI ${rsi} — oversold kuat`, contrib: 1.5 }); }
    else if (rsi < 40)              { score += 0.8; breakdown.push({ item: `RSI ${rsi} — oversold ringan`, contrib: 0.8 }); }
    else if (rsi >= 40 && rsi < 50) { score += 0.2; breakdown.push({ item: `RSI ${rsi} — mendekati support 50`, contrib: 0.2 }); }
    else if (rsi >= 50 && rsi < 60) { score += 0.3; breakdown.push({ item: `RSI ${rsi} — di atas 50 (momentum positif)`, contrib: 0.3 }); }
    else if (rsi >= 60 && rsi < 70) { score += 0.0; breakdown.push({ item: `RSI ${rsi} — normal bullish`, contrib: 0 }); }
    else if (rsi >= 70 && rsi < 80) { score -= 0.8; breakdown.push({ item: `RSI ${rsi} — overbought`, contrib: -0.8 }); }
    else if (rsi >= 80)             { score -= 1.5; breakdown.push({ item: `RSI ${rsi} — overbought ekstrim`, contrib: -1.5 }); }
  }

  // MACD
  if (macd) {
    if (macd.crossover === 'golden_cross') { score += 1.0; breakdown.push({ item: 'MACD golden cross', contrib: 1.0 }); }
    if (macd.crossover === 'death_cross')  { score -= 1.0; breakdown.push({ item: 'MACD death cross', contrib: -1.0 }); }
    if (macd.trend === 'bullish' && macd.slopeLabel === 'rising_fast')  { score += 0.7; breakdown.push({ item: 'MACD slope rising fast', contrib: 0.7 }); }
    if (macd.trend === 'bullish' && macd.slopeLabel === 'rising')       { score += 0.4; breakdown.push({ item: 'MACD slope rising', contrib: 0.4 }); }
    if (macd.trend === 'bearish' && macd.slopeLabel === 'falling_fast') { score -= 0.7; breakdown.push({ item: 'MACD slope falling fast', contrib: -0.7 }); }
    if (macd.trend === 'bearish' && macd.slopeLabel === 'falling')      { score -= 0.4; breakdown.push({ item: 'MACD slope falling', contrib: -0.4 }); }
  }

  // Volume ratio vs MA20
  if (volumeRatio) {
    if      (volumeRatio.ratio >= 3)   { score += 1.0; breakdown.push({ item: `Volume ratio ${volumeRatio.ratio}x — spike ekstrim`, contrib: 1.0 }); }
    else if (volumeRatio.ratio >= 1.5) { score += 0.5; breakdown.push({ item: `Volume ratio ${volumeRatio.ratio}x — di atas normal`, contrib: 0.5 }); }
    else if (volumeRatio.ratio < 0.5)  { score -= 0.5; breakdown.push({ item: `Volume ratio ${volumeRatio.ratio}x — sepi`, contrib: -0.5 }); }
  }

  // OBV
  if (obv) {
    if (obv.divergence === 'bullish_divergence') { score += 0.5; breakdown.push({ item: 'OBV bullish divergence', contrib: 0.5 }); }
    if (obv.divergence === 'bearish_divergence') { score -= 0.5; breakdown.push({ item: 'OBV bearish divergence', contrib: -0.5 }); }
  }

  // Multi-TF konfirmasi
  if (weekly?.rsi != null) {
    if (weekly.rsi < 35)  { score += 0.5; breakdown.push({ item: `Weekly RSI ${weekly.rsi} — oversold`, contrib: 0.5 }); }
    if (weekly.rsi > 70)  { score -= 0.3; breakdown.push({ item: `Weekly RSI ${weekly.rsi} — overbought`, contrib: -0.3 }); }
    if (weekly.trend === 'above_ema20') { score += 0.3; breakdown.push({ item: 'Weekly: harga di atas EMA20', contrib: 0.3 }); }
    else                                { score -= 0.3; breakdown.push({ item: 'Weekly: harga di bawah EMA20', contrib: -0.3 }); }
  }
  if (monthly?.rsi != null) {
    if (monthly.trend === 'above_ema20') { score += 0.3; breakdown.push({ item: 'Monthly: tren panjang bullish', contrib: 0.3 }); }
    else                                 { score -= 0.3; breakdown.push({ item: 'Monthly: tren panjang bearish', contrib: -0.3 }); }
  }

  score = Math.max(0, Math.min(10, score));
  return { score: parseFloat(score.toFixed(1)), breakdown, label: score>=7?'Momentum kuat':score>=4?'Momentum moderat':'Momentum lemah' };
}

// ── L4: Market Sentiment ──────────────────────────────────────────
function scoreL4Sentiment(foreignData, contextData) {
  let score = 5;
  const breakdown = [];

  if (foreignData) {
    const adj = foreignData.score || 0;
    if      (adj >= 2)  { score += 2.0; breakdown.push({ item: `Net foreign strong buy (${foreignData.label})`, contrib: 2.0 }); }
    else if (adj >= 1)  { score += 1.0; breakdown.push({ item: `Net foreign mild buy (${foreignData.label})`, contrib: 1.0 }); }
    else if (adj <= -2) { score -= 2.0; breakdown.push({ item: `Net foreign strong sell (${foreignData.label})`, contrib: -2.0 }); }
    else if (adj <= -1) { score -= 1.0; breakdown.push({ item: `Net foreign mild sell (${foreignData.label})`, contrib: -1.0 }); }
  }

  if (contextData) {
    if (contextData.marketRisk === 'risk_on')           { score += 1.0; breakdown.push({ item: 'Market sentiment: risk_on', contrib: 1.0 }); }
    else if (contextData.marketRisk === 'mild_risk_on') { score += 0.5; breakdown.push({ item: 'Market sentiment: mild_risk_on', contrib: 0.5 }); }
    else if (contextData.marketRisk === 'risk_off')     { score -= 1.5; breakdown.push({ item: 'Market sentiment: risk_off', contrib: -1.5 }); }
    else if (contextData.marketRisk === 'mild_risk_off'){ score -= 0.7; breakdown.push({ item: 'Market sentiment: mild_risk_off', contrib: -0.7 }); }

    if (contextData.sectorBias === 'beneficiary')       { score += 0.7; breakdown.push({ item: `Sektor beneficiary di kondisi saat ini`, contrib: 0.7 }); }
    else if (contextData.sectorBias === 'laggard')      { score -= 0.7; breakdown.push({ item: `Sektor laggard di kondisi saat ini`, contrib: -0.7 }); }
  }

  score = Math.max(0, Math.min(10, score));
  return { score: parseFloat(score.toFixed(1)), breakdown, label: score>=7?'Sentimen positif':score>=4?'Sentimen netral':'Sentimen negatif' };
}

// ── L5: Fundamental ───────────────────────────────────────────────
function scoreL5Fundamental(fundamentalData) {
  if (!fundamentalData || fundamentalData.noData) {
    return { score: 5, breakdown: [{ item: 'Data fundamental tidak tersedia, skor netral', contrib: 0 }], label: 'N/A' };
  }
  let score = 5;
  const breakdown = [];

  // Revenue growth QoQ
  if (fundamentalData.revenueGrowthQoQ != null) {
    const g = fundamentalData.revenueGrowthQoQ;
    if      (g >= 20) { score += 1.5; breakdown.push({ item: `Revenue QoQ +${g}% — pertumbuhan tinggi`, contrib: 1.5 }); }
    else if (g >= 10) { score += 0.8; breakdown.push({ item: `Revenue QoQ +${g}% — pertumbuhan moderat`, contrib: 0.8 }); }
    else if (g >= 0)  { score += 0.2; breakdown.push({ item: `Revenue QoQ +${g}% — stabil`, contrib: 0.2 }); }
    else if (g < -10) { score -= 1.2; breakdown.push({ item: `Revenue QoQ ${g}% — kontraksi`, contrib: -1.2 }); }
    else              { score -= 0.5; breakdown.push({ item: `Revenue QoQ ${g}% — sedikit turun`, contrib: -0.5 }); }
  }

  // Revenue growth YoY
  if (fundamentalData.revenueGrowthYoY != null) {
    const g = fundamentalData.revenueGrowthYoY;
    if      (g >= 20) { score += 1.0; breakdown.push({ item: `Revenue YoY +${g}% — tumbuh kuat`, contrib: 1.0 }); }
    else if (g >= 5)  { score += 0.5; breakdown.push({ item: `Revenue YoY +${g}% — tumbuh moderat`, contrib: 0.5 }); }
    else if (g < -10) { score -= 1.0; breakdown.push({ item: `Revenue YoY ${g}% — kontraksi tahunan`, contrib: -1.0 }); }
  }

  // Debt to Equity Ratio
  if (fundamentalData.debtToEquity != null) {
    const der = fundamentalData.debtToEquity;
    if      (der < 0.5)                   { score += 0.8; breakdown.push({ item: `DER ${der}x — utang sangat sehat`, contrib: 0.8 }); }
    else if (der < 1.0)                   { score += 0.3; breakdown.push({ item: `DER ${der}x — utang moderat`, contrib: 0.3 }); }
    else if (der >= 1.0 && der < 2.0)     { score -= 0.3; breakdown.push({ item: `DER ${der}x — utang mulai berat`, contrib: -0.3 }); }
    else if (der >= 2.0)                  { score -= 1.0; breakdown.push({ item: `DER ${der}x — leverage tinggi`, contrib: -1.0 }); }
  }

  // Cash flow operasional
  if (fundamentalData.cashflowOp != null) {
    if      (fundamentalData.cashflowOp === 'positive_growing') { score += 0.8; breakdown.push({ item: 'Cashflow operasional positif & tumbuh', contrib: 0.8 }); }
    else if (fundamentalData.cashflowOp === 'positive_stable')  { score += 0.4; breakdown.push({ item: 'Cashflow operasional positif stabil', contrib: 0.4 }); }
    else if (fundamentalData.cashflowOp === 'negative')         { score -= 1.0; breakdown.push({ item: 'Cashflow operasional negatif', contrib: -1.0 }); }
  }

  // EPS trend
  if (fundamentalData.epsTrend != null) {
    if      (fundamentalData.epsTrend === 'growing_fast')  { score += 1.0; breakdown.push({ item: 'EPS tumbuh cepat', contrib: 1.0 }); }
    else if (fundamentalData.epsTrend === 'growing')       { score += 0.5; breakdown.push({ item: 'EPS tumbuh stabil', contrib: 0.5 }); }
    else if (fundamentalData.epsTrend === 'flat')          { score += 0.0; breakdown.push({ item: 'EPS flat', contrib: 0 }); }
    else if (fundamentalData.epsTrend === 'declining')     { score -= 0.8; breakdown.push({ item: 'EPS menurun', contrib: -0.8 }); }
    else if (fundamentalData.epsTrend === 'loss')          { score -= 1.5; breakdown.push({ item: 'Merugi — EPS negatif', contrib: -1.5 }); }
  }

  score = Math.max(0, Math.min(10, score));
  return { score: parseFloat(score.toFixed(1)), breakdown, label: score>=7?'Fundamental kuat':score>=4?'Fundamental moderat':'Fundamental lemah' };
}

// ── L6: News & Catalyst ───────────────────────────────────────────
function scoreL6News(newsData) {
  if (!newsData || !newsData.length) {
    return { score: 5, breakdown: [{ item: 'Tidak ada berita terkini', contrib: 0 }], label: 'Netral' };
  }
  let score = 5;
  const breakdown = [];
  let sentimentSum = 0, count = 0;
  for (const n of newsData) {
    if (n.sentiment === 'positive') { sentimentSum += 1; count++; }
    if (n.sentiment === 'negative') { sentimentSum -= 1; count++; }
  }
  if (count > 0) {
    const avg = sentimentSum / count;
    const contrib = parseFloat((avg * 2.5).toFixed(2));
    score += contrib;
    const bias = avg > 0.3 ? 'mayoritas positif' : avg < -0.3 ? 'mayoritas negatif' : 'campuran';
    breakdown.push({ item: `Sentimen berita: ${bias} (${count} berita)`, contrib });
  }
  score = Math.max(0, Math.min(10, score));
  return { score: parseFloat(score.toFixed(1)), breakdown, label: score>=7?'Katalis positif':score>=4?'Netral':'Katalis negatif' };
}

// ── L7: Risk Management Quality ───────────────────────────────────
function scoreL7Risk(riskData, indicators) {
  if (!riskData) return { score: 5, breakdown: [], label: 'N/A' };
  let score = 5;
  const breakdown = [];

  // R/R ratio
  const rr = riskData.riskReward?.rrTP2 || 0;
  if      (rr >= 3)   { score += 2.5; breakdown.push({ item: `R/R ${rr}:1 — excellent`, contrib: 2.5 }); }
  else if (rr >= 2)   { score += 1.5; breakdown.push({ item: `R/R ${rr}:1 — baik`, contrib: 1.5 }); }
  else if (rr >= 1.5) { score += 0.5; breakdown.push({ item: `R/R ${rr}:1 — cukup`, contrib: 0.5 }); }
  else if (rr < 1)    { score -= 2.0; breakdown.push({ item: `R/R ${rr}:1 — tidak layak`, contrib: -2.0 }); }

  // ATR volatilitas
  if (indicators?.atr) {
    const atrPct = indicators.atr.atrPct;
    if      (atrPct > 5)  { score -= 1.5; breakdown.push({ item: `ATR ${atrPct}% — volatilitas sangat tinggi`, contrib: -1.5 }); }
    else if (atrPct > 3)  { score -= 0.7; breakdown.push({ item: `ATR ${atrPct}% — volatilitas tinggi`, contrib: -0.7 }); }
    else if (atrPct < 1)  { score += 0.5; breakdown.push({ item: `ATR ${atrPct}% — volatilitas rendah (aman)`, contrib: 0.5 }); }
  }

  // Posisi entry vs 52W
  if (indicators?.position52w) {
    const pos = indicators.position52w.positionPct;
    if      (pos <= 15) { score += 1.0; breakdown.push({ item: '52W low zone — entry harga murah', contrib: 1.0 }); }
    else if (pos >= 85) { score -= 1.0; breakdown.push({ item: '52W high zone — risiko beli di puncak', contrib: -1.0 }); }
  }

  score = Math.max(0, Math.min(10, score));
  return { score: parseFloat(score.toFixed(1)), breakdown, label: score>=7?'Setup risiko baik':score>=4?'Setup moderat':'Setup berisiko tinggi' };
}

// ── Aggregasi final ───────────────────────────────────────────────
function computeScore(indicators, foreignData, contextData, fundamentalData, newsData, riskData) {
  const l2 = scoreL2PriceAction(indicators);
  const l3 = scoreL3Momentum(indicators);
  const l4 = scoreL4Sentiment(foreignData, contextData);
  const l5 = scoreL5Fundamental(fundamentalData);
  const l6 = scoreL6News(newsData);
  const l7 = scoreL7Risk(riskData, indicators);

  const weighted =
    l2.score * WEIGHTS.l2_priceAction +
    l3.score * WEIGHTS.l3_momentum    +
    l4.score * WEIGHTS.l4_sentiment   +
    l5.score * WEIGHTS.l5_fundamental +
    l6.score * WEIGHTS.l6_news        +
    l7.score * WEIGHTS.l7_risk;

  const final = parseFloat(weighted.toFixed(1));
  const recommendation =
    final >= 8.0 ? 'BELI'      :
    final >= 6.5 ? 'AKUMULASI' :
    final >= 4.5 ? 'TAHAN'     :
    final >= 2.5 ? 'KURANGI'   : 'JUAL';

  return {
    final, recommendation,
    layers: {
      l2_priceAction: l2,
      l3_momentum:    l3,
      l4_sentiment:   l4,
      l5_fundamental: l5,
      l6_news:        l6,
      l7_risk:        l7
    },
    weights: WEIGHTS,
    summary: `Score ${final}/10 — ${recommendation}. Price Action ${l2.score} | Momentum ${l3.score} | Sentimen ${l4.score} | Fundamental ${l5.score} | Berita ${l6.score} | Risk ${l7.score}`
  };
}

module.exports = {
  computeScore,
  scoreL2PriceAction,
  scoreL3Momentum,
  scoreL4Sentiment,
  scoreL5Fundamental,
  scoreL6News,
  scoreL7Risk,
  WEIGHTS
};
