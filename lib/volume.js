// ══════════════════════════════════════════════════════════════════
// lib/volume.js — Volume Intelligence Engine
// Deteksi akumulasi, distribusi, spike, bandar activity
// ══════════════════════════════════════════════════════════════════

const { hasOpen, candleBody } = require('./candleUtils');

// ── Konstanta threshold ───────────────────────────────────────────
const SPIKE_EXTREME_RATIO  = 5;   // volume spike ekstrim jika > 5x avg
const SPIKE_HIGH_RATIO     = 3;   // spike tinggi jika > 3x avg
const SPIKE_MODERATE_RATIO = 2;   // spike moderat jika > 2x avg
const SPIKE_MILD_RATIO     = 1.5; // spike ringan jika > 1.5x avg
const ACC_DIST_LOOKBACK    = 10;  // lookback akumulasi/distribusi (hari)

/**
 * Rata-rata volume N hari terakhir
 */
function avgVolume(candles, period = 20) {
  const slice = candles.slice(-period).filter(c => c.volume > 0);
  if (!slice.length) return 0;
  return Math.round(slice.reduce((a, c) => a + c.volume, 0) / slice.length);
}

/**
 * On-Balance Volume (OBV)
 * Mengukur tekanan beli/jual secara kumulatif
 */
function obv(candles) {
  if (!candles || candles.length < 2) return null;
  let obvVal = 0;
  const obvSeries = [0];
  for (let i = 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    obvVal += diff > 0 ? candles[i].volume
            : diff < 0 ? -candles[i].volume
            : 0;
    obvSeries.push(obvVal);
  }
  const trend = obvSeries[obvSeries.length - 1] > obvSeries[Math.max(0, obvSeries.length - 5)]
    ? 'rising' : 'falling';
  return { value: obvVal, trend };
}

/**
 * Volume Weighted Average Price (VWAP) — intraday proxy dari daily data
 */
function vwap(candles, period = 20) {
  const slice = candles.slice(-period).filter(c => c.volume > 0);
  if (!slice.length) return null;
  const totalPV  = slice.reduce((a, c) => a + ((c.high + c.low + c.close) / 3) * c.volume, 0);
  const totalVol = slice.reduce((a, c) => a + c.volume, 0);
  return totalVol ? Math.round(totalPV / totalVol) : null;
}

/**
 * Deteksi Volume Spike
 * Spike = volume > N× rata-rata
 */
function detectVolumeSpike(candles, multiplier = 2.0) {
  if (!candles || candles.length < 21) return null;
  const avg  = avgVolume(candles.slice(0, -1), 20);
  const last = candles[candles.length - 1];
  if (!avg || !last.volume) return null;

  const ratio = last.volume / avg;
  return {
    isSpike:    ratio >= multiplier,
    ratio:      parseFloat(ratio.toFixed(2)),
    avgVolume:  avg,
    lastVolume: last.volume,
    intensity:  ratio >= 5   ? 'extreme'
              : ratio >= SPIKE_HIGH_RATIO     ? 'high'
              : ratio >= SPIKE_MODERATE_RATIO ? 'moderate'
              : ratio >= SPIKE_MILD_RATIO     ? 'mild'
              : 'normal'
  };
}

/**
 * Accumulation / Distribution Detection
 * Logika: harga naik + volume naik = akumulasi
 *         harga turun + volume naik = distribusi
 *         harga bergerak + volume kecil = tidak meyakinkan
 */
function detectAccDist(candles, lookback = 10) {
  if (!candles || candles.length < lookback + 1) return null;

  const recent = candles.slice(-lookback);
  let accDays = 0, distDays = 0, dryDays = 0;
  const avgVol = avgVolume(candles.slice(0, -lookback), 20) || 1;

  for (let i = 1; i < recent.length; i++) {
    const priceUp  = recent[i].close > recent[i - 1].close;
    const volAbove = recent[i].volume > avgVol;

    if (priceUp && volAbove)   accDays++;
    else if (!priceUp && volAbove) distDays++;
    else dryDays++;
  }

  // Money Flow Multiplier → Chaikin
  const mfm = recent.map(c => {
    const hl = c.high - c.low;
    return hl ? ((c.close - c.low) - (c.high - c.close)) / hl : 0;
  });
  const mfv  = recent.map((c, i) => mfm[i] * c.volume);
  const adl  = mfv.reduce((a, b) => a + b, 0);

  let bias;
  if (accDays >= distDays * 2)       bias = 'accumulation';
  else if (distDays >= accDays * 2)  bias = 'distribution';
  else if (dryDays > lookback * 0.5) bias = 'drying_up';
  else                               bias = 'mixed';

  return {
    bias,
    accDays,
    distDays,
    dryDays,
    adl:   Math.round(adl),
    score: accDays - distDays  // positif = akumulasi, negatif = distribusi
  };
}

/**
 * Unusual Activity Detection — deteksi aktivitas bandar
 * Mencari candle dengan volume ekstrim + body kecil (absorpsi)
 */
function detectUnusualActivity(candles, period = 20) {
  if (!candles || candles.length < period + 1) return null;

  const avg    = avgVolume(candles.slice(0, -1), period);
  const recent = candles.slice(-5);
  const flags  = [];

  for (const c of recent) {
    const ratio    = avg ? c.volume / avg : 0;
    // Bug fix: sebelumnya `c.open || c.close` membuat bodyPct jadi 0 dan klasifikasi
    // arah (buying/selling climax) diam-diam SELALU 'selling_climax' saat open null
    // (karena c.close > c.close selalu false). Sekarang eksplisit: kalau open tidak
    // tersedia, body dianggap tidak diketahui (bodyPct=0, aman untuk deteksi absorpsi)
    // tapi arah TIDAK ditebak — dilabeli 'volume_spike' generik, bukan dipaksa salah satu.
    const cBody    = candleBody(c);
    const bodyPct  = c.high !== c.low && cBody != null ? cBody / (c.high - c.low) : 0;
    const isSpike  = ratio > 2;
    const isAbsorb = isSpike && bodyPct < 0.3; // volume besar tapi body kecil = absorpsi

    if (isSpike) {
      const direction = !hasOpen(c) ? 'volume_spike' : (c.close > c.open ? 'buying_climax' : 'selling_climax');
      flags.push({
        date:    c.date,
        type:    isAbsorb ? 'absorption' : direction,
        volRatio: parseFloat(ratio.toFixed(2))
      });
    }
  }

  return {
    hasUnusual: flags.length > 0,
    flags,
    avgVolume:  avg
  };
}

/**
 * Climax Volume — exhaustion signal
 */
function detectClimaxVolume(candles) {
  if (!candles || candles.length < 21) return null;

  // Pakai multiplier 2.5 agar lebih sensitif — spike 3x terlalu ketat untuk climax
  const spike = detectVolumeSpike(candles, 2.5);

  if (!spike || !spike.isSpike) {
    return { isClimax: false, volRatio: spike ? spike.ratio : null };
  }

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  // Climax: volume ekstrim + reversal candle
  // Bug fix: `last.open || last.close` sebelumnya membuat kondisi ini diam-diam
  // selalu false saat open null (self-comparison last.close vs last.close).
  // Sekarang eksplisit: tanpa data open, isReversal tidak bisa ditentukan -> false.
  const isReversal = hasOpen(last) && (
    (last.close < prev.close && last.close < last.open) ||  // bearish
    (last.close > prev.close && last.close > last.open)     // bullish
  );

  return {
    isClimax:   true,
    type:       last.close < prev.close ? 'selling_climax' : 'buying_climax',
    isReversal,
    volRatio:   spike.ratio
  };
}

/**
 * Volume Trend Confirmation
 * Apakah tren harga dikonfirmasi oleh volume?
 */
function volumeTrendConfirmation(candles) {
  if (!candles || candles.length < 10) return null;

  const recent = candles.slice(-10);
  const priceTrend = recent[recent.length - 1].close > recent[0].close ? 'up' : 'down';
  const avgVolEarly = avgVolume(recent.slice(0, 5), 5);
  const avgVolLate  = avgVolume(recent.slice(-5), 5);

  const volIncreasing = avgVolLate > avgVolEarly * 1.1;
  const confirmed     = (priceTrend === 'up' && volIncreasing)
                     || (priceTrend === 'down' && volIncreasing);

  return {
    priceTrend,
    volIncreasing,
    confirmed,
    signal: confirmed
      ? priceTrend === 'up' ? 'bullish_confirmed' : 'bearish_confirmed'
      : 'unconfirmed_move'
  };
}

/**
 * Smart Money Flow Index (simplified)
 * Mengukur apakah uang besar masuk di close (bullish) atau open (bearish)
 */
function smartMoneyFlow(candles, period) {
  period = period || 14;
  if (!candles || candles.length < period) return null;

  const recent = candles.slice(-period);
  let bullFlow = 0, bearFlow = 0;

  recent.forEach(function(c) {
    const range   = c.high - c.low || 1;
    // Smart money biasanya push harga di close
    const smfMult = ((c.close - c.low) - (c.high - c.close)) / range;
    const flow    = smfMult * c.volume;
    if (flow > 0) bullFlow += flow;
    else          bearFlow += Math.abs(flow);
  });

  const total = bullFlow + bearFlow;
  const ratio = total > 0 ? parseFloat((bullFlow / total * 100).toFixed(1)) : 50;

  return {
    bullFlow:  Math.round(bullFlow),
    bearFlow:  Math.round(bearFlow),
    ratio:     ratio,
    bias:      ratio > 60 ? 'strong_buying' : ratio > 50 ? 'mild_buying' : ratio < 40 ? 'strong_selling' : 'mild_selling',
    label:     ratio > 60 ? 'Smart money flow bullish kuat' : ratio > 50 ? 'Smart money flow cenderung beli' : ratio < 40 ? 'Smart money flow bearish kuat' : 'Smart money flow cenderung jual'
  };
}

/**
 * Volume Price Trend (VPT)
 * Lebih sensitif dari OBV — mempertimbangkan besaran perubahan harga
 */
function volumePriceTrend(candles) {
  if (!candles || candles.length < 5) return null;

  let vpt = 0;
  const vptSeries = [0];
  for (let i = 1; i < candles.length; i++) {
    const pctChange = candles[i-1].close ? (candles[i].close - candles[i-1].close) / candles[i-1].close : 0;
    vpt += pctChange * candles[i].volume;
    vptSeries.push(vpt);
  }

  const recent5 = vptSeries.slice(-5);
  const older5  = vptSeries.slice(-10, -5);
  const recentAvg = recent5.reduce(function(a,b){return a+b;},0) / 5;
  const olderAvg  = older5.length ? older5.reduce(function(a,b){return a+b;},0) / older5.length : recentAvg;

  return {
    value:     parseFloat(vpt.toFixed(0)),
    trend:     recentAvg > olderAvg ? 'rising' : 'falling',
    momentum:  parseFloat(((recentAvg - olderAvg) / (Math.abs(olderAvg) || 1) * 100).toFixed(1))
  };
}

/**
 * Main: Analisis volume lengkap
 * @param {Object[]} candles
 * @returns {Object} semua sinyal volume
 */
// Bug fix: sebelumnya fungsi ini SELALU menghitung smartMoneyFlow versinya sendiri
// (periode 14, formula closePos-additive berbeda) meski lib/indicators.js sudah
// punya versi kanonik (periode 20, formula lain) yang dipakai scoring.js, bandar.js,
// context.js, dan response API. Akibatnya ada DUA sinyal "smart money flow" berbeda
// yang bisa saling bertentangan arah, dan volumeData.score diam-diam dipengaruhi versi
// yang TIDAK dipakai di tempat lain. Sekarang analyzeVolume menerima `indicators` yang
// sudah dihitung lebih dulu (semua caller sudah menghitung indicators sebelum volumeData)
// dan REUSE indicators.smartMoney sebagai satu-satunya sumber kebenaran. Fallback ke
// perhitungan lokal hanya dipakai jika `indicators` tidak diberikan (mis. pemanggilan
// langsung/tes lama) agar tetap backward-compatible.
function analyzeVolume(candles, indicators) {
  if (!candles || candles.length < 5) {
    return { error: 'Data tidak cukup' };
  }

  const spike      = detectVolumeSpike(candles);
  const accDist    = detectAccDist(candles);
  const unusual    = detectUnusualActivity(candles);
  const climax     = detectClimaxVolume(candles);
  const confirmation = volumeTrendConfirmation(candles);
  const obvData    = obv(candles);
  const vwapPrice  = vwap(candles);
  const smf = (indicators && indicators.smartMoney) || smartMoneyFlow(candles, 14);
  const vpt = volumePriceTrend(candles);

  const last = candles[candles.length - 1];
  const avg  = avgVolume(candles, 20);

  // Narasi — prioritaskan sinyal terkuat, hindari redundansi dengan accDist
  let narrative = '';
  if (accDist?.bias === 'accumulation' && spike?.isSpike) {
    narrative = 'Volume breakout dengan pola akumulasi — sinyal kuat potensi naik.';
  } else if (accDist?.bias === 'distribution' && spike?.isSpike) {
    narrative = 'Volume tinggi dengan pola distribusi — waspadai tekanan jual.';
  } else if (accDist?.bias === 'drying_up') {
    narrative = 'Volume mengering — pasar konsolidasi, tunggu konfirmasi arah.';
  } else if (climax?.isClimax) {
    narrative = `${climax.type === 'selling_climax' ? 'Selling climax' : 'Buying climax'} terdeteksi — potensi reversal.`;
  } else if (smf && smf.ratio > 65) {
    narrative = `Smart money flow bullish kuat (${smf.ratio}%) — ${confirmation?.signal?.replace(/_/g, ' ') || 'konfirmasi volume positif'}.`;
  } else if (smf && smf.ratio < 35) {
    narrative = `Smart money flow bearish kuat (${smf.ratio}%) — tekanan jual dari pelaku besar.`;
  } else {
    narrative = `Volume ${spike?.intensity || 'normal'} — ${confirmation?.signal?.replace(/_/g, ' ') || 'tidak ada sinyal kuat'}.`;
  }

  return {
    current:        last.volume,
    avg20:          avg,
    vwap:           vwapPrice,
    spike,
    accDist,
    unusual,
    climax,
    confirmation,
    obv:            obvData,
    smartMoneyFlow: smf,   // key ini dipakai oleh api/analyze.js response builder
    vpt,
    narrative,
    score: computeVolumeScore(spike, accDist, confirmation, climax, smf)
  };
}

/**
 * Score volume 0–10
 * v4: tambah SMF sebagai konfirmasi (sebelumnya tidak diperhitungkan)
 */
function computeVolumeScore(spike, accDist, confirmation, climax, smf) {
  let score = 5; // baseline netral

  // Spike + bias
  if (spike?.isSpike && accDist?.bias === 'accumulation') score += 2;
  if (spike?.isSpike && accDist?.bias === 'distribution') score -= 2;
  if (spike?.intensity === 'extreme')                      score += 1;

  // Konfirmasi tren
  if (confirmation?.confirmed && confirmation?.priceTrend === 'up')   score += 1;
  if (confirmation?.confirmed && confirmation?.priceTrend === 'down') score -= 1;

  // Climax (reversal signal — negatif untuk tren saat ini)
  if (climax?.isClimax && climax?.isReversal) score -= 1;

  // ADL Chaikin
  if (accDist?.score > 3)  score += 1;
  if (accDist?.score < -3) score -= 1;

  // SMF — konfirmasi tambahan (v4)
  if (smf?.bias === 'strong_buying')  score += 1;
  if (smf?.bias === 'strong_selling') score -= 1;

  return Math.max(0, Math.min(10, score));
}

module.exports = { analyzeVolume, smartMoneyFlow, volumePriceTrend };
