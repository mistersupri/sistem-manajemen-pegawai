# Arah Desain: SIMPEG

Dial: ENERGY 2 / RHYTHM 2 / MOTION 1

## Identitas

Aplikasi kerja harian untuk admin kepegawaian, pimpinan, operator unit, dan pegawai. Karakternya **instansi modern**: navy yang tegas di bagian atas setiap halaman, area kerja yang terang dan bersih di bawahnya, dan kuning sebagai warna aksi. Arah ini mengikuti inspirasi visual yang diberikan pemilik (Oktober 2026). Admin memakainya untuk mengambil keputusan cepat setiap pagi (siapa belum ada transaksi, pengajuan mana yang menunggu, perangkat mana yang offline). Pegawai memakainya dari HP untuk satu tugas: absen.

## Palet

| Peran | Warna | Dipakai untuk | Alasan |
|---|---|---|---|
| Inti 1: Navy | `#0C1A45` | Header, pita judul, teks di atas kuning | Navy gelap instansi; teks putih di atasnya 16:1 |
| Inti 2: Biru tua | `#1A3A8F` | Tombol utama di area terang, tautan, tab aktif, fokus | Biru kerja; teks putih 10:1 |
| Aksen: Kuning | `#F4B92B` (teks `#0C1A45`) | Tombol aksi di atas navy (Buka kiosk wajah, aksi utama di pita judul, absen di beranda pegawai), menu aktif, jumlah pengajuan menunggu | Satu aksen hangat; di atas navy kontrasnya 9:1 |
| Netral: Latar | `#F7F8FB` | Latar area kerja | Abu kebiruan yang sangat terang, senada dengan navy |
| Netral: Permukaan | `#FFFFFF` | Card dan tabel | Data dibaca di atas putih bersih |
| Netral: Garis | `#E2E7F0` | Batas card, pemisah baris | Senada dengan latar |
| Teks | `#0F1B3D` / redup `#556079` | Teks utama / keterangan | 16:1 dan 6:1 di latar |

Pita judul memakai gradasi navy `#0C1A45` ke biru tua `#1A3590` (satu keluarga warna, bukan biru ke ungu). Gradasi hanya ada di pita ini dan panel halaman masuk, untuk memisahkan identitas halaman dari area kerja (R-01: gradasi sebagai penanda hierarki, bukan latar seluruh halaman).

Warna status adalah skala semantik, bukan dekorasi. Semuanya berupa latar muda dengan teks gelap (minimal 6:1):

- Hadir: hijau muda `#DCFCE7` / `#14532D`
- Terlambat: kuning muda `#FDF1D8` / `#6E4400` (keluarga aksen, karena terlambat memang perlu perhatian)
- Alpa / tanpa keterangan: merah muda `#FDE2E2` / `#991B1B`
- Dinas luar: biru muda `#E3EDF9` / `#1E4A80`
- Izin, sakit, cuti: abu `#ECEFF4` / `#3D475C` (sah, tidak perlu tindakan)

Warna jadwal dipilih admin dan hanya dipakai sebagai latar tipis (15%) dan garis bawah sel; teks kode jadwal tetap memakai warna teks utama sehingga kontras tidak bergantung pada pilihan warna.

## Tipografi

**Plus Jakarta Sans** (400, 500, 600, 700), disajikan lokal tanpa internet. Alasan: huruf ini dirancang untuk identitas kota Jakarta. Bentuknya ramah tapi tetap resmi, dan cocok untuk instansi pendidikan di Jakarta. Angka jam memakai `tabular-nums` agar kolom jam rata dan mudah dibandingkan. Judul kolom tabel memakai huruf kalimat biasa, tidak kapital semua.

## Permukaan, radius, bayangan

- Panel memakai Card shadcn: batas garis 1px dengan bayangan `shadow-sm` bawaan shadcn yang sangat tipis. Bayangan tebal (`shadow-lg`) hanya untuk elemen yang melayang: DropdownMenu, Dialog, Sheet, dan menu sel jadwal.
- Radius mengikuti token `--radius: 0.75rem` shadcn: Card 14px (`rounded-xl`), kontrol 8–10px (`rounded-md`). Badge berbentuk pil sesuai shadcn.

## Motif identitas: garis hari kerja

Setiap baris absensi hari ini menampilkan **garis hari kerja**: jalur tipis dari 05.00 sampai 22.00, rentang shift ditandai pita biru, dan jam masuk/pulang ditandai titik. Terlambat langsung terlihat sebagai titik masuk yang jatuh setelah awal pita. Motif ini dipakai di dashboard admin, beranda pegawai, dan detail absensi.

## Tata letak

- **Sidebar** navy (`--sidebar #0C1A45`) dengan struktur menu sesuai PRD: Dashboard, Data Pegawai, Absensi (Absensi Saya, Monitoring, Rekapitulasi, Koreksi), Perangkat Absensi (Daftar, Status Sinkronisasi, Log), Jadwal Kerja, Cuti & Izin, Notifikasi, Pengaturan (Unit Kerja, Pengguna & Peran, Aturan, Metode, Retensi & Privasi, Audit Log). Menu hanya tampil bila pengguna punya izinnya. Menu aktif berteks kuning. Jumlah yang menunggu tindakan tampil sebagai badge di menu.
- **Header** tipis di atas area kerja: tombol buka/tutup sidebar, nama instansi, dan lonceng notifikasi dengan jumlah belum dibaca.
- **Pita judul** (`.page-head`): elemen pertama tiap halaman. Isinya breadcrumb (halaman turunan), judul, keterangan, dan aksi halaman. Token tema ditimpa di dalam pita sehingga tombol utama otomatis kuning.
- **Area kerja** di bawah pita: card putih di atas latar terang. Lebar form dibatasi (`max-w-2xl` sampai `max-w-5xl`); tabel memakai lebar penuh.
- Tampilan dalam satu halaman dipilih lewat navigasi pil berbasis URL (`Segmented`), sehingga bisa dibagikan dan tetap berfungsi tanpa JavaScript.
- Dashboard admin dibangun di sekitar keputusan pagi hari; ringkasan angka hanya satu baris, grafik tren memakai palet referensi dataviz dengan tabel data sebagai alternatif.
- Di HP sidebar menjadi Sheet, tabel berubah menjadi daftar kartu (`.table-stack`) dengan kolom penentu di baris pertama, dan kontrol bertinggi minimal 44px.
- Kalender jadwal bulanan: tabel bergulir horizontal dengan kolom nama tetap (sticky). Warna jadwal hanya penanda (latar tipis dan garis bawah); kodenya tetap tertulis sehingga tidak bergantung warna.

## Gerak

MOTION 1: hanya transisi hover/fokus 120ms dan indikator proses (spinner) saat aksi berjalan. Tidak ada animasi masuk atau loop.

## Tema

Tema terang tetap untuk aplikasi admin dan pegawai. Alasannya: dipakai di kantor siang hari, dan hasilnya disandingkan dengan dokumen cetak/ekspor Excel. Kiosk memakai tema gelap tetap (kelas `.dark` shadcn pada `<html>`, navy yang sama dengan header, mode absen aktif berwarna kuning) karena berupa layar bersama yang menyala sepanjang hari dan harus mudah dibaca dari jarak jauh.

## Komponen: shadcn/ui

Semua komponen mengikuti [shadcn/ui](https://ui.shadcn.com/) gaya new-york-v4, disalin ke `src/components/ui` (React, Radix, Tailwind CSS v4). Komponen aplikasi ada di `src/components/app`.

- Token warna shadcn (`--background`, `--primary`, `--sidebar`, dan lainnya) diisi dari palet di atas di `src/app/globals.css`.
- Varian tambahan: tombol `highlight` (aksen kuning) dan `outline-destructive`, badge status (`hadir`, `terlambat`, `alpa`, `dinas`, `netral`, `highlight`), Alert `warning`/`success`.
- `Field` + `fieldProps`: label, petunjuk, dan pesan galat per isian yang terhubung lewat `aria-describedby`. Galat dari API (`error.fields`) tampil di isian yang bersangkutan.
- `ConfirmButton`: aksi yang mengubah data penting selalu lewat dialog konfirmasi, dengan alasan wajib bila aksinya perlu jejak (pembatalan, penonaktifan).
- `StatusBadge`: satu peta status untuk absensi, pengajuan, sinkronisasi, perangkat, dan wajah.
- `EmptyState`: ikon dalam lingkaran abu, judul, alasan, lalu aksi. Pesan kosong membedakan "belum ada data" dan "tidak ada hasil filter".
- Status "Belum ada transaksi" selalu netral (abu), tidak pernah merah. Hanya status yang ditetapkan aturan atau petugas yang memakai warna peringatan.
- Ikon dari Lucide.

## Logo

Logo instansi diunggah admin di Pengaturan. Bila belum ada, yang tampil hanya nama instansi sebagai teks, tanpa ikon pengganti.

## Revisi desain Oktober 2026

Bahan utama aplikasi ini adalah **waktu**: jam masuk, jam pulang, jadwal, dan "sekarang". Desain dibangun di sekitar itu.

- **Kuning jam** (`#F2B11E`) hanya punya dua arti: *sekarang* (garis waktu sekarang di papan dan garis hari) dan aksi absen utama pegawai. Bukan warna dekorasi.
- **Jam sebagai tipografi utama**: kelas `.clock` (angka tabular, tebal 750, rapat). Dipakai untuk jam masuk/pulang di beranda pegawai dan jam server di halaman masuk.
- **Dashboard admin**: judulnya tanggal, bukan kata "Dashboard". Enam kartu angka diganti satu batang proporsional (`RegisterBar`) dengan jumlah sebagai teks. Elemen khasnya **Papan hari ini** (`TodayBoard`): satu baris per pegawai pada sumbu 05.00 sampai 24.00, pita jadwal, tanda masuk (biru, oranye bila terlambat), tanda pulang (navy), dan garis kuning waktu sekarang. Yang belum ada transaksi dan terlambat di atas.
- **Warna kategori** satu sumber (`attendance-colors.ts`) untuk batang dan grafik tren. "Belum ada transaksi" abu netral karena belum tentu tidak hadir.
- **Beranda pegawai**: satu kartu "Absensi hari ini" dengan jam besar, garis hari, satu tombol kuning untuk aksi berikutnya, lalu aksi lain sebagai baris di bawahnya. Jadwal minggu ini sebagai strip 7 hari.
- **Navigasi bawah** di ponsel untuk pegawai tanpa peran pengelola: Beranda, Absen, Jadwal, Koreksi, Cuti.
- **Daftar di ponsel**: filter dilipat di balik tombol "Filter" (`CollapsibleFilters`); baris tabel dipadatkan (nama dan status di baris pertama, jam dalam satu kalimat); tabel banyak angka memakai varian `stack-grid` (tiga kolom, label di atas nilai). Navigasi pil menjadi satu baris yang bisa digeser.
- **Kartu** tanpa bayangan (cukup garis), padding 16 px di ponsel dan 24 px di layar lebar. Metadata ditulis sebagai kalimat atau baris terpisah, bukan dipisah titik tengah.
- **Keadaan halaman**: kerangka saat memuat (`loading.tsx`), halaman galat dengan langkah berikutnya, dan halaman tidak ditemukan. Animasi dinonaktifkan bila pengguna memilih *reduced motion*; grafik tidak beranimasi.
- **Halaman masuk**: panel kiri menampilkan jam server berjalan dalam zona waktu instansi, karena itu yang dipakai untuk semua absensi.
