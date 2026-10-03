import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { env } from './env';

// Satu instance per proses (dan per hot-reload saat development).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function client() {
  if (!globalForPrisma.prisma) {
    const adapter = new PrismaPg({ connectionString: env().DATABASE_URL });
    globalForPrisma.prisma = new PrismaClient({ adapter });
  }
  return globalForPrisma.prisma;
}

// Dibuat saat pertama dipakai, bukan saat modul diimpor, agar `next build` tidak butuh
// DATABASE_URL dan rahasia aplikasi.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const c = client();
    const value = Reflect.get(c, prop, c);
    return typeof value === 'function' ? value.bind(c) : value;
  },
});

export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
export type Db = typeof prisma | Tx;
