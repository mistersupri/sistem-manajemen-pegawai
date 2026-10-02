import { execSync } from 'node:child_process';

// Integration test: pastikan skema database uji mutakhir sebelum tes berjalan.
export default function setup() {
  const url = process.env.TEST_DATABASE_URL || 'postgresql://postgres@127.0.0.1:5433/simpeg_test';
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
}
