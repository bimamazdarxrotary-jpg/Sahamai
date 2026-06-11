// ══════════════════════════════════════════════════════════════════
// lib/risk.js — Layer 7: Risk Management
// Entry zone, SL, TP1/2/3, R/R ratio, position sizing
// ══════════════════════════════════════════════════════════════════

/**
 * Hitung risk management lengkap
 * @param {number} current     - harga saat ini
 * @param {object} atrData     - { atr, atrPct } dari indicators
 * @param {object} levels      - { support, resistance } dari indicators
 * @param {object} fibonacci   - dari indicators
 * @param {string} signal      - 'BELI' | 'AKUMULASI' | 'TAHAN' | 'KURANGI' | 'JUAL'
 * @param {number} modalTotal  - modal total user (opsional, untuk sizing)
 * @param {number} riskPct     - % modal yang mau dirisiko per trade (default 2%)
 */
function calculateRisk(current, atrData, levels, fibonacci, signal, modalTotal, riskPct) {
  if (!current || !atrData) return null;

  riskPct    = riskPct    || 2;
  modalTotal = modalTotal || 10000000; // default 10jt untuk ilustrasi

  const atr         = atrData.atr || (current * 0.02);
  const isBullish   = signal === 'BELI' || signal === 'AKUMULASI';
  const isBearish   = signal === 'JUAL' || signal === 'KURANGI';

  // ── Entry Zone ────────────────────────────────────────────────
  // Entry ideal: harga saat ini ± 0.5 ATR, atau di support terdekat
  let entryLow, entryHigh;
  if (isBullish) {
    const nearSupport = levels?.support?.[0];
    entryLow  = nearSupport && nearSupport > current * 0.97
              ? Math.round(nearSupport)
              : Math.round(current - atr * 0.3);
    entryHigh = Math.round(current + atr * 0.3);
  } else if (isBearish) {
    const nearResist  = levels?.resistance?.[0];
    entryLow  = Math.round(current - atr * 0.3);
    entryHigh = nearResist && nearResist < current * 1.03
              ? Math.round(nearResist)
              : Math.round(current + atr * 0.3);
  } else {
    entryLow  = Math.round(current - atr * 0.5);
    entryHigh = Math.round(current + atr * 0.5);
  }

  // ── Stop Loss ─────────────────────────────────────────────────
  // SL = entry - 1.5 ATR (beli) | entry + 1.5 ATR (jual)
  // Juga cek support/resistance sebagai SL alami
  let stopLoss;
  if (isBullish) {
    const slByATR      = Math.round(entryLow - atr * 1.5);
    const supportFloor = levels?.support?.[1] || levels?.support?.[0];
    stopLoss = supportFloor && supportFloor < entryLow && supportFloor > slByATR * 0.97
             ? Math.round(supportFloor * 0.99)
             : slByATR;
  } else if (isBearish) {
    const slByATR      = Math.round(entryHigh + atr * 1.5);
    const resistCeil   = levels?.resistance?.[1] || levels?.resistance?.[0];
    stopLoss = resistCeil && resistCeil > entryHigh && resistCeil < slByATR * 1.03
             ? Math.round(resistCeil * 1.01)
             : slByATR;
  } else {
    stopLoss = Math.round(entryLow - atr * 1.5);
  }

  // ── Take Profit 1 / 2 / 3 ────────────────────────────────────
  // TP1 = 1:1 R/R (ATR 1.5x dari entry)
  // TP2 = resistance terdekat atau 3x ATR
  // TP3 = resistance kuat atau Fib extension 1.272/1.618
  const entryMid = Math.round((entryLow + entryHigh) / 2);
  const riskPoints = Math.abs(entryMid - stopLoss);

  let tp1, tp2, tp3;
  if (isBullish) {
    tp1 = Math.round(entryMid + riskPoints * 1.0);
    tp2 = levels?.resistance?.[0]
        ? Math.round(levels.resistance[0])
        : Math.round(entryMid + riskPoints * 2.0);
    tp3 = fibonacci?.levels?.e1272
        ? Math.round(fibonacci.levels.e1272)
        : levels?.resistance?.[1]
        ? Math.round(levels.resistance[1])
        : Math.round(entryMid + riskPoints * 3.0);
    // Pastikan tp1 < tp2 < tp3
    if (tp2 <= tp1) tp2 = Math.round(entryMid + riskPoints * 2.0);
    if (tp3 <= tp2) tp3 = Math.round(entryMid + riskPoints * 3.0);
  } else if (isBearish) {
    tp1 = Math.round(entryMid - riskPoints * 1.0);
    tp2 = levels?.support?.[0]
        ? Math.round(levels.support[0])
        : Math.round(entryMid - riskPoints * 2.0);
    tp3 = Math.round(entryMid - riskPoints * 3.0);
    if (tp2 >= tp1) tp2 = Math.round(entryMid - riskPoints * 2.0);
    if (tp3 >= tp2) tp3 = Math.round(entryMid - riskPoints * 3.0);
  } else {
    tp1 = Math.round(entryMid + riskPoints);
    tp2 = Math.round(entryMid + riskPoints * 2);
    tp3 = Math.round(entryMid + riskPoints * 3);
  }

  // ── R/R Ratio ─────────────────────────────────────────────────
  const rewardTP1 = Math.abs(tp1 - entryMid);
  const rewardTP2 = Math.abs(tp2 - entryMid);
  const risk      = riskPoints || 1;
  const rrTP1     = parseFloat((rewardTP1 / risk).toFixed(2));
  const rrTP2     = parseFloat((rewardTP2 / risk).toFixed(2));
  const rrLabel   = rrTP2 >= 3 ? 'Excellent (≥3:1)' : rrTP2 >= 2 ? 'Baik (≥2:1)' : rrTP2 >= 1.5 ? 'Cukup (≥1.5:1)' : 'Rendah (<1.5:1)';

  // ── Position Sizing ───────────────────────────────────────────
  // Risk per trade = modal × riskPct%
  // Lot size = (modal × riskPct%) / (entryMid - stopLoss)
  const riskAmount      = Math.round(modalTotal * riskPct / 100);
  const riskPerLembar   = Math.abs(entryMid - stopLoss);
  const lotSuggested    = riskPerLembar > 0
    ? Math.floor(riskAmount / riskPerLembar / 100) * 100   // bulatkan ke lot (100 lembar)
    : 0;
  const modalDipakai    = Math.round(lotSuggested * entryMid);
  const pctOfPortfolio  = parseFloat((modalDipakai / modalTotal * 100).toFixed(1));

  return {
    entryZone:   { low: entryLow, high: entryHigh, mid: entryMid },
    stopLoss,
    targets:     { tp1, tp2, tp3 },
    riskReward:  { rrTP1, rrTP2, label: rrLabel },
    riskPoints,
    positioning: {
      riskAmount,
      lotSuggested,
      modalDipakai,
      pctOfPortfolio,
      note: `Risiko ${riskPct}% modal. Lot ${lotSuggested.toLocaleString('id-ID')} lembar = Rp ${modalDipakai.toLocaleString('id-ID')} (${pctOfPortfolio}% portofolio).`
    },
    summary: [
      `Entry: ${entryLow.toLocaleString('id-ID')}–${entryHigh.toLocaleString('id-ID')}`,
      `SL: ${stopLoss.toLocaleString('id-ID')} (${(Math.abs(entryMid-stopLoss)/entryMid*100).toFixed(1)}%)`,
      `TP1: ${tp1.toLocaleString('id-ID')} | TP2: ${tp2.toLocaleString('id-ID')} | TP3: ${tp3.toLocaleString('id-ID')}`,
      `R/R TP2: ${rrTP2}:1 — ${rrLabel}`
    ].join(' | ')
  };
}

module.exports = { calculateRisk };
