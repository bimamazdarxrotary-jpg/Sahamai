// ══════════════════════════════════════════════════════════════════
// lib/ai.js — AI Engine (Groq)
// AI hanya bertugas narasi & synthesize. Angka dari scoring deterministik.
// ══════════════════════════════════════════════════════════════════
const log = require('./logger');

const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL      = 'openai/gpt-oss-120b';
const MAX_TOKENS = 1800;

// ── Build konteks teknikal untuk prompt ───────────────────────────
function buildTechnicalContext(data) {
  const { ticker, priceData, indicators, scoring, riskData, fundamentalData, newsData, foreignData, contextData, bandarData } = data;
  const ind  = indicators || {};
  const sc   = scoring    || {};
  const cur  = priceData?.current || 0;
  const fmt  = n => n != null ? n.toLocaleString('id-ID') : 'N/A';

  const lines = [
    `=== ANALISIS ${ticker} ===`,
    `Harga: Rp ${fmt(cur)} | Perubahan: ${priceData?.changePct ?? 0}%`,
    `Data: ${priceData?.candleCount?.daily || 0} candle daily, ${priceData?.candleCount?.weekly || 0} weekly, ${priceData?.candleCount?.monthly || 0} monthly`,
    '',
    '--- LAYER 2: PRICE ACTION ---',
    `EMA20: ${fmt(ind.ma?.ema20)} | EMA50: ${fmt(ind.ma?.ema50)} | EMA200: ${fmt(ind.ma?.ema200)}`,
    `Trend: ${ind.trend?.label || 'N/A'} (score ${ind.trend?.score ?? 'N/A'}/10)`,
    ind.trend?.crossover ? `Crossover: ${ind.trend.crossover}` : '',
    `BB: upper=${fmt(ind.bb?.upper)} mid=${fmt(ind.bb?.middle)} lower=${fmt(ind.bb?.lower)} | BW=${ind.bb?.bandwidth}% | ${ind.bb?.position || ''} ${ind.bb?.isSqueeze ? '| SQUEEZE' : ''}`,
    `S/R: Support=${ind.levels?.support?.slice(0,2).map(fmt).join(', ')||'N/A'} | Resist=${ind.levels?.resistance?.slice(0,2).map(fmt).join(', ')||'N/A'}`,
    `52W: posisi ${ind.position52w?.positionPct ?? 'N/A'}% | High=${fmt(ind.position52w?.high52w)} Low=${fmt(ind.position52w?.low52w)} | ${ind.position52w?.label || ''}`,
    ind.fibonacci?.narrative ? `Fibonacci: ${ind.fibonacci.narrative}` : '',
    ind.candlestick?.topPattern ? `Candlestick: ${ind.candlestick.summary}` : '',
    `ADX: ${ind.adx?.adx ?? 'N/A'} — ${ind.adx?.strength || ''} ${ind.adx?.trend || ''}`,
    '',
    '--- LAYER 3: MOMENTUM ---',
    `RSI(14): ${ind.rsi ?? 'N/A'}`,
    ind.macd ? `MACD: line=${ind.macd.macd} signal=${ind.macd.signal} hist=${ind.macd.histogram} | slope=${ind.macd.slopeLabel} | trend=${ind.macd.trend} ${ind.macd.crossover ? `| ${ind.macd.crossover}` : ''}` : '',
    ind.volumeRatio ? `Volume ratio vs MA20: ${ind.volumeRatio.ratio}x (${ind.volumeRatio.label})` : '',
    ind.obv ? `OBV: ${ind.obv.trend} ${ind.obv.divergence ? `| ${ind.obv.divergence}` : ''}` : '',
    ind.divergence?.detected ? `Divergence: ${ind.divergence.summary}` : '',
    '',
    '--- MULTI TIMEFRAME ---',
    ind.weekly  ? `Weekly:  RSI=${ind.weekly.rsi ?? 'N/A'} | trend=${ind.weekly.trend} | EMA20=${fmt(ind.weekly.ema20)} EMA50=${fmt(ind.weekly.ema50)} ${ind.weekly.macd ? `| MACD=${ind.weekly.macd.trend}` : ''}` : 'Weekly: tidak tersedia',
    ind.monthly ? `Monthly: RSI=${ind.monthly.rsi ?? 'N/A'} | trend=${ind.monthly.trend} | EMA20=${fmt(ind.monthly.ema20)}` : 'Monthly: tidak tersedia',
    '',
    '--- LAYER 4: MARKET SENTIMENT ---',
    foreignData ? `Net Foreign: ${foreignData.label} | net=${fmt(foreignData.foreignNet)} | score adj=${foreignData.score ?? 0}` : 'Net Foreign: N/A',
    contextData ? `IHSG/Market: ${contextData.marketRisk || 'N/A'} | sektor ${contextData.sectorName || ''}: ${contextData.sectorReturn20d != null ? contextData.sectorReturn20d + '%' : 'N/A'} (20d) | bias=${contextData.sectorBias || 'N/A'}` : '',
    '',
    '--- LAYER 5: FUNDAMENTAL ---',
    fundamentalData && !fundamentalData.noData
      ? [
          `Revenue growth QoQ: ${fundamentalData.revenueGrowthQoQ != null ? fundamentalData.revenueGrowthQoQ + '%' : 'N/A'}`,
          `Revenue growth YoY: ${fundamentalData.revenueGrowthYoY != null ? fundamentalData.revenueGrowthYoY + '%' : 'N/A'}`,
          `DER: ${fundamentalData.debtToEquity != null ? fundamentalData.debtToEquity + 'x' : 'N/A'}`,
          `Cashflow Op: ${fundamentalData.cashflowOp || 'N/A'}`,
          `EPS trend: ${fundamentalData.epsTrend || 'N/A'}`,
          fundamentalData.notes ? `Catatan: ${fundamentalData.notes}` : ''
        ].filter(Boolean).join(' | ')
      : 'Fundamental: data tidak tersedia (saham tidak tercover atau baru listing)',
    '',
    '--- LAYER 6: NEWS & CATALYST ---',
    newsData?.emiten?.length
      ? newsData.emiten.slice(0,3).map(n => `[${n.sentiment?.toUpperCase() || 'NETRAL'}] ${n.title}`).join('\n')
      : 'Tidak ada berita emiten terkini',
    newsData?.ihsg?.length ? `IHSG: ${newsData.ihsg[0].title}` : '',
    '',
    '--- LAYER 7: RISK MANAGEMENT ---',
    riskData ? [
      `Entry zone: ${fmt(riskData.entryZone?.low)}–${fmt(riskData.entryZone?.high)}`,
      `Stop Loss: ${fmt(riskData.stopLoss)}`,
      `TP1: ${fmt(riskData.targets?.tp1)} | TP2: ${fmt(riskData.targets?.tp2)} | TP3: ${fmt(riskData.targets?.tp3)}`,
      `R/R: TP1=${riskData.riskReward?.rrTP1}:1 | TP2=${riskData.riskReward?.rrTP2}:1 | ${riskData.riskReward?.label}`
    ].join(' | ') : 'Risk: N/A',
    '',
    '--- SCORING (deterministik) ---',
    sc.summary || '',
    `L2 Price Action: ${sc.layers?.l2_priceAction?.score}/10 — ${sc.layers?.l2_priceAction?.label || ''}`,
    `L3 Momentum:     ${sc.layers?.l3_momentum?.score}/10 — ${sc.layers?.l3_momentum?.label || ''}`,
    `L4 Sentimen:     ${sc.layers?.l4_sentiment?.score}/10 — ${sc.layers?.l4_sentiment?.label || ''}`,
    `L5 Fundamental:  ${sc.layers?.l5_fundamental?.score}/10 — ${sc.layers?.l5_fundamental?.label || ''}`,
    `L6 Berita:       ${sc.layers?.l6_news?.score}/10 — ${sc.layers?.l6_news?.label || ''}`,
    `L7 Risk:         ${sc.layers?.l7_risk?.score}/10 — ${sc.layers?.l7_risk?.label || ''}`,
    `FINAL: ${sc.final}/10 → ${sc.recommendation}`,
    bandarData?.signal ? `\nSmart Money: ${bandarData.signal} — ${bandarData.description || ''}` : ''
  ];

  return lines.filter(l => l != null).join('\n').trim();
}

// ── Prompt template ───────────────────────────────────────────────
function buildPrompt(context, isIndex) {
  const schema = isIndex ? INDEX_SCHEMA : STOCK_SCHEMA;
  return `Kamu adalah analis saham IDX senior. Scoring deterministik sudah dihitung sistem — JANGAN ubah angka scoring atau rekomendasi.
Tugasmu: buat narasi analisis yang tajam, konkret, dan actionable berdasarkan data di bawah.

${context}

Respond ONLY valid JSON sesuai schema ini (tanpa markdown, tanpa komentar):
${JSON.stringify(schema, null, 2)}

ATURAN:
- field "recommendation" dan "score" HARUS sama persis dengan nilai di bagian SCORING di atas
- "analisis" minimal 3 paragraf: (1) kondisi teknikal multi-TF, (2) momentum & volume, (3) fundamental + katalis
- "bullCase" dan "bearCase" masing-masing 2–3 poin konkret berdasarkan data
- "targetHarga", "stopLoss", "entryZone" HARUS menggunakan nilai dari Layer 7 di atas
- "riskWarning" tuliskan kondisi spesifik yang membatalkan thesis
- Gunakan bahasa Indonesia profesional tapi mudah dipahami retail`;
}

const STOCK_SCHEMA = {
  recommendation: "BELI|AKUMULASI|TAHAN|KURANGI|JUAL",
  score: 0,
  konfidensLevel: "tinggi|sedang|rendah",
  analisis: "narasi 3 paragraf",
  bullCase: ["poin 1","poin 2","poin 3"],
  bearCase: ["poin 1","poin 2"],
  entryZone: { low: 0, high: 0 },
  targetHarga: { tp1: 0, tp2: 0, tp3: 0 },
  stopLoss: 0,
  riskRewardLabel: "string",
  positionSizing: "narasi singkat sizing dari data L7",
  riskWarning: "kondisi spesifik yang batalkan thesis",
  katalisis: "katalis utama yang bisa dorong/tekan harga",
  timeframe: "swing (1–2 minggu)|positioning (1–3 bulan)|investasi (3–12 bulan)",
  multiTFSummary: "konfirmasi atau divergensi antar D/W/M",
  fundamentalNote: "komentar singkat fundamental",
  newsImpact: "dampak berita terkini jika ada"
};

const INDEX_SCHEMA = {
  recommendation: "BULLISH|NETRAL|BEARISH",
  score: 0,
  konfidensLevel: "tinggi|sedang|rendah",
  analisis: "narasi kondisi IHSG 3 paragraf",
  bullCase: ["poin 1","poin 2"],
  bearCase: ["poin 1","poin 2"],
  levelSupport: [0, 0],
  levelResistance: [0, 0],
  riskWarning: "string",
  sektorKuat: "sektor yang outperform",
  sektorLemah: "sektor yang underperform",
  outlookMingguan: "string"
};

// ── sanitize AI output ────────────────────────────────────────────
function sanitizeAIOutput(parsed, scoring, riskData, isIndex) {
  if (!parsed || typeof parsed !== 'object') return null;

  // Paksa rekomendasi & score dari deterministik
  parsed.recommendation = scoring.recommendation;
  parsed.score          = scoring.final;

  // Paksa entry/SL/target dari risk.js — untuk saham (bukan index)
  if (!isIndex && riskData) {
    const isBullish = ['BELI','AKUMULASI'].includes(scoring.recommendation);
    const isBearish = ['JUAL','KURANGI'].includes(scoring.recommendation);

    // Entry zone
    if (riskData.entryZone) {
      parsed.entryZone = { low: riskData.entryZone.low, high: riskData.entryZone.high };
    }

    // Stop Loss
    parsed.stopLoss = riskData.stopLoss;

    // Target — bearish: tp harus di bawah harga entry
    if (riskData.targets) {
      parsed.targetHarga = {
        tp1: riskData.targets.tp1,
        tp2: riskData.targets.tp2,
        tp3: riskData.targets.tp3
      };
    }

    if (riskData.riskReward) {
      parsed.riskRewardLabel = riskData.riskReward.label;
    }

    if (riskData.positioning?.note) {
      parsed.positionSizing = riskData.positioning.note;
    }
  }

  // Validasi field wajib
  const requiredText = ['analisis','riskWarning'];
  for (const f of requiredText) {
    if (!parsed[f] || typeof parsed[f] !== 'string') parsed[f] = '';
  }
  if (!Array.isArray(parsed.bullCase)) parsed.bullCase = [];
  if (!Array.isArray(parsed.bearCase)) parsed.bearCase = [];

  return parsed;
}

// ── callAI ────────────────────────────────────────────────────────
async function callAI(data) {
  const context = buildTechnicalContext(data);
  const prompt  = buildPrompt(context, data.priceData?.isIndex);

  const call = async (temperature) => {
    const res = await fetch(GROQ_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model:       MODEL,
        max_tokens:  MAX_TOKENS,
        temperature,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!res.ok) {
      const err = await res.text().catch(() => res.status);
      throw new Error(`Groq HTTP ${res.status}: ${err}`);
    }
    const json = await res.json();
    return json.choices?.[0]?.message?.content || '';
  };

  const parse = (raw) => {
    const clean = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
                     .replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const start = clean.indexOf('{'), end = clean.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON found');
    return JSON.parse(clean.slice(start, end + 1));
  };

  let raw, parsed;
  try {
    raw    = await call(0.15);
    parsed = parse(raw);
  } catch (e) {
    log.warn('ai', `Parse gagal (${e.message}), retry temperature 0.05`);
    try {
      raw    = await call(0.05);
      parsed = parse(raw);
    } catch (e2) {
      log.error('ai', `Retry gagal: ${e2.message}`);
      return null;
    }
  }

  return sanitizeAIOutput(parsed, data.scoring, data.riskData, data.priceData?.isIndex);
}

module.exports = { callAI, buildTechnicalContext };
