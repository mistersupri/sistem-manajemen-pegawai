import { fileResponse, route } from '@/lib/api';
import { getLeave } from '@/lib/services/leave';
import { MIME, readStored, sniff } from '@/lib/storage';
import { notFound } from '@/lib/errors';

export const GET = route<{ id: string }>({}, async ({ actor, params }) => {
  const r = await getLeave(actor, params.id);
  if (!r.attachmentPath) throw notFound();
  const buf = await readStored(r.attachmentPath);
  const ext = sniff(buf) ?? 'pdf';
  return fileResponse(buf, `lampiran.${ext}`, MIME[ext], true);
});
