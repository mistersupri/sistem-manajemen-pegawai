import { route, uploadedFile } from '@/lib/api';
import { listLeave, requestLeave } from '@/lib/services/leave';
import { saveFile, sniff } from '@/lib/storage';
import { unprocessable } from '@/lib/errors';

export const GET = route({ perm: ['leave.request', 'leave.approve', 'leave.manage'] }, async ({ req, actor }) => listLeave(actor, Object.fromEntries(req.nextUrl.searchParams)));

export const POST = route({ perm: 'leave.request', rate: { key: 'leave', limit: 20, windowMs: 3600_000 } }, async ({ req, actor }) => {
  const form = await req.formData();
  const file = await uploadedFile(form, 'attachment', 5_000_000);
  let path: string | null = null;
  if (file) {
    const ext = sniff(file.buffer);
    if (!ext || !['jpg', 'png', 'pdf'].includes(ext)) throw unprocessable('Lampiran harus JPG, PNG, atau PDF.', { attachment: 'Format tidak didukung' });
    path = await saveFile(`lampiran/${new Date().toISOString().slice(0, 7)}`, file.buffer, ext);
  }
  const data = Object.fromEntries([...form.entries()].filter(([k]) => k !== 'attachment'));
  return requestLeave(actor, data, path);
});
