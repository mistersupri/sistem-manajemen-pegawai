import { route, uploadedFile } from '@/lib/api';
import { unprocessable } from '@/lib/errors';
import { previewImport } from '@/lib/services/employee-import';

export const POST = route({ perm: 'employee.import' }, async ({ req, actor }) => {
  const f = await uploadedFile(await req.formData(), 'file', 10_000_000);
  if (!f) throw unprocessable('Pilih berkas untuk diimpor.', { file: 'Wajib diisi' });
  return previewImport(actor, f.buffer, f.name);
});
