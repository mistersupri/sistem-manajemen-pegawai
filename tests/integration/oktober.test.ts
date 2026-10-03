// Titik absen tanpa login, libur nasional otomatis, rekap kalender. Data fiktif.
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { enrollFace } from '@/lib/services/biometrics';
import { createStation, rotateStationToken, stationAttendance, updateStation } from '@/lib/services/stations';
import { applyHolidays, setHolidayDisabled } from '@/lib/services/holidays';
import { calendarRecap } from '@/lib/services/reports';
import { createSchedule, setDaysBulk } from '@/lib/services/schedules';
import { loadPlanContext } from '@/lib/attendance/plan';
import { systemActor } from '@/lib/auth/system';
import { toDbDate } from '@/lib/time';
import { actorOf, pastWorkday, seedFixture } from './helpers';

let f: Awaited<ReturnType<typeof seedFixture>>;
const face = (seed: number) => Array.from({ length: 128 }, (_, i) => Math.sin(i * seed) / 5);
const jitter = (d: number[], k: number) => d.map((x, i) => x + Math.cos(i + k) / 1000);
const q = { score: 0.95, faceWidthPx: 220, brightness: 120 };
const meta = { ip: '10.0.0.9', userAgent: 'vitest' };
let n = 0;
const key = () => `uji-titik-${String(++n).padStart(4, '0')}`;

beforeAll(async () => {
  f = await seedFixture();
  await enrollFace(await actorOf(f.users.stafAUser.id), f.stafA.id, { descriptors: [face(1), jitter(face(1), 1), jitter(face(1), 2)], consentAccepted: true, consentVersion: '1' });
  await enrollFace(await actorOf(f.users.stafBUser.id), f.stafB.id, { descriptors: [face(3), jitter(face(3), 1), jitter(face(3), 2)], consentAccepted: true, consentVersion: '1' });
});

describe('titik absen tanpa login', () => {
  it('token hanya disimpan sebagai hash dan wajah dikenali tanpa akun', async () => {
    const admin = await actorOf(f.users.superUser.id);
    const { id, token } = await createStation(admin, { name: 'Lobi Unit A', unitId: f.unitA.id });
    const st = await prisma.attendanceStation.findUniqueOrThrow({ where: { id } });
    expect(st.tokenHash).not.toContain(token);
    const r = await stationAttendance(token, 'kiosk', { direction: 'IN', descriptor: jitter(face(1), 5), quality: q, idempotencyKey: key() }, meta);
    expect(r.outcome).toBe('SUCCESS');
    expect(r.employee?.id).toBe(f.stafA.id);
    const ev = await prisma.attendanceEvent.findUniqueOrThrow({ where: { id: r.eventId } });
    expect(ev.stationId).toBe(id);
    expect(ev.actorUserId).toBeNull();
    expect(ev.method).toBe('FACE_KIOSK');
  });

  it('pegawai di luar unit titik absen tidak dikenali', async () => {
    const admin = await actorOf(f.users.superUser.id);
    const { token } = await createStation(admin, { name: 'Lobi Unit A 2', unitId: f.unitA.id });
    const r = await stationAttendance(token, 'kiosk', { direction: 'IN', descriptor: jitter(face(3), 5), quality: q, idempotencyKey: key() }, meta);
    expect(r.outcome).toBe('NOT_RECOGNIZED');
    expect(r.employee).toBeUndefined();
  });

  it('token salah, nonaktif, atau sudah diganti ditolak', async () => {
    const admin = await actorOf(f.users.superUser.id);
    const { id, token } = await createStation(admin, { name: 'Tablet sementara' });
    const body = () => ({ direction: 'OUT', descriptor: face(1), quality: q, idempotencyKey: key() });
    await expect(stationAttendance('x'.repeat(32), 'kiosk', body(), meta)).rejects.toThrow(/tidak berlaku/);
    const { token: baru } = await rotateStationToken(admin, id);
    await expect(stationAttendance(token, 'kiosk', body(), meta)).rejects.toThrow(/tidak berlaku/);
    await updateStation(admin, id, { isActive: false });
    await expect(stationAttendance(baru, 'kiosk', body(), meta)).rejects.toThrow(/tidak berlaku/);
  });

  it('dinas luar hanya bila diizinkan, dan wajib GPS', async () => {
    const admin = await actorOf(f.users.superUser.id);
    const off = await createStation(admin, { name: 'Tanpa dinas luar' });
    const body = { direction: 'IN', descriptor: jitter(face(3), 7), quality: q, latitude: -6.2, longitude: 106.8, note: 'Rapat di kementerian', idempotencyKey: key() };
    await expect(stationAttendance(off.token, 'field-duty', body, meta)).rejects.toThrow(/tidak melayani/);
    const on = await createStation(admin, { name: 'Dengan dinas luar', allowFieldDuty: true });
    const noGps = await stationAttendance(on.token, 'field-duty', { ...body, latitude: undefined, longitude: undefined, idempotencyKey: key() }, meta);
    expect(noGps.outcome).toBe('LOCATION_MISMATCH');
    const r = await stationAttendance(on.token, 'field-duty', { ...body, idempotencyKey: key(), photo: `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 0xff, 0xd9]).toString('base64')}` }, meta);
    expect(r.outcome).toBe('SUCCESS');
    expect(r.employee?.id).toBe(f.stafB.id);
  });

  it('operator unit B tidak bisa membuat titik absen untuk unit A', async () => {
    const op = await actorOf(f.users.operatorB.id);
    await expect(createStation(op, { name: 'Lobi A', unitId: f.unitA.id })).rejects.toThrow();
  });
});

describe('libur nasional', () => {
  const sys = systemActor('uji');
  const Y = 2031;

  it('menambah, mempertahankan isian petugas, dan menghapus libur yang dibatalkan', async () => {
    await prisma.holiday.create({ data: { date: toDbDate(`${Y}-08-17`), name: 'HUT RI versi instansi', source: 'MANUAL', kind: 'NASIONAL' } });
    const first = await applyHolidays(sys, Y, 'DAYOFFAPI', [
      { date: `${Y}-01-01`, name: 'Tahun Baru', kind: 'NASIONAL' },
      { date: `${Y}-08-17`, name: 'Kemerdekaan', kind: 'NASIONAL' },
      { date: `${Y}-12-24`, name: 'Cuti Bersama Natal', kind: 'CUTI_BERSAMA' },
    ], { replace: true });
    expect(first).toMatchObject({ created: 2, keptManual: 1 });
    const manual = await prisma.holiday.findFirstOrThrow({ where: { date: toDbDate(`${Y}-08-17`) } });
    expect(manual.name).toBe('HUT RI versi instansi');

    const second = await applyHolidays(sys, Y, 'DAYOFFAPI', [{ date: `${Y}-01-01`, name: 'Tahun Baru Masehi', kind: 'NASIONAL' }], { replace: true });
    expect(second).toMatchObject({ created: 0, updated: 1, removed: 1 });
    expect(await prisma.holiday.count({ where: { date: toDbDate(`${Y}-08-17`) } })).toBe(1);
  });

  it('libur yang dinonaktifkan tetap nonaktif setelah tarik ulang dan tidak dihitung libur', async () => {
    const h = await prisma.holiday.findFirstOrThrow({ where: { date: toDbDate(`${Y}-01-01`), unitId: null } });
    await setHolidayDisabled(sys, h.id, true);
    await applyHolidays(sys, Y, 'DAYOFFAPI', [{ date: `${Y}-01-01`, name: 'Tahun Baru Masehi', kind: 'NASIONAL' }], { replace: true });
    expect((await prisma.holiday.findUniqueOrThrow({ where: { id: h.id } })).disabled).toBe(true);
  });
});

describe('rekap kalender', () => {
  it('satu baris per pegawai, satu kolom per tanggal, dengan kode dan jam', async () => {
    const admin = await actorOf(f.users.admin.id);
    const day = pastWorkday(1);
    const month = day.slice(0, 7);
    await prisma.holiday.deleteMany({ where: { date: toDbDate(day) } });
    const r = await calendarRecap(admin, { month });
    expect(r.columns[0].date).toBe(`${month}-01`);
    expect(r.rows.map((x) => x.employee.fullName)).toContain('Staf Uji A');
    const row = r.rows.find((x) => x.employee.id === f.stafA.id)!;
    expect(row.cells).toHaveLength(r.columns.length);
    // Akhir pekan tanpa rekap selalu L (tes lain bisa membuat rekap di hari ini, yang mungkin jatuh di akhir pekan).
    const weekendNoRecord = row.cells.filter((c, i) => r.columns[i].weekend && !c.status);
    expect(weekendNoRecord.length).toBeGreaterThan(0);
    expect(weekendNoRecord.every((c) => c.code === 'L')).toBe(true);
  });

  it('operator unit B hanya melihat pegawai unit B', async () => {
    const op = await actorOf(f.users.operatorB.id);
    const r = await calendarRecap(op, { month: pastWorkday(1).slice(0, 7) }).catch((e) => e);
    if (r instanceof Error) return expect(r.message).toMatch(/izin|akses/i);
    expect(r.rows.every((x: { employee: { id: string } }) => x.employee.id === f.stafB.id)).toBe(true);
  });
});

describe('atur jadwal banyak pegawai', () => {
  const D = (d: string) => `2032-01-${d}`;
  let pagi: { id: string };

  beforeAll(async () => {
    pagi = await createSchedule(systemActor('uji'), { code: 'PG', name: 'Pagi uji', kind: 'SHIFT', checkIn: '06:00', checkOut: '14:00', lateToleranceMin: 0, earlyLeaveToleranceMin: 0, workdays: [1, 2, 3, 4, 5, 6], color: '#2a78d6' });
  });

  it('menerapkan shift ke beberapa pegawai, hanya pada hari yang dipilih', async () => {
    const admin = await actorOf(f.users.admin.id);
    // Januari 2032: Senin jatuh pada 5, 12, 19, 26.
    const r = await setDaysBulk(admin, { employeeIds: [f.stafA.id, f.stafB.id], from: D('01'), to: D('31'), weekdays: [1], value: pagi.id });
    expect(r).toMatchObject({ employees: 2, days: 4 });
    const ctx = await loadPlanContext([f.stafA.id, f.stafB.id], D('05'), D('06'));
    expect(ctx.planFor(f.stafA.id, D('05')).schedule?.code).toBe('PG');
    expect(ctx.planFor(f.stafB.id, D('05')).schedule?.code).toBe('PG');
    expect(ctx.planFor(f.stafA.id, D('06')).schedule?.code).toBe('REG');
  });

  it('libur lalu shift default mengganti perubahan harian sebelumnya, tanpa menumpuk', async () => {
    const admin = await actorOf(f.users.admin.id);
    const libur = await setDaysBulk(admin, { employeeIds: [f.stafA.id], from: D('05'), to: D('05'), value: 'LIBUR' });
    expect(libur.replaced).toBe(1);
    let p = (await loadPlanContext([f.stafA.id], D('05'), D('05'))).planFor(f.stafA.id, D('05'));
    expect(p.isOffDay).toBe(true);
    await setDaysBulk(admin, { employeeIds: [f.stafA.id], from: D('05'), to: D('05'), value: 'BAWAAN' });
    p = (await loadPlanContext([f.stafA.id], D('05'), D('05'))).planFor(f.stafA.id, D('05'));
    expect(p.schedule?.code).toBe('REG');
    expect(await prisma.employeeScheduleAssignment.count({ where: { employeeId: f.stafA.id, startDate: toDbDate(D('05')), deletedAt: null } })).toBe(0);
  });

  it('pegawai di luar kewenangan menggagalkan seluruh proses', async () => {
    const op = await actorOf(f.users.operatorB.id);
    const before = await prisma.employeeScheduleAssignment.count();
    await expect(setDaysBulk(op, { employeeIds: [f.stafA.id, f.stafB.id], from: D('10'), to: D('11'), value: 'LIBUR' })).rejects.toThrow(/kewenangan/);
    expect(await prisma.employeeScheduleAssignment.count()).toBe(before);
  });
});
