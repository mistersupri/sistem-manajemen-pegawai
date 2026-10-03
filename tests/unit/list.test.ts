import { describe, expect, it } from 'vitest';
import { clampPage, listSchema, qs, sortRows } from '@/lib/list';

describe('parameter daftar', () => {
  const schema = listSchema(['nama', 'unit'] as const, { sort: 'nama' });

  it('nilai URL yang salah jatuh ke bawaan, bukan galat', () => {
    expect(schema.parse({ page: 'abc', per: '999', sort: 'hapus', dir: 'naik' })).toEqual({ page: 1, per: 20, sort: 'nama', dir: 'asc' });
    expect(schema.parse({ page: '3', per: '100', sort: 'unit', dir: 'desc' })).toEqual({ page: 3, per: 100, sort: 'unit', dir: 'desc' });
  });

  it('halaman di luar jangkauan dijepit ke halaman terakhir', () => {
    expect(clampPage(9, 25, 60)).toBe(3);
    expect(clampPage(2, 25, 0)).toBe(1);
  });

  it('urut di memori: angka dan teks, nilai kosong selalu di akhir', () => {
    const rows = [{ v: 3 }, { v: null }, { v: 10 }, { v: 1 }];
    expect(sortRows(rows, (r) => r.v, 'asc').map((r) => r.v)).toEqual([1, 3, 10, null]);
    expect(sortRows(rows, (r) => r.v, 'desc').map((r) => r.v)).toEqual([10, 3, 1, null]);
    expect(sortRows([{ n: 'Budi' }, { n: 'agus' }], (r) => r.n, 'asc').map((r) => r.n)).toEqual(['agus', 'Budi']);
  });

  it('query string membuang nilai kosong', () => {
    expect(qs({ a: '1', b: '', c: undefined, d: 0 })).toBe('?a=1&d=0');
  });
});
