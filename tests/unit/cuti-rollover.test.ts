import { describe, expect, it } from 'vitest';
import { carryOverOf } from '@/lib/services/leave';

const prev = (entitled: number, carriedOver = 0, adjustment = 0) => ({ entitled, carriedOver, adjustment });

describe('sisa cuti tahun lalu yang dibawa', () => {
  it('sisa sedikit dibawa seluruhnya', () => {
    expect(carryOverOf(prev(12), 9, 6)).toBe(3);
  });
  it('sisa banyak dibatasi 6 hari: hak tahun ini 12 + 6', () => {
    expect(carryOverOf(prev(12), 0, 6)).toBe(6);
  });
  it('cuti habis terpakai: tidak ada yang dibawa', () => {
    expect(carryOverOf(prev(12), 12, 6)).toBe(0);
    expect(carryOverOf(prev(12), 14, 6)).toBe(0);
  });
  it('hak tahun lalu mencakup bawaan dan penyesuaian', () => {
    expect(carryOverOf(prev(12, 4, -2), 10, 6)).toBe(4);
  });
  it('tanpa saldo tahun lalu atau batas 0: tidak dibawa', () => {
    expect(carryOverOf(undefined, 0, 6)).toBe(0);
    expect(carryOverOf(prev(12), 0, 0)).toBe(0);
  });
});
