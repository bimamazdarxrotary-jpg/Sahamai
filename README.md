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

## Catatan Teknikal & Limitasi

### Rate Limiting
Rate limiting (`/api/analyze` maks 10 req/menit per IP) disimpan **in-memory** dan tidak persist antar instance Vercel. Di Vercel free tier, setiap cold start menghasilkan instance baru sehingga counter reset. Ini by-design untuk kesederhanaan — jika dibutuhkan rate limiting yang ketat di production, gunakan **Vercel KV** sebagai shared store.

### Cache
Cache analisis juga in-memory per instance (TTL 5 menit untuk analisis, 10 menit untuk return sektor, 15 menit untuk berita/foreign flow, 1 menit untuk harga). Artinya dua user berbeda yang hit instance berbeda tidak sharing cache. Untuk cache terdistribusi, gunakan Vercel KV atau Redis.

### IHSG Crash Blocker
Saat IHSG turun lebih dari 8% dalam sehari, rekomendasi `BELI` dan `AKUMULASI` secara otomatis di-override ke `TAHAN`. Field `crashWarning` di response berisi pesan peringatan yang bisa ditampilkan ke user. Data IHSG crash di-cache selama 10 menit — artinya jika IHSG pulih, blocker akan nonaktif setelah cache expired.

### Datasource
Data harga menggunakan Yahoo Finance sebagai sumber utama dengan fallback ke Stooq. Jika kedua sumber gagal (rate limit, timeout, dll), endpoint tetap merespons dengan `{ error }` tanpa crash.

### Timeout
Semua Vercel function dikonfigurasi dengan `maxDuration: 30s`. Analisis paralel (AI + news + market context) biasanya selesai dalam 5–15 detik tergantung kondisi network ke Groq dan Yahoo Finance.

## Disclaimer

Konten ini hanya untuk tujuan edukasi. Bukan saran investasi resmi. Selalu lakukan riset mandiri sebelum berinvestasi.
