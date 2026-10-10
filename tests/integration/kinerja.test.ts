import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { attachmentFor, deleteDailyReport, getReport, myMonth, reviewMonthly, reviewQueue, saveDailyReport, submitMonth } from '@/lib/services/performance';
import { openPeriod, periodResults, resultSheet, setPeriodClosed, submitAssessment, myAssignments, topUpPeriod } from '@/lib/services/assessment';
import { INDICATOR_KEYS } from '@/lib/assessment/indicators';
import { addDays, todayIn } from '@/lib/time';
import { actorOf, seedFixture } from './helpers';

let f: Awaited<ReturnType<typeof seedFixture>>;
beforeAll(async () => { f = await seedFixture(); });

const today = todayIn('Asia/Jakarta');
const month = today.slice(0, 7);
const pdf = Buffer.from('%PDF-1.4 uji');

describe('laporan kinerja', () => {
  it('pegawai mengisi laporan harian dengan lampiran; tanggal masa depan dan berkas palsu ditolak', async () => {
    const staf = await actorOf(f.users.stafAUser.id);
    await expect(saveDailyReport(staf, { date: addDays(today, 1), content: 'Pekerjaan besok' }, [], [])).rejects.toMatchObject({ status: 422 });
    await expect(saveDailyReport(staf, { date: today, content: 'Pendek' }, [{ name: 'a.pdf', buffer: Buffer.from('bukan pdf') }], [])).rejects.toMatchObject({ status: 422 });
    await expect(saveDailyReport(staf, { date: today, content: 'abc' }, [], [])).rejects.toBeTruthy();
    const ok = await saveDailyReport(staf, { date: today, content: 'Menyusun rekap data pegawai' }, [{ name: 'rekap.pdf', buffer: pdf }], []);
    expect(ok.id).toBeTruthy();
    const m = await myMonth(staf, month);
    const day = m.days.find((d) => d.date === today)!;
    expect(day.report?.attachments).toHaveLength(1);
    expect(m.editable).toBe(true);
    // Ubah isi dan hapus lampiran.
    await saveDailyReport(staf, { date: today, content: 'Menyusun rekap data pegawai (revisi)' }, [], [day.report!.attachments[0].id]);
    expect((await myMonth(staf, month)).days.find((d) => d.date === today)!.report?.attachments).toHaveLength(0);
  });

  it('kirim ke atasan: notifikasi ke atasan, laporan terkunci, atasan lain tidak bisa menilai', async () => {
    const staf = await actorOf(f.users.stafAUser.id);
    await saveDailyReport(staf, { date: today, content: 'Laporan akhir bulan' }, [{ name: 'lampiran.pdf', buffer: pdf }], []);
    const sent = await submitMonth(staf, month, 'Ringkasan bulan');
    expect(await prisma.notification.count({ where: { userId: f.users.kabidUser.id, type: 'report_submitted' } })).toBe(1);
    await expect(saveDailyReport(staf, { date: today, content: 'Ubah setelah dikirim' }, [], [])).rejects.toMatchObject({ status: 409 });
    await expect(deleteDailyReport(staf, (await prisma.dailyReport.findFirstOrThrow({ where: { employeeId: f.stafA.id } })).id)).rejects.toMatchObject({ status: 409 });

    const kabid = await actorOf(f.users.kabidUser.id);
    const q = await reviewQueue(kabid, {});
    expect(q.rows.map((r) => r.id)).toContain(sent.id);
    const staffB = await actorOf(f.users.stafBUser.id);
    await expect(getReport(staffB, sent.id)).rejects.toMatchObject({ status: 404 });

    const att = await prisma.dailyReportAttachment.findFirstOrThrow({});
    await expect(attachmentFor(kabid, att.id)).resolves.toBeTruthy();
    await expect(attachmentFor(staffB, att.id)).rejects.toMatchObject({ status: 404 });
  });

  it('atasan memberi nilai atau mengembalikan; pegawai diberi tahu', async () => {
    const kabid = await actorOf(f.users.kabidUser.id);
    const rep = await prisma.monthlyReport.findFirstOrThrow({ where: { employeeId: f.stafA.id, month } });
    await expect(reviewMonthly(kabid, rep.id, { action: 'return', note: 'x' })).rejects.toBeTruthy();
    await reviewMonthly(kabid, rep.id, { action: 'return', note: 'Lengkapi uraian pekerjaan minggu kedua' });
    expect((await prisma.monthlyReport.findUniqueOrThrow({ where: { id: rep.id } })).status).toBe('RETURNED');
    const staf = await actorOf(f.users.stafAUser.id);
    expect((await myMonth(staf, month)).editable).toBe(true);
    await saveDailyReport(staf, { date: today, content: 'Laporan setelah diperbaiki' }, [], []);
    await submitMonth(staf, month, null);
    await expect(reviewMonthly(kabid, rep.id, { action: 'approve', score: 0 })).rejects.toBeTruthy();
    await reviewMonthly(kabid, rep.id, { action: 'approve', score: 88, note: 'Baik' });
    const done = await prisma.monthlyReport.findUniqueOrThrow({ where: { id: rep.id } });
    expect(done.status).toBe('APPROVED');
    expect(done.score).toBe(88);
    expect(await prisma.notification.count({ where: { userId: f.users.stafAUser.id, type: 'report_reviewed' } })).toBe(2);
    await expect(reviewMonthly(kabid, rep.id, { action: 'approve', score: 90 })).rejects.toMatchObject({ status: 409 });
  });
});

describe('penilaian kinerja', () => {
  const scores = (n: number) => Object.fromEntries(INDICATOR_KEYS.map((k) => [k, n]));

  it('periode dibuka: atasan dan rekan acak dibagi, tidak ada yang menilai diri sendiri', async () => {
    const admin = await actorOf(f.users.admin.id);
    const r = await openPeriod(admin, { month, peerCount: 1 });
    expect(r.assignments).toBeGreaterThan(0);
    const rows = await prisma.assessmentAssignment.findMany({ where: { period: { month } } });
    expect(rows.every((a) => a.targetEmployeeId !== a.assessorEmployeeId)).toBe(true);
    // Staf A punya atasan (Kabid) dan satu rekan.
    const forStaf = rows.filter((a) => a.targetEmployeeId === f.stafA.id);
    expect(forStaf.filter((a) => a.role === 'ATASAN').map((a) => a.assessorEmployeeId)).toEqual([f.kabidA.id]);
    expect(forStaf.filter((a) => a.role === 'REKAN')).toHaveLength(1);
    await expect(openPeriod(admin, { month, peerCount: 1 })).rejects.toMatchObject({ status: 409 });
    expect((await topUpPeriod(admin, (await prisma.assessmentPeriod.findFirstOrThrow({ where: { month } })).id)).added).toBe(0);
  });

  it('penilai mengirim nilai; nilai kosong atau di luar rentang ditolak; atasan wajib mengisi kesimpulan', async () => {
    const kabid = await actorOf(f.users.kabidUser.id);
    const task = (await myAssignments(kabid)).find((t) => t.target.id === f.stafA.id && t.role === 'ATASAN')!;
    await expect(submitAssessment(kabid, task.id, { scores: { d1: 90 } })).rejects.toMatchObject({ status: 422 });
    await expect(submitAssessment(kabid, task.id, { scores: scores(101) })).rejects.toBeTruthy();
    await expect(submitAssessment(kabid, task.id, { scores: scores(90) })).rejects.toMatchObject({ status: 422 });
    const r = await submitAssessment(kabid, task.id, { scores: scores(90), competence: 'SESUAI', followUp: 'DIREKOMENDASIKAN' });
    expect(r).toEqual({ average: 90, predicate: 'Baik' });
    // Pegawai lain tidak bisa mengisi penugasan orang lain.
    const staf = await actorOf(f.users.stafAUser.id);
    await expect(submitAssessment(staf, task.id, { scores: scores(50) })).rejects.toMatchObject({ status: 404 });
  });

  it('rekap menggabungkan atasan dan rekan; hasil pegawai baru terbuka setelah periode ditutup', async () => {
    const admin = await actorOf(f.users.admin.id);
    const period = await prisma.assessmentPeriod.findFirstOrThrow({ where: { month } });
    const peer = await prisma.assessmentAssignment.findFirstOrThrow({ where: { periodId: period.id, targetEmployeeId: f.stafA.id, role: 'REKAN' } });
    const peerUser = await prisma.user.findFirstOrThrow({ where: { employeeId: peer.assessorEmployeeId } });
    await submitAssessment(await actorOf(peerUser.id), peer.id, { scores: scores(70) });

    const { results } = await periodResults(admin, period.id);
    const row = results.find((x) => x.employee.id === f.stafA.id)!;
    expect(row.bossAverage).toBe(90);
    expect(row.peerAverage).toBe(70);
    expect(row.average).toBe(80);
    expect(row.predicate).toBe('Baik');

    const staf = await actorOf(f.users.stafAUser.id);
    await expect(resultSheet(staf, period.id, f.stafA.id)).rejects.toMatchObject({ status: 404 });
    await setPeriodClosed(admin, period.id, true);
    const sheet = await resultSheet(staf, period.id, f.stafA.id);
    expect(sheet.average).toBe(80);
    expect(sheet.competence).toBe('SESUAI');
    await expect(submitAssessment(await actorOf(peerUser.id), peer.id, { scores: scores(60) })).rejects.toMatchObject({ status: 409 });
  });
});
