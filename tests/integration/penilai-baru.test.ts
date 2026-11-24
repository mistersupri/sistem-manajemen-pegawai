// Pegawai baru setelah periode dibuka, dan hapus semua penilai. Data fiktif.
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { openPeriod } from '@/lib/services/assessment';
import { autoAssign, clearAssignments, periodOverview } from '@/lib/services/assessment-mapping';
import { createEmployee } from '@/lib/services/employees';
import { systemActor } from '@/lib/auth/system';
import { todayIn } from '@/lib/time';
import { actorOf, seedFixture } from './helpers';

let f: Awaited<ReturnType<typeof seedFixture>>;
let periodId: string;
const month = todayIn('Asia/Jakarta').slice(0, 7);

beforeAll(async () => {
  f = await seedFixture();
  const admin = await actorOf(f.users.admin.id);
  periodId = (await openPeriod(admin, { month, peerCount: 1 })).id;
});

describe('pegawai baru setelah periode dibuka', () => {
  it('muncul di daftar walau belum punya akun, dan bisa dinilai', async () => {
    const admin = await actorOf(f.users.admin.id);
    const baru = (await createEmployee(systemActor('uji'), { fullName: 'Pegawai Baru Uji', employeeNumber: '900000000000000077', unitId: f.unitA1.id, employmentStatus: 'PNS' })).employee;
    const list = await periodOverview(admin, periodId, { q: 'Baru Uji' });
    expect(list.rows).toHaveLength(1);
    expect(list.rows[0].hasAccount).toBe(false);
    expect(list.rows[0].assessors).toHaveLength(0);
    await autoAssign(admin, periodId, { peerCount: 1 });
    const after = await periodOverview(admin, periodId, { q: 'Baru Uji' });
    expect(after.rows[0].assessors.length).toBeGreaterThan(0);
    expect(after.rows[0].assessors.every((a) => a.assessor.id !== baru.id)).toBe(true);
  });

  it('hapus semua penilai menghapus yang belum dinilai saja', async () => {
    const admin = await actorOf(f.users.admin.id);
    const a = await prisma.assessmentAssignment.findFirstOrThrow({ where: { periodId } });
    await prisma.assessmentAssignment.update({ where: { id: a.id }, data: { status: 'SUBMITTED', submittedAt: new Date() } });
    const r = await clearAssignments(admin, periodId);
    expect(r.kept).toBe(1);
    expect(await prisma.assessmentAssignment.count({ where: { periodId } })).toBe(1);
  });
});
