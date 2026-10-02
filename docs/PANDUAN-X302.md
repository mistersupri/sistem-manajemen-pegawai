# Panduan Integrasi Mesin Solution X302

Panduan ini menghubungkan mesin absensi Solution X302 ke SIMPEG lewat jaringan kantor (LAN), sehingga data scan masuk otomatis tanpa flashdisk. Kerjakan berurutan; setiap langkah punya cara memeriksa bahwa langkah itu berhasil.

Yang dibutuhkan:
- Mesin X302 tersambung kabel LAN ke jaringan kantor.
- Komputer atau server yang menjalankan SIMPEG, **di jaringan yang sama** dengan mesin (lihat Langkah 1).
- Akses ke menu admin mesin (biasanya perlu sidik jari atau PIN admin mesin).
- Akun SIMPEG dengan izin kelola perangkat (Super Admin atau Admin IT/Perangkat).

> Konektor X302 di SIMPEG sudah diuji dengan simulator yang meniru respons mesin, tetapi **belum dengan unit X302 fisik**. Karena itu ikuti Langkah 7 (pencocokan) sebelum data dipakai untuk keputusan resmi.

## Cara kerja singkat

SIMPEG menghubungi mesin lewat **Web Service** mesin (port 80, dilindungi **Comm Key**), membaca daftar pengguna dan seluruh log scan, lalu menyimpan setiap scan sekali saja. Menarik ulang data atau mengimpor berkas yang tumpang tindih tidak membuat data ganda. Mesin tidak diubah sama sekali: SIMPEG hanya membaca.

```
Mesin X302 (192.168.x.x:80)  <── tarik tiap 5/15/30/60 menit ──  Server SIMPEG (satu LAN)
```

## Langkah 1. Tentukan di mana SIMPEG berjalan

Server SIMPEG harus bisa menjangkau alamat IP mesin.

| Lokasi server SIMPEG | Bisa tarik langsung dari X302? |
|---|---|
| Komputer/server di kantor yang sama, satu jaringan dengan mesin | Ya. Pilihan paling sederhana. |
| Server di kantor lain atau di internet (VPS/cloud) | Hanya bila ada VPN antara server dan jaringan kantor. **Jangan** membuka port mesin ke internet. |
| Belum ada server di kantor | Pakai cara cadangan di Langkah 8: komputer kantor menarik log ke berkas, lalu berkas diunggah ke SIMPEG. |

Bila SIMPEG berjalan dengan Docker Desktop di komputer kantor, container biasanya bisa menjangkau IP di LAN kantor tanpa pengaturan tambahan. Langkah 3 memastikannya.

## Langkah 2. Atur mesin

Nama menu bisa sedikit berbeda tergantung versi firmware; cari padanannya.

1. **Alamat IP tetap.** Buka *Menu > Komunikasi (Comm.) > Jaringan/Ethernet*. Isi alamat IP yang tidak dipakai perangkat lain dan berada di jaringan kantor, misalnya `192.168.1.201`, beserta Subnet Mask (biasanya `255.255.255.0`) dan Gateway (alamat router). Minta bantuan pengelola jaringan bila ragu. DHCP sebaiknya dimatikan agar IP tidak berubah.
2. **Comm Key.** Di *Komunikasi > Koneksi PC (PC Connection)* catat atau atur **Comm Key** (kata sandi komunikasi; bawaan `0`). Disarankan mengganti dengan angka lain, lalu simpan angka ini dengan aman.
3. **Jam dan tanggal.** Di *Sistem > Tanggal/Jam* samakan jam mesin dengan jam yang benar (WIB/WITA/WIT sesuai lokasi). SIMPEG memakai jam di setiap scan; jam mesin yang salah membuat keterlambatan salah hitung.
4. **ID pengguna mesin.** Catat nomor ID (PIN) setiap pegawai di mesin. Nomor ini akan dipasangkan ke data pegawai di SIMPEG (Langkah 6).
5. Catat juga **versi firmware** dan nomor seri dari *Info Sistem*, untuk dilaporkan bila ada masalah.

## Langkah 3. Periksa koneksi dengan alat diagnosa

Jalankan di komputer tempat SIMPEG berjalan (atau komputer lain di jaringan yang sama), dari folder aplikasi:

```bash
npm run perangkat:cek -- --ip 192.168.1.201 --key 1234
```

Ganti IP dan Comm Key sesuai mesin. Alat ini hanya membaca dari mesin dan tidak butuh database. Contoh hasil yang baik:

```
1. Jaringan
  [OK]    port 80 terbuka (4 ms)
2. Web Service (iWsService)
  [OK]    terhubung, 42 pengguna terdaftar di mesin
3. Log absensi
  [OK]    15873 log terbaca dalam 6.2 detik
          log tertua 2025-01-02 07:12:09, terbaru 2026-10-02 07:44:51
Hasil: mesin siap dihubungkan ke SIMPEG.
```

Alat ini juga membuat berkas `laporan-x302-<ip>-<waktu>.json` berisi ringkasan teknis **tanpa nama pegawai**. Bila ada yang gagal, kirimkan berkas ini beserta versi firmware mesin agar konektor bisa disesuaikan.

| Pesan | Arti dan tindakan |
|---|---|
| `port 80 tidak bisa dibuka: ETIMEDOUT` / `EHOSTUNREACH` | Mesin tidak terjangkau. Periksa kabel LAN dan lampu port, alamat IP, dan apakah komputer satu jaringan (`ping 192.168.1.201`). |
| `port 80 tidak bisa dibuka: ECONNREFUSED` | Mesin terjangkau tetapi port 80 tidak melayani. Periksa pengaturan port/Web Server di menu komunikasi mesin. |
| `Comm Key ... salah` | Comm Key di perintah tidak sama dengan di mesin. |
| `Respons mesin tidak dikenali` | Firmware memakai format lain. Kirim berkas laporan. |
| `N log bertanggal di masa depan` | Jam mesin salah. Perbaiki di Langkah 2.3. |

Bila port 80 tertutup tetapi alat menyebut port 4370 terbuka, mesin hanya melayani protokol SDK. Konektor untuk protokol itu belum tersedia; laporkan hasilnya.

## Langkah 4. Daftarkan mesin di SIMPEG

1. Masuk ke SIMPEG, buka **Perangkat Absensi > Daftar Perangkat > Tambah perangkat**.
2. Isi:
   - Adapter: **Solution X302 / kompatibel iWsService (LAN)**
   - Nama: mis. `X302 Lobi Utama`; Merek `Solution`; Model `X302`
   - Nomor seri: dari Info Sistem mesin (dipakai sebagai identitas mesin)
   - Alamat IP dan Port: sama dengan Langkah 2 (port biasanya `80`)
   - Comm Key: sama dengan mesin. Disimpan terenkripsi dan tidak pernah ditampilkan lagi.
   - Unit kerja: unit tempat mesin dipasang (opsional)
   - Tarik otomatis: **Manual saja** dulu sampai Langkah 7 selesai
3. Simpan, buka halaman perangkat, tekan **Uji koneksi**. Hasil yang benar: *"Terhubung. N pengguna terbaca di mesin."* Status perangkat menjadi Online.

## Langkah 5. Tarik data pertama

Tekan **Tarik data sekarang**. Penarikan pertama membaca seluruh log di mesin (bisa beberapa puluh detik untuk puluhan ribu log). Hasilnya tercatat di **Status Sinkronisasi**: diterima, baru, duplikat, gagal.

- Scan dari ID mesin yang sudah dipasangkan ke pegawai langsung membentuk rekap harian.
- Scan dari ID yang belum dipasangkan tetap disimpan dan menunggu pemetaan.
- Penarikan berikutnya hanya membaca log sejak hari terakhir; duplikat dilewati otomatis.

## Langkah 6. Pasangkan ID mesin dengan pegawai

Buka **Perangkat Absensi > Status Sinkronisasi**, bagian *ID mesin belum terpetakan*. Untuk setiap ID, pilih pegawainya (sistem menyarankan nama yang mirip dengan nama di mesin), lalu simpan. Scan lama untuk ID tersebut langsung diproses.

Cara lain: isi kolom **ID mesin** di data pegawai (form pegawai atau impor Excel kolom "ID mesin absensi").

## Langkah 7. Cocokkan dengan laporan mesin (wajib sebelum dipakai resmi)

1. Di mesin atau software bawaan Solution, buat laporan log untuk 2 sampai 3 hari terakhir.
2. Di SIMPEG buka halaman perangkat, isi tanggal pada **Rekonsiliasi**, lalu jalankan. SIMPEG menarik ulang data sejak tanggal itu dan menampilkan jumlah scan per hari.
3. Bandingkan jumlah per hari, lalu periksa 3 sampai 5 pegawai di **Absensi > Rekapitulasi** (buka rincian untuk melihat scan sumbernya).
4. Bila cocok beberapa hari berturut-turut, ubah **Tarik otomatis** menjadi 5 atau 15 menit. Laporkan hasilnya agar status konektor X302 bisa diubah dari "belum diuji" menjadi "siap".

Bila ada selisih, catat tanggal, ID mesin, dan jam scan yang berbeda, lalu kirimkan bersama berkas laporan dari Langkah 3.

## Langkah 8. Cara cadangan tanpa koneksi langsung

Bila server SIMPEG tidak bisa menjangkau mesin (mis. server di cloud tanpa VPN), jalankan alat diagnosa di komputer kantor dengan `--csv`:

```bash
npm run perangkat:cek -- --ip 192.168.1.201 --key 1234 --csv
```

Alat menyimpan seluruh log ke `attlog-x302-<ip>-<waktu>.txt`. Unggah berkas itu di **Perangkat Absensi > Status Sinkronisasi > Impor berkas**, dan **pilih perangkat X302 yang sama** agar duplikat dikenali, termasuk bila nanti beralih ke tarik langsung. Lakukan setiap hari (atau jadwalkan dengan Task Scheduler Windows), lalu unggah berkasnya.

Unduhan flashdisk dari mesin juga bisa diunggah dengan cara yang sama.

## Pemeliharaan

- **Perangkat offline**: notifikasi dikirim ke pengelola perangkat saat penarikan gagal dan saat mesin kembali terhubung. Penarikan yang gagal bisa diulang dari riwayat sinkronisasi di halaman perangkat (tombol Ulangi).
- **Jam mesin menyimpang**: scan dengan waktu di masa depan atau dari mesin yang jamnya berbeda jauh dari server ditandai untuk ditinjau (toleransi di Pengaturan, Aturan Absensi).
- **Kapasitas log mesin**: SIMPEG tidak menghapus log di mesin. Bila memori log mesin hampir penuh, hapus log di mesin hanya **setelah** penarikan terakhir berhasil dan rekonsiliasi cocok.
- **Mengganti Comm Key**: ubah di mesin dan di form perangkat SIMPEG pada waktu yang sama.
- **Mesin pengganti**: daftarkan sebagai perangkat baru dan nonaktifkan yang lama; data lama tetap tersimpan.
