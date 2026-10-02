# Pengenalan Wajah

## Cara kerja

1. Browser memuat model [face-api.js](https://github.com/vladmandic/face-api) (detektor TinyFaceDetector, 68 titik wajah, jaringan pengenal 128 dimensi) dari server aplikasi sendiri (`/face-assets`), tanpa CDN pihak ketiga.
2. Browser menghitung **descriptor** (128 angka) dari kamera dan memeriksa kualitas: skor deteksi, lebar wajah dalam piksel, dan kecerahan. Foto tidak dikirim, kecuali foto dinas luar.
3. Server membandingkan descriptor dengan **template** pegawai memakai jarak Euclidean (`src/lib/biometric/matcher.ts`). Lolos bila jarak terdekat ≤ ambang `face.matchThreshold`.
4. Setiap percobaan, berhasil maupun gagal, dicatat sebagai `AttendanceEvent` + `AttendanceVerification` (hasil, jarak, ambang, kualitas, liveness, jarak ke kantor). Keduanya tidak bisa diubah atau dihapus. Rekap hanya memakai transaksi yang berhasil.

Pada kiosk, descriptor dibandingkan dengan semua template aktif dalam cakupan unit operator kiosk, lalu dipilih yang terdekat.

## Pendaftaran dan persetujuan

- Sebelum merekam, pegawai (atau petugas atas nama pegawai) membaca teks pemberitahuan dari Pengaturan, Retensi & Privasi, lalu menyatakan setuju. Versi teks yang disetujui dan waktunya disimpan bersama template. Mengubah teks menaikkan versi.
- Template berisi 3 sampai 10 sampel dan disimpan terenkripsi AES-256-GCM dengan `BIOMETRIC_ENCRYPTION_KEY`. Template tidak pernah dikirim ke browser atau muncul di ekspor.
- Sampel yang terlalu berbeda satu sama lain ditolak (kemungkinan lebih dari satu orang). Wajah yang sangat mirip dengan template pegawai lain juga ditolak.
- Bila "Pendaftaran wajah mandiri perlu verifikasi petugas" aktif, pendaftaran oleh pegawai berstatus menunggu sampai petugas memverifikasi.
- Mencabut template atau mendaftar ulang mengganti isi template dengan `DIHAPUS`; barisnya tetap ada sebagai jejak.
- Pendaftaran bersifat sukarela. Pegawai yang tidak mendaftar tetap bisa absen lewat mesin absensi, input petugas, atau dinas luar.

## Ambang dan kalibrasi

Nilai bawaan `0.5` adalah titik awal, **bukan** angka yang sudah dikalibrasi untuk instansi Anda. Makin kecil ambang, makin ketat:

- **FRR** (false rejection rate): pegawai sah ditolak. Naik bila ambang terlalu kecil.
- **FAR** (false acceptance rate): orang lain diterima. Naik bila ambang terlalu besar.

Kalibrasi dengan data sendiri:

1. Jalankan uji coba 1 sampai 2 minggu dengan ambang bawaan dan pencahayaan, kamera, serta lokasi yang akan dipakai sebenarnya.
2. Ambil jarak percobaan **sah** (pegawai sendiri, terkonfirmasi petugas):
   ```sql
   SELECT v.distance FROM attendance_verifications v JOIN attendance_events e ON e.id = v.event_id
   WHERE e.method IN ('FACE_SELF','FACE_KIOSK') AND v.distance IS NOT NULL AND e.occurred_at >= now() - interval '14 days';
   ```
3. Kumpulkan jarak **penyusup** dengan meminta beberapa relawan mencoba memakai akun orang lain di lingkungan uji (catat waktunya agar bisa dipisahkan).
4. Untuk beberapa nilai ambang (mis. 0.40, 0.45, 0.50, 0.55), hitung FRR = persentase jarak sah di atas ambang dan FAR = persentase jarak penyusup di bawah ambang. Pilih ambang dengan FAR serendah mungkin pada FRR yang masih bisa diterima, lalu catat keputusan dan datanya.
5. Ulangi kalibrasi bila kamera, lokasi, atau versi model berubah.

Skor kemiripan 0 sampai 100 yang tampil di layar hanya untuk tampilan; keputusan selalu memakai jarak dan ambang.

## Batasan yang harus dipahami

- **Tidak ada pengenalan wajah yang 100% akurat.** Masker, kacamata gelap, cahaya dari belakang, kamera beresolusi rendah, dan perubahan penampilan menurunkan akurasi. Saudara kembar atau wajah yang sangat mirip bisa lolos.
- **Kegagalan verifikasi bukan pelanggaran disiplin.** Sistem menampilkan pesan yang bisa ditindaklanjuti dan mengarahkan ke metode lain atau koreksi absensi. Tidak ada status otomatis yang menghukum karena gagal verifikasi.
- **Liveness sederhana.** Opsi "wajib kedip" mendeteksi kedipan dari titik mata di browser. Ini mengurangi pemakaian foto cetak, tetapi tidak menahan video rekaman atau perangkat yang dimodifikasi.
- **Descriptor dihitung di perangkat pengguna.** Pengguna yang memodifikasi browser secara teoretis bisa mengirim descriptor buatan. Karena itu absen mandiri sebaiknya dikombinasikan dengan pembatasan radius GPS, kiosk diletakkan di area yang diawasi, dan hasil yang janggal ditinjau lewat telusur rekap. Untuk kebutuhan anti-spoofing yang lebih kuat, ganti provider pencocokan dengan model liveness/pengenalan di server (interface `FaceMatcher`) setelah dievaluasi.
- Data wajah adalah data pribadi yang sensitif. Retensi: template disimpan selama pegawai aktif dan dihapus saat dicabut. Akses dibatasi izin `biometric.manage`.
