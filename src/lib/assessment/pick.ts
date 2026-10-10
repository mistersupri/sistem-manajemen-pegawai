// Pembagian penilai rekan secara acak yang adil.
export interface Candidate { id: string; unitId: string | null; parentUnitId: string | null }

/**
 * Pilih `count` penilai rekan untuk satu pegawai. Rekan sekantor (unit sama) didahulukan, lalu satu induk unit,
 * lalu siapa pun. Di antara kandidat sekelompok, yang beban tugasnya paling sedikit dipilih lebih dulu;
 * sisa kesamaan diundi, sehingga beban merata dan pasangan penilai tidak bisa ditebak.
 */
export function pickPeers(
  target: Candidate, pool: Candidate[], count: number, load: Map<string, number>, exclude: Set<string>,
  rnd: () => number = Math.random,
): string[] {
  const chosen: string[] = [];
  const ok = (c: Candidate) => c.id !== target.id && !exclude.has(c.id) && !chosen.includes(c.id);
  const tiers = [
    (c: Candidate) => c.unitId !== null && c.unitId === target.unitId,
    (c: Candidate) => c.parentUnitId !== null && c.parentUnitId === target.parentUnitId,
    () => true,
  ];
  for (const inTier of tiers) {
    if (chosen.length >= count) break;
    const cands = pool.filter((c) => ok(c) && inTier(c));
    // Acak dulu, lalu urut stabil menurut beban: kesamaan beban jatuh ke urutan acak.
    const shuffled = [...cands].sort(() => rnd() - 0.5);
    shuffled.sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0));
    for (const c of shuffled) {
      if (chosen.length >= count) break;
      chosen.push(c.id);
      load.set(c.id, (load.get(c.id) ?? 0) + 1);
    }
  }
  return chosen;
}
