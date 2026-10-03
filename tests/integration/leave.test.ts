import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { systemActor } from '@/lib/auth/system';
import { decideLeave, getLeave, requestLeave, saveLeaveType, setBalance, balancesFor, cancelLeave } from '@/lib/services/leave';
import { addDays, toDbDate, weekdayOf } from '@/lib/time';
import { actorOf, pastWorkday, seedFixture } from './helpers';

let f: Awaited<ReturnType<typeof seedFixture>>;
let cutiId: string;
beforeAll(async () => {
  f = await seedFixture();
  const t = await saveLeaveType(systemActor(), null, {
    code: 'CT', name: 'Cuti uji', attendanceStatus: 'CUTI', usesBalance: true, defaultAnnualQuota: 12, approvalLevels: 2,
    countWorkdaysOnly: true, allowAttachment: false, minNoticeDays: 0, maxDaysPerRequest: 10,
  });
  cutiId = t.id;
});

/** Senin-Selasa pekan lalu (dua hari kerja di masa lalu, tahun yang sama bila memungkinkan). */
function twoWorkdays() {
  let d = pastWorkday(7);
  while (weekdayOf(d) !== 1) d = addDays(d, -1);
  return [d, addDays(d, 1)] as const;
}

describe('cuti dan izin', () => {
  it('ditolak bila saldo belum diatur atau tidak cukup', async () => {
    const [a, b] = twoWorkdays();
    const staf = await actorOf(f.users.stafAUser.id);
    await expect(requestLeave(staf, { leaveTypeId: cutiId, startDate: a, endDate: b, reason: 'Keperluan keluarga' }, null)).rejects.toMatchObject({ status: 422 });
    await setBalance(await actorOf(f.users.admin.id), { employeeId: f.stafA.id, leaveTypeId: cutiId, year: Number(a.slice(0, 4)), entitled: 1, carriedOver: 0, adjustment: 0 });
    await expect(requestLeave(staf, { leaveTypeId: cutiId, startDate: a, endDate: b, reason: 'Keperluan keluarga' }, null)).rejects.toThrow(/Sisa saldo/);
  });

  it('persetujuan berjenjang: atasan lalu admin kepegawaian, lalu rekap menjadi CUTI', async () => {
    const [a, b] = twoWorkdays();
    const admin = await actorOf(f.users.admin.id);
    await setBalance(admin, { employeeId: f.stafA.id, leaveTypeId: cutiId, year: Number(a.slice(0, 4)), entitled: 12, carriedOver: 0, adjustment: 0 });
    const staf = await actorOf(f.users.stafAUser.id);
    const req = await requestLeave(staf, { leaveTypeId: cutiId, startDate: a, endDate: b, reason: 'Keperluan keluarga' }, null);
    expect(req.days).toBe(2);
    expect((await balancesFor(f.stafA.id, Number(a.slice(0, 4))))[0]).toMatchObject({ reserved: 2, remaining: 10 });

    // Admin kepegawaian belum boleh memutus sebelum atasan.
    await expect(decideLeave(admin, req.id, { approve: true })).rejects.toMatchObject({ status: 403 });
    // Pegawai unit lain tidak bisa melihat pengajuan ini.
    await expect(getLeave(await actorOf(f.users.stafBUser.id), req.id)).rejects.toMatchObject({ status: 404 });

    const kabid = await actorOf(f.users.kabidUser.id);
    expect((await getLeave(kabid, req.id)).canDecide).toBe(true);
    await decideLeave(kabid, req.id, { approve: true });
    await expect(decideLeave(kabid, req.id, { approve: true })).rejects.toMatchObject({ status: 403 });
    await decideLeave(admin, req.id, { approve: true, note: 'Disetujui' });

    const done = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(done.status).toBe('APPROVED');
    const recs = await prisma.attendanceRecord.findMany({ where: { employeeId: f.stafA.id, workDate: { in: [toDbDate(a), toDbDate(b)] } } });
    expect(recs.map((r) => r.status)).toEqual(['CUTI', 'CUTI']);
    expect(await prisma.notification.count({ where: { userId: f.users.stafAUser.id, title: { contains: 'disetujui' } } })).toBe(1);

    // Cuti yang sudah berjalan hanya bisa dibatalkan admin; rekap kembali dihitung dari transaksi.
    await expect(cancelLeave(staf, req.id, 'Batal')).rejects.toMatchObject({ status: 409 });
    await cancelLeave(admin, req.id, 'Salah input tanggal');
    const after = await prisma.attendanceRecord.findMany({ where: { employeeId: f.stafA.id, workDate: { in: [toDbDate(a), toDbDate(b)] } } });
    expect(after.every((r) => r.status !== 'CUTI')).toBe(true);
  });

  it('penolakan wajib alasan', async () => {
    const d = pastWorkday(1);
    const kabid = await actorOf(f.users.kabidUser.id);
    const staf = await actorOf(f.users.stafAUser.id);
    const req = await requestLeave(staf, { leaveTypeId: cutiId, startDate: d, endDate: d, reason: 'Urusan administrasi' }, null);
    await expect(decideLeave(kabid, req.id, { approve: false })).rejects.toMatchObject({ status: 422 });
    await decideLeave(kabid, req.id, { approve: false, note: 'Bentrok dengan rapat' });
    expect((await prisma.leaveRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe('REJECTED');
  });
});
