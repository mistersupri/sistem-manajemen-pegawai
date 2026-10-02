import next from 'eslint-config-next';

const config = [
  ...next,
  { ignores: ['src/generated/**', '.next/**', 'public/vendor/**'] },
  // Gambar di aplikasi ini berasal dari API privat, data URL (QR MFA), atau blob kamera; next/image tidak cocok.
  { rules: { '@next/next/no-img-element': 'off' } },
];

export default config;
