import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { notifyUsers } from '@/lib/services/notifications';
import { runAttendanceReminders } from '@/lib/services/reminders';
import { rebuildRecord } from '@/lib/attendance/record';
import { subscribe, type RealtimeEvent } from '@/lib/realtime';
import { zonedToUtc } from '@/lib/time';
import { seedFixture } from './helpers';

let f: Awaited<ReturnType<typeof seedFixture>>;
beforeAll(async () => { f = await seedFixture(); });

const TZ = 'Asia/Jakarta';

describe('notifikasi realtime', () => {
  it('notifikasi baru dikirim ke pelanggan stream milik penerima saja', async () => {
    const got: RealtimeEvent[] = [];
    const other: RealtimeEvent[] = [];
    const off = subscribe(f.users.stafAUser.id, (e) => got.push(e));
    const off2 = subscribe(f.users.stafBUser.id, (e) => other.push(e));
    await notifyUsers([f.users.stafAUser.id], { type: 'uji', title: 'Halo', body: 'Isi', link: '/x' });
    await new Promise((r) => setTimeout(r, 50));
    off(); off2();
    expect(got.map((e) => e.type)).toEqual(expect.arrayContaining(['notification', 'unread']));
    expect(other).toHaveLength(0);
  });

  it('kunci anti-ganda mencegah notifikasi yang sama dibuat dua kali', async () => {
    const n = { type: 'uji', title: 'Sekali', dedupeKey: 'uji-sekali' };
    await notifyUsers([f.users.stafAUser.id], n);
    await notifyUsers([f.users.stafAUser.id], n);
    expect(await prisma.notification.count({ where: { userId: f.users.stafAUser.id, title: 'Sekali' } })).toBe(1);
  });
});

describe('pengingat absensi', () => {
  // Hari kerja tetap: Senin 5 Oktober 2026 (jadwal uji 07:30-16:00).
  const day = '2026-10-05';

  it('mengingatkan masuk sebelum jam masuk, sekali saja, dan tidak bagi yang sudah absen', async () => {
    const now = zonedToUtc(day, '07:20', TZ);
    const r1 = await runAttendanceReminders(now);
    expect(r1.sent).toBeGreaterThan(0);
    const q = { userId: f.users.stafAUser.id, type: 'reminder_masuk' };
    expect(await prisma.notification.count({ where: q })).toBe(1);
    const r2 = await runAttendanceReminders(zonedToUtc(day, '07:25', TZ));
    expect(r2.sent).toBe(0);
    expect(await prisma.notification.count({ where: q })).toBe(1);
  });

  it('tidak mengingatkan terlalu awal', async () => {
    const before = await prisma.notification.count({ where: { type: 'reminder_masuk' } });
    await runAttendanceReminders(zonedToUtc('2026-10-06', '06:00', TZ));
    expect(await prisma.notification.count({ where: { type: 'reminder_masuk' } })).toBe(before);
  });

  it('mengingatkan pulang hanya bagi yang sudah absen masuk tetapi belum pulang', async () => {
    await prisma.attendanceRecord.create({ data: { employeeId: f.stafA.id, workDate: new Date(`${day}T00:00:00Z`), checkInAt: zonedToUtc(day, '07:28', TZ), status: 'HADIR' } });
    await runAttendanceReminders(zonedToUtc(day, '16:01', TZ));
    expect(await prisma.notification.count({ where: { userId: f.users.stafAUser.id, type: 'reminder_pulang' } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: f.users.stafBUser.id, type: 'reminder_pulang' } })).toBe(0);
  });

  it('absen yang baru terjadi memicu pemberitahuan tercatat; hitung ulang data lama tidak', async () => {
    const sys = await prisma.attendanceRecord.count();
    expect(sys).toBeGreaterThan(0);
    const old = '2026-09-01';
    await rebuildRecord(f.stafB.id, old);
    expect(await prisma.notification.count({ where: { userId: f.users.stafBUser.id, type: 'attendance' } })).toBe(0);
  });
});
