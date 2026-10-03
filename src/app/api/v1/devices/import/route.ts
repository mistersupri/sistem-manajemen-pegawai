import { route, uploadedFile } from '@/lib/api';
import { unprocessable } from '@/lib/errors';
import { importDeviceFile } from '@/lib/services/devices';

export const POST = route({ perm: 'device.sync', rate: { key: 'devimport', limit: 20, windowMs: 600_000 } }, async ({ req, actor }) => {
  const form = await req.formData();
  const f = await uploadedFile(form, 'file', 30_000_000);
  if (!f) throw unprocessable('Pilih berkas hasil unduhan mesin.', { file: 'Wajib diisi' });
  const deviceId = String(form.get('deviceId') || '') || null;
  return importDeviceFile(actor, deviceId, f.buffer, f.name);
});
