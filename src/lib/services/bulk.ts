import { z } from 'zod';
import { prisma } from '../db';
import { audit } from '../audit';
import { assertCan, employeeScopeWhere, type Actor } from '../auth/actor';
import { realUserId } from '../auth/system';
import { forbidden, unprocessable } from '../errors';
import { forgetTemplate } from '../biometric/templates';
import { assignRole, resetUserPassword, setUserActive } from './users';
import { getEmployeeInScope } from '../auth/actor';

export const MAX_BULK = 200;

export interface BulkOutcome {
  done: number;
  skipped: { name: string; reason: string }[];
  /** Hanya untuk reset password: kata sandi sementara yang dibuat, ditampilkan sekali. */
  credentials?: { name: string; username: string; password: string }[];
}

const ids = z.array(z.string().uuid()).min(1, 'Pilih minimal satu data').max(MAX_BULK, `Maksimal ${MAX_BULK} data sekali proses`);

export const bulkUserInput = z.discriminatedUnion('action', [
  z.object({ action: z.literal('role'), ids, roleId: z.string().uuid('Pilih peran'), unitId: z.string().uuid().nullable().optional(), includeSubunits: z.boolean().default(true) }),
  z.object({ action: z.literal('reset-password'), ids }),
  z.object({ action: z.literal('deactivate'), ids }),
  z.object({ action: z.literal('activate'), ids }),
]);
export const bulkEmployeeInput = z.discriminatedUnion('action', [
  z.object({ action: z.literal('delete'), ids, reason: z.string().trim().min(3, 'Alasan wajib diisi').max(300) }),
  z.object({ action: z.literal('role'), ids, roleId: z.string().uuid('Pilih peran'), unitId: z.string().uuid().nullable().optional(), includeSubunits: z.boolean().default(true) }),
  z.object({ action: z.literal('reset-password'), ids }),
  z.object({ action: z.literal('deactivate'), ids }),
  z.object({ action: z.literal('activate'), ids }),
]);

/** Jalankan satu aksi untuk tiap pengguna; yang gagal dicatat beserta alasannya, sisanya tetap diproses. */
async function eachUser(actor: Actor, userIds: string[], fn: (userId: string, label: string) => Promise<{ username: string; password: string } | void>): Promise<BulkOutcome> {
  const users = await prisma.user.findMany({ where: { id: { in: userIds }, deletedAt: null }, select: { id: true, username: true, employee: { select: { fullName: true } } } });
  const label = new Map(users.map((u) => [u.id, u.employee?.fullName ?? u.username]));
  const out: BulkOutcome = { done: 0, skipped: [] };
  for (const id of userIds) {
    const name = label.get(id) ?? 'Pengguna tidak ditemukan';
    try {
      const r = await fn(id, name);
      out.done += 1;
      if (r) (out.credentials ??= []).push({ name, ...r });
    } catch (err) {
      out.skipped.push({ name, reason: (err as Error).message });
    }
  }
  return out;
}

export async function bulkUsers(actor: Actor, raw: unknown): Promise<BulkOutcome> {
  assertCan(actor, 'user.manage');
  const v = bulkUserInput.parse(raw);
  const out = await runUserAction(actor, v.ids, v);
  await audit(actor, { action: `user.bulk_${v.action.replace('-', '_')}`, entityType: 'User', meta: { requested: v.ids.length, done: out.done, skipped: out.skipped.length } });
  return out;
}

type UserAction = z.infer<typeof bulkUserInput>;
function runUserAction(actor: Actor, userIds: string[], v: UserAction) {
  switch (v.action) {
    case 'role': return eachUser(actor, userIds, async (id) => { await assignRole(actor, id, { roleId: v.roleId, unitId: v.unitId ?? null, includeSubunits: v.includeSubunits }); });
    case 'reset-password': return eachUser(actor, userIds, async (id) => { const r = await resetUserPassword(actor, id); return { username: r.username, password: r.password }; });
    case 'deactivate': return eachUser(actor, userIds, async (id) => { await setUserActive(actor, id, false); });
    case 'activate': return eachUser(actor, userIds, async (id) => { await setUserActive(actor, id, true); });
  }
}

/** Aksi massal dari daftar pegawai. Aksi akun dijalankan pada akun milik pegawai terpilih; pegawai tanpa akun dilewati. */
export async function bulkEmployees(actor: Actor, raw: unknown): Promise<BulkOutcome> {
  const v = bulkEmployeeInput.parse(raw);
  if (v.action === 'delete') return deleteEmployees(actor, v.ids, v.reason);
  assertCan(actor, 'user.manage');
  const emps = await prisma.employee.findMany({ where: { AND: [{ id: { in: v.ids }, deletedAt: null }, employeeScopeWhere(actor, 'user.manage')] }, select: { id: true, fullName: true, user: { select: { id: true } } } });
  const withAccount = emps.filter((e) => e.user);
  const out = await runUserAction(actor, withAccount.map((e) => e.user!.id), v);
  for (const e of emps.filter((x) => !x.user)) out.skipped.push({ name: e.fullName, reason: 'Belum memiliki akun' });
  const missing = v.ids.length - emps.length;
  if (missing > 0) out.skipped.push({ name: `${missing} data`, reason: 'Tidak ditemukan atau di luar kewenangan Anda' });
  await audit(actor, { action: `user.bulk_${v.action.replace('-', '_')}`, entityType: 'Employee', meta: { requested: v.ids.length, done: out.done, skipped: out.skipped.length } });
  return out;
}

/**
 * Hapus data pegawai (hapus lunak): pegawai disembunyikan dari daftar, akun ditutup, wajah dihapus, dan NIP serta ID mesin
 * dibebaskan agar bisa dipakai lagi. Riwayat absensi dan audit tetap tersimpan.
 */
export async function deleteEmployees(actor: Actor, employeeIds: string[], reason: string): Promise<BulkOutcome> {
  assertCan(actor, 'employee.delete');
  const out: BulkOutcome = { done: 0, skipped: [] };
  for (const id of employeeIds) {
    let name = 'Pegawai';
    try {
      const emp = await getEmployeeInScope(actor, 'employee.delete', id);
      name = emp.fullName;
      if (emp.id === actor.employeeId) throw forbidden('Tidak bisa menghapus data pegawai milik akun sendiri.');
      const user = await prisma.user.findUnique({ where: { employeeId: emp.id }, include: { roles: { include: { role: true } } } });
      if (user?.roles.some((r) => r.role.code === 'SUPER_ADMIN')) throw forbidden('Pegawai ini memegang peran Super Admin; cabut perannya lebih dulu.');
      const suffix = `~hapus-${emp.id.slice(0, 8)}`;
      await prisma.$transaction(async (tx) => {
        await tx.employee.update({ where: { id: emp.id }, data: { deletedAt: new Date(), isActive: false, employeeNumber: emp.employeeNumber ? `${emp.employeeNumber}${suffix}` : null, machinePin: null } });
        if (user) {
          await tx.user.update({ where: { id: user.id }, data: { deletedAt: new Date(), isActive: false, username: `${user.username}${suffix}` } });
          await tx.session.deleteMany({ where: { userId: user.id } });
          await tx.userRole.deleteMany({ where: { userId: user.id } });
        }
        const templates = await tx.employeeBiometric.findMany({ where: { employeeId: emp.id, status: { in: ['ACTIVE', 'PENDING_VERIFICATION'] } }, select: { id: true } });
        await tx.employeeBiometric.updateMany({ where: { id: { in: templates.map((t) => t.id) } }, data: { status: 'REVOKED', templateEnc: 'DIHAPUS', revokedAt: new Date(), revokedById: realUserId(actor), revokedReason: 'Data pegawai dihapus' } });
        templates.forEach((t) => forgetTemplate(t.id));
        await audit(actor, { action: 'employee.delete', entityType: 'Employee', entityId: emp.id, before: { employeeNumber: emp.employeeNumber, machinePin: emp.machinePin, fullName: emp.fullName }, meta: { reason } }, tx);
      });
      out.done += 1;
    } catch (err) {
      out.skipped.push({ name, reason: (err as Error).message });
    }
  }
  if (!out.done && !out.skipped.length) throw unprocessable('Tidak ada data yang dihapus.');
  return out;
}
