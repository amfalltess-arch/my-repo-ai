# Deploy ke Netlify

## Kenapa muncul "Page not found"
Deploy sebelumnya (`deploy_source: api`, 143 file, *framework: none*, *no functions*) hanya meng-upload
**source mentah** tanpa build. Netlify jadi tidak menemukan `index.html` → 404.
Next.js harus di-**build** oleh Netlify (Git) atau lewat CLI dengan `--build`.

## Arsitektur
Sama seperti Vercel: web + API di Netlify, **worker (FFmpeg/Whisper/yt-dlp) wajib di VPS/Railway/Fly**
(`Dockerfile.worker`), Postgres + Redis (TCP) + bucket R2/S3 di luar Netlify.
Lihat `DEPLOY-VERCEL.md` bagian 1–3 dan 5 (langkahnya sama, ganti "Vercel" jadi "Netlify").

## Cara deploy (pilih satu)
**A. Via Git (disarankan)**
1. Push project ke GitHub/GitLab.
2. Netlify → *Add new project → Import from Git*. Build command `npm run build` (sudah ada di `netlify.toml`).

**B. Via CLI (situs `starlit-youtiao-e006ab` yang sudah ada)**
```bash
npm install
npx netlify-cli login
npx netlify-cli link --id 3e62261e-e821-460c-b35d-27f2a8848b01
npx netlify-cli deploy --build --prod
```

## Environment variables
Site configuration → Environment variables. Isi seperti `.env.example`
(`DATABASE_URL` pooled, `REDIS_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`, `STORAGE_PROVIDER=r2|s3`, `S3_*`,
`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_URL`, `GEMINI_API_KEY`, dst).
Tambahkan juga `SERVERLESS=true` (jaga-jaga kalau platform tidak terdeteksi otomatis).
Buat tabel database sekali: `DATABASE_URL="<url direct>" npx prisma db push`.

## Catatan Netlify
- Function sinkron default **10 detik** (paid bisa 26 detik). Progress realtime (SSE) menutup diri tiap ±8 detik dan
  browser reconnect otomatis; ubah dengan `SSE_MAX_LIFETIME_SEC`.
- Upload video langsung ke R2/S3 (presigned URL) — pastikan CORS bucket mengizinkan `PUT` dari domain Netlify.
- Deploy non-production di situs ini dilindungi login SSO tim (`Make public` di screenshot = buka akses publik).
- Tidak ada `pg_dump` / ffprobe / yt-dlp di Netlify (backup DB via provider, durasi video dicek worker).
- Kalau build gagal karena `secrets scanning`, tambahkan nama variabelnya ke `SECRETS_SCAN_OMIT_KEYS` di `netlify.toml`.

Langkah lewat HP (Termius + VPS): lihat `DEPLOY-TERMIUS.md`.
