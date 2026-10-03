import { NextResponse } from 'next/server';
import { route, uploadedFile } from '@/lib/api';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { assertCan, scopeOf } from '@/lib/auth/actor';
import { forbidden, unprocessable } from '@/lib/errors';
import { getSetting } from '@/lib/settings';
import { MIME, readStored, removeStored, saveFile, sniff } from '@/lib/storage';

// Logo instansi bersifat publik (tampil di halaman masuk).
export async function GET() {
  const logo = await getSetting('org.logo');
  if (!logo) return new NextResponse(null, { status: 404 });
  const buf = await readStored(logo).catch(() => null);
  if (!buf) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(buf), { headers: { 'Content-Type': MIME[sniff(buf) ?? 'png'], 'Cache-Control': 'public, max-age=86400' } });
}

export const POST = route({ perm: 'settings.manage' }, async ({ req, actor }) => {
  assertCan(actor, 'settings.manage');
  if (!scopeOf(actor, 'settings.manage')!.all) throw forbidden();
  const f = await uploadedFile(await req.formData(), 'logo', 1_000_000);
  if (!f) throw unprocessable('Pilih berkas logo.', { logo: 'Wajib diisi' });
  const ext = sniff(f.buffer);
  if (!ext || !['png', 'jpg', 'webp'].includes(ext)) throw unprocessable('Logo harus PNG, JPG, atau WebP.', { logo: 'Format tidak didukung' });
  const old = await getSetting('org.logo');
  const path = await saveFile('logo', f.buffer, ext);
  await prisma.systemSetting.upsert({ where: { key: 'org.logo' }, update: { value: path, updatedById: actor.userId }, create: { key: 'org.logo', value: path, updatedById: actor.userId } });
  await removeStored(old);
  await audit(actor, { action: 'settings.logo', entityType: 'SystemSetting', entityId: 'org.logo' });
  return { ok: true };
});

export const DELETE = route({ perm: 'settings.manage' }, async ({ actor }) => {
  if (!scopeOf(actor, 'settings.manage')!.all) throw forbidden();
  await removeStored(await getSetting('org.logo'));
  await prisma.systemSetting.deleteMany({ where: { key: 'org.logo' } });
  await audit(actor, { action: 'settings.logo_delete', entityType: 'SystemSetting', entityId: 'org.logo' });
});
