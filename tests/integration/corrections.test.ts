import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { requestCorrection, reviewCorrection } from '@/lib/services/corrections';
import { manualAttendance } from '@/lib/services/attendance';
import { fmtJam, toDbDate } from '@/lib/time';
import { actorOf, pastWorkday, seedFixture } from './helpers';

let f: Awaited<ReturnType<typeof seedFixture>>;
beforeAll(async () => { f = await seedFixture(); });

describe('koreksi absensi', () => {
  it('nilai awal tersimpan, rekap diperbarui, dan tercatat di audit', async () => {
    const day = pastWorkday(2);
    const admin = await actorOf(f.users.admin.id);
    await manualAttendance(admin, { employeeId: f.stafA.id, workDate: day, direction: 'OUT', time: '16:05', reason: 'Mesin rusak, dicatat petugas' });
    const before = await prisma.attendanceRecord.findUniqueOrThrow({ where: { employeeId_workDate: { employeeId: f.stafA.id, workDate: toDbDate(day) } } });
    expect(before.checkInAt).toBeNull();

    const staf = await actorOf(f.users.stafAUser.id);
    const c = await requestCorrection(staf, { workDate: day, kind: 'LUPA_MASUK', proposedCheckIn: '07:20', reason: 'Lupa absen karena antre di lobi' }, null);
    expect((c.originalValues as { checkOut: string }).checkOut).toBe('16:05');

    // Operator unit B tidak berwenang meninjau koreksi.
    const op = await actorOf(f.users.operatorB.id);
    await expect(reviewCorrection(op, c.id, { approve: true })).rejects.toMatchObject({ status: 403 });

    const kabid = await actorOf(f.users.kabidUser.id);
    await reviewCorrection(kabid, c.id, { approve: true, note: 'Sesuai keterangan satpam' });
    const after = await prisma.attendanceRecord.findUniqueOrThrow({ where: { id: before.id } });
    expect(fmtJam(after.checkInAt, 'Asia/Jakarta')).toBe('07:20');
    expect(after.status).toBe('HADIR');
    const saved = await prisma.attendanceCorrection.findUniqueOrThrow({ where: { id: c.id } });
    expect(saved.status).toBe('APPROVED');
    expect(saved.appliedValues).toMatchObject({ checkIn: '07:20', checkOut: '16:05' });
    expect(await prisma.auditLog.count({ where: { action: 'correction.approve', entityId: c.id } })).toBe(1);

    // Keputusan kedua ditolak (sudah diproses).
    await expect(reviewCorrection(kabid, c.id, { approve: false, note: 'x' })).rejects.toMatchObject({ status: 409 });
  });

  it('pegawai tidak bisa meninjau pengajuannya sendiri', async () => {
    const day = pastWorkday(3);
    const kabid = await actorOf(f.users.kabidUser.id);
    const c = await requestCorrection(kabid, { workDate: day, kind: 'LUPA_PULANG', proposedCheckOut: '16:10', reason: 'Lupa absen pulang karena rapat' }, null);
    await expect(reviewCorrection(kabid, c.id, { approve: true })).rejects.toMatchObject({ status: 403 });
  });
});
