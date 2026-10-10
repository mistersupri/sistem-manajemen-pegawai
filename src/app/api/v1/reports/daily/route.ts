import { route } from '@/lib/api';
import { MAX_FILES, saveDailyReport } from '@/lib/services/performance';
import { unprocessable } from '@/lib/errors';

export const POST = route({ perm: 'report.self', rate: { key: 'dailyreport', limit: 60, windowMs: 3600_000 } }, async ({ req, actor }) => {
  const form = await req.formData();
  const files: { name: string; buffer: Buffer }[] = [];
  for (const f of form.getAll('files')) {
    if (typeof f === 'string' || f.size === 0) continue;
    if (f.size > 5_000_000) throw unprocessable(`Berkas "${f.name}" lebih dari 5 MB.`, { files: 'Terlalu besar' });
    files.push({ name: f.name || 'berkas', buffer: Buffer.from(await f.arrayBuffer()) });
  }
  if (files.length > MAX_FILES) throw unprocessable(`Maksimal ${MAX_FILES} lampiran per hari.`, { files: 'Terlalu banyak' });
  const remove = String(form.get('remove') || '').split(',').map((x) => x.trim()).filter(Boolean);
  return saveDailyReport(actor, { date: form.get('date'), content: form.get('content') }, files, remove);
});
