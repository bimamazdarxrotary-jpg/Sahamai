// ══════════════════════════════════════════════════════════════════
// lib/bandar.js — Bandar Analysis Engine
// Deteksi pola bandar IHSG: akumulasi stealth, distribusi tersembunyi,
// retail trap, smart money footprint
// ══════════════════════════════════════════════════════════════════

const { hasOpen, candleBody, upperWick, lowerWick } = require('./candleUtils');

// ── Konstanta threshold ───────────────────────────────────────────
const STEALTH_PRICE_FLAT_PCT     = 5;    // harga flat jika perubahan < 5%
const STEALTH_VOL_GROWTH_PCT     = 20;   // volume naik jika tumbuh > 20%
const STEALTH_LOWER_WICK_RATIO   = 1.5;  // lower wick minimal 1.5x body
const DISTRIB_VOL_MULTIPLIER     = 1.5;  // volume distribusi minimal 1.5x avg
const DISTRIB_WICK_RATIO         = 1.2;  // upper wick minimal 1.2x body
const PANIC_VOL_MULTIPLIER       = 2.5;  // volume panik minimal 2.5x avg
const PANIC_BODY_RATIO           = 0.6;  // body candle panik minimal 60% range
const SMALL_CAP_THRESHOLD        = 1e12; // market cap < 1T IDR = small cap
const LARGE_CAP_THRESHOLD        = 5e12; // market cap > 5T IDR = fundamental
const GORENGAN_DAILY_VOL_PCT     = 3;    // volatilitas harian > 3% = gorengan
const GORENGAN_VOL_ERRATIC_RATIO = 10;   // max/min volume > 10x = erratic

/**
 * Hitung rata-rata volume
 */
function avgVol(candles, period) {
  const slice = candles.slice(-period).filter(function(c) { return c.volume > 0; });
  if (!slice.length) return 0;
  return slice.reduce(function(a, c) { return a + c.volume; }, 0) / slice.length;
}

/**
 * Deteksi Stealth Accumulation
 * Ciri: harga sideways/turun perlahan, volume kecil tapi konsisten naik
 * Bandar kumpulkan posisi tanpa menaikkan harga
 */
function detectStealthAccumulation(candles) {
  if (!candles || candles.length < 20) return null;

  const recent   = candles.slice(-20);
  const first10  = recent.slice(0, 10);
  const last10   = recent.slice(10);

  const priceChange = (last10[last10.length-1].close - first10[0].close) / first10[0].close * 100;
  const avgVolFirst = avgVol(first10, 10);
  const avgVolLast  = avgVol(last10, 10);

  const volGrowth   = avgVolFirst > 0 ? (avgVolLast - avgVolFirst) / avgVolFirst * 100 : 0;

  // Stealth: harga flat/turun sedikit tapi volume pelan naik
  const isPriceFlat = Math.abs(priceChange) < STEALTH_PRICE_FLAT_PCT;
  const isVolGrowing = volGrowth > STEALTH_VOL_GROWTH_PCT;

  // Hitung hari dengan lower wick panjang (bandar beli di low)
  // Bug fix: `c.open || c.close` sebelumnya membuat body jadi 0 saat open null,
  // sehingga syarat "lowerWick > body*RATIO" jadi trivial (selalu benar untuk
  // wick sekecil apa pun) -> over-counting candle stealth accumulation palsu.
  // Sekarang candle tanpa data open di-skip dari filter ini, bukan ditebak.
  const longLowerWick = last10.filter(function(c) {
    if (!hasOpen(c)) return false;
    const body = candleBody(c);
    const lw   = lowerWick(c);
    return lw > body * STEALTH_LOWER_WICK_RATIO && c.volume > avgVolFirst;
  }).length;

  const isActive = isPriceFlat && isVolGrowing && longLowerWick >= 2;

  return {
    detected:      isActive,
    priceChange:   parseFloat(priceChange.toFixed(2)),
    volGrowth:     parseFloat(volGrowth.toFixed(2)),
    longLowerWick: longLowerWick,
    confidence:    isActive ? (longLowerWick >= 4 ? 'high' : 'medium') : 'low',
    description:   isActive
      ? 'Stealth accumulation terdeteksi — volume meningkat ' + Math.round(volGrowth) + '% saat harga sideways. Kemungkinan bandar mengumpulkan posisi.'
      : 'Tidak ada pola stealth accumulation.'
  };
}

/**
 * Deteksi Distribution Trap
 * Ciri: harga naik cepat + volume besar + candle dengan upper wick panjang
 * Bandar jual saat retail euforia beli
 */
function detectDistributionTrap(candles) {
  if (!candles || candles.length < 15) return null;

  const recent  = candles.slice(-15);
  const avg     = avgVol(candles.slice(0, -15), 20) || avgVol(candles, 20);
  const priceUp = recent[recent.length-1].close > recent[0].close;

  // Cari candle distribusi: volume tinggi + upper wick panjang + close di bawah high
  // Bug fix: sama seperti stealth accumulation di atas — skip candle tanpa open,
  // jangan ditebak jadi body=0 yang membuat syarat wick trivial selalu benar.
  const distCandles = recent.filter(function(c) {
    if (!hasOpen(c)) return false;
    const body    = candleBody(c);
    const uw      = upperWick(c);
    const volHigh = c.volume > avg * DISTRIB_VOL_MULTIPLIER;
    return volHigh && uw > body * DISTRIB_WICK_RATIO;
  });

  const isDistrib = priceUp && distCandles.length >= 2;

  return {
    detected:      isDistrib,
    distCandles:   distCandles.length,
    confidence:    isDistrib ? (distCandles.length >= 3 ? 'high' : 'medium') : 'low',
    description:   isDistrib
      ? 'Distribution trap terdeteksi — ' + distCandles.length + ' candle dengan upper wick panjang di volume tinggi. Bandar kemungkinan menjual ke retail.'
      : 'Tidak ada pola distribution trap.'
  };
}

/**
 * Deteksi Retail Panic (Selling Climax)
 * Ciri: volume ekstrim + candle merah besar + harga jauh di bawah support
 * Retail panik jual = oportunitas bandar beli
 */
function detectRetailPanic(candles) {
  if (!candles || candles.length < 21) return null;

  const avg  = avgVol(candles.slice(0, -5), 20);
  const last5 = candles.slice(-5);

  // Bug fix: `c.close < (c.open || c.close)` sebelumnya selalu false saat open null
  // (self-comparison) -> candle panic tidak pernah terhitung diam-diam, undercounting.
  // Sekarang skip eksplisit candle tanpa open, bukan ditebak jadi "tidak bearish".
  const panicCandles = last5.filter(function(c) {
    if (!hasOpen(c)) return false;
    const isBearish = c.close < c.open;
    const bigBody   = candleBody(c) > (c.high - c.low) * PANIC_BODY_RATIO;
    const highVol   = c.volume > avg * PANIC_VOL_MULTIPLIER;
    return isBearish && bigBody && highVol;
  });

  const isPanic = panicCandles.length >= 1;

  return {
    detected:    isPanic,
    panicCount:  panicCandles.length,
    confidence:  isPanic ? 'high' : 'low',
    description: isPanic
      ? 'Retail panic selling terdeteksi — ' + panicCandles.length + ' candle merah besar dengan volume ' + (panicCandles.length > 0 ? Math.round(panicCandles[0].volume / avg * 10) / 10 : 0) + 'x rata-rata. Potensi reversal jika volume mulai mengering.'
      : 'Tidak ada pola retail panic.'
  };
}

/**
 * Deteksi Smart Money Footprint
 * Kombinasi: OBV divergence + volume pattern + price action
 */
function detectSmartMoneyFootprint(candles, indicators, volumeData) {
  if (!candles || candles.length < 20) return { score: 0, signals: [], label: 'Tidak terdeteksi' };

  const signals = [];
  let score   = 0;

  // 1. OBV rising saat harga turun (bullish divergence)
  // v4: OBV ada di indicators.obv (bukan volumeData.obv)
  const obvData    = (indicators && indicators.obv) || (volumeData && volumeData.obv);
  const priceDown  = candles[candles.length-1].close < candles[candles.length-10].close;
  if (obvData && obvData.trend === 'rising' && priceDown) {
    signals.push('OBV bullish divergence — smart money akumulasi saat harga turun');
    score += 3;
  }

  // 2. Akumulasi stealth
  const stealth = detectStealthAccumulation(candles);
  if (stealth && stealth.detected) {
    signals.push(stealth.description);
    score += stealth.confidence === 'high' ? 3 : 2;
  }

  // 3. Long lower wick di support (beli di low)
  // Bug fix: sama seperti stealth accumulation — skip candle tanpa open eksplisit,
  // jangan biarkan fallback body=0 membuat syarat wick trivial selalu benar.
  const recent5 = candles.slice(-5);
  const avg20   = avgVol(candles, 20);
  const buyingAtLow = recent5.filter(function(c) {
    if (!hasOpen(c)) return false;
    const lw   = lowerWick(c);
    const body = candleBody(c);
    return lw > body * 2 && c.volume > avg20 * 1.3;
  }).length;
  if (buyingAtLow >= 2) {
    signals.push('Buying at support — ' + buyingAtLow + ' candle dengan lower wick panjang di volume tinggi');
    score += 2;
  }

  // 4. MACD momentum tapi harga belum gerak (leading indicator)
  if (indicators && indicators.macd && indicators.macd.trend === 'bullish' && priceDown) {
    signals.push('MACD bullish tapi harga masih turun — momentum mendahului price');
    score += 1;
  }

  // 5. Accumulation bias dari volume engine
  if (volumeData && volumeData.accDist && volumeData.accDist.bias === 'accumulation' && volumeData.accDist.accDays >= 6) {
    signals.push('Pola akumulasi ' + volumeData.accDist.accDays + ' hari — konsisten di atas rata-rata');
    score += 2;
  }

  // 6. Smart Money Flow dari indicators (v4: indicators.smartMoney)
  const smf = indicators && indicators.smartMoney;
  if (smf && smf.bias === 'strong_buying') {
    signals.push('Smart money flow bullish kuat (' + smf.ratio + '%) — konfirmasi akumulasi');
    score += 2;
  } else if (smf && smf.bias === 'mild_buying') {
    signals.push('Smart money flow cenderung beli (' + smf.ratio + '%)');
    score += 1;
  }

  let label;
  if      (score >= 7) label = 'Smart money aktif — akumulasi kuat';
  else if (score >= 4) label = 'Ada indikasi smart money — perlu konfirmasi';
  else if (score >= 2) label = 'Sinyal lemah — belum meyakinkan';
  else                 label = 'Tidak terdeteksi';

  return { score: score, signals: signals, label: label };
}

/**
 * Deteksi tipe saham (gorengan vs fundamental)
 * Berdasarkan: volatilitas, market cap, volume pattern, price action
 */
function detectStockType(candles, priceData, metadata) {
  if (!candles || candles.length < 20) return null;

  const marketCap = priceData && priceData.marketCap;
  const avg       = avgVol(candles, 20);
  const last      = candles[candles.length - 1];
  const closes    = candles.map(function(c) { return c.close; });

  // Volatilitas harian
  const dailyReturns = [];
  for (let i = 1; i < closes.length; i++) {
    dailyReturns.push(Math.abs(closes[i] - closes[i-1]) / closes[i-1] * 100);
  }
  const avgDailyVol = dailyReturns.reduce(function(a, b) { return a + b; }, 0) / dailyReturns.length;

  // Cek volume konsistensi
  const volumes = candles.slice(-20).map(function(c) { return c.volume; });
  const maxVol  = Math.max.apply(null, volumes);
  const minVol  = Math.min.apply(null, volumes.filter(function(v) { return v > 0; }));
  const volErratic = minVol > 0 && maxVol / minVol > GORENGAN_VOL_ERRATIC_RATIO;

  const isHighVol = avgDailyVol > GORENGAN_DAILY_VOL_PCT;

  // Deteksi small cap:
  // 1. Dari marketCap jika tersedia
  // 2. Fallback: harga saham < Rp 200 + avg volume < 5M/hari = proxy saham kecil
  // 3. Fallback: avg volume harian sangat kecil < 1M lembar
  let isSmallCap = false;
  if (marketCap != null) {
    isSmallCap = marketCap < SMALL_CAP_THRESHOLD;
  } else {
    const lowPrice  = last.close < 200;
    const lowVolume = avg < 1000000;
    isSmallCap = lowPrice || lowVolume;
  }

  // Large cap: marketCap > 5T, atau avg vol > 50M/hari + harga > 500 (proxy blue chip)
  let isBigCap = false;
  if (marketCap != null) {
    isBigCap = marketCap > LARGE_CAP_THRESHOLD;
  } else {
    isBigCap = avg > 50000000 && last.close > 500;
  }

  const isGorengan    = isHighVol && volErratic && isSmallCap;
  const isFundamental = !isGorengan && isBigCap;

  return {
    type:        isGorengan ? 'speculative' : isFundamental ? 'fundamental' : 'mixed',
    label:       isGorengan ? '⚠️ Saham Spekulatif/Gorengan' : isFundamental ? '✅ Saham Fundamental' : '⚡ Mixed',
    avgDailyVol: parseFloat(avgDailyVol.toFixed(2)),
    volErratic,
    isSmallCap,
    marketCapEstimated: marketCap == null, // flag bahwa marketCap di-estimasi
    warning:     isGorengan ? 'Saham ini menunjukkan karakteristik gorengan — volatilitas tinggi dan volume tidak konsisten. Risiko sangat tinggi.' : null
  };
}

/**
 * Main: Full bandar analysis
 */
function analyzeBandar(candles, indicators, volumeData, priceData, metadata) {
  if (!candles || candles.length < 20) {
    return { error: 'Data tidak cukup untuk analisis bandar' };
  }

  const stealth     = detectStealthAccumulation(candles);
  const distTrap    = detectDistributionTrap(candles);
  const panic       = detectRetailPanic(candles);
  const smartMoney  = detectSmartMoneyFootprint(candles, indicators, volumeData);
  const stockType   = detectStockType(candles, priceData, metadata);

  // Overall bandar score
  let bandarScore = smartMoney.score;
  if (distTrap && distTrap.detected) bandarScore -= 2;
  if (panic    && panic.detected)    bandarScore += 1; // panic = peluang

  // Narrative
  const narrative = buildBandarNarrative(stealth, distTrap, panic, smartMoney, stockType);

  return {
    smartMoney:  smartMoney,
    stealth:     stealth,
    distTrap:    distTrap,
    panic:       panic,
    stockType:   stockType,
    bandarScore: Math.max(0, Math.min(10, bandarScore)),
    narrative:   narrative
  };
}

function buildBandarNarrative(stealth, distTrap, panic, smartMoney, stockType) {
  const parts = [];

  if (stockType && stockType.type === 'speculative') {
    parts.push(stockType.warning);
  }

  if (smartMoney && smartMoney.score >= 4) {
    parts.push(smartMoney.label + ': ' + smartMoney.signals.slice(0, 2).join('; '));
  }

  if (stealth && stealth.detected) {
    parts.push(stealth.description);
  }

  if (distTrap && distTrap.detected) {
    parts.push(distTrap.description);
  }

  if (panic && panic.detected) {
    parts.push(panic.description);
  }

  if (!parts.length) {
    parts.push('Tidak ada pola bandar yang signifikan terdeteksi dari data teknikal.');
  }

  return parts.join(' | ');
}

module.exports = {
  analyzeBandar,
  detectStealthAccumulation,
  detectDistributionTrap,
  detectRetailPanic,
  detectSmartMoneyFootprint,
  detectStockType
};
