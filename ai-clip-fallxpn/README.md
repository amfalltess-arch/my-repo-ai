> **Deploy ke Vercel:** lihat [DEPLOY-VERCEL.md](./DEPLOY-VERCEL.md).

# AI ClipFlow

Platform AI video clipper: masukkan satu video panjang (upload atau URL YouTube), AI mencari momen-momen terbaik, lalu menghasilkan puluhan clip vertikal siap posting — lengkap dengan auto-crop 9:16, subtitle otomatis, judul/deskripsi/hashtag AI, dan auto-publish ke TikTok lewat API resmi.

## Status proyek: Fase 1, 2, dan 3 selesai

Spesifikasi awal untuk proyek ini setara dengan platform SaaS penuh (57 bagian). Ini dibangun bertahap lewat beberapa sesi — semua 3 fase yang direncanakan sudah selesai, tapi tetap baca bagian "PENTING" di bawah karena kode ini belum pernah benar-benar dikompilasi/dijalankan.

### Fase 1 — Fondasi & mesin inti
Auth, upload/YouTube ingestion, AI provider (Gemini + Custom, API asli), pipeline FFmpeg lengkap (crop/subtitle/silence-removal/audio), Whisper, duplicate detection, storage abstraction, integrasi TikTok resmi (OAuth + Content Posting API + scheduler), 12 BullMQ worker, semua API routes inti, UI inti (Dashboard/Create/Results/Editor/TikTok/Scheduler/Templates), unit test dasar, Docker.

### Fase 2 — Admin Panel (spec section 29-34)
- `/admin` — Dashboard (statistik sistem), Users (edit limit per user: max video/generation, max durasi, max upload, limit harian, concurrent jobs), AI Providers (Gemini + Custom AI lewat UI dengan Test Connection & Fetch Models, API key terenkripsi dan tidak pernah dikirim balik ke browser), Templates (template global), Generation Defaults (default & maksimum video per batch, durasi clip, aspect ratio, subtitle), Queue (live job count 12 BullMQ queue), Logs (audit log terpaginasi), Storage (info read-only provider aktif), Backup (pg_dump + export konfigurasi, API key tetap terenkripsi di backup).
- `getAIProvider()` dan endpoint create-generation kini membaca setting dari database dulu (diatur admin), baru fallback ke `.env` — jadi Admin Panel ini benar-benar mengubah perilaku aplikasi, bukan sekadar tampilan.

### Fase 3 — Bulk edit, regenerate, test, deployment hardening (spec section 46-47, 54, 57)
- Bulk Edit (section 46): pilih banyak clip di halaman Results, lalu ubah hashtag/deskripsi/subtitle style/template sekaligus untuk semua yang dipilih.
- Regenerate (section 47): New Highlight / Title / Description / Hashtags / Caption / Subtitle. Field teks tampil sebagai preview dan baru ditulis ke database setelah user menekan Confirm (sesuai aturan "jangan menghapus original sebelum user mengonfirmasi"). New Highlight memilih momen terbaik berikutnya yang belum dipakai clip lain lalu re-render lewat pipeline yang sama; New Subtitle re-render lewat worker yang sama.
- Test tambahan (validasi Zod cross-field) dan CI (`.github/workflows/ci.yml`) yang otomatis menjalankan typecheck/lint/test/build plus migrasi database di setiap push.

### Masih belum ada (item kecil yang jujur belum sempat — silakan lanjutkan sendiri atau minta lagi)
- Admin belum punya browser lintas-user untuk Videos/Generations (baru agregat di Dashboard)
- Subtitle position default masih di level style, belum granular per-pixel safe-area
- Belum ada UI khusus admin untuk TikTok app-level config (`TIKTOK_CLIENT_KEY`/`SECRET` masih lewat `.env`, sengaja dipisah dari per-user API key karena beda level sensitivitas)
- Test yang ada murni unit test untuk pure function; belum ada integration test yang benar-benar memutar Postgres+Redis+worker
- Belum ada adaptasi khusus Vercel/Netlify serverless untuk tier non-FFmpeg (worker tetap wajib VPS/container di semua skenario)

## PENTING — batasan yang jujur harus diketahui

1. **Belum pernah dijalankan `npm install`/`build`/`test` secara nyata.** Sandbox tempat kode ini ditulis tidak punya akses network sama sekali (terverifikasi: request ke npm registry pun ditolak). Jadi kode ini ditulis dengan hati-hati dan konsisten, tapi **Anda wajib menjalankan** `npm install && npm run typecheck && npm run lint && npm test && npm run build` setelah download, sesuai permintaan Anda di poin 57 — dan memperbaiki apa pun yang muncul.
2. **Model Gemini** di `.env.example` (`gemini-flash-latest`) adalah nama alias yang masuk akal per riset saat ini — cek [daftar model resmi](https://ai.google.dev/gemini-api/docs/models) sebelum deploy karena nama model berubah dari waktu ke waktu.
3. **TikTok API**: sebelum app Anda lolos audit TikTok, SEMUA post otomatis jadi privat (`SELF_ONLY`) — ini aturan platform TikTok, bukan bug. UI/log akan menunjukkan ini. `TIKTOK_REDIRECT_URI` juga wajib HTTPS (bukan localhost) — pakai tunnel (Cloudflare Tunnel/ngrok) untuk development.
4. **Mengunduh video dari YouTube** berada di area abu-abu ToS YouTube meski uploader mengizinkan reuse. Fitur upload file tetap jalur utama; URL YouTube adalah kenyamanan tambahan dengan atestasi hak cipta eksplisit dari user (`rightsConfirmed`).
5. **Topologi worker**: semua 12 worker berjalan dalam satu proses (`npm run worker`) yang berbagi satu direktori kerja lokal. Ini sengaja sederhana untuk satu VPS. Untuk scale horizontal ke banyak mesin worker, mount shared filesystem di `WORKER_TMP_DIR` atau ubah setiap stage supaya round-trip lewat storage driver (S3/R2/MinIO) — lihat komentar di `src/lib/queue/worker-entry.ts`.
6. **Whisper**: modul di `src/lib/transcription/whisper.ts` mendukung HTTP service (`WHISPER_SERVICE_URL`, direkomendasikan) atau binary CLI lokal (`WHISPER_BINARY_PATH`). Anda perlu menjalankan salah satunya sendiri — tidak dibundel di image worker secara default (image worker hanya install `ffmpeg` + `yt-dlp`).

## Arsitektur

```mermaid
flowchart LR
    User[Browser] --> Next[Next.js App\n(UI + API routes)]
    Next --> DB[(PostgreSQL)]
    Next --> Redis[(Redis)]
    Redis --> Worker[Worker Process\nBullMQ x12 queues]
    Worker --> FFmpeg[FFmpeg / Whisper / yt-dlp]
    Worker --> AI[Gemini / Custom AI]
    Worker --> Storage[(Local / S3 / R2 / MinIO)]
    Worker --> TikTok[TikTok Content Posting API]
    Next -.SSE.-> User
```

Pipeline pemrosesan (satu per clip kecuali disebutkan lain): `video-analysis` → `transcription` (per video) → `highlight-detection` (per video, generate N Clip) → `clip-generation` → `auto-edit` → `subtitle-generation` → `render-video` → `metadata-generation` (per batch) → publish opsional: `tiktok-upload` → `tiktok-publish` → `tiktok-status`.

## Menjalankan secara lokal

### Prasyarat
- Node.js ≥ 20.9
- Docker (untuk Postgres + Redis, atau install manual)
- `ffmpeg` dan `yt-dlp` terinstal di PATH untuk worker
- Salah satu: layanan Whisper (self-hosted faster-whisper server) atau binary `whisper`/`whisper.cpp`

### Langkah

```bash
# 1. Install dependencies
npm install

# 2. Salin dan isi environment variables
cp .env.example .env
# minimal wajib diisi: DATABASE_URL, REDIS_URL, SESSION_SECRET, ENCRYPTION_KEY, GEMINI_API_KEY

# 3. Jalankan Postgres + Redis (kalau belum ada)
docker compose up -d postgres redis

# 4. Migrasi database
npx prisma migrate dev --name init

# 5. Verifikasi kualitas kode (sesuai permintaan: jalankan semua ini)
npm run typecheck
npm run lint
npm test
npm run build

# 6. Jalankan app (terminal 1)
npm run dev

# 7. Jalankan worker (terminal 2) — WAJIB terpisah, jangan skip
npm run worker
```

Buka `http://localhost:3000`. Akun pertama yang register otomatis jadi ADMIN.

### Menghasilkan `SESSION_SECRET` dan `ENCRYPTION_KEY`
```bash
openssl rand -hex 32
```

### Menghubungkan TikTok
1. Daftar app di https://developers.tiktok.com, aktifkan produk **Login Kit** dan **Content Posting API**.
2. Minta scope: `user.info.basic`, `video.upload`, `video.publish`.
3. Isi `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI` (harus HTTPS) di `.env`.
4. Buka halaman **TikTok** di app → Connect.

## Deployment produksi

- **App (Next.js)**: image `Dockerfile` di-deploy ke Vercel/Netlify/VPS/Docker apa pun yang mendukung Next.js standalone output.
- **Worker**: WAJIB proses/container terpisah dengan CPU cukup (FFmpeg berat) — VPS atau Docker, **jangan** serverless function (lihat komentar di `next.config.ts` dan `worker-entry.ts`).
- Gunakan `docker-compose.yml` sebagai referensi topologi (app, worker, Postgres, Redis terpisah).
- Set `STORAGE_PROVIDER=s3` (atau `r2`/`minio`) di produksi — driver `local` cuma untuk dev satu-mesin.

## Struktur proyek

```
src/
  app/                # Next.js App Router — pages & API routes
    admin/             # Admin Panel UI (Fase 2) — requireAdmin-gated
    api/admin/          # Admin Panel API routes
  components/          # UI primitives (ui/) & feature components (features/)
  lib/
    ai/                # AIProvider abstraction (Gemini + Custom)
    auth/              # Password hashing, JWT, session
    ffmpeg/            # Semua logic FFmpeg (crop, subtitle, render, silence removal)
    highlight/          # Duplicate detection & highlight orchestration
    queue/               # BullMQ queues + 12 workers + worker-entry.ts
    regenerate/           # Regenerate preview/confirm logic (Fase 3)
    security/             # Encryption, validation, rate limit, SSRF guard
    settings/              # Admin-configurable generation defaults
    storage/                # local / S3-compatible driver
    template/               # {{variable}} rendering engine
    tiktok/                 # OAuth, Content Posting API, scheduler
    transcription/          # Whisper client
    youtube/                # yt-dlp metadata + download
  middleware.ts        # Edge auth gate
prisma/schema.prisma   # 16 model database
tests/                 # Unit test (vitest)
.github/workflows/     # CI: typecheck, lint, test, build on every push

## Roadmap yang tersisa

Semua 3 fase yang direncanakan sudah dibangun. Item yang jujur belum sempat ada di daftar "Masih belum ada" di bagian Status di atas — balas di percakapan yang sama kalau ingin saya lanjutkan salah satunya (misalnya integration test end-to-end, atau admin browser lintas-user untuk Videos/Generations).
