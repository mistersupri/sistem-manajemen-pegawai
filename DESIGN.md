# Arah Desain: SIMPEG

Dial: ENERGY 2 / RHYTHM 2 / MOTION 1

## Identitas

Aplikasi kerja harian untuk admin kepegawaian, pimpinan, operator unit, dan pegawai. Sejak Oktober 2026 tampilannya **mengikuti e-TPP** (aplikasi kinerja pegawai yang sudah dikenal pegawai Pemprov DKI), atas permintaan pemilik: sidebar putih, header putih, latar abu sangat muda, kartu putih bergaris tipis, dan biru sebagai warna aksi. Pegawai berpindah antara kedua aplikasi setiap hari, jadi bahasa visual yang sama mengurangi beban belajar. Admin memakainya untuk keputusan pagi (siapa belum ada transaksi, pengajuan mana yang menunggu, perangkat mana yang offline). Pegawai memakainya dari HP untuk absen dan melihat rekap presensinya.

## Palet

| Peran | Warna | Dipakai untuk | Alasan |
|---|---|---|---|
| Inti: Biru | `#0A6CC2` | Tombol utama, tautan, menu aktif (teks), tab aktif, avatar, fokus | Biru e-TPP yang digelapkan agar teks putih 5,3:1 |
| Biru muda | `#E8F4FD` | Latar menu aktif, kotak ikon judul kartu | Teks biru di atasnya 4,8:1 |
| Merah muda | `#D61F69` | Jumlah yang menunggu (lonceng, menu) | Seperti e-TPP; teks putih 4,9:1 |
| Libur | `#FDF2F8` / `#9D174D` | Baris dan kolom hari libur di tabel | Teks 6,7:1 |
| Kuning | `#F59E0B` | Hanya penanda "sekarang" di garis waktu | Bukan warna aksi lagi |
| Netral: Latar | `#F5F7FA` | Latar area kerja | |
| Netral: Permukaan | `#FFFFFF` | Sidebar, header, kartu, tabel | |
| Netral: Garis | `#E6EAF0` | Batas kartu, pemisah baris | |
| Teks | `#1E2939` / redup `#5B6576` | Teks utama / keterangan | 13,7:1 dan 5,5:1 di latar |

Tanpa gradasi. Halaman masuk memakai panel biru polos.

Warna status adalah skala semantik, bukan dekorasi. Semuanya berupa latar muda dengan teks gelap (minimal 6:1):

- Hadir: hijau muda `#DCFCE7` / `#14532D`
- Terlambat: kuning muda `#FDF1D8` / `#6E4400`
- Alpa / tanpa keterangan: merah muda `#FDE2E2` / `#991B1B`
- Dinas luar: biru muda `#E3EDF9` / `#1E4A80`
- Izin, sakit, cuti: abu `#ECEFF4` / `#3D475C` (sah, tidak perlu tindakan)

Warna jadwal dipilih admin dan hanya dipakai sebagai latar tipis (15%) dan garis bawah sel; teks kode jadwal tetap memakai warna teks utama sehingga kontras tidak bergantung pada pilihan warna.

## Tipografi

**Poppins** (400, 500, 600, 700), disajikan lokal lewat `@fontsource/poppins`, sama dengan e-TPP. Angka jam memakai `tabular-nums` agar kolom jam rata. Judul halaman 20–24 px tebal 600; judul kartu 16 px tebal 600 dengan keterangan 12 px di bawahnya. Judul kolom tabel memakai huruf kalimat biasa, 12 px, abu.

## Permukaan, radius, bayangan

- Kartu putih dengan garis 1px dan radius 14px (`rounded-xl`), tanpa bayangan. Bayangan hanya untuk elemen yang melayang: menu, popover, Dialog, Sheet.
- Radius satu hierarki: kartu 14px, kontrol (tombol, isian, tab, menu sidebar) 8–10px. Bentuk pil hanya untuk penanda kecil: badge, jumlah, switch, avatar.
- Judul kartu bergaya e-TPP: ikon di kotak biru muda 40px, judul, lalu keterangan satu baris (`CardHead` di `presence-recap.tsx`).

## Motif identitas: garis hari kerja

Setiap baris absensi hari ini menampilkan **garis hari kerja**: jalur tipis dari 05.00 sampai 22.00, rentang shift ditandai pita, dan jam masuk/pulang ditandai titik. Dipakai di dashboard admin dan beranda pegawai.

## Tata letak

- **Sidebar putih**: logo dan nama instansi, lalu **kartu profil** (avatar inisial, nama kapital, peran) yang membuka menu akun (Password dan MFA, Keluar). Menu aktif berlatar biru muda dengan teks biru; hover berlatar abu tipis sehingga tidak tertukar dengan menu aktif. Submenu tanpa ikon, menjorok. Jumlah yang menunggu tampil sebagai lingkaran merah muda.
- Struktur menu: Dashboard, Data Pegawai, Absensi (Absen Sekarang, Rekap Presensi Saya, Monitoring, Rekapitulasi, Koreksi), Perangkat Absensi, Cuti & Izin, Pengaturan (Jadwal Kerja, Unit Kerja, Pengguna & Peran, Aturan, Metode, Retensi & Privasi, Audit Log). Notifikasi tidak ada di sidebar; cukup lonceng di header. Jadwal Kerja hanya untuk pengelola jadwal; pegawai melihat shift-nya di tabel rekap presensi, dan `/jadwal` mengarahkan pegawai ke sana.
- **Header putih** (sticky): tombol menu, jejak lokasi (Beranda / Absensi / Rekapitulasi, diturunkan dari menu), lalu di kanan chip tanggal hari ini, lonceng, dan avatar.
- **Judul halaman** di atas latar abu: breadcrumb turunan (bila ada), judul, keterangan, dan aksi di kanan.
- **Area kerja**: kartu putih. Lebar form dibatasi (`max-w-2xl` sampai `max-w-5xl`); tabel memakai lebar penuh.
- Tampilan dalam satu halaman dipilih lewat kontrol segmen berbasis URL (`Segmented`) dengan indikator biru yang bergeser; tetap berfungsi tanpa JavaScript.
- **Navigator bulan** (`MonthStepper`): ‹ Oktober 2026 › dengan pilihan 12 bulan. Diletakkan di luar kartu filter, sejajar tab tampilan dan tepat di atas tabel yang dikendalikannya (Rekapitulasi kalender, Jadwal Kerja), atau di aksi judul (Rekap Presensi Saya).
- Di HP sidebar menjadi Sheet, tabel menjadi daftar kartu (`.table-stack`), dan kontrol bertinggi minimal 44px.

## Rekapitulasi Presensi (gaya e-TPP)

Halaman **Rekap Presensi Saya** (`/absensi/saya`) dan tab **Absensi** di detail pegawai memakai komponen yang sama (`PresenceRecap`):

1. **Ringkasan bulan**: delapan kotak angka (hari kerja, hadir, terlambat, pulang cepat, izin/sakit/cuti, dinas luar, alpa, belum ada transaksi), masing-masing dengan titik warna kategori.
2. **Detail Rekap Presensi / Absensi**: tiga tabel per kategori (Kehadiran dan Dinas Luar di kiri, Cuti di kanan). Kolom Kategori menyatu ke bawah, lalu Jenis Absensi dan Jumlah ("0 Hari" abu, angka bukan nol tebal). Semua jenis aktif selalu tampil agar daftar lengkap seperti e-TPP. Jenisnya berasal dari master Jenis Cuti/Izin (migrasi `katalog_jenis_cuti` mengisi 27 jenis standar e-TPP); Kehadiran ditambah Alpa, Terlambat, dan Pulang Cepat yang dihitung dari rekap.
3. **Rincian Harian**: #, Tanggal, Shift Datang, Shift Pulang, Jam Datang (HH:MM:SS), Lokasi Datang, Jam Pulang, Lokasi Pulang, Terlambat, Pulang Cepat, Keterangan. Hari libur berlatar merah muda dengan keterangan "Libur" atau nama hari libur. Lokasi diambil dari mesin (lokasi mesin), titik absen, alamat, atau koordinat; input petugas ditulis "Input petugas". Di ponsel tiap hari menjadi kartu tiga kolom; hari libur hanya tanggal dan keterangan, durasi nol tidak ditulis.

Absen dengan kamera ada di halaman terpisah **Absen Sekarang** (`/absensi/saya/absen`).

## Gerak

MOTION 1: gerak hanya untuk umpan balik dan kesinambungan ruang, tidak untuk hiasan. Token di `globals.css`:

| Token | Nilai | Dipakai untuk |
|---|---|---|
| `ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | Elemen masuk/keluar: Dialog, AlertDialog, menu, popover, select, tooltip, hasil absen |
| `ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` | Elemen yang berpindah di layar |
| `ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` | Sheet (sidebar ponsel) |

- Durasi UI di bawah 300 ms: menu dan popover 150–200 ms, Dialog 200 ms buka dan 150 ms tutup, Sheet 300 ms buka dan 200 ms tutup. Tidak ada `ease-in`, `transition-all`, atau `scale(0)`; elemen masuk mulai dari skala 0,95.
- Tombol menyusut ke `scale(0.97)` saat ditekan (hanya bila gerak diizinkan).
- Hasil absen (wajah, kiosk, dinas luar) muncul dengan `.enter-rise`: naik 6 px dan memudar dalam 200 ms lewat `@starting-style`. Ini satu-satunya animasi masuk di luar overlay, karena menandai hasil aksi yang penting.
- **Pindah halaman** (`app/(app)/template.tsx`, `.page-enter`): isi baru memudar dan naik 4 px dalam 180 ms. Hanya saat pindah rute; ganti filter atau parameter URL tidak beranimasi.
- **Tab segmen**: indikator biru bergeser ke tab yang diklik dalam 250 ms (transform dan lebar), sebelum halaman baru selesai dimuat. Posisi awal tidak beranimasi.
- **Grup menu sidebar dan accordion**: buka/tutup dengan animasi tinggi 200 ms (`collapsible-down/up` dari tw-animate-css); panah berputar 200 ms.
- Yang sengaja tidak beranimasi: navigasi bawah, sorotan menu, pengurutan dan paginasi tabel, angka dashboard, grafik. Semuanya dipakai puluhan sampai ratusan kali sehari.
- *Reduced motion* menghapus gerak posisi dan skala, tetapi tetap memakai pudar (opacity) agar perubahan keadaan tetap terlihat.

## Tema

Tema terang tetap untuk aplikasi admin dan pegawai. Alasannya: dipakai di kantor siang hari, dan hasilnya disandingkan dengan dokumen cetak/ekspor Excel. Kiosk memakai tema gelap tetap (kelas `.dark` shadcn pada `<html>`, biru tua keabuan dengan aksi biru terang) karena berupa layar bersama yang menyala sepanjang hari dan harus mudah dibaca dari jarak jauh.

## Komponen: shadcn/ui

Semua komponen mengikuti [shadcn/ui](https://ui.shadcn.com/) gaya new-york-v4, disalin ke `src/components/ui` (React, Radix, Tailwind CSS v4). Komponen aplikasi ada di `src/components/app`.

- Token warna shadcn (`--background`, `--primary`, `--sidebar`, dan lainnya) diisi dari palet di atas di `src/app/globals.css`.
- Varian tambahan: tombol `highlight` (sekarang sama dengan aksi utama biru, dipakai untuk aksi utama halaman) dan `outline-destructive`, badge status (`hadir`, `terlambat`, `alpa`, `dinas`, `netral`, `highlight` merah muda untuk jumlah), Alert `warning`/`success`.
- **Kursor**: semua yang bisa diklik memakai kursor tangan (tombol, tautan, item menu, opsi select, tab, ringkasan accordion, label isian); yang nonaktif memakai kursor larangan. Aturannya global di `globals.css`, dan item menu/select shadcn diubah dari `cursor-default`.
- **Hover** konsisten: tombol dan item menu berlatar abu tipis; tautan teks biru bergaris bawah; baris tabel sedikit abu.
- Komponen aplikasi baru: `MonthStepper` (navigator bulan dengan popover 12 bulan), `PageSizeSelect` (baris per halaman), `ProfileCard`/`HeaderAvatar` (menu akun), `HeaderCrumbs`, `PresenceRecap`.
- `Field` + `fieldProps`: label, petunjuk, dan pesan galat per isian yang terhubung lewat `aria-describedby`. Galat dari API (`error.fields`) tampil di isian yang bersangkutan.
- `ConfirmButton`: aksi yang mengubah data penting selalu lewat dialog konfirmasi, dengan alasan wajib bila aksinya perlu jejak (pembatalan, penonaktifan).
- `StatusBadge`: satu peta status untuk absensi, pengajuan, sinkronisasi, perangkat, dan wajah.
- `EmptyState`: judul, penyebab, lalu satu langkah berikutnya ("Hapus filter" bila hasil tersaring kosong, aksi utama bila memang belum ada data). Tanpa lingkaran ikon dekoratif; ikon hanya bila memberi arti.
- Status "Belum ada transaksi" selalu netral (abu), tidak pernah merah. Hanya status yang ditetapkan aturan atau petugas yang memakai warna peringatan.
- Ikon dari Lucide, garis 2px seragam. Alasannya: satu set yang sudah menjadi bawaan shadcn, lengkap untuk istilah kerja (jadwal, sidik jari, wajah, perangkat), dan tidak menambah pustaka. Ikon selalu berdampingan dengan teks, kecuali tombol ikon yang punya `aria-label`.

## Logo

Logo instansi diunggah admin di Pengaturan. Bila belum ada, yang tampil hanya nama instansi sebagai teks, tanpa ikon pengganti.

## Revisi desain Oktober 2026

Bahan utama aplikasi ini adalah **waktu**: jam masuk, jam pulang, jadwal, dan "sekarang". Desain dibangun di sekitar itu.

- **Kuning** hanya berarti *sekarang* (garis waktu sekarang di papan dan garis hari). Aksi absen memakai biru seperti aksi utama lain.
- **Jam sebagai tipografi utama**: kelas `.clock` (angka tabular, tebal 750, rapat). Dipakai untuk jam masuk/pulang di beranda pegawai dan jam server di halaman masuk.
- **Dashboard admin**: judulnya tanggal, bukan kata "Dashboard". Enam kartu angka diganti satu batang proporsional (`RegisterBar`) dengan jumlah sebagai teks. Elemen khasnya **Papan hari ini** (`TodayBoard`): satu baris per pegawai pada sumbu 05.00 sampai 24.00, pita jadwal, tanda masuk (biru, oranye bila terlambat), tanda pulang (abu tua), dan garis kuning waktu sekarang. Yang belum ada transaksi dan terlambat di atas.
- **Warna kategori** satu sumber (`attendance-colors.ts`) untuk batang dan grafik tren. "Belum ada transaksi" abu netral karena belum tentu tidak hadir.
- **Beranda pegawai**: satu kartu "Absensi hari ini" dengan jam besar, garis hari, satu tombol biru untuk aksi berikutnya, lalu aksi lain sebagai baris di bawahnya. Jadwal minggu ini sebagai strip 7 hari.
- **Navigasi bawah** di ponsel untuk pegawai tanpa peran pengelola: Beranda, Absen, Rekap, Koreksi, Cuti.
- **Daftar di ponsel**: filter dilipat di balik tombol "Filter" (`CollapsibleFilters`); baris tabel dipadatkan (nama dan status di baris pertama, jam dalam satu kalimat); tabel banyak angka memakai varian `stack-grid` (tiga kolom, label di atas nilai). Kontrol segmen menjadi satu baris yang bisa digeser.
- **Kartu** tanpa bayangan (cukup garis), padding 16 px di ponsel dan 24 px di layar lebar. Metadata ditulis sebagai kalimat atau baris terpisah, bukan dipisah titik tengah.
- **Keadaan halaman**: kerangka saat memuat (`loading.tsx`), halaman galat dengan langkah berikutnya, dan halaman tidak ditemukan. Bila pengguna memilih *reduced motion*, gerak posisi dihapus dan hanya pudar yang tersisa; grafik tidak beranimasi.
- **Halaman masuk**: panel kiri menampilkan jam server berjalan dalam zona waktu instansi, karena itu yang dipakai untuk semua absensi.

## Aturan antarmuka dan data besar (Oktober 2026)

- **Tanpa gradien** dan **tanpa letter-spacing** (`tracking-*`).
- **Teks:** judul `text-wrap: balance` dan paragraf `pretty`, berlaku global lewat `globals.css`, termasuk judul dan deskripsi Card/Dialog. Angka data memakai `tabular-nums`.
- **Gerak:** hanya `transform`/`opacity`, plus warna untuk kontrol kecil. Sidebar tidak menganimasikan `width`/`left`. Rinciannya di bagian Gerak.
- **Kelas bersyarat** selalu lewat `cn()`, tidak dengan template string.
- **Konfirmasi:** aksi merusak atau tidak bisa dibatalkan selalu memakai AlertDialog: `ConfirmButton`, atau `confirmDialog()` dari `components/app/confirm-dialog.tsx` untuk menu. `window.confirm` tidak dipakai.
- **Keadaan kosong** memberi satu langkah berikutnya: "Hapus filter" bila hasil tersaring kosong, atau aksi utama (tambah/ajukan) bila memang belum ada data.

### Daftar data

Semua daftar besar memakai parameter URL yang sama sehingga tautan bisa dibagikan dan tombol Kembali bekerja: `page`, `per` (5/10/20/50/100/200/500, bawaan 20), `sort`, `dir` (asc/desc), ditambah filter per halaman.

- `lib/list.ts`: `listSchema()` membaca parameter. Nilai yang salah jatuh ke bawaan, bukan galat. Halaman di luar jangkauan dijepit ke halaman terakhir.
- `SortableHead`: judul kolom yang bisa diklik dengan ikon arah dan `aria-sort` pada `<th>`. Klik pertama mengurut naik; kolom angka dan tanggal mulai dari turun.
- `TableToolbar`: jumlah data. Di ponsel, tempat judul kolom tersembunyi, ada `SortMenu` untuk memilih urutan.
- `Pager`: rentang "1–20 dari 3.017", nomor halaman, dan pemilih "Tampilkan [20] per halaman" yang langsung berpindah saat diganti. Ukuran yang tidak ada di daftar jatuh ke 20 (`pickPer`).
- `KeepParams` di setiap form filter menjaga urutan dan jumlah baris saat filter diubah.
- Pemilih pegawai (`EmployeePicker`) mencari di server (`/api/v1/employees/options`), tidak mengirim ribuan nama di HTML halaman. Dialog Atur banyak pegawai memuat daftarnya saat dibuka.
- Kalender jadwal bulanan dipaginasi dengan pencarian.

### Ukuran performa

Diukur di build produksi dengan 3.000 pegawai dan sekitar 198 ribu rekap harian. Sebagian besar halaman daftar 30–180 ms. Dashboard sekitar 200 ms di layanan (sebelumnya 844 ms). Jadwal Kerja 161 ms / 1,2 MB (sebelumnya 652 ms / 7,3 MB).

## Ponsel

- `viewport-fit=cover`, `theme-color` putih (mengikuti header), dan `interactive-widget=resizes-content` agar keyboard tidak menutupi isian.
- Area bawah memberi ruang `env(safe-area-inset-bottom)` untuk navigasi bawah.
- Sorotan ketuk bawaan browser dimatikan; tombol dan tautan memakai `touch-action: manipulation` (tanpa jeda ketuk ganda).
- Select dan input bertulisan 16 px di ponsel agar iOS tidak memperbesar halaman.
- Efek hover hanya untuk perangkat dengan pointer halus.

## Uji data terburuk

Setiap perubahan tata letak diuji di 1366, 1024, 820, dan 390 px dengan data 3.000 pegawai dan contoh terburuk: nama dan unit sangat panjang, nama satu huruf, dan nama beraksen. Grid yang berisi teks panjang memakai `grid-cols-1` (minmax(0, 1fr)) agar `truncate` bekerja. Sumbu angka grafik melebar mengikuti digit terbesar.

## Skill yang dipakai

Desain ini disusun dengan skill di `.claude/skills`: antislop, antislop-code, antislop-layoutmobile, emil-design-eng, apple-design, animate, animation-vocabulary, improve-animations, find-animation-opportunities, review-animations, ask-sonner, break-ui, mobile-native, pick-ui-library, dan prototype.
