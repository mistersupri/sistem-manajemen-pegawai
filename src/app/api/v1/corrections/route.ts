import { route, uploadedFile } from '@/lib/api';
import { listCorrections, requestCorrection } from '@/lib/services/corrections';
import { saveFile, sniff } from '@/lib/storage';
import { unprocessable } from '@/lib/errors';

export const GET = route({ perm: ['correction.request', 'correction.review'] }, async ({ req, actor }) => listCorrections(actor, Object.fromEntries(req.nextUrl.searchParams)));

export const POST = route({ perm: 'correction.request', rate: { key: 'corr', limit: 20, windowMs: 3600_000 } }, async ({ req, actor }) => {
  const form = await req.formData();
  const file = await uploadedFile(form, 'attachment', 5_000_000);
  let path: string | null = null;
  if (file) {
    const ext = sniff(file.buffer);
    if (!ext || !['jpg', 'png', 'pdf'].includes(ext)) throw unprocessable('Lampiran harus JPG, PNG, atau PDF.', { attachment: 'Format tidak didukung' });
    path = await saveFile(`lampiran/${new Date().toISOString().slice(0, 7)}`, file.buffer, ext);
  }
  const data = Object.fromEntries([...form.entries()].filter(([k]) => k !== 'attachment'));
  return requestCorrection(actor, data, path);
});
