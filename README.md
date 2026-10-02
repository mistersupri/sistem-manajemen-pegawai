# SIMPEG: Sistem Manajemen Pegawai dan Absensi

Aplikasi web untuk data pegawai, absensi (wajah, kiosk, dinas luar, mesin absensi, input petugas), jadwal kerja, koreksi, cuti/izin, dan laporan. Dibangun sesuai PRD SIMPEG.

- Next.js 16 (App Router) + TypeScript, Tailwind CSS v4 + shadcn/ui
- PostgreSQL 16 + Prisma 7
- Docker Compose untuk produksi; Vitest dan Playwright untuk pengujian

Tidak ada modul dokumen pegawai. Tidak memakai Firebase/Supabase atau API berbayar.

## Modul

| Modul | Isi |
|---|---|
| Dashboard | Ringkasan per peran: admin (hari ini, tren 7 sampai 92 hari dengan filter unit dan status kepegawaian, pengajuan menunggu, status perangkat), pegawai (jadwal dan absensi hari ini, saldo cuti). |
| Data Pegawai | CRUD, tab profil/penempatan/absensi/jadwal/riwayat, riwayat jabatan dan unit, pendaftaran wajah, nonaktif dengan tanggal efektif (soft delete), impor Excel/CSV dengan pratinjau, ekspor Excel/CSV (NIK hanya untuk izin data sensitif, tercatat di audit). |
| Absensi | Absen wajah mandiri, kiosk wajah, titik absen wajah tanpa login (tautan/QR untuk tablet atau ponsel), dinas luar (foto, waktu server, GPS) di halaman tersendiri `/dinas-luar`, input manual petugas, monitoring harian, rekapitulasi per pegawai, kalender bulanan (pegawai x tanggal) dan detail harian dengan telusur ke transaksi sumber, ekspor Excel (termasuk kalender)/CSV/PDF. |
| Koreksi | Pengajuan pegawai, koreksi oleh petugas, persetujuan; nilai awal dan nilai hasil tersimpan. |
| Perangkat | Adapter per merek (mock, Solution X302 via SOAP, impor berkas USB P280), sinkronisasi terjadwal/manual dengan retry, rekonsiliasi, log raw event immutable, pemetaan ID mesin. |
| Jadwal Kerja | Jenis jadwal berversi, penugasan tetap/sementara ke pegawai atau unit, atur banyak pegawai sekaligus (satu shift, libur, atau kembali ke shift default pada rentang tanggal, bisa hanya hari tertentu), kalender bulanan dengan ubah harian, hari libur nasional dan cuti bersama yang diperbarui otomatis tiap hari (atau impor .ics/.csv bila server tanpa internet). |
| Cuti & Izin | Jenis cuti dapat diatur, saldo tahunan, persetujuan 1 atau 2 tahap (atasan, admin kepegawaian), kalender, pembatalan. |
| Notifikasi | Notifikasi dalam aplikasi; saluran WhatsApp/email bisa ditambahkan sebagai konfigurasi opsional (`registerChannel`). |
| Pengaturan | Unit kerja (pohon), pengguna dan peran dengan cakupan unit, izin per peran, aturan absensi, metode absensi dan ambang wajah, retensi dan privasi, logo, audit log. |

Peran bawaan: Super Admin, Admin Kepegawaian, Admin IT/Perangkat, Pimpinan/Approver, Operator Unit, Pegawai, Auditor. Izin tiap peran bisa diubah; cakupan unit diberikan per penugasan peran.

## Menjalankan dengan Docker

```bash
cp .env.example .env
# isi POSTGRES_PASSWORD, APP_SECRET (openssl rand -base64 48),
# BIOMETRIC_ENCRYPTION_KEY (openssl rand -base64 32), ADMIN_PASSWORD
docker compose up -d --build
```

Layanan `migrate` menjalankan migrasi skema dan membuat peran serta akun Super Admin pertama, lalu `app` berjalan di port `APP_PORT` (bawaan 3000). Health check: `GET /api/health`.

Lupa password admin atau akun terkunci: isi `ADMIN_USERNAME`/`ADMIN_PASSWORD` di `.env`, lalu `docker compose run --rm migrate npx tsx scripts/reset-admin.ts`.

Pasang aplikasi di belakang reverse proxy HTTPS (kamera dan GPS di browser hanya bekerja lewat HTTPS atau localhost) dan biarkan `COOKIE_SECURE=1`.

**Simpan `BIOMETRIC_ENCRYPTION_KEY` terpisah dari backup.** Tanpa kunci ini template wajah, NIK, secret perangkat, dan secret MFA tidak bisa dibuka.

## Pengembangan lokal

Butuh Node.js 22.13+. PostgreSQL tidak perlu diinstal.

```bash
npm install
npm run dev:local
```

`dev:local` menjalankan PostgreSQL 16 lokal dari paket npm `embedded-postgres` (Windows, macOS, Linux) di port 54329, data di folder `.local-db/`. Saat pertama kali, perintah ini:

1. membuat `.env` bila belum ada (atau melengkapi isian yang kosong) dengan `DATABASE_URL` lokal dan rahasia acak;
2. menyiapkan database dan menerapkan migrasi;
3. mengisi data demo bertanda "(demo)".

Setelah itu buka http://localhost:3000. Akun untuk masuk ditampilkan di terminal: `superadmin` / `Demo#2026` (akun demo), dan akun `ADMIN_USERNAME`/`ADMIN_PASSWORD` bila diisi di `.env`. Akun dari `.env` dibuat setiap kali aplikasi dijalankan bila username itu belum ada; mengganti password akun yang sudah ada dilakukan dengan `npm run admin:reset`. Ctrl+C menghentikan aplikasi dan database sekaligus; data tetap tersimpan untuk dijalankan lagi.

| Perintah | Fungsi |
|---|---|
| `npm run dev:local -- --tanpa-demo` | Tanpa data demo; password sementara Super Admin ditampilkan sekali |
| `npm run db:local` | Database lokal saja, mis. untuk `npm run dev` di terminal lain atau Prisma Studio |
| `npm run db:local -- --reset` | Hapus database lokal lalu buat ulang |
| `npm run admin:reset` | Terapkan `ADMIN_USERNAME`/`ADMIN_PASSWORD` dari `.env`: buat akun bila belum ada, atau ganti password, buka kunci, dan pastikan berperan Super Admin. `-- --hapus-mfa` juga melepas MFA. |

Database lokal hanya untuk pengembangan dan uji coba. Untuk produksi pakai Docker Compose atau PostgreSQL sendiri: isi `DATABASE_URL` di `.env`, lalu `npm run db:deploy` dan `npm run db:seed`.

Akun demo (password `Demo#2026`): `superadmin`, `kepegawaian`, `admin.it`, `pimpinan`, `kabid.a`, `operator.b`, `pegawai`, `auditor`. Data demo fiktif dan tidak boleh dipakai di produksi; tanpa `SEED_DEMO=1` seed hanya membuat peran dan akun Super Admin dari `ADMIN_USERNAME`/`ADMIN_PASSWORD`.

| Perintah | Fungsi |
|---|---|
| `npm run dev` / `build` / `start` | Server pengembangan, build produksi, jalankan build |
| `npm run lint` / `typecheck` | ESLint, TypeScript |
| `npm run db:migrate` | Buat migrasi baru dari perubahan skema (pengembangan) |
| `npm run db:deploy` / `db:seed` | Terapkan migrasi / seed |
| `npm run migrate:sqlite -- --sqlite data/absensi.db` | Pindahkan data aplikasi absensi lama, lihat [docs/MIGRASI.md](docs/MIGRASI.md) |
| `npm run perangkat:cek -- --ip 192.168.1.201 --key 0` | Diagnosa koneksi mesin X302 (tanpa database), lihat [docs/PANDUAN-X302.md](docs/PANDUAN-X302.md) |
| `npm test` | Unit + integration test (butuh database uji, lihat di bawah) |
| `npm run test:e2e` | Playwright terhadap aplikasi yang berjalan dengan data demo |

## Pengujian

- **Unit** (`tests/unit`, `npm run test:unit`, tanpa database): mesin perhitungan absensi (jadwal, shift malam, keterlambatan, tanggal kerja) dan adapter X302 terhadap simulator respons mesin.
- **Integration** (`tests/integration`): RBAC dan kebocoran data antar unit, login dan penguncian akun, impor valid/duplikat/salah, sinkronisasi ulang tanpa duplikat, perangkat offline, secret perangkat tidak terkirim, koreksi dengan nilai awal dan audit, cuti berjenjang, idempotensi absensi wajah, imutabilitas audit log dan raw event. Memakai database terpisah `TEST_DATABASE_URL` (bawaan `postgresql://postgres@127.0.0.1:5433/simpeg_test`) yang dikosongkan setiap file tes.
- **E2E** (`tests/e2e`): login, tambah/ubah/nonaktifkan pegawai, input manual, koreksi, persetujuan cuti, ekspor rekap. Jalankan terhadap aplikasi berdata demo: `BASE_URL=http://127.0.0.1:3000 npm run test:e2e`.

## Dokumentasi

- [docs/ARSITEKTUR.md](docs/ARSITEKTUR.md): struktur kode, alur data absensi, keputusan teknis
- [docs/API.md](docs/API.md): REST API `/api/v1`
- [docs/PANDUAN-X302.md](docs/PANDUAN-X302.md): langkah integrasi mesin Solution X302 lewat LAN
- [docs/PERANGKAT.md](docs/PERANGKAT.md): adapter mesin absensi, jaringan, menambah merek baru
- [docs/BIOMETRIK.md](docs/BIOMETRIK.md): pengenalan wajah, kalibrasi ambang, batasan
- [docs/KEAMANAN.md](docs/KEAMANAN.md): keamanan, privasi, backup dan pemulihan
- [docs/MIGRASI.md](docs/MIGRASI.md): migrasi dari aplikasi absensi lama (SQLite)
- [DESIGN.md](DESIGN.md): arah desain antarmuka
