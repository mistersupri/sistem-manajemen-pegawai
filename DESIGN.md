# Arah Desain: Sistem Absensi Pegawai

Dial: ENERGY 2 / RHYTHM 2 / MOTION 1

## Identitas

Aplikasi kerja harian untuk admin tata usaha dan pegawai Suku Dinas Pendidikan. Karakternya **instansi modern hangat**: resmi dan bisa dipercaya seperti dokumen dinas, tapi tidak dingin. Admin memakainya untuk mengambil keputusan cepat setiap pagi (siapa belum hadir, klarifikasi mana yang menunggu). Pegawai memakainya dari HP untuk satu tugas: absen.

## Palet

| Peran | Warna | Dipakai untuk | Alasan |
|---|---|---|---|
| Inti 1: Navy | `#123B6D` | Bilah navigasi, judul angka utama | Biru instansi yang tegas; teks putih di atasnya 11,2:1 |
| Inti 2: Biru | `#1D5FA8` | Tombol utama, tautan, status aktif | Biru kerja yang lebih terang dari navy; teks putih 6,4:1 |
| Netral: Kertas | `#F6F4EF` | Latar halaman | Putih kertas yang sedikit hangat, memberi kesan "instansi hangat" tanpa menambah warna |
| Netral: Permukaan | `#FFFFFF` | Panel dan tabel | Data dibaca di atas putih bersih |
| Netral: Garis | `#E4E0D6` | Batas panel, pemisah baris | Senada dengan latar kertas |
| Teks | `#1F2733` / redup `#5A6270` | Teks utama / keterangan | 13,7:1 dan 5,6:1 di latar kertas |
| Aksen: Kuning tindakan | `#F2B33D` (teks `#5A3800`) | Hanya untuk hal yang menunggu tindakan admin: jumlah klarifikasi menunggu, penanda menu aktif | Satu aksen hangat yang hanya muncul saat ada yang perlu dikerjakan |

Warna status adalah skala semantik, bukan dekorasi. Semuanya berupa latar muda dengan teks gelap (minimal 6:1):

- Hadir: hijau muda `#DCFCE7` / `#14532D`
- Terlambat: kuning muda `#FDF1D8` / `#7A4B00` (keluarga aksen, karena terlambat memang perlu perhatian)
- Alpa / tanpa keterangan: merah muda `#FDE2E2` / `#991B1B`
- Dinas luar: biru muda `#E3EDF9` / `#1E4A80`
- Izin, sakit, cuti: abu hangat `#ECEAE4` / `#3F4654` (sah, tidak perlu tindakan)

Warna shift dipilih admin. Teks chip shift otomatis hitam atau putih sesuai kecerahan warnanya agar kontras selalu terjaga.

## Tipografi

**Plus Jakarta Sans** (400, 500, 600, 700), disajikan lokal tanpa internet. Alasan: huruf ini dirancang untuk identitas kota Jakarta. Bentuknya ramah tapi tetap resmi, dan cocok untuk instansi pendidikan di Jakarta. Angka jam memakai `tabular-nums` agar kolom jam rata dan mudah dibandingkan. Judul kolom tabel memakai huruf kalimat biasa, tidak kapital semua.

## Permukaan, radius, bayangan

- Panel memakai Card shadcn: batas garis 1px dengan bayangan `shadow-sm` bawaan shadcn yang sangat tipis. Bayangan tebal (`shadow-lg`) hanya untuk elemen yang melayang: DropdownMenu, Dialog, Sheet, dan menu sel jadwal.
- Radius mengikuti token `--radius: 0.75rem` shadcn: Card 14px (`rounded-xl`), kontrol 8–10px (`rounded-md`). Badge berbentuk pil sesuai shadcn.

## Motif identitas: garis hari kerja

Setiap baris absensi hari ini menampilkan **garis hari kerja**: jalur tipis dari 05.00 sampai 22.00, rentang shift ditandai pita biru, dan jam masuk/pulang ditandai titik. Terlambat langsung terlihat sebagai titik masuk yang jatuh setelah awal pita. Motif ini dipakai di dashboard admin, beranda pegawai, dan detail absensi.

## Tata letak

- Dashboard admin dibangun di sekitar keputusan pagi hari: "Perlu perhatian" (belum absen, terlambat, klarifikasi menunggu) adalah fokus utama. Ringkasan angka hanya satu baris.
- Di HP, tabel berubah menjadi daftar kartu yang memuat kolom penentu (status, jam) di baris pertama.
- Pegawai di HP memakai navigasi bawah (Beranda, Absen, Dinas Luar, Riwayat, Klarifikasi), karena aksi absen harus selalu satu ketukan jauhnya.
- Admin di HP memakai tombol "Menu" berlabel.
- Filter di HP dilipat, dengan ringkasan filter aktif.

## Gerak

MOTION 1: hanya transisi hover/fokus 120ms dan indikator proses (spinner) saat aksi berjalan. Tidak ada animasi masuk atau loop.

## Tema

Tema terang tetap untuk aplikasi admin dan pegawai. Alasannya: dipakai di kantor siang hari, dan hasilnya disandingkan dengan dokumen cetak/ekspor Excel. Kiosk memakai tema gelap tetap (kelas `.dark` shadcn pada `<html>`) karena berupa layar bersama yang menyala sepanjang hari dan harus mudah dibaca dari jarak jauh.

## Komponen: shadcn/ui

Semua komponen antarmuka mengikuti [shadcn/ui](https://ui.shadcn.com/) gaya new-york-v4. Karena aplikasi ini dirender server (EJS, bukan React), komponennya dipindahkan sebagai berikut:

- Class dan varian disalin dari sumber shadcn ke `src/ui.js`, dirangkai dengan `class-variance-authority` dan `tailwind-merge` seperti fungsi `cn()` shadcn. Template memanggilnya lewat `ui.button({ variant: 'outline' })`, `ui.card()`, `ui.badge()`, dan seterusnya. Perubahan dari sumber asli ditandai komentar `app:`.
- Token warna shadcn (`--background`, `--primary`, `--muted`, dan lainnya) diisi dari palet di atas, di `src/styles/app.css`. Tailwind CSS v4 membangunnya menjadi `public/css/app.css` (`npm run build:css`).
- Komponen yang di React memakai Radix diganti elemen bawaan browser plus skrip kecil di `public/js/app.js`: Dialog, Sheet, dan AlertDialog memakai `<dialog>`; DropdownMenu memakai tombol `data-dropdown` dengan navigasi panah dan Escape; Select memakai NativeSelect; Switch memakai checkbox; Collapsible memakai `<details>`.
- Varian tambahan: tombol `highlight` (aksen kuning tindakan) dan `outline-destructive` (hapus yang bukan aksi utama), badge status (`hadir`, `terlambat`, `alpa`, `dinas`, `netral`), dan Alert `warning`/`success`.
- Ikon dari Lucide (ikon resmi shadcn), disisipkan sebagai SVG oleh `ui.icon()`.
- Kontrol diberi tinggi minimal 44px di layar sentuh dan layar di bawah 1024px.

## Logo

Logo instansi diunggah admin di Pengaturan. Bila belum ada, yang tampil hanya nama instansi sebagai teks, tanpa ikon pengganti.
