# Sistem Absensi & Manajemen Pegawai

Aplikasi web absensi pegawai dengan **pengenalan wajah**, **shift kerja**, **klarifikasi absen**, dan **absen dinas luar dengan foto berstempel waktu + GPS**. Data pegawai, jadwal shift, dan absensi dapat diekspor/diimpor dalam format Excel (.xlsx) dan CSV.

Dibangun dengan Node.js + Express + SQLite bawaan Node (`node:sqlite`), jadi tidak perlu server database terpisah dan tidak ada modul native yang harus dikompilasi. Pengenalan wajah memakai [face-api.js](https://github.com/vladmandic/face-api) dan berjalan di browser; modelnya disajikan dari server sendiri, jadi tidak perlu internet.

## Fitur

### Manajemen pegawai (admin)
- Tambah, ubah, hapus, dan cari pegawai (NIP, nama, jabatan, unit kerja, kontak, status aktif/nonaktif, shift default).
- Akun login pegawai dibuat otomatis (username = NIP, password awal = NIP), dan password bisa direset.
- **Ekspor** data pegawai ke Excel/CSV.
- **Impor** dari Excel/CSV (sudah ada template): NIP baru ditambahkan, NIP yang sudah ada diperbarui, dan baris yang gagal dilaporkan per nomor baris.

### Pengenalan wajah
- **Pendaftaran wajah**: lewat kamera (5 sampel otomatis) atau dari file foto. Pegawai juga bisa mendaftarkan wajahnya sendiri satu kali.
- Sistem menolak wajah yang sudah terdaftar atas nama pegawai lain.
- **Kiosk wajah** (`/kiosk`): perangkat absensi bersama di kantor. Wajah dideteksi dan dikenali otomatis, dengan mode Absen Masuk / Absen Pulang.
- **Absen mandiri** dari HP/laptop pegawai, berupa verifikasi 1:1 terhadap wajah pemilik akun dan dapat dibatasi radius kantor (geofence).
- Pencocokan wajah dilakukan **di server**, sehingga data biometrik pegawai tidak pernah dikirim ke browser.
- Opsional: wajib **kedip mata** (deteksi keaktifan sederhana) untuk mengurangi kecurangan memakai foto.
- Ambang batas kecocokan dapat diatur di menu Pengaturan.

### Shift kerja
- Master shift: kode, jam masuk/pulang, toleransi keterlambatan, dan warna. Shift malam lintas hari didukung (mis. 22:00–06:00).
- Shift default per pegawai, plus **jadwal per tanggal** (grid bulanan, klik sel untuk mengubah, termasuk hari libur).
- Atur jadwal **massal** (banyak pegawai, rentang tanggal, pilihan hari).
- Ekspor/impor jadwal shift (Excel).
- Keterlambatan dan pulang cepat dihitung otomatis sesuai shift.

### Absen dinas luar (foto + timestamp + GPS)
- Pegawai mengambil selfie di lokasi tugas. Foto otomatis diberi stempel berisi nama/NIP, **waktu server**, **koordinat GPS dan akurasinya**, **alamat** (dari OpenStreetMap), dan keterangan tugas.
- Wajah pada foto diverifikasi terhadap data wajah pegawai.
- Status absensi menjadi *Dinas Luar*. Admin dapat melihat foto beserta peta lokasinya.

### Integrasi mesin fingerprint (Solution X302 & P280)
- **X302 lewat LAN**: server menarik data langsung dari mesin melalui Web Service mesin (port 80, Comm Key). Bisa manual (tombol *Tarik*) atau otomatis setiap 5/15/30/60 menit. Server aplikasi harus berada di jaringan yang sama dengan mesin.
- **P280 lewat USB**: unggah file hasil unduhan flashdisk di menu *Mesin → Impor Data dari Flashdisk*. Format yang dibaca: laporan standar `.xls` (mis. `StandardReport.xls`, sheet "Lap. Log Absen"), attlog `.dat/.txt` (mis. `1_attlog.dat`), serta CSV/Excel berkolom ID & Waktu.
- Scan yang pernah diimpor dilewati otomatis, jadi file dengan periode tumpang tindih aman diimpor ulang.
- **Pemetaan ID mesin**: setiap pegawai punya kolom *ID Mesin*. ID yang belum terhubung tampil di menu *Pemetaan ID Mesin*. Di sana admin bisa menghubungkannya ke pegawai (nama yang sama dipilih otomatis) atau langsung membuat pegawai baru dari data mesin.
- Scan diolah menjadi absensi harian: scan pertama = masuk, scan terakhir = pulang, dan scan tunggal ditentukan dari posisinya terhadap jam kerja. Shift malam lintas hari didukung, dan hasilnya digabung dengan absen wajah/dinas luar.
- *Log Scan* menampilkan seluruh scan mentah per mesin dan bisa diekspor ke CSV. *Proses Ulang* menghitung ulang absensi setelah shift atau hari libur diubah.

### Hari kerja & hari libur
- Hari kerja umum (default Senin–Jumat) diatur di *Pengaturan*. Tanggal merah dan cuti bersama diatur di *Shift → Hari Libur Nasional*.
- Shift default hanya berlaku di hari kerja. Pegawai piket atau satpam diatur lewat *Jadwal Shift*.

### Klarifikasi absen
- Pegawai mengajukan klarifikasi untuk maksimal 31 hari ke belakang: lupa absen masuk/pulang, terlambat, pulang cepat, izin, sakit, cuti, dinas luar, atau lainnya. Lampiran bukti (JPG/PNG/PDF) bisa disertakan.
- Admin menyetujui atau menolak. Saat menyetujui, admin menentukan jam masuk/pulang, status, dan dispensasi keterlambatan, lalu data absensi diperbarui otomatis.

### Laporan & ekspor absensi
- Data absensi dapat difilter per tanggal, unit, status, dan pegawai, serta dikoreksi atau diinput manual oleh admin.
- **Rekap** per pegawai: hari kerja, tepat waktu, terlambat, dinas luar, izin, sakit, cuti, alpa, tanpa keterangan, total menit terlambat, dan % kehadiran.
- **Ekspor Excel** (sheet Rekap + Detail) serta **CSV** (detail atau rekap).

### Tampilan
- Antarmuka memakai komponen [shadcn/ui](https://ui.shadcn.com/) (Button, Card, Table, Badge, Alert, Dialog, Sheet, DropdownMenu, Tabs, Switch, dan lainnya) yang dipindahkan ke template EJS dengan Tailwind CSS v4. Penjelasannya ada di `DESIGN.md` bagian Komponen.
- Arah desain tertulis di `DESIGN.md`: palet navy dan biru instansi di atas latar kertas hangat, huruf Plus Jakarta Sans (disajikan lokal), dan motif garis hari kerja yang menunjukkan jam masuk/pulang terhadap shift.
- Logo instansi diunggah di **Pengaturan** (PNG/JPG/WebP, maksimal 1 MB). Tanpa logo, yang tampil hanya nama instansi.
- Di HP: tabel berubah menjadi kartu, pegawai memakai navigasi bawah, dan filter bisa dilipat. Semua halaman lolos pemeriksaan WCAG 2 AA (axe-core) dan bisa dipakai dengan keyboard.

## Menjalankan

Kebutuhan: **Node.js 22.13 atau lebih baru** (disarankan Node 24 LTS). Tidak perlu Visual Studio, Python, atau build tools.

```bash
npm install
npm start
```

Bila sebelumnya `npm install` gagal karena `better-sqlite3` / `node-gyp` (versi lama aplikasi ini), hapus folder `node_modules` (dan `yarn.lock` bila ada), tarik versi terbaru, lalu jalankan `npm install` lagi.

Buka `http://localhost:3000` dan login sebagai admin: **admin / admin123** (segera ganti lewat menu *Ubah Password*).

> **Penting:** browser hanya mengizinkan akses kamera dan GPS pada **HTTPS** atau `localhost`. Untuk dipakai dari HP atau komputer lain, pasang aplikasi di belakang reverse proxy HTTPS (mis. Nginx/Caddy), lalu set `COOKIE_SECURE=1` dan `TRUST_PROXY=1`.

### Variabel lingkungan

| Variabel | Default | Keterangan |
|---|---|---|
| `PORT` | `3000` | Port HTTP |
| `TZ` | `Asia/Jakarta` | Zona waktu untuk perhitungan absensi |
| `DB_PATH` | `data/absensi.db` | Lokasi file database SQLite |
| `UPLOAD_DIR` | `uploads/` | Lokasi foto absensi & lampiran |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / `admin123` | Akun admin awal (hanya saat database pertama kali dibuat) |
| `COOKIE_SECURE` | – | `1` bila memakai HTTPS |
| `TRUST_PROXY` | – | `1` bila di belakang reverse proxy |

### Mengubah tampilan

CSS hasil build (`public/css/app.css`) sudah disertakan, jadi `npm start` langsung jalan. Bila mengubah template atau `src/styles/app.css`, bangun ulang CSS-nya:

```bash
npm run build:css   # sekali
npm run watch:css   # otomatis saat file berubah
```

### Pengujian

```bash
npm test
```

## Alur penggunaan singkat

1. **Admin** mengatur nama instansi, lokasi kantor, dan ambang wajah di *Pengaturan*.
2. Admin menyesuaikan *Master Shift*, lalu menambahkan atau mengimpor pegawai beserta shift default-nya.
3. Wajah setiap pegawai didaftarkan, oleh admin atau oleh pegawai sendiri.
4. Bila ada pola bergilir, atur *Jadwal Shift*.
5. Pegawai absen melalui **Kiosk Wajah** di kantor, menu **Absen Wajah** di HP, atau **Dinas Luar** saat bertugas di luar.
6. Bila ada kendala absen, pegawai mengajukan **Klarifikasi**, lalu admin meninjaunya.
7. Admin memantau dashboard, rekap, dan mengekspor laporan ke Excel/CSV.

## Struktur proyek

```
server.js               Entry point Express
src/db.js               Skema & koneksi SQLite
src/attendance.js       Logika absensi, shift, keterlambatan, shift malam
src/face.js             Pencocokan descriptor wajah (server)
src/excel.js            Baca/tulis Excel & CSV
src/routes/             Route admin, pegawai, shift, absensi, klarifikasi
src/ui.js               Komponen shadcn/ui (class + varian) untuk template
src/styles/app.css      Sumber Tailwind: token tema shadcn dan gaya khusus
views/                  Template EJS
public/js/app.js        Perilaku Dialog, Sheet, DropdownMenu, AlertDialog
public/js/face.js       Utilitas kamera, deteksi wajah, GPS
test/                   Pengujian otomatis (node:test)
```

## Catatan keamanan

- Foto absensi dan lampiran hanya dapat diakses admin dan pegawai pemiliknya.
- Deteksi kedip mata adalah pencegahan dasar, bukan anti-spoofing tingkat tinggi. Untuk keamanan lebih, gunakan kiosk di area yang diawasi.
- Stempel waktu foto dinas luar memakai jam server, bukan jam perangkat. Koordinat GPS berasal dari perangkat pegawai.
