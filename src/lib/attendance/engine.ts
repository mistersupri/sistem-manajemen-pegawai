// Perhitungan absensi tanpa akses database: jendela shift, keterlambatan, pulang awal,
// penentuan tanggal kerja shift malam, dan penyusunan rekap harian dari transaksi sumber.
import { addDays, minutesBetween, zonedToUtc } from '../time';

export interface ScheduleRules {
  id: string;
  code: string;
  name: string;
  kind: string;
  checkIn: string; // HH:MM
  checkOut: string;
  breakStart?: string | null;
  breakEnd?: string | null;
  lateToleranceMin: number;
  earlyLeaveToleranceMin: number;
  workdays: number[];
  version: number;
  revisionId?: string | null;
}

export type PlanSource = 'SEMENTARA' | 'PEGAWAI' | 'UNIT' | 'TANPA_JADWAL';

export interface DayPlan {
  date: string;
  schedule: ScheduleRules | null;
  isOffDay: boolean;
  source: PlanSource;
  offReason?: 'HARI_LIBUR' | 'BUKAN_HARI_KERJA' | 'LIBUR_TERJADWAL' | null;
  holidayName?: string | null;
}

export const isOvernight = (s: Pick<ScheduleRules, 'checkIn' | 'checkOut'>) => s.checkOut <= s.checkIn;

/** Jendela kerja suatu jadwal pada tanggal kerja tertentu (shift malam berakhir esok hari). */
export function shiftWindow(s: Pick<ScheduleRules, 'checkIn' | 'checkOut'>, date: string, tz: string) {
  return {
    start: zonedToUtc(date, s.checkIn, tz),
    end: zonedToUtc(isOvernight(s) ? addDays(date, 1) : date, s.checkOut, tz),
  };
}

/** Menit terlambat dan pulang awal. Toleransi: terlambat dihitung bila melebihi toleransi. */
export function lateAndEarly(plan: DayPlan, checkInAt: Date | null, checkOutAt: Date | null, tz: string) {
  const out = { lateMinutes: 0, earlyLeaveMinutes: 0 };
  if (!plan.schedule || plan.isOffDay) return out;
  const win = shiftWindow(plan.schedule, plan.date, tz);
  if (checkInAt) {
    const late = minutesBetween(win.start, checkInAt);
    if (late > plan.schedule.lateToleranceMin) out.lateMinutes = late;
  }
  if (checkOutAt) {
    const early = minutesBetween(checkOutAt, win.end);
    if (early > plan.schedule.earlyLeaveToleranceMin) out.earlyLeaveMinutes = early;
  }
  return out;
}

/** Batas akhir absen pulang masih dihitung milik tanggal kerja tersebut. */
export function checkoutDeadline(plan: DayPlan, tz: string, graceHours: number) {
  if (plan.schedule && !plan.isOffDay) return new Date(shiftWindow(plan.schedule, plan.date, tz).end.getTime() + graceHours * 3600_000);
  return zonedToUtc(addDays(plan.date, 1), '06:00', tz);
}

/**
 * Tanggal kerja sebuah waktu absen/scan. Waktu dini hari dianggap milik shift malam kemarin
 * bila masih sebelum batas akhir shift tersebut ditambah masa tenggang.
 */
export function workDateFor(at: Date, today: string, yesterdayPlan: DayPlan | null, tz: string, graceHours: number) {
  if (yesterdayPlan?.schedule && !yesterdayPlan.isOffDay && isOvernight(yesterdayPlan.schedule)) {
    if (at <= checkoutDeadline(yesterdayPlan, tz, graceHours)) return addDays(today, -1);
  }
  return today;
}

// ---------------------------------------------------------------------------
// Penyusunan rekap harian
// ---------------------------------------------------------------------------

export const LOCKED_STATUSES = ['DINAS_LUAR', 'IZIN', 'SAKIT', 'CUTI', 'TIDAK_HADIR'] as const;

export interface SourceEvent {
  id: string;
  at: Date;
  direction: 'IN' | 'OUT' | null; // null = scan perangkat tanpa arah
  method: string;
}

export interface ApprovedCorrection {
  id: string;
  checkIn: Date | null; // nilai usulan yang disetujui (null = tidak diubah)
  checkOut: Date | null;
  status: string | null;
  dispensation: boolean;
}

export interface ApprovedLeave {
  id: string;
  status: string; // CUTI | IZIN | SAKIT | DINAS_LUAR
}

export interface BuiltRecord {
  checkInAt: Date | null;
  checkOutAt: Date | null;
  checkInMethod: string | null;
  checkOutMethod: string | null;
  checkInSourceId: string | null;
  checkOutSourceId: string | null;
  status: string;
  statusLocked: boolean;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  dispensation: boolean;
  needsReview: boolean;
  reviewReason: string | null;
  leaveRequestId: string | null;
  notes: string[];
}

// Scan perangkat yang semuanya berdekatan dianggap satu kelompok (mis. scan ganda).
export const DEVICE_CLUSTER_MINUTES = 60;

/**
 * Susun rekap satu pegawai pada satu tanggal kerja dari transaksi sumber, lalu terapkan
 * koreksi dan cuti/izin yang sudah disetujui. Mengembalikan null bila tidak ada apa pun.
 */
export function buildRecord(input: {
  plan: DayPlan;
  tz: string;
  events: SourceEvent[];
  correction: ApprovedCorrection | null;
  leave: ApprovedLeave | null;
  fieldDuty: boolean;
}): BuiltRecord | null {
  const { plan, tz, correction, leave } = input;
  const notes: string[] = [];
  const reasons: string[] = [];
  const events = [...input.events].sort((a, b) => a.at.getTime() - b.at.getTime());

  let inEv: SourceEvent | null = null;
  let outEv: SourceEvent | null = null;
  const pickIn = (e: SourceEvent) => { if (!inEv || e.at < inEv.at) inEv = e; };
  const pickOut = (e: SourceEvent) => { if (!outEv || e.at > outEv.at) outEv = e; };

  for (const e of events) {
    if (e.direction === 'IN') pickIn(e);
    else if (e.direction === 'OUT') pickOut(e);
  }
  const scans = events.filter((e) => e.direction === null);
  if (scans.length) {
    const first = scans[0];
    const last = scans[scans.length - 1];
    if (minutesBetween(first.at, last.at) >= DEVICE_CLUSTER_MINUTES) {
      pickIn(first);
      pickOut(last);
    } else {
      // Satu kelompok scan: masuk atau pulang ditentukan dari posisinya terhadap tengah jam kerja.
      const win = plan.schedule && !plan.isOffDay ? shiftWindow(plan.schedule, plan.date, tz) : null;
      const mid = win ? new Date((win.start.getTime() + win.end.getTime()) / 2) : zonedToUtc(plan.date, '12:00', tz);
      if (first.at < mid) pickIn(first); else pickOut(last);
    }
  }

  let checkInAt: Date | null = inEv ? (inEv as SourceEvent).at : null;
  let checkOutAt: Date | null = outEv ? (outEv as SourceEvent).at : null;
  let checkInMethod: string | null = inEv ? (inEv as SourceEvent).method : null;
  let checkOutMethod: string | null = outEv ? (outEv as SourceEvent).method : null;
  let checkInSourceId: string | null = inEv ? (inEv as SourceEvent).id : null;
  let checkOutSourceId: string | null = outEv ? (outEv as SourceEvent).id : null;
  let dispensation = false;
  let status: string | null = null;
  let statusLocked = false;

  if (correction) {
    if (correction.checkIn) { checkInAt = correction.checkIn; checkInMethod = 'KOREKSI'; checkInSourceId = correction.id; }
    if (correction.checkOut) { checkOutAt = correction.checkOut; checkOutMethod = 'KOREKSI'; checkOutSourceId = correction.id; }
    dispensation = correction.dispensation;
    if (correction.status) { status = correction.status; statusLocked = (LOCKED_STATUSES as readonly string[]).includes(correction.status); }
    notes.push('Dikoreksi');
  }
  if (leave && !statusLocked) {
    status = leave.status;
    statusLocked = true;
  }
  if (input.fieldDuty && !statusLocked) {
    status = 'DINAS_LUAR';
    statusLocked = true;
  }

  if (!checkInAt && !checkOutAt && !statusLocked && !status) return null;

  const calc = dispensation ? { lateMinutes: 0, earlyLeaveMinutes: 0 } : lateAndEarly(plan, checkInAt, checkOutAt, tz);
  if (!statusLocked) status = calc.lateMinutes > 0 ? 'TERLAMBAT' : 'HADIR';
  if (checkOutAt && !checkInAt && !statusLocked) reasons.push('Tidak ada absen masuk');
  if (checkInAt && checkOutAt && checkOutAt < checkInAt) reasons.push('Jam pulang lebih awal dari jam masuk');
  if (plan.isOffDay && (checkInAt || checkOutAt)) notes.push(plan.holidayName ? `Masuk pada hari libur (${plan.holidayName})` : 'Masuk pada hari libur');

  return {
    checkInAt, checkOutAt, checkInMethod, checkOutMethod, checkInSourceId, checkOutSourceId,
    status: status!, statusLocked,
    lateMinutes: statusLocked && status !== 'HADIR' && status !== 'TERLAMBAT' ? 0 : calc.lateMinutes,
    earlyLeaveMinutes: statusLocked && status !== 'HADIR' && status !== 'TERLAMBAT' ? 0 : calc.earlyLeaveMinutes,
    dispensation,
    needsReview: reasons.length > 0,
    reviewReason: reasons.join('; ') || null,
    leaveRequestId: leave?.id ?? null,
    notes,
  };
}

export const STATUS_LABEL: Record<string, string> = {
  HADIR: 'Hadir',
  TERLAMBAT: 'Terlambat',
  DINAS_LUAR: 'Dinas luar',
  IZIN: 'Izin',
  SAKIT: 'Sakit',
  CUTI: 'Cuti',
  TIDAK_HADIR: 'Tidak hadir',
  TANPA_TRANSAKSI: 'Belum ada transaksi',
};

export const METHOD_LABEL: Record<string, string> = {
  FACE_SELF: 'Wajah (perangkat pribadi)',
  FACE_KIOSK: 'Wajah (kiosk)',
  FIELD_DUTY: 'Foto GPS dinas luar',
  MANUAL: 'Input manual petugas',
  DEVICE: 'Mesin absensi',
  KOREKSI: 'Koreksi disetujui',
};
