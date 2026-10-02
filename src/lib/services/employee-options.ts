import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '../db';
import { can, employeeScopeWhere, type Actor } from '../auth/actor';
import type { Permission } from '../auth/catalog';
import { forbidden } from '../errors';

/**
 * Pilihan pegawai untuk dialog dan formulir, dimuat saat dibutuhkan (bukan ikut di HTML halaman).
 * `for` menentukan izin dan saringan: jadwal, input manual, akun baru, atau pemetaan ID mesin.
 */
const PURPOSE: Record<string, { perms: Permission[]; where?: Prisma.EmployeeWhereInput }> = {
  jadwal: { perms: ['schedule.manage'] },
  manual: { perms: ['attendance.manual_entry'] },
  akun: { perms: ['user.manage'], where: { user: null } },
  pin: { perms: ['employee.write', 'device.manage'], where: { machinePin: null } },
};

export const optionsQuery = z.object({
  for: z.enum(['jadwal', 'manual', 'akun', 'pin']),
  q: z.string().trim().max(100).optional().or(z.literal('')).transform((v) => v || undefined),
  unitId: z.string().uuid().optional().or(z.literal('')).catch(undefined).transform((v) => v || undefined),
  limit: z.coerce.number().int().min(1).max(5000).catch(50).default(50),
});

export async function employeeOptions(actor: Actor, raw: unknown) {
  const q = optionsQuery.parse(raw);
  const purpose = PURPOSE[q.for];
  const perm = purpose.perms.find((p) => can(actor, p));
  if (!perm) throw forbidden();
  const where: Prisma.EmployeeWhereInput = {
    AND: [
      { deletedAt: null, isActive: true },
      employeeScopeWhere(actor, perm),
      purpose.where ?? {},
      q.unitId ? { unitId: q.unitId } : {},
      q.q ? { OR: [{ fullName: { contains: q.q, mode: 'insensitive' } }, { employeeNumber: { contains: q.q } }] } : {},
    ],
  };
  const [total, rows] = await Promise.all([
    prisma.employee.count({ where }),
    prisma.employee.findMany({ where, select: { id: true, fullName: true, employeeNumber: true, unitId: true, unit: { select: { name: true } } }, orderBy: { fullName: 'asc' }, take: q.limit }),
  ]);
  return { total, rows: rows.map((e) => ({ id: e.id, name: e.fullName, nip: e.employeeNumber, unitId: e.unitId, unit: e.unit?.name ?? null })) };
}
