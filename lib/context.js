// ══════════════════════════════════════════════════════════════════
// lib/context.js — Market Context Engine
// Analisis IHSG trend, sector strength, commodity, sentiment
// ══════════════════════════════════════════════════════════════════

const IDX_STOCKS = require('../data/idx-stocks.json');

// Mapping sektor ke kelompok saham representatif
const SECTOR_TICKERS = {
  'Perbankan':       ['BBCA', 'BBRI', 'BMRI', 'BBNI', 'BRIS'],
  'Energi':          ['ADRO', 'PTBA', 'ITMG', 'BREN', 'PGAS'],
  'Barang Baku':     ['TPIA', 'INCO', 'ANTM', 'MDKA', 'BRPT'],
  'Konsumer':        ['UNVR', 'ICBP', 'MYOR', 'SIDO', 'AMRT'],
  'Teknologi':       ['GOTO', 'BUKA', 'EMTK', 'MLPT'],
  'Properti':        ['BSDE', 'CTRA', 'SMRA', 'PWON'],
  'Infrastruktur':   ['JSMR', 'TLKM', 'WIKA', 'WSKT'],
  'Telekomunikasi':  ['TLKM', 'EXCL', 'ISAT'],
  'Kesehatan':       ['KLBF', 'SIDO', 'MIKA', 'HEAL'],
};

// Commodity linkage — sektor mana yang terpengaruh commodity apa
const COMMODITY_LINKAGE = {
  'batubara': ['Energi'],
  'cpo':      ['Konsumer', 'Barang Baku'],
  'nikel':    ['Barang Baku'],
  'emas':     ['Barang Baku'],
  'minyak':   ['Energi'],
  'gas':      ['Energi'],
};

/**
 * Deteksi sektor dari ticker
 */
function getSektorFromTicker(ticker) {
  const data = IDX_STOCKS[ticker];
  return data ? data.sector : null;
}

/**
 * Hitung kekuatan relatif sektor dari data candles
 * @param {string} sektor
 * @param {Object[]} candles - candles saham yang dianalisis
 * @returns {Object}
 */
function analyzeSectorStrength(sektor, candles) {
  if (!sektor || !candles || candles.length < 5) {
    return { sektor: sektor || 'Unknown', strength: 'unknown', note: 'Data tidak cukup' };
  }

  // Hitung return 20 hari terakhir saham ini sebagai proxy sektor
  const recent = candles.slice(-20);
  if (recent.length < 5) return { sektor: sektor, strength: 'unknown' };

  const firstClose = recent[0].close;
  const lastClose  = recent[recent.length - 1].close;
  const returnPct  = firstClose ? ((lastClose - firstClose) / firstClose * 100) : 0;

  let strength;
  if      (returnPct > 10)  strength = 'very_strong';
  else if (returnPct > 5)   strength = 'strong';
  else if (returnPct > 0)   strength = 'neutral_positive';
  else if (returnPct > -5)  strength = 'neutral_negative';
  else if (returnPct > -10) strength = 'weak';
  else                      strength = 'very_weak';

  return {
    sektor:    sektor,
    strength:  strength,
    return20d: parseFloat(returnPct.toFixed(2)),
    label:     getStrengthLabel(strength)
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
      beneficiary: ['Energi', 'Barang Baku', 'Teknologi', 'Properti'],
      laggard:     ['Konsumer', 'Kesehatan', 'Telekomunikasi']
    },
    'mild_risk_on': {
      beneficiary: ['Perbankan', 'Energi', 'Infrastruktur'],
      laggard:     ['Teknologi', 'Properti']
    },
    'neutral': {
      beneficiary: ['Perbankan', 'Konsumer', 'Telekomunikasi'],
      laggard:     []
    },
    'mild_risk_off': {
      beneficiary: ['Konsumer', 'Kesehatan', 'Telekomunikasi'],
      laggard:     ['Energi', 'Properti', 'Teknologi']
    },
    'risk_off': {
      beneficiary: ['Konsumer', 'Kesehatan'],
      laggard:     ['Energi', 'Barang Baku', 'Teknologi', 'Properti', 'Infrastruktur']
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
  const sectorStrength = analyzeSectorStrength(sektor, candles);
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
