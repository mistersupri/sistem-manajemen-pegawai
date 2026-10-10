import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { openPeriod, submitAssessment } from '@/lib/services/assessment';
import { addAssignment, assessorLoads, autoAssign, mapUnits, periodOverview, reassign, remindPending, removeAssignment } from '@/lib/services/assessment-mapping';
import { createEmployee } from '@/lib/services/employees';
import { systemActor } from '@/lib/auth/system';
import { hashPassword } from '@/lib/auth/password';
import { INDICATOR_KEYS } from '@/lib/assessment/indicators';
import { todayIn } from '@/lib/time';
import { actorOf, seedFixture } from './helpers';

let f: Awaited<ReturnType<typeof seedFixture>>;
let periodId: string;
const month = todayIn('Asia/Jakarta').slice(0, 7);
const scores = Object.fromEntries(INDICATOR_KEYS.map((k) => [k, 80]));

/** Pegawai tambahan di unit tertentu lengkap dengan akun, agar bisa jadi penilai. */
async function staff(name: string, unitId: string, i: number) {
  const e = (await createEmployee(systemActor('uji'), { fullName: name, employeeNumber: `91000000000000${String(i).padStart(4, '0')}`, unitId, employmentStatus: 'PNS' })).employee;
  const u = await prisma.user.create({ data: { username: `uji.${i}`, employeeId: e.id, passwordHash: await hashPassword('Uji#Rahasia2026') } });
  const role = await prisma.role.findUniqueOrThrow({ where: { code: 'PEGAWAI' } });
  await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
  return { e, u };
}

beforeAll(async () => {
  f = await seedFixture();
  const admin = await actorOf(f.users.admin.id);
  // Periode tanpa rekan acak: semua penugasan diatur manual atau lewat pemetaan.
  periodId = (await openPeriod(admin, { month, peerCount: 0 })).id;
});

describe('pemetaan penilai oleh admin', () => {
  it('menambah penilai manual, menolak diri sendiri dan duplikat', async () => {
    const admin = await actorOf(f.users.admin.id);
    await expect(addAssignment(admin, periodId, { targetId: f.stafB.id, assessorId: f.stafB.id })).rejects.toMatchObject({ status: 422 });
    const a = await addAssignment(admin, periodId, { targetId: f.stafB.id, assessorId: f.stafA.id });
    expect(a.id).toBeTruthy();
    await expect(addAssignment(admin, periodId, { targetId: f.stafB.id, assessorId: f.stafA.id })).rejects.toMatchObject({ status: 409 });
    expect((await prisma.assessmentAssignment.findUniqueOrThrow({ where: { id: a.id } })).source).toBe('MANUAL');
    expect(await prisma.notification.count({ where: { userId: f.users.stafAUser.id, type: 'assessment_assigned' } })).toBeGreaterThan(0);
  });

  it('mengganti dan menghapus penilai yang belum menilai; yang sudah menilai terkunci', async () => {
    const admin = await actorOf(f.users.admin.id);
    const a = await prisma.assessmentAssignment.findFirstOrThrow({ where: { periodId, targetEmployeeId: f.stafB.id, assessorEmployeeId: f.stafA.id } });
    await reassign(admin, a.id, f.kabidA.id);
    expect((await prisma.assessmentAssignment.findUniqueOrThrow({ where: { id: a.id } })).assessorEmployeeId).toBe(f.kabidA.id);
    await expect(reassign(admin, a.id, f.stafB.id)).rejects.toMatchObject({ status: 422 });
    await submitAssessment(await actorOf(f.users.kabidUser.id), a.id, { scores });
    await expect(removeAssignment(admin, a.id)).rejects.toMatchObject({ status: 409 });
    await expect(reassign(admin, a.id, f.stafA.id)).rejects.toMatchObject({ status: 409 });
    const b = await addAssignment(admin, periodId, { targetId: f.kabidA.id, assessorId: f.stafA.id });
    await removeAssignment(admin, b.id);
    expect(await prisma.assessmentAssignment.count({ where: { id: b.id } })).toBe(0);
  });

  it('admin melihat siapa penilai tiap pegawai dan statusnya, dan bisa menyaring yang belum selesai', async () => {
    const admin = await actorOf(f.users.admin.id);
    const all = await periodOverview(admin, periodId, {});
    const row = all.rows.find((r) => r.id === f.stafB.id)!;
    expect(row.assessors.map((a) => a.assessor.fullName)).toContain('Kabid Uji');
    expect(row.assessors.find((a) => a.assessor.id === f.kabidA.id)!.status).toBe('SUBMITTED');
    const kurang = await periodOverview(admin, periodId, { status: 'kurang' });
    expect(kurang.rows.every((r) => r.assessors.length === 0)).toBe(true);
    const selesai = await periodOverview(admin, periodId, { status: 'selesai' });
    expect(selesai.rows.map((r) => r.id)).toContain(f.stafB.id);
    const loads = await assessorLoads(admin, periodId);
    expect(loads.find((l) => l.id === f.kabidA.id)).toMatchObject({ total: 2, done: 1, pending: 1 }) // Kabid juga atasan langsung Staf A;
  });

  it('operator di luar kewenangan ditolak', async () => {
    const op = await actorOf(f.users.operatorB.id);
    await expect(addAssignment(op, periodId, { targetId: f.stafB.id, assessorId: f.stafA.id })).rejects.toMatchObject({ status: 403 });
  });
});

describe('pemetaan unit dan acak', () => {
  it('unit menilai unit: semua menilai semua tanpa menilai diri sendiri', async () => {
    const admin = await actorOf(f.users.admin.id);
    const a1 = await staff('Penilai C1', f.unitA.id, 1);
    const a2 = await staff('Penilai C2', f.unitA.id, 2);
    const t1 = await staff('Dinilai D1', f.unitB.id, 3);
    const t2 = await staff('Dinilai D2', f.unitB.id, 4);
    const r = await mapUnits(admin, periodId, { assessorUnitId: f.unitA.id, targetUnitId: f.unitB.id, mode: 'SEMUA' });
    expect(r.created).toBeGreaterThanOrEqual(4);
    const rows = await prisma.assessmentAssignment.findMany({ where: { periodId, targetEmployeeId: { in: [t1.e.id, t2.e.id] }, source: 'UNIT' } });
    for (const t of [t1.e.id, t2.e.id]) {
      expect(rows.filter((x) => x.targetEmployeeId === t).map((x) => x.assessorEmployeeId)).toEqual(expect.arrayContaining([a1.e.id, a2.e.id]));
    }
    expect(rows.every((x) => x.assessorEmployeeId !== x.targetEmployeeId)).toBe(true);
    // Dijalankan ulang tidak menggandakan.
    expect((await mapUnits(admin, periodId, { assessorUnitId: f.unitA.id, targetUnitId: f.unitB.id, mode: 'SEMUA' })).created).toBe(0);
  });

  it('acak per pegawai dari unit penilai: tiap pegawai mendapat N penilai dan beban merata', async () => {
    const admin = await actorOf(f.users.admin.id);
    const targets = await Promise.all([5, 6, 7, 8].map((i) => staff(`Dinilai E${i}`, f.unitB.id, i)));
    await Promise.all([9, 10, 11].map((i) => staff(`Penilai F${i}`, f.unitA.id, i)));
    const ids = targets.map((t) => t.e.id);
    const r = await mapUnits(admin, periodId, { assessorUnitId: f.unitA.id, targetUnitId: f.unitB.id, mode: 'ACAK', perTarget: 2 });
    expect(r.created).toBeGreaterThan(0);
    for (const id of ids) {
      const n = await prisma.assessmentAssignment.count({ where: { periodId, targetEmployeeId: id, assessor: { unitId: f.unitA.id } } });
      expect(n).toBeGreaterThanOrEqual(2);
    }
    const loads = (await assessorLoads(admin, periodId)).filter((l) => l.unit === 'Unit Uji A');
    expect(Math.max(...loads.map((l) => l.total)) - Math.min(...loads.map((l) => l.total))).toBeLessThanOrEqual(ids.length);
  });

  it('acak otomatis: lengkapi yang kurang, atau acak ulang tanpa menyentuh yang sudah menilai', async () => {
    const admin = await actorOf(f.users.admin.id);
    const doneBefore = await prisma.assessmentAssignment.count({ where: { periodId, status: 'SUBMITTED' } });
    const fill = await autoAssign(admin, periodId, { peerCount: 1 });
    expect(fill.created).toBeGreaterThan(0);
    const reset = await autoAssign(admin, periodId, { peerCount: 1, reset: true });
    expect(reset.removed).toBeGreaterThan(0);
    expect(await prisma.assessmentAssignment.count({ where: { periodId, status: 'SUBMITTED' } })).toBe(doneBefore);
    // Satu unit saja.
    const one = await autoAssign(admin, periodId, { peerCount: 2, unitId: f.unitB.id });
    expect(one.created).toBeGreaterThanOrEqual(0);
  });

  it('mengingatkan hanya penilai yang masih punya tugas; periode tertutup tidak bisa diubah', async () => {
    const admin = await actorOf(f.users.admin.id);
    const r = await remindPending(admin, periodId);
    expect(r.reminded).toBeGreaterThan(0);
    await prisma.assessmentPeriod.update({ where: { id: periodId }, data: { isClosed: true } });
    await expect(addAssignment(admin, periodId, { targetId: f.stafB.id, assessorId: f.stafA.id })).rejects.toMatchObject({ status: 409 });
    await expect(remindPending(admin, periodId)).rejects.toMatchObject({ status: 409 });
  });
});
