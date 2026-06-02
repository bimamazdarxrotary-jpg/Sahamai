// ══════════════════════════════════════════════════════════════════
// lib/context.js — Market Context Engine
// Analisis IHSG trend, sector strength, commodity, sentiment
// ══════════════════════════════════════════════════════════════════

const IDX_STOCKS = require('../data/idx-stocks.json');

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
const { cacheGet } = require('./cache');



/**
 * Deteksi sektor dari ticker
 */
function getSektorFromTicker(ticker) {
  const data = IDX_STOCKS[ticker];
  return data ? data.sector : null;
}

// ── Indeks sektoral IDX resmi — dipakai sebagai benchmark sektor ──
const SECTOR_INDEX_MAP = {
  'Keuangan':            'IDXFINANCE.JK',
  'Konsumer Primer':     'IDXBASIC.JK',
  'Konsumer Non-Primer': 'IDXCYCLIC.JK',
  'Teknologi':           'IDXTECHNO.JK',
  'Energi':              'IDXENERGY.JK',
  'Industri':            'IDXINDUST.JK',
  'Infrastruktur':       'IDXINFRA.JK',
  'Properti':            'IDXPROPTY.JK',
  'Kesehatan':           'IDXHEALTH.JK',
  'Barang Baku':         'IDXNONCYC.JK',
  'Transportasi':        'IDXTRANS.JK',
  'Perindustrian':       'IDXINDUST.JK'
};

const SECTOR_CACHE_TTL  = 30 * 60 * 1000; // 30 menit
const SECTOR_FETCH_TIMEOUT = 4000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// Fetch return 20 hari indeks sektor dari Yahoo Finance
async function fetchSectorReturn(sectorIndex) {
  const cacheKey = 'sector_return:' + sectorIndex;
  const { cacheGet, cacheSet } = require('./cache');
  const cached = cacheGet(cacheKey);
  if (cached !== null && cached !== undefined) return cached;

  try {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + sectorIndex + '?interval=1d&range=1mo';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), SECTOR_FETCH_TIMEOUT);
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
      signal: ctrl.signal
    }).catch(() => null);
    clearTimeout(timer);

    if (!res || !res.ok) return null;

    const json    = await res.json().catch(() => null);
    const result  = json && json.chart && json.chart.result && json.chart.result[0];
    const closes  = result && result.indicators && result.indicators.quote &&
                    result.indicators.quote[0] && result.indicators.quote[0].close;
    if (!closes || closes.length < 5) return null;

    const validCloses = closes.filter(Boolean);
    const first = validCloses[0];
    const last  = validCloses[validCloses.length - 1];
    const returnPct = first ? parseFloat(((last - first) / first * 100).toFixed(2)) : null;

    if (returnPct !== null) cacheSet(cacheKey, returnPct, SECTOR_CACHE_TTL);
    return returnPct;
  } catch (e) {
    return null;
  }
}

/**
 * Hitung kekuatan sektor dari indeks sektoral IDX resmi (Yahoo Finance)
 * Fallback ke proxy dispersion jika fetch gagal
 */
async function analyzeSectorStrength(sektor, candles, ticker) {
  if (!sektor || !candles || candles.length < 5) {
    return { sektor: sektor || 'Unknown', strength: 'unknown', note: 'Data tidak cukup' };
  }

  const peers      = _sectorTickers[sektor] || [];
  const peerCount  = peers.length;
  const sectorIdx  = SECTOR_INDEX_MAP[sektor] || null;

  // Hitung return saham sendiri sebagai referensi
  const recent     = candles.slice(-20);
  const firstClose = recent[0] && recent[0].close;
  const lastClose  = recent[recent.length - 1] && recent[recent.length - 1].close;
  const selfReturn = firstClose ? parseFloat(((lastClose - firstClose) / firstClose * 100).toFixed(2)) : 0;

  // Coba fetch indeks sektor IDX (akurat, data real peer)
  let sectorReturn = null;
  let source       = 'proxy';

  if (sectorIdx) {
    const fetched = await fetchSectorReturn(sectorIdx);
    if (fetched !== null) {
      sectorReturn = fetched;
      source       = 'idx_index';
    }
  }

  // Fallback ke proxy dispersion jika fetch gagal
  if (sectorReturn === null) {
    const closes     = recent.map(c => c.close);
    const maxC       = Math.max(...closes);
    const minC       = Math.min(...closes);
    const dispersion = firstClose ? ((maxC - minC) / firstClose * 100) : 0;
    sectorReturn     = dispersion > 15 && Math.abs(selfReturn) > 8
      ? selfReturn * 0.6
      : selfReturn;
    source = 'proxy_dispersion';
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
    sectorReturn,
    selfReturn,
    source,
    sectorIndex: sectorIdx || null,
    peerCount,
    label: getStrengthLabel(strength),
    note:  source === 'idx_index'
      ? 'Berdasarkan indeks ' + sectorIdx + ' (IDX resmi)'
      : 'Estimasi dari pergerakan saham (indeks sektor tidak tersedia)'
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
async function analyzeMarketContext(ticker, candles, indicators, volumeData, structure) {
  const sektor         = getSektorFromTicker(ticker);
  const sectorStrength = await analyzeSectorStrength(sektor, candles, ticker);
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
    const ret = sectorStrength.sectorReturn !== undefined ? sectorStrength.sectorReturn : sectorStrength.return20d;
    parts.push('Sektor ' + sektor + ': ' + sectorStrength.label + ' (return 20d: ' + ret + '%)');
  }
  if (sectorRotation) {
    parts.push(sectorRotation.implication);
  }

  return parts.join('. ');
}

module.exports = { analyzeMarketContext, getSektorFromTicker, analyzeSectorStrength, detectRiskSentiment, analyzeSectorRotation };
