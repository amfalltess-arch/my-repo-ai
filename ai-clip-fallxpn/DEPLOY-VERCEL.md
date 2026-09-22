# Deploy ke Vercel

## Arsitektur

| Bagian | Jalan di | Alasan |
|---|---|---|
| Web app + API (Next.js) | **Vercel** | serverless |
| Worker (FFmpeg, Whisper, yt-dlp, TikTok) | **VPS / Railway / Fly / Render** (`Dockerfile.worker`) | Vercel tidak bisa jalanin proses lama + FFmpeg |
| Postgres | Neon / Supabase / Vercel Marketplace | |
| Redis (BullMQ) | Upstash (TCP) / Redis Cloud / Railway | web & worker harus pakai Redis yang **sama** |
| Storage | Cloudflare R2 / S3 | web & worker harus pakai bucket yang **sama** |

Tanpa worker, upload dan generate akan masuk antrean tapi tidak pernah diproses.

## 1. Siapkan layanan
1. Buat database Postgres → ambil URL **pooled** (untuk Vercel) dan URL **direct** (untuk migrasi).
2. Buat Redis → URL `rediss://...` (TCP, bukan REST).
3. Buat bucket R2/S3 + access key.
4. CORS bucket (agar browser bisa upload langsung):
```json
[{
  "AllowedOrigins": ["https://NAMA-APP.vercel.app"],
  "AllowedMethods": ["PUT", "GET", "HEAD"],
  "AllowedHeaders": ["*"],
  "MaxAgeSeconds": 3600
}]
```

## 2. Buat tabel database (sekali saja, dari laptop)
Repo ini belum punya folder `prisma/migrations`, jadi tabel dibuat dengan `db push`:
```bash
npm install
DATABASE_URL="<URL direct, bukan pooled>" npx prisma db push
```

## 3. Environment Variables di Vercel
Isi semua dari `.env.example`. Minimal:
`DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY` (`openssl rand -hex 32`),
`STORAGE_PROVIDER` (`r2`/`s3`), `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`,
`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_URL`, `AI_PROVIDER` + `GEMINI_API_KEY`,
`TIKTOK_CLIENT_KEY/SECRET/REDIRECT_URI` (kalau pakai TikTok).

## 4. Deploy
Push ke Git lalu import di Vercel (Framework: Next.js, build command otomatis `npm run build`).

## 5. Jalankan worker
Di VPS/Railway/Fly, build `Dockerfile.worker` dengan env yang **sama** (`DATABASE_URL`, `REDIS_URL`, `S3_*`, `ENCRYPTION_KEY`, AI keys).
Pakai `STORAGE_PROVIDER=r2/s3` juga di worker.

## Perubahan agar jalan di Vercel
- `next.config.ts`: hapus opsi `eslint` (dihapus di Next 16), `standalone` hanya di Docker.
- Redis & queue BullMQ dibuat *lazy* (tidak konek saat build).
- Upload video langsung dari browser ke R2/S3 (presigned URL); limit body Vercel hanya 4,5 MB.
- Probe durasi + limit durasi user dipindah ke worker (tidak ada ffprobe di Vercel).
- Import YouTube di Vercel pakai oEmbed (tidak ada yt-dlp di Vercel).
- Halaman `/dashboard` sebelumnya tidak ada (404 setelah login) → redirect ke `/create`.
- `/tiktok` dibungkus `Suspense` (`useSearchParams` bikin build gagal).
- SSE progress menutup diri sebelum batas durasi function; browser reconnect otomatis.
- Prisma `binaryTargets` + `rhel-openssl-3.0.x`; `build` = `prisma generate && next build`.

## Batasan di Vercel
- Backup DB via `pg_dump` tidak tersedia (pakai backup dari provider DB).
- Durasi video YouTube baru diketahui setelah worker mulai memproses.
