import { z } from 'zod';

/**
 * Parameter daftar standar di URL: page, per (baris per halaman), sort, dir.
 * Semua daftar besar memakai bentuk yang sama agar tautan bisa dibagikan dan tombol Kembali bekerja.
 */
export const PAGE_SIZES = [5, 10, 20, 50, 100, 200, 500] as const;
export const DEFAULT_PER = 20;

/** Ukuran halaman dari URL; nilai di luar daftar jatuh ke bawaan. */
export const pickPer = (n: unknown) => ((PAGE_SIZES as readonly number[]).includes(Number(n)) ? Number(n) : DEFAULT_PER);
export type SortDir = 'asc' | 'desc';

export function listSchema<S extends string>(sorts: readonly [S, ...S[]], defaults: { sort: S; dir?: SortDir }) {
  return z.object({
    page: z.coerce.number().int().min(1).max(100000).catch(1).default(1),
    per: z.coerce.number().int().catch(DEFAULT_PER).default(DEFAULT_PER).transform(pickPer),
    sort: z.enum(sorts).catch(defaults.sort).default(defaults.sort),
    dir: z.enum(['asc', 'desc']).catch(defaults.dir ?? 'asc').default(defaults.dir ?? 'asc'),
  });
}

export type ListParams<S extends string> = { page: number; per: number; sort: S; dir: SortDir };

/** skip/take Prisma; halaman di luar jangkauan dijepit ke halaman terakhir oleh pemanggil lewat clampPage. */
export const paging = (p: { page: number; per: number }) => ({ skip: (p.page - 1) * p.per, take: p.per });

export function clampPage(page: number, per: number, total: number) {
  return Math.min(page, Math.max(1, Math.ceil(total / per)));
}

/** Urutkan larik di memori (untuk metrik hasil hitungan, mis. persentase kehadiran). Null selalu di akhir. */
export function sortRows<T>(rows: T[], key: (r: T) => string | number | null | undefined, dir: SortDir) {
  const m = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'id')) * m;
  });
}

/** Query string dari objek, membuang nilai kosong. */
export function qs(params: Record<string, string | number | undefined | null>) {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)])).toString();
  return s ? `?${s}` : '?';
}
