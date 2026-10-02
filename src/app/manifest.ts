import type { MetadataRoute } from 'next';

// Agar SIMPEG bisa dipasang ke layar utama ponsel, dengan pintasan langsung ke absen dan dinas luar.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SIMPEG: Absensi dan Kepegawaian',
    short_name: 'SIMPEG',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#f4f6f9',
    theme_color: '#0e1b3d',
    lang: 'id',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
    shortcuts: [
      { name: 'Absen wajah', short_name: 'Absen', url: '/absensi/saya' },
      { name: 'Absen dinas luar', short_name: 'Dinas luar', url: '/dinas-luar' },
    ],
  };
}
