import { route, uploadedFile } from '@/lib/api';
import { unprocessable } from '@/lib/errors';
import { importHolidayFile } from '@/lib/services/holidays';

export const POST = route({ perm: 'schedule.manage' }, async ({ req, actor }) => {
  const form = await req.formData();
  const f = await uploadedFile(form, 'file', 1_000_000);
  if (!f) throw unprocessable('Pilih berkas .ics atau .csv.', { file: 'Wajib diisi' });
  return importHolidayFile(actor, { year: form.get('year'), filename: f.name, text: f.buffer.toString('utf8') });
});
