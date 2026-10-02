import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  // Kamera dan lokasi hanya untuk halaman aplikasi ini sendiri.
  { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  agentRules: false,
  allowedDevOrigins: ['127.0.0.1'],
  serverExternalPackages: ['pdfkit', 'exceljs', 'pg'],
  // Berkas yang dibaca lewat fs pada runtime tidak terdeteksi otomatis oleh output standalone.
  outputFileTracingIncludes: {
    '/face-assets/[...path]': ['./node_modules/@vladmandic/face-api/dist/face-api.js', ...['tiny_face_detector', 'face_landmark_68', 'face_recognition'].map((m) => `./node_modules/@vladmandic/face-api/model/${m}_model*`)],
    '/api/v1/**/*': ['./node_modules/pdfkit/js/data/**/*'],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
