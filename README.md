# SahamAI — Platform Analisis Saham IHSG

Platform AI analisis saham Indonesia dengan indikator teknikal matematis, volume intelligence, market structure, dan scoring deterministik.

## Fitur

- **18 Indikator Teknikal** — RSI, MACD, Bollinger Bands, ATR, MFI, Fibonacci, Divergence, Candlestick Pattern, Pivot Points, Relative Strength, dan lainnya
- **Bandar Detection** — Stealth accumulation, distribution trap, retail panic, smart money footprint
- **Berita Terkini** — Berita emiten, komoditas terkait, dan sentimen market IHSG dari Google News
- **Scanner** — Scan 200+ saham IHSG untuk setup breakout, volume spike, oversold, golden cross, dan lebih
- **AI Analysis** — Powered by openai/gpt-oss-120b via Groq

## Setup

### 1. Clone repo
```bash
git clone https://github.com/username/sahamai.git
cd sahamai
```

### 2. Install dependencies
```bash
npm install
```

### 3. Setup environment
```bash
cp .env.example .env
# Edit .env dan isi GROQ_API_KEY
```

### 4. Jalankan local
```bash
npm run dev
# Buka http://localhost:3000
```

## Deploy ke Vercel

1. Push ke GitHub
2. Import repo di vercel.com
3. Tambahkan environment variable `GROQ_API_KEY` di Vercel dashboard
4. Deploy otomatis

## Struktur Folder

```
├── api/
│   ├── analyze.js      # Main analysis endpoint
│   └── scanner.js      # Scanner endpoint
├── data/
│   └── idx-stocks.json # Database 621 emiten IDX
├── lib/
│   ├── ai.js           # AI engine (Groq/gpt-oss-120b)
│   ├── bandar.js       # Bandar detection
│   ├── cache.js        # In-memory cache
│   ├── context.js      # Market context
│   ├── indicators.js   # Technical indicators
│   ├── news.js         # News fetcher
│   ├── scanner.js      # Quick scan engine
│   ├── scoring.js      # Scoring system
│   ├── structure.js    # Market structure
│   ├── validation.js   # Input validation
│   └── volume.js       # Volume intelligence
├── public/
│   ├── index.html      # Frontend
│   └── app.js          # Frontend JS
├── .env.example
├── package.json
├── server.js           # Local dev server
└── vercel.json
```

## Tech Stack

- **Backend**: Node.js (CommonJS), Vercel Serverless
- **Frontend**: Vanilla JS, HTML, CSS
- **AI**: openai/gpt-oss-120b via Groq API
- **Data**: Yahoo Finance API, Google News RSS
- **Chart**: Lightweight Charts (TradingView)

## Disclaimer

Konten ini hanya untuk tujuan edukasi. Bukan saran investasi resmi. Selalu lakukan riset mandiri sebelum berinvestasi.
