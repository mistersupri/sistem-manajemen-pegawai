import { fileResponse, route } from '@/lib/api';
import { getCorrection } from '@/lib/services/corrections';
import { MIME, readStored, sniff } from '@/lib/storage';
import { notFound } from '@/lib/errors';

export const GET = route<{ id: string }>({ perm: ['correction.request', 'correction.review'] }, async ({ actor, params }) => {
  const c = await getCorrection(actor, params.id);
  if (!c.attachmentPath) throw notFound();
  const buf = await readStored(c.attachmentPath);
  const ext = sniff(buf) ?? 'pdf';
  return fileResponse(buf, `lampiran.${ext}`, MIME[ext], true);
});
