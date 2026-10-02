# Perangkat Absensi

Data mesin absensi masuk ke SIMPEG lewat **adapter**. Setiap merek atau protokol punya adapter sendiri (`src/lib/devices/*`), dan layanan sinkronisasi hanya mengenal interface `DeviceAdapter` (`src/lib/devices/adapter.ts`).

## Adapter yang tersedia

| Adapter | Koneksi | Status | Keterangan |
|---|---|---|---|
| `SOLUTION_SOAP` | LAN | **Belum diuji dengan perangkat fisik** (sudah diuji dengan simulator respons mesin di `tests/unit/solution-soap.test.ts`) | Solution X302 dan mesin lain yang punya Web Service `iWsService` (port 80, Comm Key). Menarik `GetAttLog` dan `GetUserInfo`. |
| `FILE_IMPORT` | USB | Siap | Berkas unduhan flashdisk: laporan standar Solution P280 (`.xls`, sheet "Lap. Log Absen"), `attlog` `.dat/.txt`, atau CSV/Excel berkolom ID dan waktu. Parser laporan P280 sudah dicoba dengan berkas ekspor asli instansi. |
| `MOCK` | API | Simulasi | Untuk pengembangan, demo, dan pengujian. Data deterministik; host `mock://gagal` mensimulasikan perangkat offline. |

Status "belum diuji" berarti konektornya ada tetapi belum dicoba dengan unit X302 di jaringan instansi. Jangan nyatakan siap sebelum langkah uji di bawah lulus.

### Uji X302 sebelum dipakai resmi

Panduan lengkap langkah demi langkah, termasuk pengaturan mesin dan pemecahan masalah: [PANDUAN-X302.md](PANDUAN-X302.md). Alat diagnosa `npm run perangkat:cek -- --ip <IP> --key <Comm Key>` memeriksa jaringan, Web Service, dan log tanpa database.


1. Di mesin: aktifkan Web Server/Web Service, catat alamat IP, port (biasanya 80), dan Comm Key.
2. Tambahkan perangkat dengan adapter `SOLUTION_SOAP`, isi IP, port, dan Comm Key.
3. **Uji koneksi** di halaman perangkat. Hasil yang diharapkan: "Terhubung. N pengguna terbaca di mesin."
4. **Tarik sekarang**, lalu bandingkan jumlah scan per hari di **Rekonsiliasi** dengan laporan yang dicetak dari mesin untuk tanggal yang sama.
5. Petakan ID mesin yang belum terhubung di **Status Sinkronisasi**.
6. Bila cocok beberapa hari berturut-turut, ubah `maturity` adapter menjadi `SIAP`.

## Jaringan

- Server aplikasi harus bisa membuka koneksi TCP ke IP:port mesin. Bila aplikasi berjalan di Docker, pastikan container bisa menjangkau jaringan LAN mesin (rute dari host, atau `network_mode: host` untuk layanan `app` bila diperlukan).
- Jangan membuka port Web Service mesin ke internet. Bila mesin ada di kantor lain, hubungkan lewat VPN.
- Comm Key disimpan terenkripsi (AES-256-GCM) dan tidak pernah dikirim ke browser; form hanya menampilkan "tersimpan".

## Alur data

1. **Tarik** (manual, terjadwal 5/15/30/60 menit, retry, atau rekonsiliasi) atau **impor berkas** membuat satu `DeviceSyncRun` dengan jumlah diterima, baru, duplikat, dan gagal.
2. Setiap scan disimpan sebagai `DeviceRawEvent` **immutable** dengan kunci idempotensi `sha256(perangkat|PIN|waktu lokal)`. Tarik ulang atau impor berkas tumpang tindih tidak menggandakan data.
3. Waktu perangkat dan waktu diterima server dicatat terpisah. Scan dengan waktu di masa depan, atau dari perangkat yang jamnya menyimpang melebihi toleransi (Pengaturan, Aturan Absensi), ditandai "jam perangkat menyimpang" untuk ditinjau.
4. PIN dipetakan ke pegawai lewat kolom ID mesin. PIN yang belum terpetakan tetap tersimpan dan diproses begitu dipetakan.
5. Tanggal kerja ditentukan dari jadwal (shift malam dihitung ke tanggal mulai shift), lalu rekap harian disusun ulang dari semua transaksi sumber.

Kegagalan tarik mengubah status perangkat menjadi `OFFLINE` dan mengirim notifikasi ke pengguna dengan izin `device.manage`. Notifikasi berikutnya baru dikirim saat perangkat kembali terhubung.

## Menambah merek baru

Kirim dulu: merek, model, versi firmware, protokol (SDK, SOAP, HTTP push, berkas), contoh data mentah, dan dokumentasi vendor bila ada. Lalu:

1. Buat `src/lib/devices/<merek>.ts` yang mengekspor `DeviceAdapter` dengan `maturity: 'BELUM_DIUJI'`.
2. `fetch(cfg, cursor)` mengembalikan `{ scans: [{ pin, local: 'YYYY-MM-DD HH:MM:SS', verifyMode, statusCode }], users, cursorAfter, deviceClock }`. Waktu `local` adalah jam dinding perangkat; konversi zona waktu dilakukan layanan sinkronisasi.
3. Lempar `DeviceError(pesan, retryable)`; `retryable = false` untuk galat yang tidak akan sembuh dengan mencoba lagi (mis. kata sandi salah).
4. Daftarkan di `src/lib/devices/registry.ts` dan tambahkan unit test parser dengan contoh data asli yang sudah dianonimkan.
5. Uji dengan perangkat fisik seperti langkah X302 di atas sebelum mengubah status menjadi `SIAP`.

Konektor yang membutuhkan layanan berbayar atau SDK berlisensi tidak ditambahkan tanpa persetujuan.
