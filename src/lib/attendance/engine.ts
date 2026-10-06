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
  /** Jam fleksibel: terlambat sampai sekian menit diganti dengan pulang selama itu lebih akhir. 0 = tidak berlaku. */
  flexMinutes?: number;
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

/**
 * Menit terlambat dan pulang awal. Toleransi: terlambat dihitung bila melebihi toleransi.
 * Jam fleksibel: keterlambatan diganti dengan pulang lebih akhir sama lamanya (masuk 07.30 pada jadwal
 * 07.00-16.00 harus pulang 16.30). Penggantian dilakukan sebelum toleransi dihitung, jadi terlambat 62 menit
 * dengan toleransi 60 menit tetap hadir bila pulang 62 menit atau lebih setelah jam pulang. Bila pulangnya
 * kurang, yang dihitung terlambat hanya sisa yang belum terganti. `flexMinutes` > 0 membatasi keterlambatan
 * yang boleh diganti; 0 berarti tanpa batas.
 */
export function lateAndEarly(plan: DayPlan, checkInAt: Date | null, checkOutAt: Date | null, tz: string) {
  const out = { lateMinutes: 0, earlyLeaveMinutes: 0 };
  if (!plan.schedule || plan.isOffDay) return out;
  const win = shiftWindow(plan.schedule, plan.date, tz);
  if (checkInAt) {
    let late = Math.max(0, minutesBetween(win.start, checkInAt));
    const flex = plan.schedule.flexMinutes ?? 0;
    if (late > 0 && (flex === 0 || late <= flex) && checkOutAt) {
      const stayedAfterEnd = Math.max(0, minutesBetween(win.end, checkOutAt));
      late = Math.max(0, late - stayedAfterEnd);
    }
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

// Penyusunan rekap harian
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
  TIDAK_HADIR: 'Alfa',
  ALFA: 'Alfa',
  ALFA_AWAL: 'Alfa awal',
  ALFA_AKHIR: 'Alfa akhir',
  BELUM: 'Belum absen',
  LIBUR: 'Libur',
};

/** Status Alfa: hari kerja yang lewat tanpa transaksi, salah satu jam tidak terekam, atau ditetapkan petugas. */
export const ALFA_STATUSES = ['ALFA', 'ALFA_AWAL', 'ALFA_AKHIR', 'TIDAK_HADIR'] as const;

/**
 * Status yang ditampilkan untuk satu pegawai pada satu tanggal. Rekap tersimpan hanya berisi transaksi;
 * status yang bergantung pada "hari sudah lewat" dihitung di sini agar berganti sendiri tanpa hitung ulang.
 * - Hari kerja yang sudah lewat tanpa transaksi: ALFA. Hari ini dan sesudahnya: BELUM ("-").
 * - Ada absen pulang tanpa absen masuk: ALFA_AWAL.
 * - Hari sudah lewat, ada absen masuk tanpa absen pulang: ALFA_AKHIR.
 * - Hari libur dan status yang ditetapkan (cuti, izin, dinas luar, ditetapkan petugas) tidak diubah.
 */
export function effectiveStatus(
  rec: { status: string; statusLocked: boolean; checkInAt: Date | null; checkOutAt: Date | null } | null,
  plan: { date: string; isOffDay: boolean; schedule: Pick<ScheduleRules, 'checkIn' | 'checkOut'> | null },
  today: string,
): string | null {
  const scheduled = !!plan.schedule && !plan.isOffDay;
  // Shift malam kemarin baru berakhir pagi ini, jadi baru dianggap lewat mulai besok.
  const overnightYesterday = !!plan.schedule && isOvernight(plan.schedule) && plan.date === addDays(today, -1);
  const past = plan.date < today && !overnightYesterday;
  if (!rec) return scheduled ? (past ? 'ALFA' : 'BELUM') : plan.isOffDay ? 'LIBUR' : null;
  if (rec.statusLocked || !scheduled) return rec.status;
  if (!rec.checkInAt && rec.checkOutAt) return 'ALFA_AWAL';
  if (rec.checkInAt && !rec.checkOutAt && past) return 'ALFA_AKHIR';
  return rec.status;
}

export const METHOD_LABEL: Record<string, string> = {
  FACE_SELF: 'Wajah (perangkat pribadi)',
  FACE_KIOSK: 'Wajah (kiosk)',
  FIELD_DUTY: 'Foto GPS dinas luar',
  MANUAL: 'Input manual petugas',
  DEVICE: 'Mesin absensi',
  KOREKSI: 'Koreksi disetujui',
};
