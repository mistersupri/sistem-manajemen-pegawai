# Migrasi dari Aplikasi Absensi Lama (SQLite)

`scripts/migrate-sqlite.ts` memindahkan data dari `data/absensi.db` aplikasi lama (Express/EJS) ke SIMPEG.

## Langkah

```bash
# 1. Siapkan database SIMPEG kosong (tanpa data demo)
npm run db:deploy
ADMIN_PASSWORD='...' npm run db:seed

# 2. Coba baca dulu (tidak menulis apa pun)
npm run migrate:sqlite -- --sqlite /path/ke/absensi.db --dry-run

# 3. Jalankan
npm run migrate:sqlite -- --sqlite /path/ke/absensi.db --uploads /path/ke/uploads
```

Dengan Docker, salin berkas lama ke folder proyek lalu jalankan lewat image aplikasi:

```bash
docker compose run --rm -v "$PWD/lama:/lama:ro" app migrate-sqlite --sqlite /lama/absensi.db --uploads /lama/uploads
```

Laporan berisi jumlah per jenis data dan peringatan tersimpan di `storage/migrasi/laporan-*.json`. Skrip menolak berjalan bila database tujuan sudah berisi pegawai (kecuali `--allow-existing`) atau migrasi sudah pernah dijalankan.

Opsi `--face`:
- `pending` (bawaan): template wajah diimpor berstatus **menunggu verifikasi**, karena aplikasi lama tidak mencatat persetujuan pegawai. Petugas memverifikasi setelah pegawai menyetujui pemberitahuan, atau pegawai mendaftar ulang.
- `active`: langsung aktif. Pakai hanya bila persetujuan sudah diperoleh di luar sistem dan terdokumentasi.
- `skip`: tidak mengimpor data wajah.

## Pemetaan data

| Lama | SIMPEG |
|---|---|
| `settings` | Nama instansi, label zona waktu, ambang wajah, koordinat dan radius kantor, absen mandiri, liveness, logo (bila `--uploads`) |
| `employees.unit_kerja` (teks) | Unit kerja baru (satu per nama unik) |
| `employees` | Pegawai: NIP, nama, jenis kelamin, jabatan, kontak, tanggal masuk, status aktif, `id_mesin` → ID mesin, riwayat jabatan dan unit awal |
| `shifts` | Jenis jadwal versi 1; hari kerja dari pengaturan `hari_kerja` |
| `employees.default_shift_id` | Penugasan tetap sejak tanggal masuk atau aktivitas pertama |
| `shift_schedules` | Perubahan harian (penugasan sementara satu hari; tanpa shift = libur) |
| `hari_libur` | Hari libur semua unit |
| `users` | Akun dengan hash password yang sama (pengguna tetap memakai password lama). `admin` → Super Admin, `pegawai` → Pegawai. Admin yang masih memakai password bawaan `admin123` wajib menggantinya. Username yang bentrok diberi akhiran `.lama`. |
| `face_descriptors` | Template wajah terenkripsi (lihat `--face`) |
| `devices` | Perangkat: X302/LAN → `SOLUTION_SOAP`, P280/USB → `FILE_IMPORT`; Comm Key dienkripsi |
| `fingerprint_logs` | Raw event perangkat dengan kunci idempotensi yang sama dengan sinkronisasi baru, jadi menarik ulang mesin tidak menggandakan data |
| `attendance` jam masuk/pulang | Transaksi sumber (metode wajah/dinas luar/manual, lokasi, alamat, foto bila `--uploads`), bertanda "Migrasi dari sistem lama". Scan mesin yang log mentahnya ikut dimigrasi tidak dibuat ulang. |
| `clarifications` | Koreksi absensi dengan status, peninjau, catatan, dan lampiran |
| `attendance.status` tetap (izin, sakit, cuti, dinas luar, alpa) dan dispensasi | Koreksi petugas berstatus disetujui, beralasan "Status dari sistem lama", bila tidak berasal dari klarifikasi yang disetujui |

Setelah impor, rekap harian **dihitung ulang** dengan mesin perhitungan baru. Akibatnya angka bisa berbeda dari aplikasi lama bila aturannya berbeda. Contoh: aplikasi lama mencatat keterlambatan sejak jam masuk, sedangkan SIMPEG baru menghitung terlambat setelah melewati toleransi jadwal. Periksa beberapa pegawai di Rekapitulasi dan halaman telusur sebelum aplikasi lama dihentikan.

## Yang tidak dimigrasi

- Sesi login aplikasi lama (pengguna masuk ulang).
- Foto wajah referensi (`face_photo`): tidak diperlukan karena pencocokan memakai template.
- Berkas foto/lampiran bila `--uploads` tidak diberikan (jumlahnya tercatat di laporan sebagai `foto_tidak_disalin`).

## Hasil uji

Diuji dengan basis data SQLite sintetis berskema aplikasi lama (3 pegawai, 4 hari absensi termasuk shift malam lintas hari, 5 log mesin termasuk satu PIN tak dikenal, 2 klarifikasi, 1 perangkat, 1 hari libur, 1 jadwal harian, 3 akun termasuk username yang bentrok). Hasil: semua data terimpor, shift malam masuk ke tanggal kerja yang benar, status sakit dari klarifikasi dipertahankan, PIN tak dikenal dilaporkan, dan admin dengan password bawaan diwajibkan mengganti password.
