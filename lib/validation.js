// ══════════════════════════════════════════════════════════════════
// lib/validation.js — CommonJS
// ══════════════════════════════════════════════════════════════════

const IDX_STOCKS = require('../data/idx-stocks.json');

const VALID_TICKER_PATTERN = /^[A-Z]{1,4}[0-9A-Z]{0,2}$/;
const INDEX_TICKERS = new Set(['IHSG', 'LQ45']);

function validateTicker(raw) {
  if (!raw || typeof raw !== 'string')
    return { valid: false, error: 'Kode saham tidak boleh kosong.' };

  const clean = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!clean) return { valid: false, error: 'Kode saham tidak valid.' };
  if (clean.length > 6) return { valid: false, error: `Kode saham terlalu panjang: "${clean}".` };
  if (!VALID_TICKER_PATTERN.test(clean) && !INDEX_TICKERS.has(clean))
    return { valid: false, error: `Format tidak valid: "${clean}".` };

  const isIndex  = INDEX_TICKERS.has(clean);
  const metadata = IDX_STOCKS[clean] || null;
  return { valid: true, ticker: clean, isIndex, metadata, inDatabase: !!metadata };
}

function validateAIOutput(raw) {
  if (!raw || typeof raw !== 'string') return { valid: false, error: 'Output AI kosong' };

  let cleaned = raw.replace(/^```(?:json)?\s*/im, '').replace(/\s*```$/im, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) cleaned = jsonMatch[0];

  let parsed;
  try { parsed = JSON.parse(cleaned); }
  catch {
    try { parsed = JSON.parse(cleaned.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')); }
    catch { return { valid: false, error: 'JSON tidak valid dari AI', raw: cleaned.slice(0, 200) }; }
  }

  const missing = ['summary', 'sentiment', 'rekomendasi', 'scoreTeknikal'].filter(f => !parsed[f]);
  if (missing.length) return { valid: false, error: `Field tidak ada: ${missing.join(', ')}`, parsed };

  const map = { beli:'BELI', tahan:'TAHAN', jual:'JUAL', bullish:'BELI', bearish:'JUAL', netral:'TAHAN', akumulasi:'BELI', kurangi:'JUAL' };
  parsed.sentiment = map[(parsed.sentiment||'').toLowerCase()] || (parsed.sentiment||'TAHAN').toUpperCase();

  for (const f of ['keunggulan','risiko','katalis','bullThesis','bearThesis']) {
    if (!Array.isArray(parsed[f])) parsed[f] = parsed[f] ? [String(parsed[f])] : [];
  }
  // Backward compat: merge field lama ke bandarSmartMoney
  if (!parsed.bandarSmartMoney && (parsed.smartMoneySignal || parsed.bandaAnalysis)) {
    parsed.bandarSmartMoney = [parsed.smartMoneySignal, parsed.bandaAnalysis].filter(Boolean).join(' | ');
    delete parsed.smartMoneySignal;
    delete parsed.bandaAnalysis;
  }
  return { valid: true, parsed };
}

module.exports = { validateTicker, validateAIOutput };
