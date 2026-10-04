// Warna kategori kehadiran, dipakai bersama oleh batang hari ini dan grafik tren agar satu arti satu warna.
// "Belum absen" (hari ini) sengaja abu netral; Alfa dan Alfa awal/akhir merah karena hari kerjanya sudah lewat.
export const CATEGORY_COLOR: Record<string, string> = {
  HADIR: '#2a78d6',
  DINAS_LUAR: '#8fb6ea',
  TERLAMBAT: '#eb6834',
  IZIN_CUTI: '#1baf7a',
  TIDAK_HADIR: '#9b2c2c',
  ALFA_SEBAGIAN: '#c2255c',
  BELUM_ABSEN: '#c3cad6',
};
