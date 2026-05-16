// ══════════════════════════════════════════════════════════════════
// DATABASE EMITEN IDX — Nama lengkap + Sektor IDX-IC resmi
// Mencakup ~200+ emiten populer & likuid di BEI
// Sektor mengacu pada IDX Industrial Classification (IDX-IC) 2021
// ══════════════════════════════════════════════════════════════════
const EMITEN_DB = {
  // ── ENERGI (A) ──────────────────────────────────────────────────
  ADRO: { nama: 'PT Adaro Energy Indonesia Tbk',         sektor: 'Energi', subsektor: 'Batu Bara' },
  PTBA: { nama: 'PT Bukit Asam Tbk',                    sektor: 'Energi', subsektor: 'Batu Bara' },
  ITMG: { nama: 'PT Indo Tambangraya Megah Tbk',         sektor: 'Energi', subsektor: 'Batu Bara' },
  HRUM: { nama: 'PT Harum Energy Tbk',                  sektor: 'Energi', subsektor: 'Batu Bara' },
  BUMI: { nama: 'PT Bumi Resources Tbk',                sektor: 'Energi', subsektor: 'Batu Bara' },
  BYAN: { nama: 'PT Bayan Resources Tbk',               sektor: 'Energi', subsektor: 'Batu Bara' },
  KKGI: { nama: 'PT Resource Alam Indonesia Tbk',       sektor: 'Energi', subsektor: 'Batu Bara' },
  PTRO: { nama: 'PT Petrosea Tbk',                      sektor: 'Energi', subsektor: 'Jasa Pertambangan' },
  MEDC: { nama: 'PT Medco Energi Internasional Tbk',    sektor: 'Energi', subsektor: 'Minyak & Gas' },
  ENRG: { nama: 'PT Energi Mega Persada Tbk',           sektor: 'Energi', subsektor: 'Minyak & Gas' },
  ELSA: { nama: 'PT Elnusa Tbk',                        sektor: 'Energi', subsektor: 'Jasa Minyak & Gas' },
  PGAS: { nama: 'PT Perusahaan Gas Negara Tbk',         sektor: 'Energi', subsektor: 'Distribusi Gas' },
  DEWA: { nama: 'PT Darma Henwa Tbk',                   sektor: 'Energi', subsektor: 'Jasa Pertambangan' },
  ESSA: { nama: 'PT Essa Industries Indonesia Tbk',     sektor: 'Energi', subsektor: 'Minyak & Gas' },
  SMMT: { nama: 'PT Golden Eagle Energy Tbk',           sektor: 'Energi', subsektor: 'Batu Bara' },
  MBSS: { nama: 'PT Mitrabahtera Segara Sejati Tbk',    sektor: 'Energi', subsektor: 'Distribusi Batu Bara' },

  // ── BARANG BAKU (B) ─────────────────────────────────────────────
  TPIA: { nama: 'PT Chandra Asri Pacific Tbk',          sektor: 'Barang Baku', subsektor: 'Kimia Dasar' },
  BRPT: { nama: 'PT Barito Pacific Tbk',                sektor: 'Barang Baku', subsektor: 'Kimia Dasar' },
  SMCB: { nama: 'PT Solusi Bangun Indonesia Tbk',       sektor: 'Barang Baku', subsektor: 'Material Konstruksi' },
  SMGR: { nama: 'PT Semen Indonesia (Persero) Tbk',     sektor: 'Barang Baku', subsektor: 'Material Konstruksi' },
  INTP: { nama: 'PT Indocement Tunggal Prakarsa Tbk',   sektor: 'Barang Baku', subsektor: 'Material Konstruksi' },
  WTON: { nama: 'PT Wijaya Karya Beton Tbk',            sektor: 'Barang Baku', subsektor: 'Material Konstruksi' },
  INKP: { nama: 'PT Indah Kiat Pulp & Paper Tbk',       sektor: 'Barang Baku', subsektor: 'Kertas' },
  TKIM: { nama: 'PT Pabrik Kertas Tjiwi Kimia Tbk',     sektor: 'Barang Baku', subsektor: 'Kertas' },
  FASW: { nama: 'PT Fajar Surya Wisesa Tbk',            sektor: 'Barang Baku', subsektor: 'Kertas' },
  ANTM: { nama: 'PT Aneka Tambang Tbk',                 sektor: 'Barang Baku', subsektor: 'Logam & Mineral' },
  VALE: { nama: 'PT Vale Indonesia Tbk',                sektor: 'Barang Baku', subsektor: 'Logam & Mineral' },
  TINS: { nama: 'PT Timah Tbk',                         sektor: 'Barang Baku', subsektor: 'Logam & Mineral' },
  MDKA: { nama: 'PT Merdeka Copper Gold Tbk',           sektor: 'Barang Baku', subsektor: 'Emas' },
  AMMN: { nama: 'PT Amman Mineral Internasional Tbk',   sektor: 'Barang Baku', subsektor: 'Logam & Mineral' },
  NCKL: { nama: 'PT Trimegah Bangun Persada Tbk',       sektor: 'Barang Baku', subsektor: 'Logam & Mineral' },
  INCO: { nama: 'PT Vale Indonesia Tbk',                sektor: 'Barang Baku', subsektor: 'Logam & Mineral' },
  PSAB: { nama: 'PT J Resources Asia Pasifik Tbk',      sektor: 'Barang Baku', subsektor: 'Emas' },
  AVIA: { nama: 'PT Avia Avian Tbk',                    sektor: 'Barang Baku', subsektor: 'Kimia Khusus' },
  AKPI: { nama: 'PT Argha Karya Prima Industry Tbk',    sektor: 'Barang Baku', subsektor: 'Wadah & Kemasan' },
  IGAR: { nama: 'PT Champion Pacific Indonesia Tbk',    sektor: 'Barang Baku', subsektor: 'Wadah & Kemasan' },
  JPFA: { nama: 'PT Japfa Comfeed Indonesia Tbk',       sektor: 'Barang Baku', subsektor: 'Kimia Pertanian' },

  // ── PERINDUSTRIAN (C) ────────────────────────────────────────────
  ASII: { nama: 'PT Astra International Tbk',           sektor: 'Perindustrian', subsektor: 'Perusahaan Holding Multi Sektor' },
  SRIL: { nama: 'PT Sri Rejeki Isman Tbk',              sektor: 'Perindustrian', subsektor: 'Mesin & Komponen' },
  KRAS: { nama: 'PT Krakatau Steel (Persero) Tbk',      sektor: 'Perindustrian', subsektor: 'Baja & Besi' },
  LION: { nama: 'PT Lion Metal Works Tbk',              sektor: 'Perindustrian', subsektor: 'Mesin & Komponen' },
  WIKA: { nama: 'PT Wijaya Karya (Persero) Tbk',        sektor: 'Perindustrian', subsektor: 'Jasa Komersial' },
  WSKT: { nama: 'PT Waskita Karya (Persero) Tbk',       sektor: 'Perindustrian', subsektor: 'Jasa Komersial' },
  PTPP: { nama: 'PT PP (Persero) Tbk',                  sektor: 'Perindustrian', subsektor: 'Jasa Komersial' },
  ADHI: { nama: 'PT Adhi Karya (Persero) Tbk',          sektor: 'Perindustrian', subsektor: 'Jasa Komersial' },
  ACST: { nama: 'PT Acset Indonusa Tbk',                sektor: 'Perindustrian', subsektor: 'Jasa Komersial' },
  TOTL: { nama: 'PT Total Bangun Persada Tbk',          sektor: 'Perindustrian', subsektor: 'Jasa Komersial' },
  KPIG: { nama: 'PT MNC Land Tbk',                      sektor: 'Perindustrian', subsektor: 'Jasa Komersial' },
  SMSM: { nama: 'PT Selamat Sempurna Tbk',              sektor: 'Perindustrian', subsektor: 'Komponen Kelistrikan' },

  // ── BARANG KONSUMEN PRIMER (D) ───────────────────────────────────
  UNVR: { nama: 'PT Unilever Indonesia Tbk',            sektor: 'Konsumen Primer', subsektor: 'Produk Rumah Tangga & Perawatan Tubuh' },
  ICBP: { nama: 'PT Indofood CBP Sukses Makmur Tbk',   sektor: 'Konsumen Primer', subsektor: 'Makanan Olahan' },
  INDF: { nama: 'PT Indofood Sukses Makmur Tbk',        sektor: 'Konsumen Primer', subsektor: 'Makanan Olahan' },
  MYOR: { nama: 'PT Mayora Indah Tbk',                  sektor: 'Konsumen Primer', subsektor: 'Makanan Olahan' },
  ULTJ: { nama: 'PT Ultra Jaya Milk Industry Tbk',      sektor: 'Konsumen Primer', subsektor: 'Produk Susu Olahan' },
  DLTA: { nama: 'PT Delta Djakarta Tbk',                sektor: 'Konsumen Primer', subsektor: 'Minuman Keras' },
  MLBI: { nama: 'PT Multi Bintang Indonesia Tbk',       sektor: 'Konsumen Primer', subsektor: 'Minuman Keras' },
  CLEO: { nama: 'PT Sariguna Primatirta Tbk',           sektor: 'Konsumen Primer', subsektor: 'Minuman Ringan' },
  CMRY: { nama: 'PT Cisarua Mountain Dairy Tbk',        sektor: 'Konsumen Primer', subsektor: 'Produk Susu Olahan' },
  GOOD: { nama: 'PT Garudafood Putra Putri Jaya Tbk',  sektor: 'Konsumen Primer', subsektor: 'Makanan Olahan' },
  HOKI: { nama: 'PT Buyung Poetra Sembada Tbk',         sektor: 'Konsumen Primer', subsektor: 'Makanan Olahan' },
  BUDI: { nama: 'PT Budi Starch & Sweetener Tbk',       sektor: 'Konsumen Primer', subsektor: 'Makanan Olahan' },
  AISA: { nama: 'PT FKS Food Sejahtera Tbk',            sektor: 'Konsumen Primer', subsektor: 'Makanan Olahan' },
  SKLT: { nama: 'PT Sekar Laut Tbk',                    sektor: 'Konsumen Primer', subsektor: 'Makanan Olahan' },
  STTP: { nama: 'PT Siantar Top Tbk',                   sektor: 'Konsumen Primer', subsektor: 'Makanan Olahan' },
  CAMP: { nama: 'PT Campina Ice Cream Industry Tbk',    sektor: 'Konsumen Primer', subsektor: 'Produk Susu Olahan' },
  GGRM: { nama: 'PT Gudang Garam Tbk',                  sektor: 'Konsumen Primer', subsektor: 'Rokok' },
  HMSP: { nama: 'PT H.M. Sampoerna Tbk',                sektor: 'Konsumen Primer', subsektor: 'Rokok' },
  WIIM: { nama: 'PT Wismilak Inti Makmur Tbk',          sektor: 'Konsumen Primer', subsektor: 'Rokok' },
  RMBA: { nama: 'PT Bentoel Internasional Investama Tbk', sektor: 'Konsumen Primer', subsektor: 'Rokok' },
  SIDO: { nama: 'PT Industri Jamu dan Farmasi Sido Muncul Tbk', sektor: 'Konsumen Primer', subsektor: 'Produk Keperluan Rumah Tangga' },
  KINO: { nama: 'PT Kino Indonesia Tbk',                sektor: 'Konsumen Primer', subsektor: 'Produk Perawatan Tubuh' },
  MAPI: { nama: 'PT Mitra Adiperkasa Tbk',              sektor: 'Konsumen Primer', subsektor: 'Ritel & Distributor' },
  ROTI: { nama: 'PT Nippon Indosari Corpindo Tbk',      sektor: 'Konsumen Primer', subsektor: 'Makanan Olahan' },
  LSIP: { nama: 'PT PP London Sumatra Indonesia Tbk',   sektor: 'Konsumen Primer', subsektor: 'Perkebunan & Tanaman Pangan' },
  SSMS: { nama: 'PT Sawit Sumbermas Sarana Tbk',        sektor: 'Konsumen Primer', subsektor: 'Perkebunan & Tanaman Pangan' },
  AALI: { nama: 'PT Astra Agro Lestari Tbk',            sektor: 'Konsumen Primer', subsektor: 'Perkebunan & Tanaman Pangan' },
  SIMP: { nama: 'PT Salim Ivomas Pratama Tbk',          sektor: 'Konsumen Primer', subsektor: 'Perkebunan & Tanaman Pangan' },
  PALM: { nama: 'PT Provident Agro Tbk',                sektor: 'Konsumen Primer', subsektor: 'Perkebunan & Tanaman Pangan' },
  SGRO: { nama: 'PT Sampoerna Agro Tbk',                sektor: 'Konsumen Primer', subsektor: 'Perkebunan & Tanaman Pangan' },
  UNSP: { nama: 'PT Bakrie Sumatera Plantations Tbk',   sektor: 'Konsumen Primer', subsektor: 'Perkebunan & Tanaman Pangan' },
  CPIN: { nama: 'PT Charoen Pokphand Indonesia Tbk',    sektor: 'Konsumen Primer', subsektor: 'Ikan, Daging & Unggas' },
  MAIN: { nama: 'PT Malindo Feedmill Tbk',              sektor: 'Konsumen Primer', subsektor: 'Ikan, Daging & Unggas' },
  TBLA: { nama: 'PT Tunas Baru Lampung Tbk',            sektor: 'Konsumen Primer', subsektor: 'Perkebunan & Tanaman Pangan' },
  CSRA: { nama: 'PT Cisadane Sawit Raya Tbk',           sektor: 'Konsumen Primer', subsektor: 'Perkebunan & Tanaman Pangan' },

  // ── BARANG KONSUMEN NON-PRIMER (E) ──────────────────────────────
  ACES: { nama: 'PT Ace Hardware Indonesia Tbk',        sektor: 'Konsumen Non-Primer', subsektor: 'Ritel Barang Sekunder' },
  MNCN: { nama: 'PT Media Nusantara Citra Tbk',         sektor: 'Konsumen Non-Primer', subsektor: 'Penyiaran' },
  SCMA: { nama: 'PT Surya Citra Media Tbk',             sektor: 'Konsumen Non-Primer', subsektor: 'Penyiaran' },
  EMTK: { nama: 'PT Elang Mahkota Teknologi Tbk',       sektor: 'Konsumen Non-Primer', subsektor: 'Penyiaran' },
  BMTR: { nama: 'PT Global Mediacom Tbk',               sektor: 'Konsumen Non-Primer', subsektor: 'Penyiaran' },
  LINK: { nama: 'PT Link Net Tbk',                      sektor: 'Konsumen Non-Primer', subsektor: 'Penyiaran Berbayar' },
  LPPF: { nama: 'PT Matahari Department Store Tbk',     sektor: 'Konsumen Non-Primer', subsektor: 'Ritel Barang Sekunder' },
  AMRT: { nama: 'PT Sumber Alfaria Trijaya Tbk',        sektor: 'Konsumen Non-Primer', subsektor: 'Supermarket' },
  MIDI: { nama: 'PT Midi Utama Indonesia Tbk',          sektor: 'Konsumen Non-Primer', subsektor: 'Supermarket' },
  HERO: { nama: 'PT Hero Supermarket Tbk',              sektor: 'Konsumen Non-Primer', subsektor: 'Supermarket' },
  RALS: { nama: 'PT Ramayana Lestari Sentosa Tbk',      sektor: 'Konsumen Non-Primer', subsektor: 'Ritel Barang Sekunder' },
  MAPS: { nama: 'PT MAP Aktif Adiperkasa Tbk',          sektor: 'Konsumen Non-Primer', subsektor: 'Ritel Barang Sekunder' },
  MTEL: { nama: 'PT Dayamitra Telekomunikasi Tbk',      sektor: 'Konsumen Non-Primer', subsektor: 'Jasa Penunjang Konsumen' },
  PZZA: { nama: 'PT Sarimelati Kencana Tbk',            sektor: 'Konsumen Non-Primer', subsektor: 'Rumah Makan' },
  FAST: { nama: 'PT Fast Food Indonesia Tbk',           sektor: 'Konsumen Non-Primer', subsektor: 'Rumah Makan' },
  PTSP: { nama: 'PT Pioneerindo Gourmet International Tbk', sektor: 'Konsumen Non-Primer', subsektor: 'Rumah Makan' },
  INPP: { nama: 'PT Indonesian Paradise Property Tbk',  sektor: 'Konsumen Non-Primer', subsektor: 'Hotel & Resor' },
  JIHD: { nama: 'PT Jakarta International Hotels & Development Tbk', sektor: 'Konsumen Non-Primer', subsektor: 'Hotel & Resor' },
  PNSE: { nama: 'PT Pudjiadi & Sons Tbk',               sektor: 'Konsumen Non-Primer', subsektor: 'Hotel & Resor' },
  GOLF: { nama: 'PT Persada Golf Indonesia Tbk',        sektor: 'Konsumen Non-Primer', subsektor: 'Fasilitas Rekreasi & Olahraga' },
  KICI: { nama: 'PT Kedaung Indah Can Tbk',             sektor: 'Konsumen Non-Primer', subsektor: 'Perlengkapan Rumah Tangga' },
  SONA: { nama: 'PT Sona Topas Tourism Industry Tbk',   sektor: 'Konsumen Non-Primer', subsektor: 'Agen Perjalanan' },
  ARGO: { nama: 'PT Argo Pantes Tbk',                   sektor: 'Konsumen Non-Primer', subsektor: 'Tekstil' },
  RICY: { nama: 'PT Ricky Putra Globalindo Tbk',        sektor: 'Konsumen Non-Primer', subsektor: 'Tekstil' },
  AUTO: { nama: 'PT Astra Otoparts Tbk',                sektor: 'Konsumen Non-Primer', subsektor: 'Suku Cadang Otomotif' },
  GJTL: { nama: 'PT Gajah Tunggal Tbk',                 sektor: 'Konsumen Non-Primer', subsektor: 'Ban' },
  ASII_OTO: { nama: 'PT Astra International Tbk (Otomotif)', sektor: 'Konsumen Non-Primer', subsektor: 'Produsen Mobil' },
  MASA: { nama: 'PT Multistrada Arah Sarana Tbk',       sektor: 'Konsumen Non-Primer', subsektor: 'Ban' },
  MPMX: { nama: 'PT Mitra Pinasthika Mustika Tbk',      sektor: 'Konsumen Non-Primer', subsektor: 'Suku Cadang Otomotif' },

  // ── KESEHATAN (F) ────────────────────────────────────────────────
  KLBF: { nama: 'PT Kalbe Farma Tbk',                   sektor: 'Kesehatan', subsektor: 'Farmasi' },
  KAEF: { nama: 'PT Kimia Farma Tbk',                   sektor: 'Kesehatan', subsektor: 'Farmasi' },
  PYFA: { nama: 'PT Pyridam Farma Tbk',                 sektor: 'Kesehatan', subsektor: 'Farmasi' },
  DVLA: { nama: 'PT Darya-Varia Laboratoria Tbk',       sektor: 'Kesehatan', subsektor: 'Farmasi' },
  TSPC: { nama: 'PT Tempo Scan Pacific Tbk',            sektor: 'Kesehatan', subsektor: 'Farmasi' },
  MERK: { nama: 'PT Merck Tbk',                         sektor: 'Kesehatan', subsektor: 'Farmasi' },
  INAF: { nama: 'PT Indofarma Tbk',                     sektor: 'Kesehatan', subsektor: 'Farmasi' },
  SOHO: { nama: 'PT Soho Global Health Tbk',            sektor: 'Kesehatan', subsektor: 'Farmasi' },
  PRDA: { nama: 'PT Prodia Widyahusada Tbk',            sektor: 'Kesehatan', subsektor: 'Alat & Layanan Kesehatan' },
  HEAL: { nama: 'PT Medikaloka Hermina Tbk',            sektor: 'Kesehatan', subsektor: 'Fasilitas Kesehatan' },
  MIKA: { nama: 'PT Mitra Keluarga Karyasehat Tbk',     sektor: 'Kesehatan', subsektor: 'Fasilitas Kesehatan' },
  SILO: { nama: 'PT Siloam International Hospitals Tbk', sektor: 'Kesehatan', subsektor: 'Fasilitas Kesehatan' },
  RSIA: { nama: 'PT Rumah Sakit Ibu dan Anak Tbk',      sektor: 'Kesehatan', subsektor: 'Fasilitas Kesehatan' },
  BMHS: { nama: 'PT Bundamedik Tbk',                    sektor: 'Kesehatan', subsektor: 'Fasilitas Kesehatan' },
  SAME: { nama: 'PT Sarana Meditama Metropolitan Tbk',  sektor: 'Kesehatan', subsektor: 'Fasilitas Kesehatan' },

  // ── KEUANGAN (G) ─────────────────────────────────────────────────
  BBCA: { nama: 'PT Bank Central Asia Tbk',             sektor: 'Keuangan', subsektor: 'Perbankan' },
  BBRI: { nama: 'PT Bank Rakyat Indonesia (Persero) Tbk', sektor: 'Keuangan', subsektor: 'Perbankan' },
  BMRI: { nama: 'PT Bank Mandiri (Persero) Tbk',        sektor: 'Keuangan', subsektor: 'Perbankan' },
  BBNI: { nama: 'PT Bank Negara Indonesia (Persero) Tbk', sektor: 'Keuangan', subsektor: 'Perbankan' },
  BRIS: { nama: 'PT Bank Syariah Indonesia Tbk',        sektor: 'Keuangan', subsektor: 'Perbankan Syariah' },
  BNGA: { nama: 'PT Bank CIMB Niaga Tbk',               sektor: 'Keuangan', subsektor: 'Perbankan' },
  BNII: { nama: 'PT Bank Maybank Indonesia Tbk',        sektor: 'Keuangan', subsektor: 'Perbankan' },
  BDMN: { nama: 'PT Bank Danamon Indonesia Tbk',        sektor: 'Keuangan', subsektor: 'Perbankan' },
  PNBN: { nama: 'PT Bank Pan Indonesia Tbk',            sektor: 'Keuangan', subsektor: 'Perbankan' },
  BNLI: { nama: 'PT Bank Permata Tbk',                  sektor: 'Keuangan', subsektor: 'Perbankan' },
  NISP: { nama: 'PT Bank OCBC NISP Tbk',                sektor: 'Keuangan', subsektor: 'Perbankan' },
  BJTM: { nama: 'PT Bank Pembangunan Daerah Jawa Timur Tbk', sektor: 'Keuangan', subsektor: 'Perbankan' },
  BJBR: { nama: 'PT Bank Pembangunan Daerah Jawa Barat dan Banten Tbk', sektor: 'Keuangan', subsektor: 'Perbankan' },
  MEGA: { nama: 'PT Bank Mega Tbk',                     sektor: 'Keuangan', subsektor: 'Perbankan' },
  BMAS: { nama: 'PT Bank Maspion Indonesia Tbk',        sektor: 'Keuangan', subsektor: 'Perbankan' },
  BTPS: { nama: 'PT Bank BTPN Syariah Tbk',             sektor: 'Keuangan', subsektor: 'Perbankan Syariah' },
  BTPN: { nama: 'PT Bank BTPN Tbk',                     sektor: 'Keuangan', subsektor: 'Perbankan' },
  BBYB: { nama: 'PT Bank Neo Commerce Tbk',             sektor: 'Keuangan', subsektor: 'Perbankan Digital' },
  ARTO: { nama: 'PT Bank Jago Tbk',                     sektor: 'Keuangan', subsektor: 'Perbankan Digital' },
  AGRO: { nama: 'PT Bank Raya Indonesia Tbk',           sektor: 'Keuangan', subsektor: 'Perbankan' },
  BBHI: { nama: 'PT Allo Bank Indonesia Tbk',           sektor: 'Keuangan', subsektor: 'Perbankan Digital' },
  BFIN: { nama: 'PT BFI Finance Indonesia Tbk',         sektor: 'Keuangan', subsektor: 'Multifinance' },
  ADMF: { nama: 'PT Adira Dinamika Multi Finance Tbk',  sektor: 'Keuangan', subsektor: 'Multifinance' },
  MFIN: { nama: 'PT Mandala Multifinance Tbk',          sektor: 'Keuangan', subsektor: 'Multifinance' },
  WOMF: { nama: 'PT Wahana Ottomitra Multiartha Tbk',   sektor: 'Keuangan', subsektor: 'Multifinance' },
  ASII_FIN: { nama: 'PT Astra International (Financial)', sektor: 'Keuangan', subsektor: 'Multifinance' },
  AMAG: { nama: 'PT Asuransi Multi Artha Guna Tbk',     sektor: 'Keuangan', subsektor: 'Asuransi' },
  ASRM: { nama: 'PT Asuransi Ramayana Tbk',             sektor: 'Keuangan', subsektor: 'Asuransi' },
  ABDA: { nama: 'PT Asuransi Bina Dana Arta Tbk',       sektor: 'Keuangan', subsektor: 'Asuransi' },
  PNIN: { nama: 'PT Paninvest Tbk',                     sektor: 'Keuangan', subsektor: 'Asuransi' },
  LIFE: { nama: 'PT Asuransi Jiwa Syariah Jasa Mitra Abadi Tbk', sektor: 'Keuangan', subsektor: 'Asuransi Jiwa' },
  AKSI: { nama: 'PT Mahkota Finansial Gemilang Tbk',    sektor: 'Keuangan', subsektor: 'Sekuritas' },
  TRIM: { nama: 'PT Trimegah Sekuritas Indonesia Tbk',  sektor: 'Keuangan', subsektor: 'Sekuritas' },
  PADI: { nama: 'PT Minna Padi Investama Sekuritas Tbk', sektor: 'Keuangan', subsektor: 'Sekuritas' },

  // ── PROPERTI & REAL ESTAT (H) ────────────────────────────────────
  BSDE: { nama: 'PT Bumi Serpong Damai Tbk',            sektor: 'Properti & Real Estat', subsektor: 'Pengembang Properti' },
  CTRA: { nama: 'PT Ciputra Development Tbk',           sektor: 'Properti & Real Estat', subsektor: 'Pengembang Properti' },
  SMRA: { nama: 'PT Summarecon Agung Tbk',              sektor: 'Properti & Real Estat', subsektor: 'Pengembang Properti' },
  PWON: { nama: 'PT Pakuwon Jati Tbk',                  sektor: 'Properti & Real Estat', subsektor: 'Pengembang Properti' },
  LPKR: { nama: 'PT Lippo Karawaci Tbk',                sektor: 'Properti & Real Estat', subsektor: 'Pengembang Properti' },
  DILD: { nama: 'PT Intiland Development Tbk',          sektor: 'Properti & Real Estat', subsektor: 'Pengembang Properti' },
  APLN: { nama: 'PT Agung Podomoro Land Tbk',           sektor: 'Properti & Real Estat', subsektor: 'Pengembang Properti' },
  ASRI: { nama: 'PT Alam Sutera Realty Tbk',            sektor: 'Properti & Real Estat', subsektor: 'Pengembang Properti' },
  MTLA: { nama: 'PT Metropolitan Land Tbk',             sektor: 'Properti & Real Estat', subsektor: 'Pengembang Properti' },
  KIJA: { nama: 'PT Kawasan Industri Jababeka Tbk',     sektor: 'Properti & Real Estat', subsektor: 'Kawasan Industri' },
  DMAS: { nama: 'PT Puradelta Lestari Tbk',             sektor: 'Properti & Real Estat', subsektor: 'Kawasan Industri' },
  SMDM: { nama: 'PT Suryamas Dutamakmur Tbk',           sektor: 'Properti & Real Estat', subsektor: 'Pengembang Properti' },
  MMLP: { nama: 'PT Mega Manunggal Property Tbk',       sektor: 'Properti & Real Estat', subsektor: 'Kawasan Industri' },
  PJAA: { nama: 'PT Pembangunan Jaya Ancol Tbk',        sektor: 'Properti & Real Estat', subsektor: 'Pengembang Properti' },
  GPRA: { nama: 'PT Perdana Gapuraprima Tbk',           sektor: 'Properti & Real Estat', subsektor: 'Pengembang Properti' },
  MKPI: { nama: 'PT Metropolitan Kentjana Tbk',         sektor: 'Properti & Real Estat', subsektor: 'Pengembang Properti' },
  JRPT: { nama: 'PT Jaya Real Property Tbk',            sektor: 'Properti & Real Estat', subsektor: 'Pengembang Properti' },
  TARA: { nama: 'PT Sitara Propertindo Tbk',            sektor: 'Properti & Real Estat', subsektor: 'Pengembang Properti' },

  // ── TEKNOLOGI (I) ────────────────────────────────────────────────
  GOTO: { nama: 'PT GoTo Gojek Tokopedia Tbk',          sektor: 'Teknologi', subsektor: 'Platform Digital' },
  BUKA: { nama: 'PT Bukalapak.com Tbk',                 sektor: 'Teknologi', subsektor: 'Platform Digital' },
  BELI: { nama: 'PT Global Digital Niaga Tbk (Blibli)', sektor: 'Teknologi', subsektor: 'Platform Digital' },
  DEWA: { nama: 'PT Darma Henwa Tbk',                   sektor: 'Teknologi', subsektor: 'Platform Digital' },
  INET: { nama: 'PT Indointernet Tbk',                  sektor: 'Teknologi', subsektor: 'Layanan Internet' },
  DCII: { nama: 'PT DCI Indonesia Tbk',                 sektor: 'Teknologi', subsektor: 'Pusat Data' },
  MLPT: { nama: 'PT Multipolar Technology Tbk',         sektor: 'Teknologi', subsektor: 'Layanan IT' },
  MTDL: { nama: 'PT Metrodata Electronics Tbk',         sektor: 'Teknologi', subsektor: 'Distribusi IT' },
  DMMX: { nama: 'PT Digital Mediatama Maxima Tbk',      sektor: 'Teknologi', subsektor: 'Teknologi Iklan Digital' },
  AWAN: { nama: 'PT Geonet Teknologi Indonesia Tbk',    sektor: 'Teknologi', subsektor: 'Layanan Cloud' },
  DOSS: { nama: 'PT Dos Ni Roha Tbk',                   sektor: 'Teknologi', subsektor: 'Distribusi IT' },
  RUNS: { nama: 'PT Rintis Sejahtera Tbk',              sektor: 'Teknologi', subsektor: 'Layanan IT' },
  EDGE: { nama: 'PT Indointernet Tbk',                  sektor: 'Teknologi', subsektor: 'Layanan Internet' },
  MSTI: { nama: 'PT Mitra Sinergi Tbk',                 sektor: 'Teknologi', subsektor: 'Layanan IT' },

  // ── INFRASTRUKTUR (J) ────────────────────────────────────────────
  TLKM: { nama: 'PT Telkom Indonesia (Persero) Tbk',    sektor: 'Infrastruktur', subsektor: 'Telekomunikasi' },
  EXCL:  { nama: 'PT XL Axiata Tbk',                   sektor: 'Infrastruktur', subsektor: 'Telekomunikasi' },
  ISAT:  { nama: 'PT Indosat Tbk',                     sektor: 'Infrastruktur', subsektor: 'Telekomunikasi' },
  FREN:  { nama: 'PT Smartfren Telecom Tbl',            sektor: 'Infrastruktur', subsektor: 'Telekomunikasi' },
  TOWR:  { nama: 'PT Sarana Menara Nusantara Tbk',     sektor: 'Infrastruktur', subsektor: 'Menara Telekomunikasi' },
  TBIG:  { nama: 'PT Tower Bersama Infrastructure Tbk', sektor: 'Infrastruktur', subsektor: 'Menara Telekomunikasi' },
  GHON:  { nama: 'PT Gihon Telekomunikasi Indonesia Tbk', sektor: 'Infrastruktur', subsektor: 'Menara Telekomunikasi' },
  JSMR:  { nama: 'PT Jasa Marga (Persero) Tbk',        sektor: 'Infrastruktur', subsektor: 'Jalan Tol' },
  META:  { nama: 'PT Nusantara Infrastructure Tbk',    sektor: 'Infrastruktur', subsektor: 'Jalan Tol' },
  CMNP:  { nama: 'PT Citra Marga Nusaphala Persada Tbk', sektor: 'Infrastruktur', subsektor: 'Jalan Tol' },
  BALI:  { nama: 'PT Bali Towerindo Sentra Tbk',       sektor: 'Infrastruktur', subsektor: 'Menara Telekomunikasi' },
  PGAS_INF: { nama: 'PT Perusahaan Gas Negara Tbk',    sektor: 'Infrastruktur', subsektor: 'Gas & Air' },
  KOPI:  { nama: 'PT Mitra Komunikasi Nusantara Tbk',  sektor: 'Infrastruktur', subsektor: 'Telekomunikasi' },

  // ── TRANSPORTASI & LOGISTIK (K) ──────────────────────────────────
  GIAA:  { nama: 'PT Garuda Indonesia (Persero) Tbk',  sektor: 'Transportasi & Logistik', subsektor: 'Maskapai' },
  CMPP:  { nama: 'PT AirAsia Indonesia Tbk',           sektor: 'Transportasi & Logistik', subsektor: 'Maskapai' },
  HATM:  { nama: 'PT Bahana Nusa Interinsco Tbk',      sektor: 'Transportasi & Logistik', subsektor: 'Transportasi' },
  SMDR:  { nama: 'PT Samudera Indonesia Tbk',          sektor: 'Transportasi & Logistik', subsektor: 'Pelayaran' },
  TMAS:  { nama: 'PT Pelayaran Tempuran Emas Tbk',     sektor: 'Transportasi & Logistik', subsektor: 'Pelayaran' },
  NELY:  { nama: 'PT Pelayaran Nelly Dwi Putri Tbk',   sektor: 'Transportasi & Logistik', subsektor: 'Pelayaran' },
  BIRD:  { nama: 'PT Blue Bird Tbk',                   sektor: 'Transportasi & Logistik', subsektor: 'Transportasi Darat' },
  TAXI:  { nama: 'PT Express Transindo Utama Tbk',     sektor: 'Transportasi & Logistik', subsektor: 'Transportasi Darat' },
  IPCC:  { nama: 'PT Indonesia Kendaraan Terminal Tbk', sektor: 'Transportasi & Logistik', subsektor: 'Pelabuhan' },
  PTIS:  { nama: 'PT Indo Straits Tbk',                sektor: 'Transportasi & Logistik', subsektor: 'Pelayaran' },
  TPMA:  { nama: 'PT Trans Power Marine Tbk',          sektor: 'Transportasi & Logistik', subsektor: 'Pelayaran' },
  ASSA:  { nama: 'PT Adi Sarana Armada Tbk',           sektor: 'Transportasi & Logistik', subsektor: 'Logistik' },
  MIKA_LOG: { nama: 'PT Mitra Karya Bahari Tbk',       sektor: 'Transportasi & Logistik', subsektor: 'Logistik' },
  IPCM:  { nama: 'PT Jasa Armada Indonesia Tbk',       sektor: 'Transportasi & Logistik', subsektor: 'Pelabuhan' },
  SAFE:  { nama: 'PT Trimuda Nuansa Citra Tbk',        sektor: 'Transportasi & Logistik', subsektor: 'Logistik' },
  MPOW:  { nama: 'PT Megapower Makmur Tbk',            sektor: 'Transportasi & Logistik', subsektor: 'Logistik' },
};

// ══════════════════════════════════════════════════════════════════
// LOOKUP: cari data emiten dari DB, fallback null jika tidak ada
// ══════════════════════════════════════════════════════════════════
function lookupEmiten(ticker) {
  return EMITEN_DB[ticker] || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ticker } = req.body;
  if (!ticker || typeof ticker !== 'string') {
    return res.status(400).json({ error: 'Kode saham tidak valid' });
  }

  const clean = ticker.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!clean || clean.length > 10) {
    return res.status(400).json({ error: 'Kode saham tidak valid' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key tidak dikonfigurasi di server' });
  }

  const isIndex = clean === 'IHSG' || clean === 'LQ45';

  // ── Lookup data emiten dari database ──────────────────────────────
  const emitenInfo = !isIndex ? lookupEmiten(clean) : null;
  const namaResmi   = emitenInfo?.nama     || null;
  const sektorResmi = emitenInfo?.sektor   || null;
  const subsektor   = emitenInfo?.subsektor || null;

  // ── 1. Fetch real-time price + historical dari Yahoo Finance ──────
  let priceData = null;
  try {
    const symbol = isIndex
      ? (clean === 'IHSG' ? '%5EJKSE' : '%5EJKLQ45')
      : `${clean}.JK`;

    const quoteUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=3mo`;
    const quoteRes = await fetch(quoteUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    if (quoteRes.ok) {
      const quoteJson = await quoteRes.json();
      const meta       = quoteJson?.chart?.result?.[0]?.meta;
      const quotes     = quoteJson?.chart?.result?.[0]?.indicators?.quote?.[0];
      const timestamps = quoteJson?.chart?.result?.[0]?.timestamp;

      if (meta && quotes && timestamps) {
        const closes  = quotes.close;
        const highs   = quotes.high;
        const lows    = quotes.low;
        const volumes = quotes.volume;

        const history = [];
        for (let i = 0; i < timestamps.length; i++) {
          if (closes[i] !== null && closes[i] !== undefined) {
            history.push({
              date:   new Date(timestamps[i] * 1000).toISOString().split('T')[0],
              close:  Math.round(closes[i]),
              high:   Math.round(highs[i]   || closes[i]),
              low:    Math.round(lows[i]    || closes[i]),
              volume: volumes[i] || 0
            });
          }
        }

        const lastClose  = meta.regularMarketPrice || closes[closes.length - 1];
        const prevClose  = meta.chartPreviousClose  || closes[closes.length - 2] || lastClose;
        const change     = lastClose - prevClose;
        const changePct  = prevClose ? ((change / prevClose) * 100) : 0;

        const recentCloses = history.slice(-20).map(h => h.close).filter(Boolean);
        const ma20 = recentCloses.length > 0
          ? Math.round(recentCloses.reduce((a, b) => a + b, 0) / recentCloses.length)
          : null;

        const last50 = history.slice(-50).map(h => h.close).filter(Boolean);
        const ma50 = last50.length >= 10
          ? Math.round(last50.reduce((a, b) => a + b, 0) / last50.length)
          : null;

        // RSI sederhana (14 periode)
        let rsi = null;
        if (history.length >= 15) {
          const slice = history.slice(-15).map(h => h.close);
          let gains = 0, losses = 0;
          for (let i = 1; i < slice.length; i++) {
            const diff = slice[i] - slice[i - 1];
            if (diff >= 0) gains += diff; else losses -= diff;
          }
          const avgGain = gains / 14;
          const avgLoss = losses / 14;
          rsi = avgLoss === 0 ? 100 : Math.round(100 - (100 / (1 + avgGain / avgLoss)));
        }

        priceData = {
          currentPrice: Math.round(lastClose),
          prevClose:    Math.round(prevClose),
          change:       Math.round(change),
          changePct:    changePct.toFixed(2),
          isUp:         change >= 0,
          high52w:      meta.fiftyTwoWeekHigh  ? Math.round(meta.fiftyTwoWeekHigh)  : null,
          low52w:       meta.fiftyTwoWeekLow   ? Math.round(meta.fiftyTwoWeekLow)   : null,
          ma20,
          ma50,
          rsi,
          currency:     meta.currency || 'IDR',
          history:      history.slice(-60),
          volume:       meta.regularMarketVolume || null,
          marketCap:    meta.marketCap || null
        };
      }
    }
  } catch (e) {
    console.error('Price fetch error:', e.message);
  }

  // ── 2. Bangun konteks harga untuk prompt ──────────────────────────
  const priceContext = priceData ? `
DATA PASAR REAL-TIME (WAJIB digunakan dalam analisis):
- Harga saat ini : ${priceData.currency} ${priceData.currentPrice.toLocaleString('id-ID')}
- Perubahan hari ini: ${priceData.isUp ? '+' : ''}${priceData.change.toLocaleString('id-ID')} (${priceData.isUp ? '+' : ''}${priceData.changePct}%)
- MA20 : ${priceData.ma20 ? priceData.ma20.toLocaleString('id-ID') : 'N/A'}
- MA50 : ${priceData.ma50 ? priceData.ma50.toLocaleString('id-ID') : 'N/A'}
- RSI (14) : ${priceData.rsi !== null ? priceData.rsi : 'N/A'}${priceData.rsi !== null ? (priceData.rsi > 70 ? ' — Overbought' : priceData.rsi < 30 ? ' — Oversold' : ' — Netral') : ''}
- 52W High : ${priceData.high52w ? priceData.high52w.toLocaleString('id-ID') : 'N/A'}
- 52W Low  : ${priceData.low52w  ? priceData.low52w.toLocaleString('id-ID')  : 'N/A'}
- Volume   : ${priceData.volume  ? priceData.volume.toLocaleString('id-ID')  : 'N/A'}
- Market Cap: ${priceData.marketCap ? (priceData.marketCap / 1e12).toFixed(2) + ' T IDR' : 'N/A'}
Posisi harga vs MA: ${priceData.ma20 && priceData.currentPrice > priceData.ma20 ? 'DI ATAS MA20 (bullish)' : 'DI BAWAH MA20 (bearish)'}${priceData.ma50 ? ', ' + (priceData.currentPrice > priceData.ma50 ? 'DI ATAS MA50 (bullish)' : 'DI BAWAH MA50 (bearish)') : ''}
` : 'Data harga real-time tidak tersedia. Gunakan estimasi terbaik dari pengetahuanmu.';

  // ── Konteks emiten dari database ──────────────────────────────────
  const emitenContext = emitenInfo
    ? `DATA EMITEN TERVERIFIKASI (gunakan persis):
- Nama resmi  : ${namaResmi}
- Sektor IDX-IC: ${sektorResmi}
- Subsektor   : ${subsektor}
`
    : `Emiten ${clean} tidak ada dalam database lokal. Tentukan nama lengkap dan sektor berdasarkan pengetahuanmu secara akurat.`;

  // ── 3. Prompt yang di-upgrade ─────────────────────────────────────
  const prompt = isIndex
    ? `Kamu adalah Chief Market Strategist senior di firma riset ekuitas terkemuka Indonesia dengan pengalaman 20+ tahun di Bursa Efek Indonesia. Kamu dikenal karena analisis yang tajam, berbasis data, dan actionable.

${priceContext}

Tugas: Berikan analisis pasar ${clean} yang komprehensif, mendalam, dan BERBASIS DATA DI ATAS.

ATURAN KETAT:
1. Gunakan angka harga nyata dari data di atas — JANGAN membuat angka fiktif
2. Semua estimasi harga harus logis mengacu harga saat ini
3. Sentiment harus konsisten dengan kondisi MA dan RSI yang diberikan
4. JSON harus valid sempurna — tidak ada trailing comma, tidak ada karakter tambahan

Jawab HANYA JSON valid tanpa markdown, tanpa komentar:
{
  "namaLengkap": "${clean === 'IHSG' ? 'Indeks Harga Saham Gabungan (IHSG)' : 'Indeks LQ45'}",
  "sektor": "Indeks Pasar Modal Indonesia",
  "summary": "Analisis naratif 4-5 kalimat yang menyebutkan level harga spesifik, kondisi MA, RSI, dan sentimen makro. Gunakan angka real dari data di atas.",
  "sentiment": "BULLISH atau BEARISH atau NETRAL",
  "rekomendasi": "Strategi investasi spesifik 3 kalimat. Sebutkan zona akumulasi/distribusi berdasarkan level MA yang ada.",
  "priceEst": "Target indeks 3-6 bulan ke depan berdasarkan level saat ini, misal: 7.400 - 7.800",
  "pe": "Rata-rata P/E IHSG saat ini, misal: 14.2x",
  "pbv": "Rata-rata P/BV IHSG saat ini, misal: 2.1x",
  "divYield": "Rata-rata dividend yield pasar saat ini, misal: 3.5%",
  "beta": "1.00",
  "sektorKuat": ["Nama sektor IDX-IC yang outperform 1", "Nama sektor 2", "Nama sektor 3"],
  "sektorLemah": ["Nama sektor IDX-IC yang underperform 1", "Nama sektor 2"],
  "analisisTeknikal": "2-3 kalimat teknikal spesifik: sebutkan level support/resistance aktual, kondisi MA20 vs MA50, momentum RSI.",
  "analisisFundamental": "2 kalimat makro: PDB, inflasi, suku bunga BI, arus modal asing, dan implikasinya ke pasar.",
  "keunggulan": ["Poin positif spesifik 1", "Poin positif 2", "Poin positif 3"],
  "risiko": ["Risiko utama spesifik 1", "Risiko 2", "Risiko 3"],
  "katalis": ["Katalis positif jangka pendek yang konkret", "Katalis positif jangka menengah", "Risiko/katalis negatif yang perlu diwaspadai"],
  "targetBull": "Target optimis indeks jika skenario positif terjadi, misal: 8.200",
  "targetBear": "Target pesimis indeks jika skenario negatif terjadi, misal: 6.500",
  "rekomendasiSaham": ["KODE: nama saham — alasan singkat defensif", "KODE: nama saham — alasan singkat growth", "KODE: nama saham — alasan singkat dividen"]
}`

    : `Kamu adalah Senior Equity Analyst terkemuka di Indonesia dengan spesialisasi saham IDX, CFA charterholder, 20+ tahun pengalaman. Analisismu dikenal tajam, berbasis data, dan selalu profitable.

${emitenContext}

${priceContext}

Tugas: Buat laporan riset ekuitas mendalam untuk saham ${clean}.

ATURAN KETAT:
1. Field "namaLengkap" dan "sektor" HARUS menggunakan nilai dari DATA EMITEN TERVERIFIKASI jika tersedia
2. Semua harga target HARUS logis relatif terhadap harga saat ini (tidak boleh terlalu jauh)
3. scoreFundamental dan scoreTeknikal harus konsisten dengan analisis (jangan asal tinggi)
4. RSI dan posisi vs MA harus tercermin dalam analisis teknikal
5. JSON harus valid sempurna

Jawab HANYA JSON valid tanpa markdown, tanpa komentar:
{
  "namaLengkap": "${namaResmi || 'nama perusahaan lengkap resmi'}",
  "sektor": "${sektorResmi ? sektorResmi + (subsektor ? ' — ' + subsektor : '') : 'sektor IDX-IC yang tepat'}",
  "summary": "Narasi 4-5 kalimat: bisnis utama, kinerja keuangan terkini, posisi kompetitif, kondisi teknikal (sebutkan harga, MA, RSI). Spesifik dan berbasis data.",
  "sentiment": "BELI atau TAHAN atau JUAL",
  "rekomendasi": "3 kalimat aksi konkret: (1) aksi yang disarankan, (2) zona beli ideal dengan harga spesifik, (3) manajemen risiko dengan stop loss.",
  "priceEst": "Range harga wajar berdasarkan metode DCF/PER, misal: Rp 9.500 - Rp 10.800",
  "pe": "P/E aktual vs rata-rata industri, misal: 18.5x (rata-rata industri: 22x — diskon 16%)",
  "pbv": "P/BV aktual dengan konteks ROE, misal: 3.2x (ROE 18% → wajar di 3-4x)",
  "divYield": "Dividend yield dan track record, misal: 4.2% (konsisten 5 tahun terakhir)",
  "beta": "Estimasi beta numerik vs IHSG, misal: 0.85",
  "analisisTeknikal": "3 kalimat teknikal: (1) tren dan posisi vs MA20/MA50, (2) level support/resistance kunci dengan angka, (3) kondisi RSI dan implikasinya.",
  "analisisFundamental": "3 kalimat fundamental: (1) pertumbuhan revenue/laba YoY, (2) margin dan ROE vs historis, (3) DER dan kesehatan neraca.",
  "posisiKompetitif": "2 kalimat: market share, keunggulan vs kompetitor utama (sebutkan nama kompetitor).",
  "keunggulan": ["Keunggulan kompetitif spesifik 1", "Keunggulan 2", "Keunggulan 3", "Keunggulan 4"],
  "risiko": ["Risiko bisnis/regulasi spesifik 1", "Risiko 2", "Risiko 3"],
  "katalis": ["Katalis positif jangka pendek (1-3 bulan) yang konkret", "Katalis positif jangka panjang (6-12 bulan)", "Potensi risiko mendatang yang perlu dipantau"],
  "targetHarga": "Target harga 12 bulan dengan angka spesifik, misal: Rp 10.500",
  "stopLoss": "Level stop loss dengan angka spesifik, misal: Rp 8.200",
  "levelBeli": "Zona beli ideal dengan range harga, misal: Rp 8.800 - Rp 9.200",
  "scoreFundamental": "Angka 1-10 lalu dash lalu penjelasan singkat, misal: 8 — ROE tinggi, DER rendah, pertumbuhan laba konsisten",
  "scoreTeknikal": "Angka 1-10 lalu dash lalu penjelasan singkat, misal: 6 — Di atas MA20 tapi RSI mendekati overbought"
}`;

  // ── 4. Panggil Groq API ───────────────────────────────────────────
  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 2500,
        temperature: 0.3,   // lebih rendah → lebih konsisten & faktual
        messages: [
          {
            role: 'system',
            content: `Kamu adalah Senior Equity Analyst Indonesia terkemuka. 
ATURAN ABSOLUT:
1. Jawab HANYA dengan JSON valid — tidak ada teks, markdown, atau komentar di luar JSON
2. Tidak ada trailing comma di JSON
3. Semua angka harga harus logis dan konsisten dengan data yang diberikan
4. Field namaLengkap dan sektor WAJIB sesuai instruksi (jangan ubah jika sudah diberikan)
5. Jangan gunakan placeholder seperti "X" atau "..." — isi semua field dengan nilai nyata`
          },
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!groqRes.ok) {
      const errBody = await groqRes.json().catch(() => ({}));
      return res.status(502).json({ error: errBody.error?.message || `Groq API error ${groqRes.status}` });
    }

    const body = await groqRes.json();
    const raw  = body.choices?.[0]?.message?.content;
    if (!raw) return res.status(502).json({ error: 'Tidak ada respons dari AI. Coba lagi.' });

    // Bersihkan output AI — kadang model masih wrap dengan ```
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Coba parse ulang setelah strip karakter aneh
      try {
        const stripped = cleaned.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ');
        parsed = JSON.parse(stripped);
      } catch {
        console.error('JSON parse error:', cleaned.slice(0, 400));
        return res.status(502).json({ error: 'Format respons AI tidak valid. Coba lagi.' });
      }
    }

    // Override namaLengkap & sektor dari DB jika ada — jangan biarkan AI mengarang
    if (emitenInfo) {
      parsed.namaLengkap = namaResmi;
      parsed.sektor      = sektorResmi + (subsektor ? ' — ' + subsektor : '');
    }

    if (priceData) {
      parsed.priceData = priceData;
    }

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: err.message || 'Terjadi kesalahan server' });
  }
}
