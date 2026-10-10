# Absensi wajah di Raspberry Pi

Pengenalan wajah berjalan di peramban perangkat (face-api.js); server hanya mencocokkan hasilnya. Di Raspberry Pi, waktu terbesar ada di peramban, bukan server.

## Yang sudah dioptimalkan di aplikasi

- **Kamera dibuka bersamaan dengan pemuatan model.** Pratinjau kamera tampil langsung; model dimuat di latar belakang dan status berubah menjadi "Siap" setelah selesai.
- **Berkas model diunduh paralel dengan skrip** dan disimpan di cache peramban (`immutable`, 7 hari). Kunjungan berikutnya tidak mengunduh ulang 8 MB model.
- **Pemanasan jaringan** sekali setelah model dimuat, sehingga bingkai pertama pengguna tidak menanggung kompilasi kernel.
- **Deteksi ringan per bingkai.** Setiap bingkai hanya menjalankan detektor wajah kecil. Jaringan pengenal (descriptor 128 angka, bagian terberat) baru dijalankan sekali saat absen benar-benar dikirim. Sebelumnya dijalankan di setiap bingkai.
- **Ukuran masukan menyesuaikan perangkat** (160 sampai 320): turun otomatis bila bingkai lambat, naik bila lega.
- **Jeda saat tidak ada wajah** (sekitar 4 bingkai per detik) dan berhenti saat tab tersembunyi, agar CPU tidak terus penuh dan Pi tidak panas.
- Kamera dibatasi 15 fps ideal pada resolusi 640x480.

## Pengaturan Raspberry Pi yang disarankan

1. **Pi 5 atau Pi 4 dengan RAM 4 GB atau lebih**, pendingin aktif, dan catu daya resmi. Pi 3 atau lebih lama akan terasa lambat.
2. **Profil Chromium yang menetap.** Jangan memakai `--incognito` atau menghapus cache saat boot; kalau tidak, model diunduh ulang setiap kali dan kiosk lambat tiap pagi.
3. **Biarkan halaman kiosk terbuka seharian.** Jangan muat ulang tiap absen; model hanya dimuat sekali per pembukaan halaman.
4. **Akses GPU untuk Chromium** (WebGL jauh lebih cepat daripada CPU). Contoh peluncur kiosk:

   ```sh
   chromium-browser --kiosk --noerrdialogs --disable-infobars \
     --ignore-gpu-blocklist --enable-gpu-rasterization --enable-zero-copy \
     --use-fake-ui-for-media-stream \
     https://alamat-server/kiosk
   ```

   Periksa di `chrome://gpu` bahwa WebGL berstatus "Hardware accelerated". Bila "Software only", model berjalan di CPU dan akan lambat.
5. **Kamera** wajib lewat HTTPS atau `localhost`. Pakai kamera USB atau modul kamera Pi yang tampil sebagai perangkat video; resolusi 640x480 sudah cukup.
6. **Jaringan:** server dan Pi sebaiknya satu LAN. Model berukuran sekitar 8 MB (satu kali).

## Bila masih terasa lambat

- Ukur dulu: buka kiosk dan lihat berapa detik dari halaman terbuka sampai status "Siap". Pemuatan pertama di Pi biasanya beberapa detik; setelah itu di bawah itu karena cache.
- Matikan kedip (liveness) di Pengaturan > Metode Absensi bila tidak dibutuhkan: pemeriksaan kedip memerlukan jaringan landmark pada setiap bingkai.
- Pertimbangkan pengenalan wajah di server (descriptor dihitung di server dari foto kecil). Itu perubahan arsitektur dan belum dikerjakan.
