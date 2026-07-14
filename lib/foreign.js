// ══════════════════════════════════════════════════════════════════
// lib/foreign.js — Net Foreign Flow Engine
// Sumber: IDX public endpoint (no API key required)
// Data: foreignBuy, foreignSell, foreignNet per saham per hari
// TTL cache: 15 menit (data IDX update per hari bursa)
// ══════════════════════════════════════════════════════════════════

const { cacheGet, cacheSet } = require('./cache');

const USER_AGENT    = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const FETCH_TIMEOUT = 8000;
const FOREIGN_TTL   = 15 * 60 * 1000; // 15 menit

// ── IDX endpoints — dicoba berurutan sebagai fallback ─────────────
// Endpoint 1: TradingSummary (paling lengkap, include net foreign per saham)
// Endpoint 2: StockData (lebih sederhana, fallback)
const IDX_ENDPOINTS = {
  tradingSummary: function(ticker, date) {
    const dateStr = date || getTodayStr();
    return 'https://www.idx.co.id/primary/TradingSummary/GetStockSummary' +
           '?start=0&length=1&code=' + ticker + '&tradingDate=' + dateStr;
  },
  stockData: function(ticker) {
    return 'https://www.idx.co.id/umum/GetStockData?kodeEmiten=' + ticker;
  }
};

function getTodayStr() {
  // Format: YYYY/MM/DD (format IDX)
  const d = new Date();
  // Jika weekend, ambil Jumat terakhir
  const day = d.getDay();
  if (day === 0) d.setDate(d.getDate() - 2); // Minggu → Jumat
  if (day === 6) d.setDate(d.getDate() - 1); // Sabtu → Jumat
  return d.getFullYear() + '/' +
    String(d.getMonth() + 1).padStart(2, '0') + '/' +
    String(d.getDate()).padStart(2, '0');
}

function fetchWithTimeout(url, timeoutMs) {
  timeoutMs = timeoutMs || FETCH_TIMEOUT;
  return new Promise(function(resolve) {
    const timer = setTimeout(function() { resolve(null); }, timeoutMs);
    fetch(url, {
      headers: {
        'User-Agent':  USER_AGENT,
        'Accept':      'application/json',
        'Referer':     'https://www.idx.co.id/',
        'Origin':      'https://www.idx.co.id'
      }
    }).then(function(res) {
      clearTimeout(timer);
      resolve(res);
    }).catch(function() {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

// ── Parse response dari TradingSummary endpoint ───────────────────
function parseTradingSummary(json, ticker) {
  if (!json) return null;

  // Response format: { data: [{ IDStocks, ForeignBuy, ForeignSell, ... }] }
  const data = json.data || json.Data || json.result || json.Result || [];
  if (!Array.isArray(data) || !data.length) return null;

  // Cari ticker yang diminta
  const row = data.find(function(d) {
    return (d.IDStocks || d.StockCode || d.Code || '').toUpperCase() === ticker.toUpperCase();
  }) || data[0];

  if (!row) return null;

  const foreignBuy  = parseNum(row.ForeignBuy  || row.foreignBuy  || row.foreign_buy  || 0);
  const foreignSell = parseNum(row.ForeignSell || row.foreignSell || row.foreign_sell || 0);
  const foreignNet  = parseNum(row.ForeignNet  || row.foreignNet  || row.foreign_net  || (foreignBuy - foreignSell));
  const totalBuy    = parseNum(row.TotalBuy    || row.totalBuy    || foreignBuy);
  const totalSell   = parseNum(row.TotalSell   || row.totalSell   || foreignSell);

  return buildForeignResult(foreignBuy, foreignSell, foreignNet, totalBuy, totalSell, ticker, 'idx_trading_summary');
}

// ── Parse response dari StockData endpoint ────────────────────────
function parseStockData(json, ticker) {
  if (!json) return null;

  // Format bervariasi tergantung versi API IDX
  const data = json.stock || json.Stock || json.data || json.Data || json;
  if (!data) return null;

  const foreignBuy  = parseNum(data.ForeignBuy  || data.foreignBuy  || 0);
  const foreignSell = parseNum(data.ForeignSell || data.foreignSell || 0);
  const foreignNet  = parseNum(data.ForeignNet  || data.foreignNet  || (foreignBuy - foreignSell));

  if (!foreignBuy && !foreignSell) return null;

  return buildForeignResult(foreignBuy, foreignSell, foreignNet, 0, 0, ticker, 'idx_stock_data');
}

function parseNum(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v.replace(/,/g, '')) || 0;
  return 0;
}

// ── Build hasil foreign flow ──────────────────────────────────────
function buildForeignResult(foreignBuy, foreignSell, foreignNet, totalBuy, totalSell, ticker, source) {
  if (!foreignBuy && !foreignSell && !foreignNet) return null;

  // Hitung ownership pct jika data total tersedia
  const totalVolume = totalBuy + totalSell;
  const foreignPct  = totalVolume > 0
    ? parseFloat(((foreignBuy + foreignSell) / totalVolume * 100).toFixed(1))
    : null;

  // Klasifikasi signal berdasarkan net foreign
  // Threshold: > 0 = net buy, < 0 = net sell
  const isNetBuy     = foreignNet > 0;
  const isNetSell    = foreignNet < 0;
  const absNet       = Math.abs(foreignNet);
  const netBuyRatio  = (foreignBuy + foreignSell) > 0
    ? parseFloat((foreignNet / (foreignBuy + foreignSell) * 100).toFixed(1))
    : 0;

  let signal, strength, label;

  if (isNetBuy) {
    if (netBuyRatio > 30)      { signal = 'strong_buy';  strength = 'high';   label = 'Asing beli kuat'; }
    else if (netBuyRatio > 10) { signal = 'mild_buy';    strength = 'medium'; label = 'Asing net buy'; }
    else                       { signal = 'weak_buy';    strength = 'low';    label = 'Asing sedikit beli'; }
  } else if (isNetSell) {
    if (netBuyRatio < -30)     { signal = 'strong_sell'; strength = 'high';   label = 'Asing jual kuat'; }
    else if (netBuyRatio < -10){ signal = 'mild_sell';   strength = 'medium'; label = 'Asing net sell'; }
    else                       { signal = 'weak_sell';   strength = 'low';    label = 'Asing sedikit jual'; }
  } else {
    signal = 'neutral'; strength = 'low'; label = 'Asing netral';
  }

  return {
    ticker,
    foreignBuy:   Math.round(foreignBuy),
    foreignSell:  Math.round(foreignSell),
    foreignNet:   Math.round(foreignNet),
    foreignPct,
    netBuyRatio,
    isNetBuy,
    isNetSell,
    signal,
    strength,
    label,
    narrative: buildNarrative(foreignNet, netBuyRatio, label, ticker),
    source,
    fetchedAt: new Date().toISOString()
  };
}

function buildNarrative(foreignNet, netBuyRatio, label, ticker) {
  const absNet    = Math.abs(foreignNet);
  const netStr    = absNet >= 1e9  ? (absNet / 1e9).toFixed(2)  + ' M lot'
                  : absNet >= 1e6  ? (absNet / 1e6).toFixed(1)  + ' ribu lot'
                  : absNet >= 1e3  ? (absNet / 1e3).toFixed(0)  + ' lot'
                  : absNet.toFixed(0) + ' lot';

  const direction = foreignNet > 0 ? 'membeli' : 'menjual';
  return label + ' — asing ' + direction + ' net ' + netStr +
         ' (' + Math.abs(netBuyRatio) + '% dari total transaksi)';
}

// ── Main: fetch net foreign untuk satu ticker ─────────────────────
async function fetchForeignFlow(ticker) {
  if (!ticker) return null;

  const cacheKey = 'foreign:' + ticker;
  const cached   = cacheGet(cacheKey);
  if (cached !== null && cached !== undefined) return cached;

  // Coba endpoint 1: TradingSummary
  try {
    const url1 = IDX_ENDPOINTS.tradingSummary(ticker);
    const res1  = await fetchWithTimeout(url1);
    if (res1 && res1.ok) {
      const json1 = await res1.json().catch(function() { return null; });
      const result = parseTradingSummary(json1, ticker);
      if (result) {
        cacheSet(cacheKey, result, FOREIGN_TTL);
        return result;
      }
    }
  } catch (e) {
    // Lanjut ke fallback
  }

  // Fallback: endpoint 2 StockData
  try {
    const url2 = IDX_ENDPOINTS.stockData(ticker);
    const res2  = await fetchWithTimeout(url2);
    if (res2 && res2.ok) {
      const json2 = await res2.json().catch(function() { return null; });
      const result = parseStockData(json2, ticker);
      if (result) {
        cacheSet(cacheKey, result, FOREIGN_TTL);
        return result;
      }
    }
  } catch (e) {
    // Semua gagal
  }

  // Return null — tidak crash, caller handle gracefully
  return null;
}

// ── Scoring helper — berapa poin yang ditambah/kurang ke scoring ──
function getForeignScoreAdjustment(foreignData) {
  if (!foreignData) return { adjustment: 0, reason: null };

  const signal = foreignData.signal;
  const str    = foreignData.strength;

  if (signal === 'strong_buy')  return { adjustment: +2, reason: 'Asing beli kuat (' + foreignData.netBuyRatio + '% net buy)' };
  if (signal === 'mild_buy')    return { adjustment: +1, reason: 'Asing net buy (' + foreignData.label + ')' };
  if (signal === 'weak_buy')    return { adjustment: 0,  reason: null };
  if (signal === 'weak_sell')   return { adjustment: 0,  reason: null };
  if (signal === 'mild_sell')   return { adjustment: -1, reason: 'Asing net sell (' + foreignData.label + ')' };
  if (signal === 'strong_sell') return { adjustment: -2, reason: 'Asing jual kuat (' + foreignData.netBuyRatio + '% net sell)' };
  return { adjustment: 0, reason: null };
}

module.exports = {
  fetchForeignFlow,
  getForeignScoreAdjustment
};
