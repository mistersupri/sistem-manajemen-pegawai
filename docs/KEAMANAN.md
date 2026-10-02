# Keamanan, Privasi, Backup

## Akses

- **Password** di-hash bcrypt (cost 12). Minimal 8 karakter berisi huruf dan angka, tidak boleh memuat username. Akun baru dan password hasil reset wajib diganti saat masuk pertama.
- **Sesi**: token acak di cookie `simpeg_session` (httpOnly, SameSite=Lax, Secure di produksi). Database hanya menyimpan hash SHA-256 token. Lama sesi diatur di Pengaturan (bawaan 12 jam). Menonaktifkan pengguna atau mereset password/MFA mengakhiri semua sesinya.
- **Penguncian**: 5 kali gagal mengunci akun 15 menit. Batas percobaan: 10 per username dan 300 per IP per 5 menit (kantor biasanya keluar lewat satu IP). Pesan gagal sama untuk username yang tidak ada dan password salah.
- **MFA** (TOTP, aplikasi autentikator): bisa dipasang setiap pengguna di halaman Keamanan Akun, dan bisa diwajibkan untuk peran admin (Super Admin, Admin Kepegawaian, Admin IT). Secret MFA disimpan terenkripsi.
- **RBAC dengan cakupan unit**: izin diberikan lewat peran; setiap penugasan peran punya cakupan (seluruh unit, atau satu unit beserta sub-unitnya). Semua pembatasan dicek di server pada lapisan layanan, bukan hanya dengan menyembunyikan tombol. Data di luar cakupan dijawab `404`.
- **Pencegahan eskalasi**: pengguna hanya bisa memberikan peran yang semua izinnya ia miliki, dengan cakupan yang tidak melebihi cakupannya sendiri. Super Admin terakhir tidak bisa dicabut, dan Super Admin tidak bisa mencabut perannya sendiri.
- **CSRF**: permintaan yang mengubah data wajib ber-`Origin` sama dengan host aplikasi; cookie SameSite=Lax sebagai lapisan kedua.

## Data

- **Enkripsi kolom** AES-256-GCM dengan `BIOMETRIC_ENCRYPTION_KEY` untuk: template wajah, NIK, secret/Comm Key perangkat, secret MFA. Nilai ini tidak pernah dikirim ke browser.
- **Audit log** mencatat login (berhasil/gagal), perubahan data pegawai, penugasan peran, perubahan izin, koreksi, keputusan cuti, perubahan jadwal dan pengaturan, sinkronisasi perangkat, ekspor berisi NIK, dan penghapusan foto karena retensi. Tabel `audit_logs` dilindungi trigger database: baris hanya bisa ditambah, tidak bisa diubah atau dihapus, termasuk lewat SQL langsung.
- **Transaksi sumber immutable**: `attendance_events`, `attendance_verifications`, dan kolom inti `device_raw_events` juga dilindungi trigger. Perbaikan dilakukan lewat koreksi yang menyimpan nilai awal dan nilai hasil, sehingga rekap selalu bisa ditelusuri ke sumbernya.
- **Log aplikasi** berformat JSON ke stdout/stderr. Kunci yang mengandung `password`, `token`, `secret`, `nik`, `descriptor`, `template`, `cookie`, `authorization`, `comm_key`, atau `mfa` disamarkan otomatis, begitu pula isi audit log.
- **Unggahan**: jenis berkas ditentukan dari isi (magic bytes), bukan nama berkas; ukuran dibatasi (lampiran 5 MB, logo 1 MB). Berkas disimpan di `STORAGE_DIR` dengan nama acak dan dilayani hanya lewat endpoint yang memeriksa izin.
- **Ekspor CSV** melindungi dari formula injection (sel diawali `=`, `+`, `-`, `@`, tab, atau CR diberi awalan `'`).
- **Header keamanan**: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy` yang hanya mengizinkan kamera dan lokasi untuk aplikasi sendiri.

## Privasi dan retensi

- Absen wajah mandiri dan kiosk **tidak menyimpan foto**; hanya descriptor yang dikirim untuk dicocokkan.
- Foto dinas luar disimpan bila diaktifkan (bawaan aktif), dan dihapus otomatis setelah N hari bila "Hapus foto setelah" diisi. Pemeriksaan berjalan tiap jam; transaksinya tetap ada.
- Template wajah dihapus saat dicabut, diganti, atau saat pegawai dinonaktifkan.
- Reverse geocoding (alamat dari koordinat) mati secara bawaan karena mengirim koordinat ke layanan pihak ketiga (OpenStreetMap Nominatim).
- Data demo hanya dibuat dengan `SEED_DEMO=1` dan selalu bertanda "(demo)" atau "(contoh)".

## Kunci dan rahasia

| Variabel | Fungsi | Bila hilang atau diganti |
|---|---|---|
| `APP_SECRET` | HMAC internal | Ganti kapan saja; tidak memengaruhi data tersimpan. |
| `BIOMETRIC_ENCRYPTION_KEY` | Enkripsi kolom sensitif | **Data terenkripsi tidak bisa dibuka.** Template wajah harus didaftarkan ulang, NIK dan Comm Key diisi ulang, MFA dipasang ulang. |
| `POSTGRES_PASSWORD` / `DATABASE_URL` | Akses database | Ganti di database dan `.env` bersamaan. |

Simpan cadangan `BIOMETRIC_ENCRYPTION_KEY` di tempat yang berbeda dari backup database (mis. brankas password instansi). Backup database tanpa kunci tidak membuka data sensitif; kunci tanpa backup tidak berguna. Keduanya diperlukan untuk pemulihan.

## Backup dan pemulihan

`scripts/backup.sh` membuat folder `backups/simpeg-YYYYMMDD-HHMMSS` berisi `database.dump` (`pg_dump` format custom), `storage.tar.gz` (foto, lampiran, logo), dan `SHA256SUMS`. Backup yang lebih tua dari `RETENTION_DAYS` (bawaan 30) dihapus.

```bash
# Docker (jadwalkan lewat cron host, mis. tiap malam pukul 01.00)
docker compose --profile ops run --rm backup

# Tanpa Docker
DATABASE_URL=... STORAGE_DIR=./storage BACKUP_DIR=./backups scripts/backup.sh
```

Pemulihan (aplikasi dihentikan dulu, database tujuan akan ditimpa):

```bash
docker compose stop app
docker compose --profile ops run --rm backup sh /scripts/restore.sh /backups/simpeg-YYYYMMDD-HHMMSS
docker compose start app
```

`restore.sh` memeriksa checksum sebelum memulihkan dan meminta konfirmasi (`--yes` untuk otomatis). Trigger imutabilitas ikut terpulihkan. Kedua skrip sudah diuji pulang-pergi (backup lalu restore ke database kosong, jumlah baris sama) di `postgres:16-alpine`.

Uji pemulihan secara berkala ke database terpisah. Backup yang belum pernah dipulihkan belum terbukti bisa dipakai.

## Batasan yang diketahui

- Rate limit disimpan di memori proses. Bila aplikasi dijalankan lebih dari satu instance, batasnya berlaku per instance; lihat [ARSITEKTUR.md](ARSITEKTUR.md).
- Pengenalan wajah punya batasan sendiri; lihat [BIOMETRIK.md](BIOMETRIK.md).
