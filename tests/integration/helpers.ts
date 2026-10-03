// Fixture integration test. Semua data di sini fiktif dan hanya ada di database uji.
import { vi } from 'vitest';
import { prisma } from '@/lib/db';
import { syncRbac } from '@/lib/auth/sync';
import { loadActor, type Actor } from '@/lib/auth/actor';
import { hashPassword } from '@/lib/auth/password';
import { systemActor } from '@/lib/auth/system';
import { addDays, todayIn, weekdayOf } from '@/lib/time';
import { createSchedule, createAssignment } from '@/lib/services/schedules';
import { createEmployee } from '@/lib/services/employees';

/** Kosongkan seluruh tabel (TRUNCATE tidak memicu trigger baris immutability). */
export async function resetDb() {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  await syncRbac();
}

/** Hari kerja (Senin sampai Jumat) terakhir sebelum hari ini, mundur n hari kerja. */
export function pastWorkday(n = 1) {
  let d = todayIn('Asia/Jakarta');
  let left = n;
  while (left > 0) {
    d = addDays(d, -1);
    if (![0, 6].includes(weekdayOf(d))) left--;
  }
  return d;
}

export const PASSWORD = 'Uji#Rahasia2026';

async function user(username: string, employeeId: string | null, roles: { code: string; unitId?: string | null }[]) {
  const u = await prisma.user.create({ data: { username, employeeId, passwordHash: await hashPassword(PASSWORD) } });
  for (const r of roles) {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: r.code } });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id, unitId: r.unitId ?? null, includeSubunits: true } });
  }
  return u;
}

export async function actorOf(userId: string): Promise<Actor> {
  return (await loadActor(userId))!;
}

/**
 * Struktur uji:
 *   Unit A (kepala: Kabid A) > Sub-unit A1 (Staf A, atasan Kabid A)
 *   Unit B (Staf B)
 * Pengguna: admin kepegawaian (semua unit), operator unit B, pimpinan unit A, akun pegawai.
 */
export async function seedFixture() {
  await resetDb();
  const sys = systemActor('uji');
  const unitA = await prisma.organizationUnit.create({ data: { code: 'UJI-A', name: 'Unit Uji A' } });
  const unitA1 = await prisma.organizationUnit.create({ data: { code: 'UJI-A1', name: 'Sub-unit Uji A1', parentId: unitA.id } });
  const unitB = await prisma.organizationUnit.create({ data: { code: 'UJI-B', name: 'Unit Uji B' } });
  const reg = await createSchedule(sys, { code: 'REG', name: 'Reguler uji', kind: 'REGULER', checkIn: '07:30', checkOut: '16:00', lateToleranceMin: 5, earlyLeaveToleranceMin: 0, workdays: [1, 2, 3, 4, 5], color: '#2a78d6' });
  for (const u of [unitA, unitB]) await createAssignment(sys, { scheduleId: reg.id, unitId: u.id, kind: 'TETAP', startDate: '2020-01-01' });
  const kabidA = (await createEmployee(sys, { fullName: 'Kabid Uji', employeeNumber: '900000000000000001', unitId: unitA.id, employmentStatus: 'PNS' })).employee;
  const stafA = (await createEmployee(sys, { fullName: 'Staf Uji A', employeeNumber: '900000000000000002', unitId: unitA1.id, supervisorId: kabidA.id, employmentStatus: 'PNS', machinePin: '101' })).employee;
  const stafB = (await createEmployee(sys, { fullName: 'Staf Uji B', employeeNumber: '900000000000000003', unitId: unitB.id, employmentStatus: 'PNS', machinePin: '102' })).employee;
  const admin = await user('admin.uji', null, [{ code: 'ADMIN_KEPEGAWAIAN' }]);
  const operatorB = await user('operator.uji', null, [{ code: 'OPERATOR_UNIT', unitId: unitB.id }]);
  const kabidUser = await user('kabid.uji', kabidA.id, [{ code: 'PIMPINAN', unitId: unitA.id }, { code: 'PEGAWAI' }]);
  const stafAUser = await user('stafa.uji', stafA.id, [{ code: 'PEGAWAI' }]);
  const stafBUser = await user('stafb.uji', stafB.id, [{ code: 'PEGAWAI' }]);
  const superUser = await user('super.uji', null, [{ code: 'SUPER_ADMIN' }]);
  return { unitA, unitA1, unitB, reg, kabidA, stafA, stafB, users: { admin, operatorB, kabidUser, stafAUser, stafBUser, superUser } };
}

/** Header/cookie palsu untuk fungsi yang membaca next/headers di luar request. */
export function mockNextHeaders() {
  const jar = new Map<string, string>();
  vi.doMock('next/headers', () => ({
    headers: async () => new Headers({ 'user-agent': 'vitest', 'x-real-ip': '127.0.0.1' }),
    cookies: async () => ({
      get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k)! } : undefined),
      set: (k: string, v: string) => { jar.set(k, v); },
      delete: (k: string) => { jar.delete(k); },
    }),
  }));
  return jar;
}
