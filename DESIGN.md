# Arah Desain: Sistem Absensi Pegawai

Dial: ENERGY 2 / RHYTHM 2 / MOTION 1

## Identitas

Aplikasi kerja harian untuk admin tata usaha dan pegawai Suku Dinas Pendidikan. Karakternya **instansi modern**: navy yang tegas di bagian atas setiap halaman, area kerja yang terang dan bersih di bawahnya, dan kuning sebagai warna aksi. Arah ini mengikuti inspirasi visual yang diberikan pemilik (Oktober 2026). Admin memakainya untuk mengambil keputusan cepat setiap pagi (siapa belum hadir, klarifikasi mana yang menunggu). Pegawai memakainya dari HP untuk satu tugas: absen.

## Palet

| Peran | Warna | Dipakai untuk | Alasan |
|---|---|---|---|
| Inti 1: Navy | `#0C1A45` | Header, pita judul, teks di atas kuning | Navy gelap instansi; teks putih di atasnya 16:1 |
| Inti 2: Biru tua | `#1A3A8F` | Tombol utama di area terang, tautan, tab aktif, fokus | Biru kerja; teks putih 10:1 |
| Aksen: Kuning | `#F4B92B` (teks `#0C1A45`) | Tombol aksi di atas navy (Buka kiosk wajah, aksi utama di pita judul, absen di beranda pegawai), menu aktif, jumlah klarifikasi menunggu | Satu aksen hangat; di atas navy kontrasnya 9:1 |
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

Warna shift dipilih admin. Teks chip shift otomatis hitam atau putih sesuai kecerahan warnanya agar kontras selalu terjaga.

## Tipografi

**Plus Jakarta Sans** (400, 500, 600, 700), disajikan lokal tanpa internet. Alasan: huruf ini dirancang untuk identitas kota Jakarta. Bentuknya ramah tapi tetap resmi, dan cocok untuk instansi pendidikan di Jakarta. Angka jam memakai `tabular-nums` agar kolom jam rata dan mudah dibandingkan. Judul kolom tabel memakai huruf kalimat biasa, tidak kapital semua.

## Permukaan, radius, bayangan

- Panel memakai Card shadcn: batas garis 1px dengan bayangan `shadow-sm` bawaan shadcn yang sangat tipis. Bayangan tebal (`shadow-lg`) hanya untuk elemen yang melayang: DropdownMenu, Dialog, Sheet, dan menu sel jadwal.
- Radius mengikuti token `--radius: 0.75rem` shadcn: Card 14px (`rounded-xl`), kontrol 8–10px (`rounded-md`). Badge berbentuk pil sesuai shadcn.

## Motif identitas: garis hari kerja

Setiap baris absensi hari ini menampilkan **garis hari kerja**: jalur tipis dari 05.00 sampai 22.00, rentang shift ditandai pita biru, dan jam masuk/pulang ditandai titik. Terlambat langsung terlihat sebagai titik masuk yang jatuh setelah awal pita. Motif ini dipakai di dashboard admin, beranda pegawai, dan detail absensi.

## Tata letak

- **Header** navy: logo dan nama instansi di kiri, menu di tengah, tombol kuning "Buka kiosk wajah" dan menu akun berbingkai di kanan. Menu aktif ditandai teks kuning dengan garis pendek di bawahnya.
- **Pita judul** (`.page-head`): elemen pertama tiap halaman, dibentangkan selebar layar tepat di bawah header. Isinya breadcrumb (halaman turunan), judul, keterangan, dan aksi halaman. Token tema ditimpa di dalam pita sehingga tombol utama otomatis menjadi kuning dan tombol berbingkai menjadi navy, sama seperti tombol Login/Register pada inspirasi.
- **Area kerja** di bawah pita: card putih di atas latar terang.
- Dashboard admin dibangun di sekitar keputusan pagi hari: "Perlu perhatian" (belum absen, terlambat, klarifikasi menunggu) adalah fokus utama. Ringkasan angka hanya satu baris.
- Beranda pegawai menaruh tombol absen berikutnya di pita judul, selebar layar di HP, agar langsung terlihat.
- Di HP, tabel berubah menjadi daftar kartu yang memuat kolom penentu (status, jam) di baris pertama.
- Pegawai di HP memakai navigasi bawah (Beranda, Absen, Dinas Luar, Riwayat, Klarifikasi), karena aksi absen harus selalu satu ketukan jauhnya.
- Admin di HP memakai tombol "Menu" berlabel yang membuka Sheet.
- Filter di HP dilipat, dengan ringkasan filter aktif.

## Gerak

MOTION 1: hanya transisi hover/fokus 120ms dan indikator proses (spinner) saat aksi berjalan. Tidak ada animasi masuk atau loop.

## Tema

Tema terang tetap untuk aplikasi admin dan pegawai. Alasannya: dipakai di kantor siang hari, dan hasilnya disandingkan dengan dokumen cetak/ekspor Excel. Kiosk memakai tema gelap tetap (kelas `.dark` shadcn pada `<html>`, navy yang sama dengan header, mode absen aktif berwarna kuning) karena berupa layar bersama yang menyala sepanjang hari dan harus mudah dibaca dari jarak jauh.

## Komponen: shadcn/ui

Semua komponen antarmuka mengikuti [shadcn/ui](https://ui.shadcn.com/) gaya new-york-v4. Karena aplikasi ini dirender server (EJS, bukan React), komponennya dipindahkan sebagai berikut:

- Class dan varian disalin dari sumber shadcn ke `src/ui.js`, dirangkai dengan `class-variance-authority` dan `tailwind-merge` seperti fungsi `cn()` shadcn. Template memanggilnya lewat `ui.button({ variant: 'outline' })`, `ui.card()`, `ui.badge()`, dan seterusnya. Perubahan dari sumber asli ditandai komentar `app:`.
- Token warna shadcn (`--background`, `--primary`, `--muted`, dan lainnya) diisi dari palet di atas, di `src/styles/app.css`. Tailwind CSS v4 membangunnya menjadi `public/css/app.css` (`npm run build:css`).
- Komponen yang di React memakai Radix diganti elemen bawaan browser plus skrip kecil di `public/js/app.js`: Dialog, Sheet, dan AlertDialog memakai `<dialog>`; DropdownMenu memakai tombol `data-dropdown` dengan navigasi panah dan Escape; Select memakai NativeSelect; Switch memakai checkbox; Collapsible memakai `<details>`.
- Bentuk pil dipakai di tiga tempat saja, masing-masing dengan alasan: kolom cari (`ui.searchInput`, penanda fungsi cari), Tabs sebagai tombol pilihan dengan item aktif biru tua (filter status klarifikasi), dan badge. Tombol, input lain, dan card tetap bersudut membulat biasa (R-11).
- Breadcrumb di pita judul untuk halaman turunan menggantikan tombol "Kembali".
- Empty state: ikon dalam lingkaran abu, judul tebal, alasan, lalu aksi.
- Accordion di atas `<details>` dengan ikon plus yang berputar, dipakai untuk panduan koneksi mesin.
- Varian tambahan: tombol `highlight` (aksen kuning) dan `outline-destructive` (hapus yang bukan aksi utama), badge status (`hadir`, `terlambat`, `alpa`, `dinas`, `netral`), dan Alert `warning`/`success`.
- Ikon dari Lucide (ikon resmi shadcn), disisipkan sebagai SVG oleh `ui.icon()`.
- Kontrol diberi tinggi minimal 44px di layar sentuh dan layar di bawah 1024px.

## Logo

Logo instansi diunggah admin di Pengaturan. Bila belum ada, yang tampil hanya nama instansi sebagai teks, tanpa ikon pengganti.
