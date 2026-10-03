import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  // `prisma generate` (saat build image) tidak butuh koneksi; migrate/seed tetap wajib DATABASE_URL.
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
