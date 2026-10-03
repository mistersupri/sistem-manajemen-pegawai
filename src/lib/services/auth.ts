import { prisma } from '../db';
import { decrypt } from '../crypto';
import { audit } from '../audit';
import { AppError, unauthorized } from '../errors';
import { rateLimit } from '../rate-limit';
import { verifyPassword } from '../auth/password';
import { verifyTotp } from '../auth/mfa';
import { ADMIN_ROLE_CODES } from '../auth/catalog';
import { createSession, destroySession, readSession, requestMeta } from '../auth/session';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const GENERIC = 'Username atau password salah.';

export async function login(username: string, password: string) {
  const meta = await requestMeta();
  const uname = username.trim().toLowerCase();
  // Kantor biasanya keluar lewat satu IP (NAT), jadi batas per IP longgar; percobaan menebak
  // password satu akun dibatasi per username dan oleh penguncian akun di bawah.
  rateLimit(`login-ip:${meta.ip ?? 'unknown'}`, 300, 5 * 60_000);
  rateLimit(`login-user:${uname}`, 10, 5 * 60_000);
  const user = await prisma.user.findFirst({
    where: { username: uname, deletedAt: null },
    include: { roles: { include: { role: true } } },
  });
  const fail = async (reason: string, userId?: string) => {
    await audit(userId ? { userId, username: uname } : null, { action: 'auth.login', entityType: 'User', entityId: userId, result: 'FAILURE', meta: { username: uname, reason } });
  };
  if (!user || !user.isActive) {
    await fail(user ? 'nonaktif' : 'tidak_ada');
    throw unauthorized(GENERIC);
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await fail('terkunci', user.id);
    throw new AppError(423, 'LOCKED', `Akun dikunci sementara karena terlalu banyak percobaan gagal. Coba lagi setelah ${LOCK_MINUTES} menit.`);
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    const count = user.failedLoginCount + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: count >= MAX_FAILED ? 0 : count, lockedUntil: count >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null },
    });
    await fail('password_salah', user.id);
    throw unauthorized(GENERIC);
  }
  await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
  if (user.mfaEnabled) {
    await createSession(user.id, true);
    return { mfaRequired: true };
  }
  await createSession(user.id, false);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ userId: user.id, username: user.username }, { action: 'auth.login', entityType: 'User', entityId: user.id });
  const isAdmin = user.roles.some((r) => ADMIN_ROLE_CODES.includes(r.role.code));
  return { mfaRequired: false, mustChangePassword: user.mustChangePassword, isAdmin };
}

export async function completeMfa(code: string) {
  const session = await readSession();
  if (!session || !session.mfaPending) throw unauthorized('Sesi verifikasi berakhir. Silakan masuk ulang.');
  rateLimit(`mfa:${session.id}`, 5, 5 * 60_000);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
  if (!user.mfaSecretEnc || !verifyTotp(code.trim(), decrypt(user.mfaSecretEnc))) {
    await audit({ userId: user.id, username: user.username }, { action: 'auth.mfa', entityType: 'User', entityId: user.id, result: 'FAILURE' });
    throw unauthorized('Kode verifikasi salah atau kedaluwarsa.');
  }
  // Ganti sesi sementara dengan sesi penuh (token baru).
  await prisma.session.delete({ where: { id: session.id } });
  await createSession(user.id, false);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ userId: user.id, username: user.username }, { action: 'auth.login', entityType: 'User', entityId: user.id, meta: { mfa: true } });
  return { mustChangePassword: user.mustChangePassword };
}

export async function logout() {
  const session = await readSession();
  if (session) {
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    await audit(user ? { userId: user.id, username: user.username } : null, { action: 'auth.logout', entityType: 'User', entityId: session.userId });
  }
  await destroySession();
}
