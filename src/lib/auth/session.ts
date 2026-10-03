import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { prisma } from '../db';
import { randomToken, sha256 } from '../crypto';
import { env } from '../env';
import { getSetting } from '../settings';
import { loadActor, type Actor } from './actor';

export const SESSION_COOKIE = 'simpeg_session';

export function cookieSecure() {
  const v = env().COOKIE_SECURE;
  return v === '1' || (process.env.NODE_ENV === 'production' && v !== '0');
}

export async function requestMeta() {
  const h = await headers();
  const fwd = env().TRUST_PROXY === '1' ? h.get('x-forwarded-for')?.split(',')[0]?.trim() : null;
  return { ip: fwd || h.get('x-real-ip') || h.get('x-forwarded-for')?.split(',')[0]?.trim() || null, userAgent: h.get('user-agent') };
}

export async function createSession(userId: string, mfaPending: boolean) {
  const token = randomToken();
  const hours = mfaPending ? 0.25 : Number(await getSetting('security.sessionHours')) || 12;
  const expiresAt = new Date(Date.now() + hours * 3600_000);
  const meta = await requestMeta();
  await prisma.session.create({ data: { id: sha256(token), userId, mfaPending, expiresAt, ip: meta.ip, userAgent: meta.userAgent } });
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: cookieSecure(), path: '/', expires: expiresAt });
  return token;
}

/** Sesi aktif dari cookie (termasuk yang masih menunggu kode MFA). */
export const readSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { id: sha256(token) } });
  if (!session || session.expiresAt < new Date()) return null;
  if (Date.now() - session.lastSeenAt.getTime() > 60_000) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  }
  return session;
});

/** Pengguna yang sudah login penuh (MFA selesai bila diperlukan). */
export const getActor = cache(async (): Promise<Actor | null> => {
  const session = await readSession();
  if (!session || session.mfaPending) return null;
  return loadActor(session.userId, session.id);
});

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { id: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}
