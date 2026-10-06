import { describe, expect, it } from 'vitest';
import { effectiveStatus, lateAndEarly, type DayPlan, type ScheduleRules } from '@/lib/attendance/engine';
import { zonedToUtc } from '@/lib/time';

const TZ = 'Asia/Jakarta';
// Jadwal contoh dari permintaan: 07.00-16.00, tanpa toleransi, jam fleksibel 60 menit.
const flex: ScheduleRules = { id: 'f', code: 'FLX', name: 'Fleksibel', kind: 'REGULER', checkIn: '07:00', checkOut: '16:00', lateToleranceMin: 0, earlyLeaveToleranceMin: 0, flexMinutes: 60, workdays: [1, 2, 3, 4, 5], version: 1 };
const night: ScheduleRules = { ...flex, id: 'm', checkIn: '22:00', checkOut: '06:00', flexMinutes: 0 };
const plan = (date: string, s: ScheduleRules | null = flex, off = false): DayPlan => ({ date, schedule: s, isOffDay: off, source: 'PEGAWAI' });
const at = (d: string, t: string) => zonedToUtc(d, t, TZ);
const D = '2026-10-05'; // Senin

describe('jam fleksibel', () => {
  it('masuk 07.30 dan pulang 16.30: tidak terlambat', () => {
    expect(lateAndEarly(plan(D), at(D, '07:30'), at(D, '16:30'), TZ).lateMinutes).toBe(0);
  });
  it('masuk 07.30 dan pulang 16.10: sisa 20 menit tetap terlambat', () => {
    expect(lateAndEarly(plan(D), at(D, '07:30'), at(D, '16:10'), TZ).lateMinutes).toBe(20);
  });
  it('masuk 07.30 dan pulang tepat 16.00: terlambat 30 menit', () => {
    expect(lateAndEarly(plan(D), at(D, '07:30'), at(D, '16:00'), TZ).lateMinutes).toBe(30);
  });
  it('terlambat melebihi batas fleksibel tidak bisa diganti', () => {
    expect(lateAndEarly(plan(D), at(D, '08:30'), at(D, '18:00'), TZ).lateMinutes).toBe(90);
  });
  it('belum absen pulang: keterlambatan tetap terhitung sampai pulang tercatat', () => {
    expect(lateAndEarly(plan(D), at(D, '07:30'), null, TZ).lateMinutes).toBe(30);
  });
  it('batas fleksibel 0 berarti tanpa batas: terlambat diganti penuh', () => {
    expect(lateAndEarly(plan(D, { ...flex, flexMinutes: 0 }), at(D, '07:30'), at(D, '16:30'), TZ).lateMinutes).toBe(0);
  });
  it('contoh: jadwal 07.30-16.00, toleransi 60, masuk 08.32 pulang 17.40 tidak terlambat', () => {
    const s = { ...flex, checkIn: '07:30', checkOut: '16:00', lateToleranceMin: 60, flexMinutes: 0 };
    expect(lateAndEarly(plan(D, s), at(D, '08:32'), at(D, '17:40'), TZ)).toEqual({ lateMinutes: 0, earlyLeaveMinutes: 0 });
  });
  it('contoh yang sama tapi pulang 16.30: sisa 32 menit masih di bawah toleransi', () => {
    const s = { ...flex, checkIn: '07:30', checkOut: '16:00', lateToleranceMin: 60, flexMinutes: 0 };
    expect(lateAndEarly(plan(D, s), at(D, '08:32'), at(D, '16:30'), TZ).lateMinutes).toBe(0);
    expect(lateAndEarly(plan(D, s), at(D, '09:00'), at(D, '16:00'), TZ).lateMinutes).toBe(90);
  });
});

describe('status efektif: Alfa, Alfa awal, Alfa akhir', () => {
  const rec = (inT: string | null, outT: string | null, status = 'HADIR', statusLocked = false) =>
    ({ status, statusLocked, checkInAt: inT ? at(D, inT) : null, checkOutAt: outT ? at(D, outT) : null });
  const today = '2026-10-06';

  it('hari kerja lewat tanpa transaksi: Alfa', () => {
    expect(effectiveStatus(null, plan(D), today)).toBe('ALFA');
  });
  it('hari ini dan sesudahnya tanpa transaksi: belum ("-")', () => {
    expect(effectiveStatus(null, plan(today), today)).toBe('BELUM');
    expect(effectiveStatus(null, plan('2026-10-07'), today)).toBe('BELUM');
  });
  it('hari libur tidak menjadi Alfa', () => {
    expect(effectiveStatus(null, plan(D, flex, true), today)).toBe('LIBUR');
  });
  it('absen pulang tanpa absen masuk: Alfa awal, juga pada hari ini', () => {
    expect(effectiveStatus(rec(null, '16:00'), plan(D), today)).toBe('ALFA_AWAL');
    expect(effectiveStatus(rec(null, '16:00'), plan(D), D)).toBe('ALFA_AWAL');
  });
  it('absen masuk tanpa pulang: Alfa akhir setelah harinya lewat, hari ini masih hadir', () => {
    expect(effectiveStatus(rec('07:00', null), plan(D), today)).toBe('ALFA_AKHIR');
    expect(effectiveStatus(rec('07:00', null), plan(D), D)).toBe('HADIR');
  });
  it('shift malam kemarin belum dianggap Alfa akhir pagi ini', () => {
    expect(effectiveStatus(rec('22:00', null), plan(D, night), today)).toBe('HADIR');
  });
  it('cuti, izin, dan status yang ditetapkan tidak diubah', () => {
    expect(effectiveStatus(rec(null, null, 'CUTI', true), plan(D), today)).toBe('CUTI');
  });
  it('masuk dan pulang lengkap tetap Hadir/Terlambat', () => {
    expect(effectiveStatus(rec('07:00', '16:00'), plan(D), today)).toBe('HADIR');
    expect(effectiveStatus(rec('07:40', '16:00', 'TERLAMBAT'), plan(D), today)).toBe('TERLAMBAT');
  });
});
