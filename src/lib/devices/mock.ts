import { createHash } from 'node:crypto';
import { addDays, dateRange, todayIn, weekdayOf, zonedParts } from '../time';
import type { DeviceAdapter, FetchResult } from './adapter';

// Simulasi mesin untuk pengembangan, demo, dan pengujian. Data deterministik: menarik ulang
// rentang yang sama menghasilkan scan yang sama, sehingga deduplikasi bisa diuji.
// host 'mock://gagal' mensimulasikan perangkat offline.
const TZ = 'Asia/Jakarta';

function jitter(seed: string, max: number) {
  return createHash('sha1').update(seed).digest().readUInt16BE(0) % max;
}

export const mockAdapter: DeviceAdapter = {
  id: 'MOCK',
  label: 'Mesin simulasi (mock)',
  maturity: 'MOCK',
  connection: 'API',
  pull: true,
  note: 'Hanya untuk pengembangan dan demo. Data scan dibuat otomatis untuk PIN pegawai yang terdaftar.',
  async testConnection(cfg) {
    if (cfg.host === 'mock://gagal') return { ok: false, message: 'Simulasi: perangkat tidak merespons.' };
    const z = zonedParts(new Date(), TZ);
    return { ok: true, message: 'Simulasi: perangkat merespons.', deviceClock: `${z.date} ${z.time}:00` };
  },
  async fetch(cfg, cursor): Promise<FetchResult> {
    if (cfg.host === 'mock://gagal') throw new Error('Simulasi: perangkat tidak merespons (timeout).');
    const today = todayIn(TZ);
    const from = cursor ? cursor.slice(0, 10) : addDays(today, -6);
    const now = zonedParts(new Date(), TZ);
    const nowStamp = `${now.date} ${now.time}:00`;
    const scans = [];
    for (const date of dateRange(from, today)) {
      if ([0, 6].includes(weekdayOf(date))) continue;
      for (const pin of cfg.knownPins ?? []) {
        if (jitter(`${pin}|${date}|absen`, 20) === 0) continue; // sesekali tidak ada scan
        const inMin = 7 * 60 + jitter(`${pin}|${date}|in`, 60); // 07:00 sampai 07:59
        const outMin = 16 * 60 + jitter(`${pin}|${date}|out`, 50);
        for (const m of [inMin, outMin]) {
          const stamp = `${date} ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
          if (stamp <= nowStamp && (!cursor || stamp > cursor.slice(0, 10) + ' 00:00:00')) scans.push({ pin, local: stamp, verifyMode: '1', statusCode: '0' });
        }
      }
      // Satu PIN yang tidak dikenal untuk menguji pemetaan ID mesin.
      const unk = `${date} 07:${String(10 + jitter(date, 40)).padStart(2, '0')}:00`;
      if (unk <= nowStamp) scans.push({ pin: '99001', local: unk, verifyMode: '1', statusCode: '0' });
    }
    const last = scans.map((s) => s.local).sort().pop() ?? cursor;
    return { scans, users: [{ pin: '99001', name: 'Pengguna Mesin (demo)', department: 'DEMO' }], cursorAfter: last ?? null, deviceClock: nowStamp };
  },
};
