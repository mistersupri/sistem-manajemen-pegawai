import { z } from 'zod';
import { body, route } from '@/lib/api';
import { reprocess } from '@/lib/services/devices';
import { rebuildActive } from '@/lib/services/schedules';
import { audit } from '@/lib/audit';
import { isValidDate } from '@/lib/time';

// Hitung ulang rekap dari transaksi sumber untuk rentang tanggal (mis. setelah aturan berubah).
export const POST = route({ perm: 'attendance.recalculate', rate: { key: 'recalc', limit: 5, windowMs: 600_000 } }, async ({ req, actor }) => {
  const v = await body(req, z.object({ from: z.string().refine(isValidDate, 'Tanggal tidak valid'), to: z.string().refine(isValidDate, 'Tanggal tidak valid') })
    .refine((x) => x.from <= x.to, { message: 'Tanggal awal harus sebelum tanggal akhir', path: ['to'] }));
  const raw = await reprocess(actor, v.from, v.to);
  const r = await rebuildActive(null, v.from, v.to);
  await audit(actor, { action: 'attendance.recalculate', meta: { ...v, employees: r.employees } });
  return { ...r, rawProcessed: raw.processed, unmatchedPins: raw.unmatchedPins.length };
});
