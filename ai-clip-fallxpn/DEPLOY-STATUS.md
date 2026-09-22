# ai-clip-fallxpn

Build produksi berhasil; 34 tes lulus. HTTP lokal: / mengarah ke /login,
/login dan /register memberikan HTTP 200. Deployment publik belum selesai:
Vercel meminta login, Netlify belum login. DATABASE_URL belum disediakan,
sehingga autentikasi dan pemrosesan video belum diuji end-to-end.

## Perubahan
- Memperbaiki tujuh error TypeScript di enam file (Prisma relations, nullable capture,
  Error.cause override, frame rate, JSON processing result, dan upload body).
- Menyertakan package-lock.json agar versi dependency build dapat direproduksi.
- Netlify publish directory ditetapkan ke `.next`.
- Nama package menjadi `ai-clip-fallxpn`.
- Script deploy Netlify menjalankan build sebelum upload.

## Netlify
Jalankan dari folder yang berisi package.json:

```sh
npm install
npx netlify-cli login
npx netlify-cli sites:create --name ai-clip-fallxpn
npm run deploy:netlify
```

Jika nama sudah digunakan, hubungkan site milikmu dengan `npx netlify-cli link`.
Jangan unggah ZIP source ke Netlify Drop. Next.js memerlukan adapter server.
Jika melalui Git, Base directory harus menunjuk folder berisi package.json;
build command `npm run build`, publish directory `.next`.

## Vercel
```sh
npm install
npx vercel login
npx vercel link --project ai-clip-fallxpn
npm run deploy:vercel
```

Gunakan framework Next.js dan output directory bawaan.

## Backend
Isi environment variables sesuai .env.example di hosting.
Login memerlukan PostgreSQL dengan tabel yang sudah dibuat dan SESSION_SECRET
acak minimal 32 karakter. prisma generate tidak membuat tabel database.
Ikuti panduan database di DEPLOY-VERCEL.md untuk database baru.
Pemrosesan video memerlukan Redis, bucket S3/R2, dan worker terpisah.
Jangan menganggap aplikasi lengkap berfungsi hanya karena halaman login terbuka.

## Verifikasi setelah deploy
Buka URL yang benar-benar dikembalikan platform: / harus menuju /login,
/login harus terbuka, lalu uji register/login dan satu proses video.
Nama/domain belum dipesan dan belum diverifikasi tersedia.
