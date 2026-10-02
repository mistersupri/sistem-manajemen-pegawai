import { describe, expect, it } from 'vitest';
import { buildRecord, lateAndEarly, shiftWindow, workDateFor, type DayPlan, type ScheduleRules } from '@/lib/attendance/engine';
import { zonedToUtc } from '@/lib/time';

const TZ = 'Asia/Jakarta';
const reg: ScheduleRules = { id: 'r', code: 'REG', name: 'Reguler', kind: 'REGULER', checkIn: '07:30', checkOut: '16:00', lateToleranceMin: 15, earlyLeaveToleranceMin: 0, workdays: [1, 2, 3, 4, 5], version: 1 };
const night: ScheduleRules = { ...reg, id: 'm', code: 'MALAM', kind: 'SHIFT', checkIn: '22:00', checkOut: '06:00', lateToleranceMin: 10, workdays: [0, 1, 2, 3, 4, 5, 6] };
const plan = (date: string, s: ScheduleRules | null = reg, off = false): DayPlan => ({ date, schedule: s, isOffDay: off, source: 'PEGAWAI' });
const at = (d: string, t: string) => zonedToUtc(d, t, TZ);

describe('jendela shift', () => {
  it('shift reguler dalam satu hari', () => {
    const w = shiftWindow(reg, '2026-05-04', TZ);
    expect(w.start.toISOString()).toBe('2026-05-04T00:30:00.000Z');
    expect(w.end.toISOString()).toBe('2026-05-04T09:00:00.000Z');
  });
  it('shift malam berakhir esok hari', () => {
    const w = shiftWindow(night, '2026-05-04', TZ);
    expect(w.start.toISOString()).toBe('2026-05-04T15:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-05-04T23:00:00.000Z');
  });
});

describe('keterlambatan dan pulang awal', () => {
  it('dalam toleransi tidak dihitung terlambat', () => {
    expect(lateAndEarly(plan('2026-05-04'), at('2026-05-04', '07:45'), null, TZ).lateMinutes).toBe(0);
  });
  it('melewati toleransi dihitung penuh dari jam masuk', () => {
    expect(lateAndEarly(plan('2026-05-04'), at('2026-05-04', '07:46'), null, TZ).lateMinutes).toBe(16);
  });
  it('pulang awal', () => {
    expect(lateAndEarly(plan('2026-05-04'), null, at('2026-05-04', '15:30'), TZ).earlyLeaveMinutes).toBe(30);
  });
  it('hari libur tidak menghitung keterlambatan', () => {
    expect(lateAndEarly(plan('2026-05-02', reg, true), at('2026-05-02', '10:00'), null, TZ).lateMinutes).toBe(0);
  });
  it('shift malam: pulang 05:00 esok hari = pulang awal 60 menit', () => {
    const r = lateAndEarly(plan('2026-05-04', night), at('2026-05-04', '22:20'), at('2026-05-05', '05:00'), TZ);
    expect(r).toEqual({ lateMinutes: 20, earlyLeaveMinutes: 60 });
  });
});

describe('tanggal kerja shift malam', () => {
  it('scan dini hari milik shift malam kemarin', () => {
    expect(workDateFor(at('2026-05-05', '06:05'), '2026-05-05', plan('2026-05-04', night), TZ, 6)).toBe('2026-05-04');
  });
  it('melewati batas tenggang menjadi tanggal hari ini', () => {
    expect(workDateFor(at('2026-05-05', '12:30'), '2026-05-05', plan('2026-05-04', night), TZ, 6)).toBe('2026-05-05');
  });
  it('kemarin shift reguler: tetap hari ini', () => {
    expect(workDateFor(at('2026-05-05', '01:00'), '2026-05-05', plan('2026-05-04'), TZ, 6)).toBe('2026-05-05');
  });
});

describe('penyusunan rekap harian', () => {
  const base = { tz: TZ, correction: null, leave: null, fieldDuty: false };
  it('tanpa transaksi: tidak ada rekap (bukan otomatis tidak hadir)', () => {
    expect(buildRecord({ ...base, plan: plan('2026-05-04'), events: [] })).toBeNull();
  });
  it('scan mesin pertama = masuk, terakhir = pulang', () => {
    const r = buildRecord({ ...base, plan: plan('2026-05-04'), events: [
      { id: 'a', at: at('2026-05-04', '07:20'), direction: null, method: 'DEVICE' },
      { id: 'b', at: at('2026-05-04', '12:00'), direction: null, method: 'DEVICE' },
      { id: 'c', at: at('2026-05-04', '16:10'), direction: null, method: 'DEVICE' },
    ] })!;
    expect(r.checkInSourceId).toBe('a');
    expect(r.checkOutSourceId).toBe('c');
    expect(r.status).toBe('HADIR');
  });
  it('scan tunggal sore hari dianggap pulang dan ditandai perlu ditinjau', () => {
    const r = buildRecord({ ...base, plan: plan('2026-05-04'), events: [
      { id: 'a', at: at('2026-05-04', '16:05'), direction: null, method: 'DEVICE' },
      { id: 'b', at: at('2026-05-04', '16:06'), direction: null, method: 'DEVICE' },
    ] })!;
    expect(r.checkInAt).toBeNull();
    expect(r.checkOutSourceId).toBe('b');
    expect(r.needsReview).toBe(true);
  });
  it('wajah dan mesin digabung: masuk paling awal, pulang paling akhir', () => {
    const r = buildRecord({ ...base, plan: plan('2026-05-04'), events: [
      { id: 'f', at: at('2026-05-04', '07:50'), direction: 'IN', method: 'FACE_KIOSK' },
      { id: 'd', at: at('2026-05-04', '07:40'), direction: null, method: 'DEVICE' },
      { id: 'o', at: at('2026-05-04', '16:30'), direction: 'OUT', method: 'FACE_KIOSK' },
    ] })!;
    expect(r.checkInSourceId).toBe('d');
    expect(r.checkOutSourceId).toBe('o');
  });
  it('koreksi disetujui menimpa jam dan bisa memberi dispensasi', () => {
    const r = buildRecord({ ...base, plan: plan('2026-05-04'), events: [{ id: 'x', at: at('2026-05-04', '09:00'), direction: 'IN', method: 'FACE_SELF' }],
      correction: { id: 'k', checkIn: at('2026-05-04', '07:30'), checkOut: at('2026-05-04', '16:00'), status: null, dispensation: false } })!;
    expect(r.lateMinutes).toBe(0);
    expect(r.checkInMethod).toBe('KOREKSI');
    const d = buildRecord({ ...base, plan: plan('2026-05-04'), events: [{ id: 'x', at: at('2026-05-04', '09:00'), direction: 'IN', method: 'FACE_SELF' }],
      correction: { id: 'k', checkIn: null, checkOut: null, status: null, dispensation: true } })!;
    expect(d.lateMinutes).toBe(0);
    expect(d.status).toBe('HADIR');
  });
  it('cuti disetujui mengunci status walau ada transaksi', () => {
    const r = buildRecord({ ...base, plan: plan('2026-05-04'), events: [], leave: { id: 'l', status: 'CUTI' } })!;
    expect(r.status).toBe('CUTI');
    expect(r.statusLocked).toBe(true);
  });
  it('absen dinas luar menjadikan status DINAS_LUAR tanpa hitungan terlambat', () => {
    const r = buildRecord({ ...base, plan: plan('2026-05-04'), fieldDuty: true, events: [{ id: 'x', at: at('2026-05-04', '09:00'), direction: 'IN', method: 'FIELD_DUTY' }] })!;
    expect(r.status).toBe('DINAS_LUAR');
    expect(r.lateMinutes).toBe(0);
  });
  it('masuk di hari libur dicatat dengan keterangan', () => {
    const r = buildRecord({ ...base, plan: { ...plan('2026-05-01', reg, true), holidayName: 'Hari Buruh' }, events: [{ id: 'x', at: at('2026-05-01', '09:00'), direction: 'IN', method: 'FACE_SELF' }] })!;
    expect(r.notes.join()).toContain('Hari Buruh');
    expect(r.lateMinutes).toBe(0);
  });
});
