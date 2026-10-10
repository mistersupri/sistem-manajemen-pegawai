import { fileResponse, route } from '@/lib/api';
import { attachmentFor } from '@/lib/services/performance';
import { readStored } from '@/lib/storage';

export const GET = route<{ id: string }>({ perm: ['report.self', 'report.review', 'report.manage'] }, async ({ actor, params }) => {
  const a = await attachmentFor(actor, params.id);
  return fileResponse(await readStored(a.path), a.fileName, a.mime, a.mime.startsWith('image/') || a.mime === 'application/pdf');
});
