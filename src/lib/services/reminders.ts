import { prisma } from '../db';
import { addDays, fromDbDate, toDbDate, zonedParts } from '../time';
import { getSettings } from '../settings';
import { shiftWindow, LOCKED_STATUSES } from '../attendance/engine';
import { loadPlanContext } from '../attendance/plan';
import { notifyUsers } from './notifications';

const MIN = 60_000;
// Pengingat masuk berhenti dikirim setelah sekian menit lewat jam masuk (tamu yang sudah telat tidak perlu diingatkan lagi).
const LATE_WINDOW_MIN = 120;
// Pengingat pulang hanya untuk sekian jam setelah jam pulang.
const OUT_WINDOW_MIN = 180;

/**
 * Dijalankan penjadwal tiap menit. Mengirim pengingat absen masuk (sebelum jam masuk) dan absen pulang
 * (saat jam pulang) kepada pegawai yang berakun, belum absen, dan dijadwalkan bekerja hari itu.
 * Kunci anti-ganda per pegawai per hari membuat aman dijalankan berulang atau setelah server mulai ulang.
 */
export async function runAttendanceReminders(now = new Date()) {
  const s = await getSettings();
  if (!s['notify.reminders']) return { sent: 0 };
  const tz = s['org.timezone'];
  const lead = Math.max(0, Number(s['notify.reminderLeadMin']) || 0);
  const today = zonedParts(now, tz).date;
  const yesterday = addDays(today, -1);

  const emps = await prisma.employee.findMany({
    where: { isActive: true, deletedAt: null, user: { isActive: true, deletedAt: null } },
    select: { id: true, user: { select: { id: true } } },
  });
  if (!emps.length) return { sent: 0 };
  const ids = emps.map((e) => e.id);
  const ctx = await loadPlanContext(ids, yesterday, today);
  const records = await prisma.attendanceRecord.findMany({
    where: { employeeId: { in: ids }, workDate: { in: [toDbDate(yesterday), toDbDate(today)] } },
    select: { employeeId: true, workDate: true, checkInAt: true, checkOutAt: true, status: true },
  });
  const rec = new Map(records.map((r) => [`${r.employeeId}|${fromDbDate(r.workDate)}`, r]));

  let sent = 0;
  const t = now.getTime();
  for (const e of emps) {
    const userId = e.user!.id;
    for (const date of [yesterday, today]) {
      const plan = ctx.planFor(e.id, date);
      if (!plan.schedule || plan.isOffDay) continue;
      const r = rec.get(`${e.id}|${date}`);
      // Cuti, izin, dinas luar, dan sejenisnya tidak perlu pengingat absen.
      if (r && (LOCKED_STATUSES as readonly string[]).includes(r.status)) continue;
      const win = shiftWindow(plan.schedule, date, tz);
      const jam = (d: Date) => zonedParts(d, tz).time;

      if (date === today && !r?.checkInAt && t >= win.start.getTime() - lead * MIN && t < win.start.getTime() + LATE_WINDOW_MIN * MIN) {
        sent += await notifyUsers([userId], {
          type: 'reminder_masuk', title: 'Waktunya absen masuk',
          body: `Jam masuk Anda ${jam(win.start)}. Jangan lupa absen.`, link: '/absensi/saya/absen', dedupeKey: `masuk:${date}:${e.id}`,
        });
      }
      if (r?.checkInAt && !r.checkOutAt && t >= win.end.getTime() && t < win.end.getTime() + OUT_WINDOW_MIN * MIN) {
        sent += await notifyUsers([userId], {
          type: 'reminder_pulang', title: 'Waktunya absen pulang',
          body: `Jam pulang Anda ${jam(win.end)}. Jangan lupa absen pulang.`, link: '/absensi/saya/absen', dedupeKey: `pulang:${date}:${e.id}`,
        });
      }
    }
  }
  return { sent };
}

/**
 * Pengingat laporan kinerja: (1) laporan harian belum diisi, dikirim setelah jam pulang pada hari kerja;
 * (2) laporan bulan lalu belum dikirim ke atasan, dikirim pada tanggal 1 sampai 5 sejak pukul 08.00.
 */
export async function runReportReminders(now = new Date()) {
  const s = await getSettings();
  if (!s['notify.reminders']) return { sent: 0 };
  const tz = s['org.timezone'];
  const z = zonedParts(now, tz);
  const today = z.date;
  const emps = await prisma.employee.findMany({
    where: { isActive: true, deletedAt: null, user: { isActive: true, deletedAt: null, roles: { some: { role: { permissions: { some: { permission: { code: 'report.self' } } } } } } } },
    select: { id: true, user: { select: { id: true } } },
  });
  if (!emps.length) return { sent: 0 };
  const ids = emps.map((e) => e.id);
  let sent = 0;

  const ctx = await loadPlanContext(ids, today, today);
  const filled = new Set((await prisma.dailyReport.findMany({ where: { employeeId: { in: ids }, workDate: toDbDate(today) }, select: { employeeId: true } })).map((r) => r.employeeId));
  for (const e of emps) {
    const plan = ctx.planFor(e.id, today);
    if (!plan.schedule || plan.isOffDay || filled.has(e.id)) continue;
    const end = shiftWindow(plan.schedule, today, tz).end.getTime();
    // Satu jam setelah jam pulang, sampai tengah malam kira-kira.
    if (now.getTime() >= end + 60 * MIN && now.getTime() < end + 6 * 60 * MIN) {
      sent += await notifyUsers([e.user!.id], { type: 'reminder_laporan', title: 'Laporan kinerja hari ini belum diisi', body: 'Uraikan pekerjaan Anda hari ini.', link: '/kinerja/laporan', dedupeKey: `laporan:${today}:${e.id}` });
    }
  }

  if (Number(today.slice(8)) <= 5 && Number(z.time.slice(0, 2)) >= 8) {
    const prev = addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7);
    const sentAlready = await prisma.monthlyReport.findMany({ where: { employeeId: { in: ids }, month: prev, status: { in: ['SUBMITTED', 'APPROVED'] } }, select: { employeeId: true } });
    const done = new Set(sentAlready.map((r) => r.employeeId));
    const withDaily = await prisma.dailyReport.groupBy({ by: ['employeeId'], where: { employeeId: { in: ids }, workDate: { gte: toDbDate(`${prev}-01`), lte: toDbDate(`${prev}-31`) } }, _count: { _all: true } });
    for (const w of withDaily) {
      if (done.has(w.employeeId)) continue;
      const e = emps.find((x) => x.id === w.employeeId)!;
      sent += await notifyUsers([e.user!.id], { type: 'reminder_kirim_laporan', title: 'Kirim laporan kinerja bulan lalu', body: `${w._count._all} laporan harian belum dikirim ke atasan.`, link: `/kinerja/laporan?bulan=${prev}`, dedupeKey: `kirim:${prev}:${e.id}` });
    }
  }
  return { sent };
}
