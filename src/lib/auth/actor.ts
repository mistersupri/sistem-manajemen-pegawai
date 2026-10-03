import type { Prisma } from '@/generated/prisma/client';
import { prisma, type Db } from '../db';
import { forbidden, notFound } from '../errors';
import type { Permission } from './catalog';

// Cakupan data suatu izin: semua unit, atau sekumpulan unit (sudah termasuk subunit).
export type Scope = { all: true } | { all: false; unitIds: string[] };

export interface Actor {
  userId: string;
  username: string;
  displayName: string;
  employeeId: string | null;
  roleCodes: string[];
  mfaEnabled: boolean;
  mustChangePassword: boolean;
  sessionId: string | null;
  permissions: Map<Permission, Scope>;
}

/** Peta unit -> seluruh keturunannya (termasuk dirinya). */
export async function unitDescendants(db: Db = prisma) {
  const units = await db.organizationUnit.findMany({ where: { deletedAt: null }, select: { id: true, parentId: true } });
  const children = new Map<string, string[]>();
  for (const u of units) if (u.parentId) children.set(u.parentId, [...(children.get(u.parentId) || []), u.id]);
  const memo = new Map<string, string[]>();
  const walk = (id: string, seen = new Set<string>()): string[] => {
    if (memo.has(id)) return memo.get(id)!;
    if (seen.has(id)) return [id];
    seen.add(id);
    const out = [id, ...(children.get(id) || []).flatMap((c) => walk(c, seen))];
    memo.set(id, out);
    return out;
  };
  return walk;
}

export async function loadActor(userId: string, sessionId: string | null = null, db: Db = prisma): Promise<Actor | null> {
  const user = await db.user.findFirst({
    where: { id: userId, isActive: true, deletedAt: null },
    include: {
      employee: { select: { fullName: true, frontTitle: true, backTitle: true, isActive: true, deletedAt: true } },
      roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
    },
  });
  if (!user) return null;
  const descendants = await unitDescendants(db);
  const perms = new Map<Permission, Scope>();
  for (const ur of user.roles) {
    const unitIds = ur.unitId ? (ur.includeSubunits ? descendants(ur.unitId) : [ur.unitId]) : null;
    for (const rp of ur.role.permissions) {
      const code = rp.permission.code as Permission;
      const cur = perms.get(code);
      if (cur?.all) continue;
      if (!unitIds) perms.set(code, { all: true });
      else perms.set(code, { all: false, unitIds: [...new Set([...(cur && !cur.all ? cur.unitIds : []), ...unitIds])] });
    }
  }
  const emp = user.employee && !user.employee.deletedAt ? user.employee : null;
  return {
    userId: user.id,
    username: user.username,
    displayName: emp ? emp.fullName : user.username,
    employeeId: emp ? user.employeeId : null,
    roleCodes: [...new Set(user.roles.map((r) => r.role.code))],
    mfaEnabled: user.mfaEnabled,
    mustChangePassword: user.mustChangePassword,
    sessionId,
    permissions: perms,
  };
}

export const can = (actor: Actor | null, perm: Permission) => !!actor?.permissions.has(perm);
export const canAny = (actor: Actor | null, perms: Permission[]) => perms.some((p) => can(actor, p));

export function assertCan(actor: Actor, perm: Permission) {
  if (!can(actor, perm)) throw forbidden();
}

export function scopeOf(actor: Actor, perm: Permission): Scope | null {
  return actor.permissions.get(perm) ?? null;
}

/** Filter Prisma untuk pegawai dalam cakupan izin. Melempar 403 bila izin tidak dimiliki. */
export function employeeScopeWhere(actor: Actor, perm: Permission): Prisma.EmployeeWhereInput {
  const s = scopeOf(actor, perm);
  if (!s) throw forbidden();
  return s.all ? {} : { unitId: { in: s.unitIds } };
}

export function unitInScope(actor: Actor, perm: Permission, unitId: string | null | undefined) {
  const s = scopeOf(actor, perm);
  if (!s) return false;
  if (s.all) return true;
  return !!unitId && s.unitIds.includes(unitId);
}

/**
 * Ambil pegawai dan pastikan berada dalam cakupan. Pegawai di luar cakupan diperlakukan
 * sebagai tidak ditemukan agar keberadaannya tidak bocor ke unit lain.
 */
export async function getEmployeeInScope(actor: Actor, perm: Permission, employeeId: string, db: Db = prisma) {
  const emp = await db.employee.findFirst({ where: { id: employeeId, deletedAt: null } });
  if (!emp) throw notFound('Pegawai tidak ditemukan.');
  if (emp.id === actor.employeeId && selfPermissionFor(perm) && can(actor, selfPermissionFor(perm)!)) return emp;
  if (!unitInScope(actor, perm, emp.unitId)) throw notFound('Pegawai tidak ditemukan.');
  return emp;
}

// Izin "milik sendiri" yang membuka akses ke data pegawai yang login.
function selfPermissionFor(perm: Permission): Permission | null {
  if (perm.startsWith('attendance.')) return 'attendance.self';
  if (perm === 'employee.read') return 'attendance.self';
  if (perm.startsWith('leave.')) return 'leave.request';
  if (perm.startsWith('correction.')) return 'correction.request';
  if (perm.startsWith('biometric.')) return 'biometric.enroll_self';
  if (perm === 'schedule.read') return 'attendance.self';
  return null;
}
