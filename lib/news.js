// ══════════════════════════════════════════════════════════════════
// lib/news.js — News Intelligence Engine
// Fetch berita emiten, komoditas, dan makro IHSG
// Sumber: Google News RSS (gratis, no API key, multi-source)
// Agregasi: CNBC Indonesia, Detik Finance, Kontan, Bisnis.com
// CATATAN: Google News RSS tidak punya SLA resmi — error di-handle gracefully dengan return []
// ══════════════════════════════════════════════════════════════════

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const { cacheGet, cacheSet } = require('./cache');

const NEWS_TTL    = require('./cache').TTL.news; // 15 menit — TTL terpisah
const FETCH_TIMEOUT = 6000;          // 6 detik — lebih toleran untuk koneksi lambat
const MAX_ITEMS     = 5;             // max berita per kategori

// ── Mapping komoditas berdasarkan sektor/subsector ────────────────
const COMMODITY_MAP = [
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
    const timer = setTimeout(function() { resolve(null); }, timeoutMs);
    fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/rss+xml, application/xml, text/xml'
      }
    }).then(function(res) {
      clearTimeout(timer);
      resolve(res);
    }).catch(function(e) {
      clearTimeout(timer);
      console.warn('[NEWS] Fetch error:', e && e.message);
      resolve(null);
    });
  });
}

// ── Parse RSS XML sederhana ───────────────────────────────────────
function parseRSS(xml) {
  if (!xml || typeof xml !== 'string') return [];
  // Handle jika Google return error page (bukan XML)
  if (!xml.includes('<item>') && !xml.includes('<item ')) return [];

  const items = [];
  // Support <item> dan <item attr="...">
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null && items.length < MAX_ITEMS) {
    const block = match[1];

    let title   = extractTag(block, 'title');
    let desc    = extractTag(block, 'description');
    const pubDate = extractTag(block, 'pubDate');
    const source  = extractTag(block, 'source') || extractTag(block, 'dc:creator') || '';
    const link    = extractTag(block, 'link') || extractTag(block, 'guid') || '';

    if (!title) continue;

    title = cleanText(title);
    desc  = cleanText(desc);
    if (!title || title.length < 5) continue; // skip jika title terlalu pendek setelah clean

    const dateStr = pubDate ? formatDate(pubDate) : 'Baru saja';

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
  const re = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i');
  const m  = str.match(re);
  return m ? m[1].trim() : '';
}

function cleanText(str) {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<a\s[^>]*>[\s\S]*?<\/a>/gi, '') // strip link tags + isinya
    .replace(/<[^>]+>/g, '')                   // strip semua HTML tag
    .replace(/https?:\/\/[^\s]+/g, '')         // strip URL bare
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, ' ')                   // hapus spasi berlebih
    .trim();
}

function formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffH  = Math.floor(diffMs / (1000 * 60 * 60));
    const diffM  = Math.floor(diffMs / (1000 * 60));
    if (diffM < 60)  return diffM + ' menit lalu';
    if (diffH < 24)  return diffH + ' jam lalu';
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  } catch (e) {
    return dateStr; // fallback ke string asli jika parse gagal
  }
}

// ── Sumber berita dengan fallback ────────────────────────────────
// Urutan: Google News → Detik Finance RSS → Kontan RSS
// Jika sumber utama gagal/kosong, otomatis coba sumber berikutnya
const NEWS_SOURCES = {
  google: function(query) {
    return 'https://news.google.com/rss/search?q=' + encodeURIComponent(query) + '&hl=id&gl=ID&ceid=ID:id';
  },
  detik: function(query) {
    return 'https://finance.detik.com/rss/indeks/' + encodeURIComponent(query);
  },
  kontan: function(query) {
    // Kontan punya RSS publik per kategori
    return 'https://www.kontan.co.id/rss/investasi';
  }
};

// ── Fetch satu RSS feed dengan fallback ──────────────────────────
async function fetchWithFallback(query, isGeneral) {
  const cacheKey = 'news:' + query;
  const cached   = cacheGet(cacheKey);
  if (cached) return cached;

  // Coba Google News dulu
  const googleUrl = NEWS_SOURCES.google(query);
  let items = await _fetchAndParse(googleUrl);
  if (items.length) {
    cacheSet(cacheKey, items, NEWS_TTL);
    return items;
  }

  // Fallback: untuk berita makro/umum, coba Kontan RSS
  if (isGeneral) {
    console.warn('[NEWS] Google RSS gagal untuk "' + query + '", coba fallback Kontan...');
    const kontanUrl = NEWS_SOURCES.kontan(query);
    items = await _fetchAndParse(kontanUrl);
    if (items.length) {
      cacheSet(cacheKey, items, NEWS_TTL);
      return items;
    }
  }

  console.warn('[NEWS] Semua sumber gagal untuk query: ' + query);
  return [];
}

async function _fetchAndParse(url) {
  try {
    const res = await fetchWithTimeout(url, FETCH_TIMEOUT);
    if (!res || !res.ok) return [];
    const xml   = await res.text();
    return parseRSS(xml);
  } catch (e) {
    console.warn('[NEWS] _fetchAndParse error:', e.message);
    return [];
  }
}

// ── Deteksi komoditas yang relevan ────────────────────────────────
function getRelevantCommodities(ticker, metadata) {
  const relevant = [];
  const sector    = (metadata && metadata.sector)    || '';
  const subsector = (metadata && metadata.subsector) || '';

  COMMODITY_MAP.forEach(function(comm) {
    let match = false;

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

// ── Kata generik yang tidak membantu query berita ─────────────────
const GENERIC_WORDS = new Set([
  'pt', 'tbk', 'indonesia', 'indonesian', 'persero', 'group',
  'holding', 'internasional', 'international', 'nusantara',
  'nasional', 'national', 'indo', 'asia', 'global'
]);

// ── Build query berita emiten ─────────────────────────────────────
function buildStockQuery(ticker, metadata) {
  const name = metadata && metadata.name ? metadata.name : '';

  // Ambil kata signifikan — filter angka, kata generik, kata <= 2 huruf
  const words = name.split(/\s+/).filter(function(w) {
    const lower = w.toLowerCase().replace(/[^a-z]/g, '');
    return lower.length > 2 && !GENERIC_WORDS.has(lower);
  });

  // Ambil max 2 kata paling signifikan (hindari query terlalu panjang)
  const shortName = words.slice(0, 2).join(' ');
  const queryName = shortName || name.split(' ').slice(0, 2).join(' '); // fallback

  return ticker + ' saham ' + queryName + ' BEI';
}

// ── Main: Fetch semua berita relevan ─────────────────────────────
async function fetchAllNews(ticker, metadata, isIndex) {
  // Untuk IHSG/LQ45 — berita makro saja
  if (isIndex) {
    const ihsgNews = await fetchWithFallback('IHSG saham Indonesia BEI hari ini', true);
    const biRate   = await fetchWithFallback('BI Rate Bank Indonesia rupiah', true);
    return {
      emiten:    [],
      komoditas: [],
      makro:     ihsgNews.concat(biRate).slice(0, MAX_ITEMS),
      summary:   buildNewsSummary([], [], ihsgNews.concat(biRate).slice(0, MAX_ITEMS))
    };
  }

  const stockQuery  = buildStockQuery(ticker, metadata);
  const makroQuery  = 'IHSG market saham Indonesia hari ini sentimen';
  const commodities = getRelevantCommodities(ticker, metadata);

  const fetchPromises = [
    fetchWithFallback(stockQuery, false),
    fetchWithFallback(makroQuery, true)
  ];

  const commSlice = commodities.slice(0, 2);
  commSlice.forEach(function(comm) {
    fetchPromises.push(fetchWithFallback(comm.keywords[0] + ' harga hari ini', true));
  });

  const results = await Promise.all(fetchPromises);

  const emitenNews = results[0] || [];
  const makroNews  = results[1] || [];
  const commNews   = [];

  commSlice.forEach(function(comm, i) {
    const items = results[2 + i] || [];
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
  const lines = [];

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
