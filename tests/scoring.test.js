// ══════════════════════════════════════════════════════════════════
// tests/scoring.test.js — Unit Test: lib/scoring.js
// ══════════════════════════════════════════════════════════════════

const { computeScore } = require('../lib/scoring');

let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  ✅ ' + name);
    passed++;
  } catch (e) {
    console.log('  ❌ ' + name + ' — ' + e.message);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

// ── Fixtures ──────────────────────────────────────────────────────
const bullishIndicators = {
  rsi: 35,
  ma: { aboveMA20: true, aboveMA50: true, ma20vs50: 'bullish_alignment', type: 'golden_cross', ma20: 1000, ema9: 1050 },
  macd: { trend: 'bullish', crossover: 'golden_cross', histogram: 10, signal: 5 },
  bb: { position: 'oversold_zone', bandwidth: 8, isSqueeze: false },
  atr: { atrPct: 1.2, atr: 120 },
  trend: { strength: 'strong', adx: 30, direction: 'uptrend' },
  rvol: { rvol: 1.8, medianVolume: 5000000, label: 'Tinggi (1.5x+)', isSpike: false },
  position52w: { positionPct: 35, pctFromHigh: 20, isNearLow: false, isNearHigh: false },
  obv: { trend: 'rising', divergence: null },
  relStrength: { rsScore: 70, trend: 'outperform' }
};

const bearishIndicators = {
  rsi: 75,
  ma: { aboveMA20: false, aboveMA50: false, ma20vs50: 'bearish_alignment', type: 'death_cross', ma20: 900, ema9: 880 },
  macd: { trend: 'bearish', crossover: 'death_cross', histogram: -10, signal: -5 },
  bb: { position: 'overbought_zone', bandwidth: 18, isSqueeze: false },
  atr: { atrPct: 6, atr: 600 },
  trend: { strength: 'strong', adx: 30, direction: 'downtrend' },
  rvol: { rvol: 2.5, medianVolume: 5000000, label: 'Sangat Tinggi (2x+)', isSpike: true },
  position52w: { positionPct: 85, pctFromHigh: 2, isNearLow: false, isNearHigh: true },
  obv: { trend: 'falling', divergence: null },
  relStrength: { rsScore: 30, trend: 'underperform' }
};

const bullishStructure = {
  trend: { direction: 'uptrend', strength: 'strong' },
  hhll: { pattern: 'uptrend' },
  setups: [{ type: 'breakout', direction: 'long', confidence: 'high' }]
};

const bearishStructure = {
  trend: { direction: 'downtrend', strength: 'strong' },
  hhll: { pattern: 'downtrend' },
  setups: [{ type: 'reversal', direction: 'short', confidence: 'high' }]
};

const bullishVolume = {
  score: 8,
  accDist: { bias: 'accumulation', accDays: 7 },
  spike: { isSpike: true, ratio: 3 },
  confirmation: { signal: 'bullish_confirmed' },
  obv: { trend: 'rising' }
};

const bearishVolume = {
  score: 2,
  accDist: { bias: 'distribution', accDays: 2 },
  spike: { isSpike: false, ratio: 1 },
  confirmation: { signal: 'bearish_confirmed' },
  obv: { trend: 'falling' }
};

// ══════════════════════════════════════════════════════════════════
console.log('\n📊 computeScore — Output Structure');
// ══════════════════════════════════════════════════════════════════

test('Return semua field yang diperlukan', () => {
  const result = computeScore(bullishIndicators, bullishVolume, bullishStructure, {});
  assert('final' in result, 'harus ada field final');
  assert('recommendation' in result, 'harus ada recommendation');
  assert('confidence' in result, 'harus ada confidence');
  assert('riskReward' in result, 'harus ada riskReward');
  assert('breakdown' in result, 'harus ada breakdown');
});

test('final score range 0–10', () => {
  const r1 = computeScore(bullishIndicators, bullishVolume, bullishStructure, {});
  const r2 = computeScore(bearishIndicators, bearishVolume, bearishStructure, {});
  assert(r1.final >= 0 && r1.final <= 10, 'bullish score out of range: ' + r1.final);
  assert(r2.final >= 0 && r2.final <= 10, 'bearish score out of range: ' + r2.final);
});

test('breakdown punya semua komponen', () => {
  const result = computeScore(bullishIndicators, bullishVolume, bullishStructure, {});
  ['trend', 'volume', 'momentum', 'risk', 'setup'].forEach(k => {
    assert(k in result.breakdown, 'breakdown harus punya: ' + k);
    assert('score' in result.breakdown[k], k + ' harus punya score');
    assert('reasons' in result.breakdown[k], k + ' harus punya reasons');
  });
});

// ══════════════════════════════════════════════════════════════════
console.log('\n📊 computeScore — Skor Bullish vs Bearish');
// ══════════════════════════════════════════════════════════════════

test('Bullish score > Bearish score', () => {
  const bull = computeScore(bullishIndicators, bullishVolume, bullishStructure, {});
  const bear = computeScore(bearishIndicators, bearishVolume, bearishStructure, {});
  assert(bull.final > bear.final,
    `Bullish (${bull.final}) harus > Bearish (${bear.final})`);
});

test('Bullish full — rekomendasi BELI atau AKUMULASI', () => {
  const result = computeScore(bullishIndicators, bullishVolume, bullishStructure, {});
  assert(['BELI', 'AKUMULASI'].includes(result.recommendation),
    'got ' + result.recommendation);
});

test('Bearish full — rekomendasi JUAL atau KURANGI', () => {
  const result = computeScore(bearishIndicators, bearishVolume, bearishStructure, {});
  assert(['JUAL', 'KURANGI'].includes(result.recommendation),
    'got ' + result.recommendation);
});

// ══════════════════════════════════════════════════════════════════
console.log('\n📊 computeScore — Recommendation Logic');
// ══════════════════════════════════════════════════════════════════

test('Score >= 8 → BELI', () => {
  // Score sangat bullish
  const ind = { ...bullishIndicators, rsi: 25, mfi: { mfi: 15 } };
  const result = computeScore(ind, bullishVolume, bullishStructure, {});
  if (result.final >= 8) {
    assert(result.recommendation === 'BELI', 'Score ' + result.final + ' harus BELI, got ' + result.recommendation);
  }
});

test('Score 4–5 → TAHAN', () => {
  // Neutral indicators
  const neutralInd = {
    rsi: 50,
    ma: { aboveMA20: true, aboveMA50: false, ma20vs50: 'bearish_alignment' },
    macd: { trend: 'bullish', histogram: 1, signal: 1 },
    bb: { position: 'middle' },
    atr: { atrPct: 2 },
    trend: { strength: 'no_trend' },
    rvol: { rvol: 1.0, medianVolume: 5000000, isSpike: false },
    position52w: { positionPct: 50, isNearLow: false, isNearHigh: false }
  };
  const neutralVol = { score: 5, accDist: { bias: 'mixed' }, spike: { isSpike: false } };
  const neutralStr = { trend: { direction: 'sideways', strength: 'no_trend' }, hhll: { pattern: 'consolidation' }, setups: [] };
  const result = computeScore(neutralInd, neutralVol, neutralStr, {});
  assert(result.recommendation === 'TAHAN',
    'Score netral harus TAHAN, got ' + result.recommendation + ' (score=' + result.final + ')');
});

// ══════════════════════════════════════════════════════════════════
console.log('\n📊 computeScore — Risk Assessment');
// ══════════════════════════════════════════════════════════════════

test('ATR tinggi → risk score lebih tinggi', () => {
  const lowRisk  = computeScore({ ...bullishIndicators, atr: { atrPct: 1.0 } }, bullishVolume, bullishStructure, {});
  const highRisk = computeScore({ ...bullishIndicators, atr: { atrPct: 6.0 } }, bullishVolume, bullishStructure, {});
  assert(highRisk.breakdown.risk.score > lowRisk.breakdown.risk.score,
    `highRisk(${highRisk.breakdown.risk.score}) harus > lowRisk(${lowRisk.breakdown.risk.score})`);
});

test('RSI overbought → risk meningkat', () => {
  const normal   = computeScore({ ...bullishIndicators, rsi: 50 }, bullishVolume, bullishStructure, {});
  const overbought = computeScore({ ...bullishIndicators, rsi: 85 }, bullishVolume, bullishStructure, {});
  assert(overbought.breakdown.risk.score >= normal.breakdown.risk.score,
    'RSI overbought harus risk >= normal');
});

test('riskReward valid value', () => {
  const result = computeScore(bullishIndicators, bullishVolume, bullishStructure, {});
  assert(['Favorable', 'Moderate', 'Unfavorable'].includes(result.riskReward),
    'got ' + result.riskReward);
});

// ══════════════════════════════════════════════════════════════════
console.log('\n📊 computeScore — Edge Cases');
// ══════════════════════════════════════════════════════════════════

test('Semua null/undefined — tidak crash', () => {
  let result;
  try { result = computeScore(null, null, null, null); }
  catch (e) { throw new Error('Tidak boleh throw: ' + e.message); }
  assert(result !== null && result.final >= 0 && result.final <= 10);
});

test('Data kosong {} — tidak crash', () => {
  let result;
  try { result = computeScore({}, {}, {}, {}); }
  catch (e) { throw new Error('Tidak boleh throw: ' + e.message); }
  assert(result !== null);
});

test('Divergence bullish → momentum naik', () => {
  const withDiv    = computeScore({ ...bullishIndicators, divergence: { detected: true, bias: 'bullish' } }, bullishVolume, bullishStructure, {});
  const withoutDiv = computeScore(bullishIndicators, bullishVolume, bullishStructure, {});
  assert(withDiv.breakdown.momentum.score >= withoutDiv.breakdown.momentum.score,
    'Divergence bullish harus naikkan momentum');
});

test('Penalti likuiditas — saham illikuid risk lebih tinggi', () => {
  const liquidInd   = { ...bullishIndicators, rvol: { rvol: 1.5, medianVolume: 10000000, isSpike: false } };
  const illiquidInd = { ...bullishIndicators, rvol: { rvol: 1.5, medianVolume: 50000,    isSpike: false } };
  const liquidPD    = { current: 1000 };
  const illiquidPD  = { current: 1000 };
  const liquid   = computeScore(liquidInd,   bullishVolume, bullishStructure, liquidPD);
  const illiquid = computeScore(illiquidInd, bullishVolume, bullishStructure, illiquidPD);
  assert(illiquid.breakdown.risk.score >= liquid.breakdown.risk.score,
    'Saham illikuid harus punya risk score >= saham likuid, got liquid=' + liquid.breakdown.risk.score + ' illiquid=' + illiquid.breakdown.risk.score);
});

test('52W near high → risk meningkat', () => {
  const nearHigh   = { ...bullishIndicators, position52w: { positionPct: 92, pctFromHigh: 1.5, isNearHigh: true, isNearLow: false } };
  const notNearHigh = { ...bullishIndicators, position52w: { positionPct: 40, pctFromHigh: 30, isNearHigh: false, isNearLow: false } };
  const rNear = computeScore(nearHigh,    bullishVolume, bullishStructure, {});
  const rNot  = computeScore(notNearHigh, bullishVolume, bullishStructure, {});
  assert(rNear.breakdown.risk.score >= rNot.breakdown.risk.score,
    'Near 52W high harus risk >= not near high');
});

// ══════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════');
console.log(`Hasil: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
