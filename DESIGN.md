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

- Panel datar berbatas garis 1px. Bayangan hanya untuk elemen yang benar-benar melayang di atas halaman: menu dropdown, modal, dan menu sel jadwal.
- Radius: panel 12px, kontrol 8px, chip dan badge 6px. Tidak ada elemen berbentuk pil kecuali tombol navigasi bawah.

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

Tema terang tetap untuk aplikasi admin dan pegawai. Alasannya: dipakai di kantor siang hari, dan hasilnya disandingkan dengan dokumen cetak/ekspor Excel. Kiosk memakai tema gelap tetap karena berupa layar bersama yang menyala sepanjang hari dan harus mudah dibaca dari jarak jauh.

## Logo

Logo instansi diunggah admin di Pengaturan. Bila belum ada, yang tampil hanya nama instansi sebagai teks, tanpa ikon pengganti.
