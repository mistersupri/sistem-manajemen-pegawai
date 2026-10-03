# Arsitektur

## Struktur kode

```
prisma/
  schema.prisma          model data
  migrations/            migrasi SQL (termasuk trigger imutabilitas dari prisma/sql/immutability.sql)
  seed.ts                peran/izin, Super Admin pertama, data demo (SEED_DEMO=1)
scripts/                 migrate-sqlite.ts, backup.sh, restore.sh
src/
  app/
    (public)/login       halaman masuk
    (account)/akun       ganti password, MFA (juga langkah wajib sebelum masuk aplikasi)
    (app)/...            halaman aplikasi dengan sidebar (server component)
    kiosk/               layar kiosk wajah
    api/v1/...           REST API (route handler tipis)
    api/health           health check
    face-assets/         model face-api.js disajikan dari node_modules
  components/ui          komponen shadcn/ui
  components/app         komponen aplikasi (form, tabel, kamera, grafik)
  lib/
    auth/                katalog izin, actor + cakupan unit, sesi, password, MFA
    attendance/          mesin perhitungan: engine.ts (fungsi murni), plan.ts (jadwal per tanggal), record.ts (susun rekap)
    biometric/           pencocokan wajah, enkripsi template
    devices/             adapter mesin absensi, parser berkas
    services/            logika bisnis per modul (dipanggil API dan halaman)
    api.ts               pembungkus route: sesi, izin, CSRF, rate limit, format galat
    audit.ts, logger.ts  audit log dan log JSON dengan penyamaran
tests/unit, tests/integration, tests/e2e
```

Halaman server memanggil `lib/services` langsung; komponen klien memanggil REST API. Keduanya melewati pemeriksaan izin yang sama di lapisan layanan.

## Alur data absensi

```
Wajah / kiosk / dinas luar / input petugas ─► AttendanceEvent + AttendanceVerification  (immutable, termasuk yang gagal)
Mesin absensi (tarik / impor berkas)        ─► DeviceSyncRun ─► DeviceRawEvent         (immutable, dedup per kunci idempotensi)
                                                        │
Jadwal (penugasan + revisi) + hari libur ──────────────►│
Koreksi disetujui (nilai awal + nilai hasil) ──────────►├─► rebuildRecord ─► AttendanceRecord (satu per pegawai per tanggal kerja)
Cuti/izin disetujui ───────────────────────────────────►│
```

- **AttendanceRecord adalah hasil hitung**, bukan sumber kebenaran. Ia bisa disusun ulang kapan saja dari sumber (`rebuildRecord`, `rebuildRange`, tombol "Hitung ulang"). Setiap rekap mencatat transaksi sumber masuk/pulang dan versi aturan jadwal yang dipakai, dan halaman telusur menampilkan semuanya.
- **Tanggal kerja** ditentukan saat transaksi masuk: scan sebelum batas pulang shift malam kemarin (jam pulang + `rules.checkoutGraceHours`) milik tanggal kemarin.
- **Status**: Hadir, Terlambat, Dinas Luar, Izin, Sakit, Cuti, Tidak Hadir (hanya bila ditetapkan petugas lewat koreksi), dan **Belum ada transaksi**. Hari kerja tanpa transaksi tidak otomatis menjadi "tidak hadir"; keputusan itu milik petugas.
- **Jadwal**: prioritas penugasan sementara pegawai > sementara unit > tetap pegawai > tetap unit (unit terdekat dulu). Perubahan aturan jadwal membuat revisi baru; rekap lama tetap menunjuk revisi yang dipakai saat dihitung.

## Keputusan teknis

| Keputusan | Alasan |
|---|---|
| Next.js full-stack, bukan backend terpisah | Satu codebase TypeScript, satu image Docker; API tetap tersedia di `/api/v1` untuk integrasi. |
| Prisma + PostgreSQL, trigger untuk imutabilitas | Jaminan "tidak bisa diubah" berlaku juga untuk akses SQL langsung, bukan hanya lewat aplikasi. |
| **Tanpa Redis/BullMQ** | Pekerjaan latar hanya dua: sinkronisasi perangkat terjadwal (tiap menit dicek) dan pembersihan foto (tiap jam). Keduanya berjalan di proses aplikasi lewat `instrumentation.ts` (`src/lib/scheduler.ts`). Untuk satu instance ini cukup dan mengurangi komponen yang harus dirawat. |
| Rate limit di memori | Konsekuensi dari keputusan di atas. |
| Pencocokan wajah di server dengan descriptor dari browser | Tidak butuh GPU/model di server dan tidak mengirim foto. Batasannya dijelaskan di [BIOMETRIK.md](BIOMETRIK.md). Provider bisa diganti lewat interface `FaceMatcher`. |
| Penyimpanan berkas di disk lokal (`STORAGE_DIR`, volume Docker) | Volume kecil (foto dinas luar, lampiran, logo). Bisa dipindah ke object storage dengan mengganti `src/lib/storage.ts`. |

### Bila perlu lebih dari satu instance

1. Jalankan scheduler hanya di satu instance: set `DISABLE_SCHEDULER=1` di instance lain.
2. Pindahkan rate limit ke penyimpanan bersama (Redis atau tabel PostgreSQL) di `src/lib/rate-limit.ts`.
3. Pakai penyimpanan berkas bersama (NFS atau object storage).
4. Sesi sudah di database, jadi tidak perlu sticky session.

## Hari libur nasional

`src/lib/services/holidays.ts`. Penjadwal memeriksa tiap jam dan menarik daftar tahun berjalan dan tahun depan paling sering sekali per 20 jam (3 jam bila gagal) dari sumber gratis tanpa kunci API, berurutan: dayoffapi.vercel.app, libur.deno.dev, lalu Nager.Date (hanya libur nasional, tanpa cuti bersama). Daftar dengan kurang dari 8 tanggal dianggap rusak dan sumber berikutnya dicoba.

- Libur yang diisi petugas (`source = MANUAL`) tidak pernah ditimpa; libur otomatis yang dinonaktifkan tetap nonaktif.
- Libur otomatis yang hilang dari daftar terbaru (mis. cuti bersama dibatalkan) dihapus, lalu rekap tanggal yang berubah dan sudah lewat dihitung ulang.
- Server perlu akses HTTPS keluar ke ketiga domain itu. Di balik proxy, jalankan Node 24+ dengan `NODE_USE_ENV_PROXY=1` dan `HTTPS_PROXY`. Tanpa internet: impor `.ics`/`.csv` dari tab Hari libur.
- Status tarik terakhir tampil di tab Hari libur; galat juga tercatat di log aplikasi.

## Zona waktu

Zona waktu instansi diatur di Pengaturan (bawaan `APP_TIMEZONE`, Asia/Jakarta); unit kerja boleh punya zona waktu sendiri untuk perangkat di unit itu. Database menyimpan instan dalam UTC dan tanggal kerja sebagai `DATE`. Waktu transaksi selalu waktu server; waktu perangkat pengguna hanya dicatat sebagai informasi.
