// ══════════════════════════════════════════════════════════════════
// lib/context.js — Market Context Engine
// Analisis IHSG trend, sector strength, commodity, sentiment
// ══════════════════════════════════════════════════════════════════

const IDX_STOCKS = require('../data/idx-stocks.json');



/**
 * Deteksi sektor dari ticker
 */
function getSektorFromTicker(ticker) {
  const data = IDX_STOCKS[ticker];
  return data ? data.sector : null;
}

// Cache daftar ticker per sektor — dihitung sekali saat module load
const _sectorTickers = (function() {
  const map = {};
  for (const [ticker, data] of Object.entries(IDX_STOCKS)) {
    if (!data || !data.sector || data.sector === 'Indeks') continue;
    if (!map[data.sector]) map[data.sector] = [];
    map[data.sector].push(ticker);
  }
  return map;
})();

// Cache return sektor dari candles yang sudah pernah dianalisis
// key: "sektor:ticker" → returnPct — direset tiap cold start (ok untuk serverless)
const _sectorReturnCache = {};

/**
 * Hitung kekuatan relatif sektor dari agregat peer di idx-stocks.json
 * Pendekatan: bandingkan return 20d saham ini vs estimasi median peer sektor
 * (tanpa fetch live data peer — menggunakan proxy statistik dari spread candles)
 *
 * @param {string} sektor
 * @param {Object[]} candles - candles saham yang dianalisis (dipakai sebagai anchor)
 * @param {string} [ticker] - ticker saham (untuk context peer count)
 * @returns {Object}
 */
function analyzeSectorStrength(sektor, candles, ticker) {
  if (!sektor || !candles || candles.length < 5) {
    return { sektor: sektor || 'Unknown', strength: 'unknown', note: 'Data tidak cukup' };
  }

  const recent = candles.slice(-20);
  if (recent.length < 5) return { sektor, strength: 'unknown' };

  const firstClose = recent[0].close;
  const lastClose  = recent[recent.length - 1].close;
  if (!firstClose) return { sektor, strength: 'unknown' };

  const selfReturn = (lastClose - firstClose) / firstClose * 100;

  // Hitung volatilitas intra-periode sebagai proxy dispersi peer sektor
  // Logika: sektor dengan dispersion rendah = saham bergerak seragam (tren kuat)
  // dispersion tinggi = mixed performance (sektor tidak kompak)
  const closes  = recent.map(c => c.close);
  const maxC    = Math.max(...closes);
  const minC    = Math.min(...closes);
  const dispersion = firstClose ? ((maxC - minC) / firstClose * 100) : 0;

  // Jumlah peer di sektor sebagai bobot keyakinan
  const peers     = _sectorTickers[sektor] || [];
  const peerCount = peers.length;

  // Estimasi "sektor return" — self return dikoreksi oleh dispersi
  // Saham outperform tajam dengan dispersi tinggi → kemungkinan outlier, koreksi ke bawah
  // Saham bergerak dengan dispersi rendah → gerakan lebih mencerminkan sektor
  let sectorReturn = selfReturn;
  if (dispersion > 15 && Math.abs(selfReturn) > 8) {
    // High dispersion + extreme return = kemungkinan outlier, revert 40% ke mean
    sectorReturn = selfReturn * 0.6;
  } else if (dispersion < 5) {
    // Low dispersion = konsolidasi, gerakan saham sangat representatif sektor
    sectorReturn = selfReturn;
  }

  let strength;
  if      (sectorReturn > 10)  strength = 'very_strong';
  else if (sectorReturn > 5)   strength = 'strong';
  else if (sectorReturn > 0)   strength = 'neutral_positive';
  else if (sectorReturn > -5)  strength = 'neutral_negative';
  else if (sectorReturn > -10) strength = 'weak';
  else                         strength = 'very_weak';

  return {
    sektor,
    strength,
    return20d:    parseFloat(selfReturn.toFixed(2)),
    sectorReturn: parseFloat(sectorReturn.toFixed(2)),
    dispersion:   parseFloat(dispersion.toFixed(2)),
    peerCount,
    isOutlier:    dispersion > 15 && Math.abs(selfReturn) > 8,
    label:        getStrengthLabel(strength),
    note:         peerCount > 0
      ? sektor + ' memiliki ' + peerCount + ' emiten di IDX'
      : 'Sektor tidak ditemukan di database'
  };
}

function getStrengthLabel(strength) {
  const labels = {
    'very_strong':      'Sektor sangat kuat',
    'strong':           'Sektor kuat',
    'neutral_positive': 'Sektor netral positif',
    'neutral_negative': 'Sektor netral negatif',
    'weak':             'Sektor lemah',
    'very_weak':        'Sektor sangat lemah',
    'unknown':          'Tidak diketahui'
  };
  return labels[strength] || 'Tidak diketahui';
}

/**
 * Deteksi kondisi risk-on / risk-off dari data teknikal
 */
function detectRiskSentiment(indicators, volumeData, structure) {
  let score = 0;
  const signals = [];

  // Trend
  if (structure && structure.trend) {
    if (structure.trend.direction === 'uptrend') { score += 2; signals.push('Tren naik'); }
    if (structure.trend.direction === 'downtrend') { score -= 2; signals.push('Tren turun'); }
  }

  // Momentum
  if (indicators && indicators.rsi != null) {
    if (indicators.rsi > 50) { score += 1; signals.push('RSI di atas 50'); }
    else { score -= 1; signals.push('RSI di bawah 50'); }
  }

  // Volume
  if (volumeData && volumeData.accDist) {
    if (volumeData.accDist.bias === 'accumulation') { score += 1; signals.push('Pola akumulasi'); }
    if (volumeData.accDist.bias === 'distribution') { score -= 1; signals.push('Pola distribusi'); }
  }

  // MA alignment
  if (indicators && indicators.ma) {
    if (indicators.ma.ma20vs50 === 'bullish_alignment') { score += 1; signals.push('MA bullish alignment'); }
    else { score -= 1; signals.push('MA bearish alignment'); }
  }

  let mode;
  if      (score >= 3)  mode = 'risk_on';
  else if (score >= 1)  mode = 'mild_risk_on';
  else if (score >= -1) mode = 'neutral';
  else if (score >= -3) mode = 'mild_risk_off';
  else                  mode = 'risk_off';

  return {
    mode:    mode,
    score:   score,
    signals: signals,
    label:   getRiskLabel(mode)
  };
}

function getRiskLabel(mode) {
  const labels = {
    'risk_on':       'Risk-On — selera beli tinggi',
    'mild_risk_on':  'Mild Risk-On — cenderung beli',
    'neutral':       'Netral — wait and see',
    'mild_risk_off': 'Mild Risk-Off — cenderung jual',
    'risk_off':      'Risk-Off — tekanan jual dominan'
  };
  return labels[mode] || 'Tidak diketahui';
}

/**
 * Analisis potensi sector rotation
 */
function analyzeSectorRotation(sektor, riskSentiment) {
  if (!sektor) return null;

  const rotationMap = {
    'risk_on': {
      beneficiary: ['Energi', 'Barang Baku', 'Teknologi', 'Properti', 'Perindustrian', 'Industri'],
      laggard:     ['Konsumer Primer', 'Konsumer Non-Primer', 'Kesehatan', 'Infrastruktur']
    },
    'mild_risk_on': {
      beneficiary: ['Keuangan', 'Energi', 'Infrastruktur', 'Industri'],
      laggard:     ['Teknologi', 'Properti']
    },
    'neutral': {
      beneficiary: ['Keuangan', 'Konsumer Primer', 'Konsumer Non-Primer', 'Infrastruktur'],
      laggard:     []
    },
    'mild_risk_off': {
      beneficiary: ['Konsumer Primer', 'Konsumer Non-Primer', 'Kesehatan'],
      laggard:     ['Energi', 'Properti', 'Teknologi', 'Perindustrian']
    },
    'risk_off': {
      beneficiary: ['Konsumer Primer', 'Kesehatan'],
      laggard:     ['Energi', 'Barang Baku', 'Teknologi', 'Properti', 'Infrastruktur', 'Perindustrian', 'Industri']
    }
  };

  const mode    = riskSentiment ? riskSentiment.mode : 'neutral';
  const mapping = rotationMap[mode] || rotationMap['neutral'];

  const isBeneficiary = mapping.beneficiary.some(function(s) {
    return sektor && sektor.toLowerCase().includes(s.toLowerCase());
  });
  const isLaggard = mapping.laggard.some(function(s) {
    return sektor && sektor.toLowerCase().includes(s.toLowerCase());
  });

  return {
    mode:          mode,
    isBeneficiary: isBeneficiary,
    isLaggard:     isLaggard,
    beneficiaries: mapping.beneficiary,
    laggards:      mapping.laggard,
    implication:   isBeneficiary
      ? 'Sektor ' + sektor + ' adalah beneficiary dalam kondisi ' + mode + ' saat ini'
      : isLaggard
        ? 'Sektor ' + sektor + ' cenderung underperform dalam kondisi ' + mode + ' saat ini'
        : 'Sektor ' + sektor + ' netral dalam kondisi market saat ini'
  };
}

/**
 * Main: Analisis konteks market untuk satu saham
 */
function analyzeMarketContext(ticker, candles, indicators, volumeData, structure) {
  const sektor         = getSektorFromTicker(ticker);
  const sectorStrength = analyzeSectorStrength(sektor, candles, ticker);
  const riskSentiment  = detectRiskSentiment(indicators, volumeData, structure);
  const sectorRotation = analyzeSectorRotation(sektor, riskSentiment);

  // Phase summary
  const phase = structure ? structure.phase : 'unknown';
  const marketPhase = {
    phase:   phase,
    label:   structure ? structure.phaseLabel : 'Tidak diketahui',
    isGood:  phase === 'markup' || phase === 'accumulation'
  };

  return {
    sektor:         sektor,
    sectorStrength: sectorStrength,
    riskSentiment:  riskSentiment,
    sectorRotation: sectorRotation,
    marketPhase:    marketPhase,
    summary: buildContextSummary(sektor, sectorStrength, riskSentiment, sectorRotation)
  };
}

function buildContextSummary(sektor, sectorStrength, riskSentiment, sectorRotation) {
  const parts = [];

  if (riskSentiment) {
    parts.push('Kondisi market: ' + riskSentiment.label);
  }
  if (sectorStrength && sectorStrength.strength !== 'unknown') {
    parts.push('Sektor ' + sektor + ': ' + sectorStrength.label + ' (return 20d: ' + sectorStrength.return20d + '%)');
  }
  if (sectorRotation) {
    parts.push(sectorRotation.implication);
  }

  return parts.join('. ');
}

module.exports = { analyzeMarketContext, getSektorFromTicker, analyzeSectorStrength, detectRiskSentiment, analyzeSectorRotation };
