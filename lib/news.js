// ══════════════════════════════════════════════════════════════════
// lib/news.js — News Intelligence Engine
// Fetch berita emiten, komoditas, dan makro IHSG
// Sumber: Google News RSS (gratis, no API key, multi-source)
// Agregasi: CNBC Indonesia, Detik Finance, Kontan, Bisnis.com
// ══════════════════════════════════════════════════════════════════

var { cacheGet, cacheSet } = require('./cache');

var NEWS_TTL    = 15 * 60 * 1000; // 15 menit — berita berubah cepat
var FETCH_TIMEOUT = 4000;          // 4 detik timeout per fetch
var MAX_ITEMS     = 5;             // max berita per kategori

// ── Mapping komoditas berdasarkan sektor/subsector ────────────────
var COMMODITY_MAP = [
  {
    keywords: ['batubara', 'coal', 'pertambangan batubara'],
    sectors:  ['Energi'],
    subsectors: ['Pertambangan Batubara', 'Batubara'],
    tickers:  ['ADRO','PTBA','ITMG','HRUM','GEMS','BUMI','ARII','DEWA']
  },
  {
    keywords: ['nikel', 'nickel', 'LME nickel'],
    sectors:  [],
    subsectors: ['Nikel', 'Metal Mining', 'Logam'],
    tickers:  ['INCO','MDKA','ANTM','BRMS','NCKL']
  },
  {
    keywords: ['CPO', 'kelapa sawit', 'palm oil', 'minyak sawit'],
    sectors:  ['Konsumer Primer'],
    subsectors: ['Perkebunan Kelapa Sawit', 'Agrikultur'],
    tickers:  ['AALI','LSIP','TAPG','SSMS','PALM','DSNG']
  },
  {
    keywords: ['emas', 'gold', 'harga emas'],
    sectors:  [],
    subsectors: ['Pertambangan Emas', 'Emas'],
    tickers:  ['MDKA','ANTM','BRMS','PSAB']
  },
  {
    keywords: ['minyak', 'crude oil', 'brent', 'WTI', 'gas LNG'],
    sectors:  ['Energi'],
    subsectors: ['Minyak dan Gas', 'Oil & Gas'],
    tickers:  ['BREN','PGAS','MEDC','ENRG','RUIS']
  },
  {
    keywords: ['petrokimia', 'naphtha', 'kimia'],
    sectors:  ['Barang Baku'],
    subsectors: ['Kimia', 'Petrokimia'],
    tickers:  ['TPIA','BRPT','SRSN']
  },
  {
    keywords: ['tembaga', 'copper', 'LME copper'],
    sectors:  [],
    subsectors: ['Tembaga', 'Metal Mining'],
    tickers:  ['MDKA','ANTM','AMMN','SMRU']
  },
  {
    keywords: ['baja', 'steel', 'besi'],
    sectors:  ['Industri'],
    subsectors: ['Baja', 'Logam'],
    tickers:  ['KRAS','INAI','GDST','LION']
  }
];

// ── Fetch dengan timeout ──────────────────────────────────────────
function fetchWithTimeout(url, timeoutMs) {
  return new Promise(function(resolve) {
    var timer = setTimeout(function() { resolve(null); }, timeoutMs);
    fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml'
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

// ── Parse RSS XML sederhana ───────────────────────────────────────
function parseRSS(xml) {
  if (!xml) return [];
  var items = [];
  var itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  var match;

  while ((match = itemRegex.exec(xml)) !== null && items.length < MAX_ITEMS) {
    var block = match[1];

    var title   = extractTag(block, 'title');
    var desc    = extractTag(block, 'description');
    var pubDate = extractTag(block, 'pubDate');
    var source  = extractTag(block, 'source');
    var link    = extractTag(block, 'link');

    if (!title) continue;

    // Bersihkan CDATA dan HTML entities
    title = cleanText(title);
    desc  = cleanText(desc);

    // Format tanggal
    var dateStr = pubDate ? formatDate(pubDate) : 'Baru saja';

    items.push({
      title,
      description: desc ? desc.slice(0, 150) + (desc.length > 150 ? '...' : '') : '',
      date:        dateStr,
      source:      source ? cleanText(source) : 'Google News',
      link:        link || ''
    });
  }

  return items;
}

function extractTag(str, tag) {
  var re = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i');
  var m  = str.match(re);
  return m ? m[1].trim() : '';
}

function cleanText(str) {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function formatDate(dateStr) {
  try {
    var d = new Date(dateStr);
    var now = new Date();
    var diffMs = now - d;
    var diffH  = Math.floor(diffMs / (1000 * 60 * 60));
    var diffM  = Math.floor(diffMs / (1000 * 60));
    if (diffM < 60)  return diffM + ' menit lalu';
    if (diffH < 24)  return diffH + ' jam lalu';
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  } catch (e) {
    return dateStr;
  }
}

// ── Fetch satu RSS feed ───────────────────────────────────────────
async function fetchGoogleNews(query) {
  var cacheKey = 'news:' + query;
  var cached   = cacheGet(cacheKey);
  if (cached) return cached;

  var encoded = encodeURIComponent(query);
  var url = 'https://news.google.com/rss/search?q=' + encoded + '&hl=id&gl=ID&ceid=ID:id';

  try {
    var res = await fetchWithTimeout(url, FETCH_TIMEOUT);
    if (!res || !res.ok) return [];
    var xml   = await res.text();
    var items = parseRSS(xml);
    if (items.length) cacheSet(cacheKey, items, NEWS_TTL);
    return items;
  } catch (e) {
    console.error('[NEWS FETCH]', e.message);
    return [];
  }
}

// ── Deteksi komoditas yang relevan ────────────────────────────────
function getRelevantCommodities(ticker, metadata) {
  var relevant = [];
  var sector    = (metadata && metadata.sector)    || '';
  var subsector = (metadata && metadata.subsector) || '';

  COMMODITY_MAP.forEach(function(comm) {
    var match = false;

    // Cek by ticker
    if (comm.tickers.indexOf(ticker) !== -1) match = true;

    // Cek by sektor
    if (!match && comm.sectors.some(function(s) {
      return sector.toLowerCase().includes(s.toLowerCase());
    })) match = true;

    // Cek by subsector
    if (!match && comm.subsectors.some(function(s) {
      return subsector.toLowerCase().includes(s.toLowerCase());
    })) match = true;

    if (match) relevant.push(comm);
  });

  return relevant;
}

// ── Build query berita emiten ─────────────────────────────────────
function buildStockQuery(ticker, metadata) {
  var name = metadata && metadata.name ? metadata.name : '';
  // Ambil 3 kata pertama nama perusahaan yang signifikan
  var shortName = name.split(' ').slice(0, 3).join(' ');
  return ticker + ' saham ' + shortName + ' BEI IDX';
}

// ── Main: Fetch semua berita relevan ─────────────────────────────
async function fetchAllNews(ticker, metadata, isIndex) {
  // Untuk IHSG/LQ45 — berita makro saja
  if (isIndex) {
    var ihsgNews = await fetchGoogleNews('IHSG saham Indonesia BEI hari ini');
    var biRate   = await fetchGoogleNews('BI Rate Bank Indonesia rupiah');
    return {
      emiten:    [],
      komoditas: [],
      makro:     ihsgNews.concat(biRate).slice(0, MAX_ITEMS),
      summary:   buildNewsSummary([], [], ihsgNews.concat(biRate).slice(0, MAX_ITEMS))
    };
  }

  // Fetch paralel — emiten + makro sekaligus
  var stockQuery  = buildStockQuery(ticker, metadata);
  var makroQuery  = 'IHSG market saham Indonesia hari ini sentimen';
  var commodities = getRelevantCommodities(ticker, metadata);

  // Semua fetch jalan paralel
  var fetchPromises = [
    fetchGoogleNews(stockQuery),
    fetchGoogleNews(makroQuery)
  ];

  // Tambah fetch komoditas jika relevan (max 2 komoditas)
  var commSlice = commodities.slice(0, 2);
  commSlice.forEach(function(comm) {
    fetchPromises.push(fetchGoogleNews(comm.keywords[0] + ' harga hari ini'));
  });

  var results = await Promise.all(fetchPromises);

  var emitenNews = results[0] || [];
  var makroNews  = results[1] || [];
  var commNews   = [];

  commSlice.forEach(function(comm, i) {
    var items = results[2 + i] || [];
    if (items.length) {
      commNews.push({
        komoditas: comm.keywords[0],
        items:     items.slice(0, 3)
      });
    }
  });

  return {
    emiten:    emitenNews,
    komoditas: commNews,
    makro:     makroNews.slice(0, 3),
    summary:   buildNewsSummary(emitenNews, commNews, makroNews)
  };
}

// ── Build ringkasan untuk prompt AI ──────────────────────────────
function buildNewsSummary(emitenNews, commNews, makroNews) {
  var lines = [];

  if (emitenNews.length) {
    lines.push('=== BERITA EMITEN TERKINI ===');
    emitenNews.slice(0, 5).forEach(function(n) {
      lines.push('• [' + n.date + '] ' + n.title);
      if (n.description) lines.push('  ' + n.description);
    });
  }

  if (commNews.length) {
    lines.push('\n=== BERITA KOMODITAS TERKAIT ===');
    commNews.forEach(function(c) {
      lines.push('[ ' + c.komoditas.toUpperCase() + ' ]');
      c.items.forEach(function(n) {
        lines.push('• [' + n.date + '] ' + n.title);
      });
    });
  }

  if (makroNews.length) {
    lines.push('\n=== SENTIMEN MARKET IHSG ===');
    makroNews.slice(0, 3).forEach(function(n) {
      lines.push('• [' + n.date + '] ' + n.title);
    });
  }

  if (!lines.length) return 'Berita terkini tidak tersedia saat ini.';

  return lines.join('\n');
}

module.exports = { fetchAllNews, getRelevantCommodities, buildNewsSummary };
