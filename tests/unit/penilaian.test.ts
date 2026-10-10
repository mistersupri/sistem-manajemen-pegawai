import { describe, expect, it } from 'vitest';
import { pickPeers, type Candidate } from '@/lib/assessment/pick';
import { averageOf, INDICATOR_KEYS, predicateOf } from '@/lib/assessment/indicators';
import { combine } from '@/lib/services/assessment';

const all = (n: number) => Object.fromEntries(INDICATOR_KEYS.map((k) => [k, n]));

describe('indikator dan predikat', () => {
  it('ada 19 indikator dari 3 kelompok formulir', () => {
    expect(INDICATOR_KEYS).toHaveLength(19);
  });
  it('75 ke atas Baik, di bawah 75 Buruk', () => {
    expect(predicateOf(75)).toBe('Baik');
    expect(predicateOf(74.99)).toBe('Buruk');
    expect(predicateOf(100)).toBe('Baik');
  });
  it('rata-rata dibulatkan dua desimal', () => {
    expect(averageOf({ ...all(80), d1: 90 })).toBe(80.53);
  });
});

describe('pembagian rekan penilai', () => {
  const people: Candidate[] = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, unitId: i < 5 ? 'A' : 'B', parentUnitId: 'P' }));
  it('tidak memilih diri sendiri, atasan, atau yang dikecualikan, dan tanpa duplikat', () => {
    const load = new Map<string, number>();
    const picks = pickPeers(people[0], people, 3, load, new Set(['p1']));
    expect(picks).toHaveLength(3);
    expect(new Set(picks).size).toBe(3);
    expect(picks).not.toContain('p0');
    expect(picks).not.toContain('p1');
  });
  it('mendahulukan rekan satu unit', () => {
    const picks = pickPeers(people[0], people, 3, new Map(), new Set());
    expect(picks.every((id) => ['p1', 'p2', 'p3', 'p4'].includes(id))).toBe(true);
  });
  it('unit kecil melengkapi dari unit lain', () => {
    const solo: Candidate[] = [{ id: 'x', unitId: 'S', parentUnitId: 'P' }, ...people];
    const picks = pickPeers(solo[0], solo, 3, new Map(), new Set());
    expect(picks).toHaveLength(3);
  });
  it('beban tugas merata: semua orang menilai hampir sama banyak', () => {
    const load = new Map<string, number>();
    for (const t of people) pickPeers(t, people, 3, load, new Set());
    const counts = people.map((p) => load.get(p.id) ?? 0);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(30);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(2);
  });
  it('kandidat kurang dari diminta: hasil lebih sedikit tanpa error', () => {
    const few: Candidate[] = people.slice(0, 3);
    expect(pickPeers(few[0], few, 5, new Map(), new Set())).toHaveLength(2);
  });
});

describe('gabungan nilai atasan dan rekan', () => {
  const sub = (role: string, n: number, extra: object = {}) => ({ role, scores: all(n), average: n, competence: null, followUp: null, note: null, ...extra });
  it('nilai akhir per indikator adalah rata-rata nilai atasan dan rata-rata rekan', () => {
    const c = combine([sub('ATASAN', 90, { competence: 'SESUAI', followUp: 'DIREKOMENDASIKAN' }), sub('REKAN', 70), sub('REKAN', 80)]);
    expect(c.bossAverage).toBe(90);
    expect(c.peerAverage).toBe(75);
    expect(c.average).toBe(82.5);
    expect(c.predicate).toBe('Baik');
    expect(c.competence).toBe('SESUAI');
  });
  it('tanpa atasan memakai rekan saja, tanpa penilaian hasilnya kosong', () => {
    expect(combine([sub('REKAN', 60)]).average).toBe(60);
    expect(combine([sub('REKAN', 60)]).predicate).toBe('Buruk');
    expect(combine([]).average).toBeNull();
  });
});
