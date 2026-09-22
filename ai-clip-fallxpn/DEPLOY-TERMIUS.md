# Jalankan lewat Termius (web di Netlify + worker di VPS)

Termius hanya SSH client. Yang dijalankan adalah **VPS** (Ubuntu 22/24, disarankan RAM 4 GB+):
1. build + deploy web ke Netlify dari VPS, 2. menjalankan worker (FFmpeg/Whisper).

## 0. Siapkan dulu (di luar VPS)
- Postgres (Neon/Supabase), Redis TCP (`rediss://...`), bucket R2/S3. Semua harus bisa diakses dari internet.
- Netlify token: Netlify → User settings → Applications → *Personal access tokens* → New.

## 1. Sambung
Termius → New Host → IP VPS, user `root`, password/SSH key.

## 2. Install (sekali)
```bash
apt update && apt install -y unzip curl
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
curl -fsSL https://get.docker.com | sh
```

## 3. Upload project
Termius → tab **SFTP** → upload `ai-clipflow-netlify.zip` ke `/root`. Lalu:
```bash
cd /root && unzip ai-clipflow-netlify.zip && cd ai-clipflow
cp .env.example .env
nano .env
```
Isi `.env`: `DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY` (`openssl rand -hex 32`),
`STORAGE_PROVIDER=r2` (atau s3) + `S3_*`, `GEMINI_API_KEY`.
Simpan di nano: `Ctrl+O`, Enter, `Ctrl+X` (pakai tombol Ctrl di keyboard Termius).
Nilai ini harus **sama** dengan env variables di Netlify.

## 4. Buat tabel database (sekali)
```bash
npm install
npx prisma db push
```

## 5. Deploy web ke Netlify
```bash
export NETLIFY_AUTH_TOKEN="tempel-token-di-sini"
npx netlify-cli deploy --build --prod --site 3e62261e-e821-460c-b35d-27f2a8848b01
```
`--build` wajib, kalau tidak hasilnya 404 lagi. Isi juga env variables di Netlify
(termasuk `NEXT_PUBLIC_APP_URL` = `https://starlit-youtiao-e006ab.netlify.app`) sebelum perintah ini.

## 6. Jalankan worker (tetap hidup walau Termius ditutup)
```bash
docker compose -f docker-compose.worker.yml up -d --build
docker compose -f docker-compose.worker.yml logs -f
```
Log harus muncul: `AI ClipFlow worker started — 12 queues active.` (keluar dari log: `Ctrl+C`, worker tetap jalan).

## Perintah berguna
```bash
docker compose -f docker-compose.worker.yml restart     # restart worker
docker compose -f docker-compose.worker.yml down        # stop
git -C . status 2>/dev/null; cd /root/ai-clipflow       # kembali ke folder project
```
Update kode: upload zip baru, ulangi langkah 5 (web) dan `up -d --build` (worker).
