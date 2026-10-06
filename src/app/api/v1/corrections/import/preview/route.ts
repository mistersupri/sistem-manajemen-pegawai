import { route, uploadedFile } from '@/lib/api';
import { unprocessable } from '@/lib/errors';
import { previewCorrectionImport } from '@/lib/services/correction-import';

export const POST = route({ perm: 'correction.review' }, async ({ req, actor }) => {
  const f = await uploadedFile(await req.formData(), 'file', 10_000_000);
  if (!f) throw unprocessable('Pilih berkas untuk diimpor.', { file: 'Wajib diisi' });
  return previewCorrectionImport(actor, f.buffer, f.name);
});
