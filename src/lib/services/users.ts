import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { clampPage, listSchema } from '../list';
import { prisma } from '../db';
import { audit } from '../audit';
import { assertCan, getEmployeeInScope, scopeOf, unitInScope, type Actor } from '../auth/actor';
import { ALL_PERMISSIONS, type Permission } from '../auth/catalog';
import { hashPassword, passwordProblem, verifyPassword } from '../auth/password';
import { mfaQrDataUrl, newMfaSecret, verifyTotp } from '../auth/mfa';
import { decrypt, encrypt, randomToken } from '../crypto';
import { conflict, forbidden, notFound, unprocessable } from '../errors';
import { getSettings } from '../settings';

/** Pengguna dengan cakupan seluruh unit untuk izin user.manage bisa mengelola semua akun; selain itu hanya akun pegawai di unitnya. */
function userWhere(actor: Actor) {
  const s = scopeOf(actor, 'user.manage');
  if (!s) throw forbidden();
  return s.all ? { deletedAt: null } : { deletedAt: null, employee: { unitId: { in: s.unitIds } } };
}

export async function listUsers(actor: Actor, q?: string) {
  return prisma.user.findMany({
    where: { ...userWhere(actor), ...(q ? { OR: [{ username: { contains: q, mode: 'insensitive' as const } }, { employee: { fullName: { contains: q, mode: 'insensitive' as const } } }] } : {}) },
    select: {
      id: true, username: true, email: true, isActive: true, mfaEnabled: true, lastLoginAt: true, lockedUntil: true,
      employee: { select: { id: true, fullName: true, unit: { select: { name: true } } } },
      roles: { select: { id: true, unitId: true, includeSubunits: true, role: { select: { code: true, name: true } }, unit: { select: { name: true } } } },
    },
    orderBy: { username: 'asc' },
    take: 500,
  });
}

const USER_ORDER: Record<string, (d: 'asc' | 'desc') => Prisma.UserOrderByWithRelationInput[]> = {
  username: (d) => [{ username: d }],
  nama: (d) => [{ employee: { fullName: d } }, { username: 'asc' }],
  login: (d) => [{ lastLoginAt: { sort: d, nulls: 'last' } }, { username: 'asc' }],
};
export const userListQuery = z.object({
  q: z.string().trim().max(100).optional().or(z.literal('')).transform((v) => v || undefined),
  status: z.enum(['aktif', 'nonaktif', 'terkunci', '']).catch('').default(''),
  role: z.string().max(40).optional().or(z.literal('')).transform((v) => v || undefined),
  mfa: z.enum(['ya', 'tidak', '']).catch('').default(''),
}).and(listSchema(['username', 'nama', 'login'] as const, { sort: 'username' }));

/** Daftar pengguna dengan filter, urutan, dan halaman untuk halaman Pengguna & Peran. */
export async function listUsersPage(actor: Actor, raw: unknown) {
  const q = userListQuery.parse(raw);
  const and: Prisma.UserWhereInput[] = [userWhere(actor)];
  if (q.q) and.push({ OR: [{ username: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }, { employee: { fullName: { contains: q.q, mode: 'insensitive' } } }] });
  if (q.status === 'aktif') and.push({ isActive: true });
  if (q.status === 'nonaktif') and.push({ isActive: false });
  if (q.status === 'terkunci') and.push({ lockedUntil: { gt: new Date() } });
  if (q.role) and.push({ roles: { some: { role: { code: q.role } } } });
  if (q.mfa) and.push({ mfaEnabled: q.mfa === 'ya' });
  const where = { AND: and };
  const total = await prisma.user.count({ where });
  const page = clampPage(q.page, q.per, total);
  const rows = await prisma.user.findMany({
    where,
    select: {
      id: true, username: true, email: true, isActive: true, mfaEnabled: true, lastLoginAt: true, lockedUntil: true,
      employee: { select: { id: true, fullName: true, unit: { select: { name: true } } } },
      roles: { select: { id: true, unitId: true, includeSubunits: true, role: { select: { code: true, name: true } }, unit: { select: { name: true } } } },
    },
    orderBy: USER_ORDER[q.sort](q.dir),
    skip: (page - 1) * q.per,
    take: q.per,
  });
  return { total, page, pageSize: q.per, sort: q.sort, dir: q.dir, rows };
}

export const userInput = z.object({
  username: z.string().trim().toLowerCase().min(3, 'Minimal 3 karakter').max(50).regex(/^[a-z0-9._-]+$/, 'Huruf kecil, angka, titik, garis bawah, strip'),
  email: z.string().trim().max(150).optional().nullable().transform((v) => v || null),
  employeeId: z.string().uuid().optional().nullable().transform((v) => v || null),
  password: z.string().min(8).max(100),
});

export async function createUser(actor: Actor, raw: unknown) {
  assertCan(actor, 'user.manage');
  const v = userInput.parse(raw);
  const problem = passwordProblem(v.password, v.username);
  if (problem) throw unprocessable(problem, { password: problem });
  if (v.employeeId) await getEmployeeInScope(actor, 'user.manage', v.employeeId);
  else if (!scopeOf(actor, 'user.manage')!.all) throw forbidden('Akun tanpa data pegawai hanya bisa dibuat pengelola dengan cakupan seluruh unit.');
  if (await prisma.user.findUnique({ where: { username: v.username } })) throw conflict('Username sudah dipakai.', { username: 'Sudah dipakai' });
  if (v.employeeId && (await prisma.user.findUnique({ where: { employeeId: v.employeeId } }))) throw conflict('Pegawai ini sudah memiliki akun.', { employeeId: 'Sudah punya akun' });
  const u = await prisma.user.create({ data: { username: v.username, email: v.email, employeeId: v.employeeId, passwordHash: await hashPassword(v.password), mustChangePassword: true } });
  await audit(actor, { action: 'user.create', entityType: 'User', entityId: u.id, after: { username: v.username, employeeId: v.employeeId } });
  return u;
}

async function manageableUser(actor: Actor, id: string) {
  const u = await prisma.user.findFirst({ where: { id, ...userWhere(actor) }, include: { roles: { include: { role: true } } } });
  if (!u) throw notFound('Pengguna tidak ditemukan.');
  return u;
}

export const roleAssignInput = z.object({
  roleId: z.string().uuid(),
  unitId: z.string().uuid().nullable().optional().transform((v) => v ?? null),
  includeSubunits: z.boolean().default(true),
});

export async function assignRole(actor: Actor, userId: string, raw: unknown) {
  assertCan(actor, 'user.manage');
  const v = roleAssignInput.parse(raw);
  const u = await manageableUser(actor, userId);
  const role = await prisma.role.findUnique({ where: { id: v.roleId }, include: { permissions: { include: { permission: true } } } });
  if (!role) throw notFound('Peran tidak ditemukan.');
  // Pencegahan eskalasi: tidak boleh memberi izin atau cakupan yang tidak dimiliki sendiri.
  for (const rp of role.permissions) {
    const code = rp.permission.code as Permission;
    const mine = scopeOf(actor, code);
    if (!mine) throw forbidden(`Anda tidak dapat memberikan peran ${role.name} karena tidak memiliki izin "${code}".`);
    if (!mine.all && (!v.unitId || !mine.unitIds.includes(v.unitId))) throw forbidden(`Cakupan unit untuk peran ${role.name} melebihi kewenangan Anda.`);
  }
  if (v.unitId && !unitInScope(actor, 'user.manage', v.unitId)) throw forbidden('Unit di luar kewenangan Anda.');
  if (u.roles.some((r) => r.roleId === v.roleId && r.unitId === v.unitId)) throw conflict('Peran dengan cakupan ini sudah diberikan.');
  const ur = await prisma.userRole.create({ data: { userId, roleId: v.roleId, unitId: v.unitId, includeSubunits: v.includeSubunits } });
  await audit(actor, { action: 'user.role_assign', entityType: 'User', entityId: userId, after: { role: role.code, unitId: v.unitId, includeSubunits: v.includeSubunits } });
  return ur;
}

export async function revokeRole(actor: Actor, userId: string, userRoleId: string) {
  assertCan(actor, 'user.manage');
  const u = await manageableUser(actor, userId);
  const ur = u.roles.find((r) => r.id === userRoleId);
  if (!ur) throw notFound('Penugasan peran tidak ditemukan.');
  if (ur.role.code === 'SUPER_ADMIN') {
    const others = await prisma.userRole.count({ where: { role: { code: 'SUPER_ADMIN' }, unitId: null, user: { isActive: true, deletedAt: null }, NOT: { id: userRoleId } } });
    if (!others) throw conflict('Tidak bisa mencabut Super Admin terakhir.');
  }
  if (userId === actor.userId && ur.role.code === 'SUPER_ADMIN') throw forbidden('Tidak bisa mencabut peran Super Admin milik sendiri.');
  await prisma.userRole.delete({ where: { id: userRoleId } });
  await audit(actor, { action: 'user.role_revoke', entityType: 'User', entityId: userId, before: { role: ur.role.code, unitId: ur.unitId } });
}

export async function setUserActive(actor: Actor, userId: string, active: boolean) {
  assertCan(actor, 'user.manage');
  if (userId === actor.userId) throw forbidden('Tidak bisa menonaktifkan akun sendiri.');
  await manageableUser(actor, userId);
  await prisma.user.update({ where: { id: userId }, data: { isActive: active } });
  if (!active) await prisma.session.deleteMany({ where: { userId } });
  await audit(actor, { action: active ? 'user.activate' : 'user.deactivate', entityType: 'User', entityId: userId });
}

export async function resetUserPassword(actor: Actor, userId: string) {
  assertCan(actor, 'user.manage');
  const u = await manageableUser(actor, userId);
  const temp = `Sm${randomToken(6)}9`;
  await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(temp), mustChangePassword: true, failedLoginCount: 0, lockedUntil: null } });
  await prisma.session.deleteMany({ where: { userId } });
  await audit(actor, { action: 'user.reset_password', entityType: 'User', entityId: userId });
  return { username: u.username, password: temp };
}

export async function resetUserMfa(actor: Actor, userId: string) {
  assertCan(actor, 'user.manage');
  await manageableUser(actor, userId);
  await prisma.user.update({ where: { id: userId }, data: { mfaEnabled: false, mfaSecretEnc: null } });
  await prisma.session.deleteMany({ where: { userId } });
  await audit(actor, { action: 'user.mfa_reset', entityType: 'User', entityId: userId });
}

// Peran dan izin
export async function listRoles() {
  return prisma.role.findMany({ include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } }, orderBy: { name: 'asc' } });
}

export async function setRolePermissions(actor: Actor, roleId: string, codes: string[]) {
  assertCan(actor, 'role.manage');
  if (!scopeOf(actor, 'role.manage')!.all) throw forbidden('Perubahan izin peran hanya untuk pengelola dengan cakupan seluruh unit.');
  const role = await prisma.role.findUnique({ where: { id: roleId }, include: { permissions: { include: { permission: true } } } });
  if (!role) throw notFound('Peran tidak ditemukan.');
  if (role.code === 'SUPER_ADMIN') throw forbidden('Izin Super Admin tidak bisa diubah.');
  const valid = codes.filter((c) => (ALL_PERMISSIONS as string[]).includes(c));
  const perms = await prisma.permission.findMany({ where: { code: { in: valid } } });
  const before = role.permissions.map((p) => p.permission.code).sort();
  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId } }),
    prisma.rolePermission.createMany({ data: perms.map((p) => ({ roleId, permissionId: p.id })) }),
  ]);
  await audit(actor, { action: 'role.permissions_update', entityType: 'Role', entityId: roleId, before, after: valid.sort() });
}

export const roleInput = z.object({
  code: z.string().trim().toUpperCase().min(2).max(40).regex(/^[A-Z0-9_]+$/, 'Huruf besar, angka, garis bawah'),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional().nullable(),
});

export async function createRole(actor: Actor, raw: unknown) {
  assertCan(actor, 'role.manage');
  if (!scopeOf(actor, 'role.manage')!.all) throw forbidden();
  const v = roleInput.parse(raw);
  if (await prisma.role.findUnique({ where: { code: v.code } })) throw conflict('Kode peran sudah dipakai.', { code: 'Sudah dipakai' });
  const r = await prisma.role.create({ data: { code: v.code, name: v.name, description: v.description ?? null } });
  await audit(actor, { action: 'role.create', entityType: 'Role', entityId: r.id, after: v });
  return r;
}

// Akun sendiri: password dan MFA
export async function changeOwnPassword(actor: Actor, current: string, next: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
  if (!(await verifyPassword(current, u.passwordHash))) throw unprocessable('Password lama salah.', { current: 'Password lama salah' });
  const problem = passwordProblem(next, u.username);
  if (problem) throw unprocessable(problem, { next: problem });
  if (await verifyPassword(next, u.passwordHash)) throw unprocessable('Password baru harus berbeda dari password lama.', { next: 'Sama dengan password lama' });
  await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(next), mustChangePassword: false } });
  // Keluarkan sesi lain.
  await prisma.session.deleteMany({ where: { userId: u.id, NOT: actor.sessionId ? { id: actor.sessionId } : undefined } });
  await audit(actor, { action: 'user.change_password', entityType: 'User', entityId: u.id });
}

export async function beginMfaSetup(actor: Actor) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
  if (u.mfaEnabled) throw conflict('MFA sudah aktif.');
  const secret = newMfaSecret();
  await prisma.user.update({ where: { id: u.id }, data: { mfaSecretEnc: encrypt(secret) } });
  const org = (await getSettings())['org.name'];
  return { qr: await mfaQrDataUrl(u.username, `SIMPEG ${org}`, secret), secret };
}

export async function confirmMfaSetup(actor: Actor, code: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
  if (!u.mfaSecretEnc) throw unprocessable('Mulai pengaturan MFA terlebih dahulu.');
  if (!verifyTotp(code.trim(), decrypt(u.mfaSecretEnc))) throw unprocessable('Kode tidak cocok. Periksa jam ponsel lalu coba kode berikutnya.', { code: 'Kode salah' });
  await prisma.user.update({ where: { id: u.id }, data: { mfaEnabled: true } });
  await audit(actor, { action: 'user.mfa_enable', entityType: 'User', entityId: u.id });
}

export async function disableOwnMfa(actor: Actor, password: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
  if (!(await verifyPassword(password, u.passwordHash))) throw unprocessable('Password salah.', { password: 'Password salah' });
  const s = await getSettings();
  if (s['security.mfaRequiredForAdmins'] && actor.roleCodes.some((r) => ['SUPER_ADMIN', 'ADMIN_KEPEGAWAIAN', 'ADMIN_IT'].includes(r))) throw forbidden('MFA wajib untuk akun administrator.');
  await prisma.user.update({ where: { id: u.id }, data: { mfaEnabled: false, mfaSecretEnc: null } });
  await audit(actor, { action: 'user.mfa_disable', entityType: 'User', entityId: u.id });
}
