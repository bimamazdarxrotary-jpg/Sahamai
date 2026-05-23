// ══════════════════════════════════════════════════════════════════
// lib/bandar.js — Bandar Analysis Engine
// Deteksi pola bandar IHSG: akumulasi stealth, distribusi tersembunyi,
// retail trap, smart money footprint
// ══════════════════════════════════════════════════════════════════

/**
 * Hitung rata-rata volume
 */
function avgVol(candles, period) {
  var slice = candles.slice(-period).filter(function(c) { return c.volume > 0; });
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

  var recent   = candles.slice(-20);
  var first10  = recent.slice(0, 10);
  var last10   = recent.slice(10);

  var priceChange = (last10[last10.length-1].close - first10[0].close) / first10[0].close * 100;
  var avgVolFirst = avgVol(first10, 10);
  var avgVolLast  = avgVol(last10, 10);

  var volGrowth   = avgVolFirst > 0 ? (avgVolLast - avgVolFirst) / avgVolFirst * 100 : 0;

  // Stealth: harga flat/turun sedikit tapi volume pelan naik
  var isPriceFlat = Math.abs(priceChange) < 5;
  var isVolGrowing = volGrowth > 20;

  // Hitung hari dengan lower wick panjang (bandar beli di low)
  var longLowerWick = last10.filter(function(c) {
    var body = Math.abs(c.close - (c.open || c.close));
    var lowerWick = Math.min(c.close, c.open || c.close) - c.low;
    return lowerWick > body * 1.5 && c.volume > avgVolFirst;
  }).length;

  var isActive = isPriceFlat && isVolGrowing && longLowerWick >= 2;

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

  var recent  = candles.slice(-15);
  var avg     = avgVol(candles.slice(0, -15), 20) || avgVol(candles, 20);
  var priceUp = recent[recent.length-1].close > recent[0].close;

  // Cari candle distribusi: volume tinggi + upper wick panjang + close di bawah high
  var distCandles = recent.filter(function(c) {
    var body      = Math.abs(c.close - (c.open || c.close));
    var upperWick = c.high - Math.max(c.close, c.open || c.close);
    var volHigh   = c.volume > avg * 1.5;
    return volHigh && upperWick > body * 1.2;
  });

  var isDistrib = priceUp && distCandles.length >= 2;

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

  var avg  = avgVol(candles.slice(0, -5), 20);
  var last5 = candles.slice(-5);

  var panicCandles = last5.filter(function(c) {
    var isBearish = c.close < (c.open || c.close);
    var bigBody   = Math.abs(c.close - (c.open || c.close)) > (c.high - c.low) * 0.6;
    var highVol   = c.volume > avg * 2.5;
    return isBearish && bigBody && highVol;
  });

  var isPanic = panicCandles.length >= 1;

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

  var signals = [];
  var score   = 0;

  // 1. OBV rising saat harga turun (bullish divergence)
  var obvData    = volumeData && volumeData.obv;
  var priceDown  = candles[candles.length-1].close < candles[candles.length-10].close;
  if (obvData && obvData.trend === 'rising' && priceDown) {
    signals.push('OBV bullish divergence — smart money akumulasi saat harga turun');
    score += 3;
  }

  // 2. Akumulasi stealth
  var stealth = detectStealthAccumulation(candles);
  if (stealth && stealth.detected) {
    signals.push(stealth.description);
    score += stealth.confidence === 'high' ? 3 : 2;
  }

  // 3. Long lower wick di support (beli di low)
  var recent5 = candles.slice(-5);
  var avg20   = avgVol(candles, 20);
  var buyingAtLow = recent5.filter(function(c) {
    var lw = Math.min(c.close, c.open || c.close) - c.low;
    var body = Math.abs(c.close - (c.open || c.close));
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

  var label;
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

  var marketCap = priceData && priceData.marketCap;
  var avg       = avgVol(candles, 20);
  var last      = candles[candles.length - 1];
  var closes    = candles.map(function(c) { return c.close; });

  // Volatilitas harian
  var dailyReturns = [];
  for (var i = 1; i < closes.length; i++) {
    dailyReturns.push(Math.abs(closes[i] - closes[i-1]) / closes[i-1] * 100);
  }
  var avgDailyVol = dailyReturns.reduce(function(a, b) { return a + b; }, 0) / dailyReturns.length;

  // Tanda gorengan: volatilitas tinggi + market cap kecil + volume tidak konsisten
  var isSmallCap   = marketCap && marketCap < 1e12; // < 1T IDR
  var isHighVol    = avgDailyVol > 3;
  var volErratic   = false;

  // Cek volume konsistensi
  var volumes  = candles.slice(-20).map(function(c) { return c.volume; });
  var maxVol   = Math.max.apply(null, volumes);
  var minVol   = Math.min.apply(null, volumes.filter(function(v) { return v > 0; }));
  if (minVol > 0 && maxVol / minVol > 10) volErratic = true;

  var isGorengan    = isHighVol && volErratic && isSmallCap;
  var isFundamental = !isGorengan && marketCap && marketCap > 5e12; // > 5T IDR

  return {
    type:        isGorengan ? 'speculative' : isFundamental ? 'fundamental' : 'mixed',
    label:       isGorengan ? '⚠️ Saham Spekulatif/Gorengan' : isFundamental ? '✅ Saham Fundamental' : '⚡ Mixed',
    avgDailyVol: parseFloat(avgDailyVol.toFixed(2)),
    volErratic:  volErratic,
    isSmallCap:  isSmallCap,
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

  var stealth     = detectStealthAccumulation(candles);
  var distTrap    = detectDistributionTrap(candles);
  var panic       = detectRetailPanic(candles);
  var smartMoney  = detectSmartMoneyFootprint(candles, indicators, volumeData);
  var stockType   = detectStockType(candles, priceData, metadata);

  // Overall bandar score
  var bandarScore = smartMoney.score;
  if (distTrap && distTrap.detected) bandarScore -= 2;
  if (panic    && panic.detected)    bandarScore += 1; // panic = peluang

  // Narrative
  var narrative = buildBandarNarrative(stealth, distTrap, panic, smartMoney, stockType);

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
  var parts = [];

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
