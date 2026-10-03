import { z } from 'zod';
import { prisma } from '../db';
import { audit } from '../audit';
import { can, getEmployeeInScope, scopeOf, type Actor } from '../auth/actor';
import { conflict, forbidden, unprocessable } from '../errors';
import { getSettings, type Settings } from '../settings';
import { rateLimit } from '../rate-limit';
import { addDays, fmtJam, isValidDate, isValidTime, toDbDate, todayIn, zonedToUtc } from '../time';
import { activeMatcher, bestDistance, parseDescriptor, qualityProblem, similarity, type QualityReport } from '../biometric/matcher';
import { activeTemplates } from '../biometric/templates';
import { workDateFor } from '../attendance/engine';
import { dayPlan, loadPlanContext } from '../attendance/plan';
import { rebuildRecord } from '../attendance/record';
import { saveFile, jpegFromDataUrl } from '../storage';
import { realUserId } from '../auth/system';
import { notifyEmployee } from './notifications';

export type Outcome =
  | 'SUCCESS' | 'NOT_RECOGNIZED' | 'LOW_QUALITY' | 'LIVENESS_FAILED' | 'OUTSIDE_SCHEDULE' | 'LOCATION_MISMATCH'
  | 'DEVICE_NOT_ALLOWED' | 'SERVICE_UNAVAILABLE' | 'DUPLICATE' | 'ALREADY_RECORDED' | 'NOT_ENROLLED' | 'INACTIVE';

export const OUTCOME_MESSAGE: Record<Outcome, string> = {
  SUCCESS: 'Absensi berhasil dicatat.',
  NOT_RECOGNIZED: 'Wajah tidak dikenali. Pastikan wajah terlihat jelas dan coba lagi, atau gunakan metode absensi lain.',
  LOW_QUALITY: 'Kualitas gambar kurang baik.',
  LIVENESS_FAILED: 'Pemeriksaan keaktifan (kedip mata) belum berhasil. Coba lagi sambil berkedip.',
  OUTSIDE_SCHEDULE: 'Anda tidak memiliki jadwal kerja pada waktu ini.',
  LOCATION_MISMATCH: 'Lokasi Anda di luar radius kantor yang diizinkan.',
  DEVICE_NOT_ALLOWED: 'Metode absensi ini sedang tidak diizinkan.',
  SERVICE_UNAVAILABLE: 'Layanan verifikasi sedang tidak tersedia. Gunakan metode absensi lain.',
  DUPLICATE: 'Transaksi yang sama baru saja tercatat.',
  ALREADY_RECORDED: 'Absensi untuk hari kerja ini sudah tercatat.',
  NOT_ENROLLED: 'Wajah belum terdaftar atau belum diverifikasi petugas.',
  INACTIVE: 'Status pegawai tidak aktif.',
};

const quality = z.object({ score: z.number(), faceWidthPx: z.number(), brightness: z.number().optional() });

export const faceAttendanceInput = z.object({
  direction: z.enum(['IN', 'OUT']),
  descriptor: z.array(z.number()),
  quality,
  liveness: z.object({ method: z.string().max(30), passed: z.boolean() }).optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  accuracyM: z.number().min(0).max(100000).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
  photo: z.string().max(2_200_000).nullable().optional(), // data URL JPEG (hanya dinas luar)
  idempotencyKey: z.string().min(8).max(100),
  clientTime: z.string().datetime().nullable().optional(),
});

type Method = 'FACE_SELF' | 'FACE_KIOSK' | 'FIELD_DUTY';

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const r = (x: number) => (x * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function methodEnabled(s: Settings, m: Method) {
  return m === 'FACE_SELF' ? s['methods.faceSelf'] : m === 'FACE_KIOSK' ? s['methods.faceKiosk'] : s['methods.fieldDuty'];
}

/** Tanggal kerja untuk transaksi sekarang (menangani shift malam lintas hari). */
export async function resolveWorkDate(employeeId: string, at: Date, s: Settings) {
  const tz = s['org.timezone'];
  const today = todayIn(tz, at);
  const ctx = await loadPlanContext([employeeId], addDays(today, -1), today);
  return workDateFor(at, today, ctx.planFor(employeeId, addDays(today, -1)), tz, Number(s['rules.checkoutGraceHours']));
}

export interface AttendanceResult {
  outcome: Outcome;
  message: string;
  eventId?: string;
  employee?: { id: string; name: string; employeeNumber: string | null; position: string | null };
  workDate?: string;
  time?: string;
  status?: string;
  lateMinutes?: number;
  earlyLeaveMinutes?: number;
  similarity?: number | null;
  schedule?: string | null;
}

/**
 * Absensi wajah: mandiri (FACE_SELF), kiosk (FACE_KIOSK, identifikasi 1:N), atau dinas luar
 * (FIELD_DUTY, verifikasi 1:1 + foto GPS). Setiap percobaan, berhasil atau gagal, disimpan
 * sebagai transaksi mentah dengan hasil verifikasi terpisah.
 */
/** Titik absen publik: wajah dikenali 1:N di antara pegawai unit titik (null = semua unit). */
export interface StationContext { id: string; unitIds: string[] | null; requireLocation: boolean }

export async function faceAttendance(actor: Actor, method: Method, raw: unknown, userAgent: string | null, opts: { station?: StationContext } = {}): Promise<AttendanceResult> {
  const station = opts.station;
  if (station) {
    if (method === 'FACE_SELF') throw forbidden();
  } else {
    if (method === 'FACE_KIOSK' && !can(actor, 'kiosk.operate')) throw forbidden();
    if (method !== 'FACE_KIOSK' && (!can(actor, 'attendance.self') || !actor.employeeId)) throw forbidden('Akun ini tidak terhubung dengan data pegawai.');
    rateLimit(`face:${actor.userId}`, method === 'FACE_KIOSK' ? 60 : 12, 60_000);
  }
  // Dari titik absen, dinas luar juga dikenali 1:N karena tidak ada akun yang login.
  const identify = method === 'FACE_KIOSK' || !!station;
  const input = faceAttendanceInput.parse(raw);
  const s = await getSettings();
  const tz = s['org.timezone'];
  const now = new Date();

  // Idempotensi: kirim ulang dengan kunci yang sama mengembalikan hasil sebelumnya.
  const prior = await prisma.attendanceEvent.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { verification: true, employee: true } });
  if (prior) {
    if (prior.actorUserId !== realUserId(actor) || prior.stationId !== (station?.id ?? null)) throw conflict('Kunci transaksi sudah dipakai. Muat ulang halaman lalu coba lagi.');
    const o = (prior.verification?.outcome ?? 'SERVICE_UNAVAILABLE') as Outcome;
    return { outcome: o, message: prior.verification?.message ?? OUTCOME_MESSAGE[o], eventId: prior.id, time: fmtJam(prior.occurredAt, tz) ?? undefined };
  }

  const m = activeMatcher();
  const threshold = Number(s['face.matchThreshold']);
  const probe = parseDescriptor(input.descriptor, m);
  let employeeId: string | null = identify ? null : actor.employeeId;
  let distance: number | null = null;
  let outcome: Outcome = 'SUCCESS';
  let detail: string | null = null;
  let distanceToOffice: number | null = null;

  const fail = (o: Outcome, d?: string | null) => { outcome = o; detail = d ?? null; };

  if (!methodEnabled(s, method)) fail('DEVICE_NOT_ALLOWED');
  else if (!probe) fail('LOW_QUALITY', 'Data wajah tidak valid.');
  else {
    const q = qualityProblem(input.quality as QualityReport, Number(s['face.minDetectionScore']), Number(s['face.minFaceSizePx']));
    if (q) fail('LOW_QUALITY', q);
    else if (s['face.requireLiveness'] && !input.liveness?.passed) fail('LIVENESS_FAILED');
  }

  if (outcome === 'SUCCESS') {
    try {
      if (identify) {
        const unitIds = station ? station.unitIds : (() => { const k = scopeOf(actor, 'kiosk.operate')!; return k.all ? null : k.unitIds; })();
        const candidates = await activeTemplates();
        const allowed = unitIds ? new Set((await prisma.employee.findMany({ where: { unitId: { in: unitIds } }, select: { id: true } })).map((e) => e.id)) : null;
        let best: { id: string; d: number } | null = null;
        for (const t of candidates) {
          if (allowed && !allowed.has(t.employeeId)) continue;
          const d = bestDistance(t.descriptors, probe!, m);
          if (!best || d < best.d) best = { id: t.employeeId, d };
        }
        distance = best?.d ?? null;
        if (best && best.d <= threshold) employeeId = best.id;
        else fail('NOT_RECOGNIZED');
      } else {
        const mine = await activeTemplates([employeeId!]);
        if (!mine.length) fail('NOT_ENROLLED');
        else {
          distance = Math.min(...mine.map((t) => bestDistance(t.descriptors, probe!, m)));
          if (distance > threshold) fail('NOT_RECOGNIZED', 'Wajah tidak cocok dengan data wajah pemilik akun.');
        }
      }
    } catch {
      fail('SERVICE_UNAVAILABLE');
    }
  }

  const employee = employeeId ? await prisma.employee.findUnique({ where: { id: employeeId } }) : null;
  if (outcome === 'SUCCESS' && (!employee || !employee.isActive || employee.deletedAt)) fail('INACTIVE');

  const hasGps = input.latitude != null && input.longitude != null;
  if (hasGps && s['geo.officeLat'] != null && s['geo.officeLng'] != null) {
    distanceToOffice = Math.round(haversineM(input.latitude!, input.longitude!, Number(s['geo.officeLat']), Number(s['geo.officeLng'])));
  }
  const geofence = method === 'FIELD_DUTY' ? false : method === 'FACE_SELF' ? !!s['geo.enforce'] : !!station?.requireLocation;
  if (outcome === 'SUCCESS' && geofence) {
    if (!hasGps) fail('LOCATION_MISMATCH', station ? 'Lokasi GPS wajib diaktifkan untuk absen dari tautan ini.' : 'Lokasi GPS wajib diaktifkan untuk absen dari perangkat pribadi.');
    else if (distanceToOffice == null) fail('SERVICE_UNAVAILABLE', 'Lokasi kantor belum diatur administrator.');
    else if (distanceToOffice > Number(s['geo.radiusM'])) fail('LOCATION_MISMATCH', `Anda berjarak sekitar ${distanceToOffice} m dari kantor (batas ${s['geo.radiusM']} m).`);
  }
  if (outcome === 'SUCCESS' && method === 'FIELD_DUTY') {
    if (!hasGps) fail('LOCATION_MISMATCH', 'Lokasi GPS wajib untuk absen dinas luar.');
    else if (!input.note) { throw unprocessable('Isi tujuan atau keterangan tugas.', { note: 'Wajib diisi' }); }
  }

  let workDate: string | null = null;
  if (employeeId) workDate = await resolveWorkDate(employeeId, now, s);
  if (outcome === 'SUCCESS' && employeeId && workDate) {
    const plan = await dayPlan(employeeId, workDate);
    if (s['rules.blockOutsideSchedule'] && (!plan.schedule || plan.isOffDay) && method !== 'FIELD_DUTY') fail('OUTSIDE_SCHEDULE');
    const windowMin = Number(s['rules.duplicateWindowMinutes']);
    const recent = await prisma.attendanceEvent.findFirst({
      where: { employeeId, direction: input.direction, occurredAt: { gte: new Date(now.getTime() - windowMin * 60_000) }, verification: { outcome: 'SUCCESS' } },
    });
    if (outcome === 'SUCCESS' && recent) fail('DUPLICATE');
    if (outcome === 'SUCCESS' && input.direction === 'IN') {
      const rec = await prisma.attendanceRecord.findUnique({ where: { employeeId_workDate: { employeeId, workDate: toDbDate(workDate) } } });
      if (rec?.checkInAt) fail('ALREADY_RECORDED', `Absen masuk sudah tercatat pukul ${fmtJam(rec.checkInAt, tz)}.`);
    }
  }

  // Foto: hanya dinas luar dan hanya bila diizinkan pengaturan privasi.
  let photoPath: string | null = null;
  if (outcome === 'SUCCESS' && method === 'FIELD_DUTY' && s['privacy.storeFieldDutyPhotos']) {
    const buf = jpegFromDataUrl(input.photo);
    if (!buf) throw unprocessable('Foto dinas luar tidak valid.', { photo: 'Ambil ulang foto' });
    photoPath = await saveFile(`foto/${workDate!.slice(0, 7)}`, buf, 'jpg');
  }

  const message = detail ?? OUTCOME_MESSAGE[outcome];
  const event = await prisma.attendanceEvent.create({
    data: {
      employeeId, direction: input.direction, workDate: workDate ? toDbDate(workDate) : null, method, occurredAt: now,
      clientTime: input.clientTime ? new Date(input.clientTime) : null, idempotencyKey: input.idempotencyKey,
      latitude: input.latitude ?? null, longitude: input.longitude ?? null, accuracyM: input.accuracyM ?? null,
      address: input.address ?? null, photoPath, note: input.note ?? null, actorUserId: realUserId(actor), stationId: station?.id ?? null, userAgent: userAgent?.slice(0, 300) ?? null,
      verification: {
        create: {
          outcome, matcher: m.model, distance, threshold, quality: input.quality, livenessPassed: input.liveness?.passed ?? null,
          distanceToOfficeM: distanceToOffice, message,
        },
      },
    },
  });

  const base: AttendanceResult = { outcome, message, eventId: event.id, similarity: similarity(distance), time: fmtJam(now, tz) ?? undefined, workDate: workDate ?? undefined };
  if (employee) base.employee = { id: employee.id, name: employee.fullName, employeeNumber: employee.employeeNumber, position: employee.position };
  if (outcome !== 'SUCCESS') {
    if (employeeId && !identify) {
      await notifyEmployee(employeeId, { type: 'attendance_failed', title: 'Absensi gagal', body: message, link: '/absensi/saya/absen' });
    }
    return base;
  }
  const rec = await rebuildRecord(employeeId!, workDate!);
  const plan = await dayPlan(employeeId!, workDate!);
  await notifyEmployee(employeeId!, {
    type: 'attendance', title: `Absen ${input.direction === 'IN' ? 'masuk' : 'pulang'} tercatat pukul ${base.time}`,
    body: rec?.lateMinutes && input.direction === 'IN' ? `Terlambat ${rec.lateMinutes} menit.` : null, link: '/absensi/saya',
  });
  return { ...base, status: rec?.status, lateMinutes: rec?.lateMinutes, earlyLeaveMinutes: rec?.earlyLeaveMinutes, schedule: plan.schedule ? `${plan.schedule.name}, ${plan.schedule.checkIn} sampai ${plan.schedule.checkOut}` : null };
}

// Input manual oleh petugas (metode alternatif bila wajah/kamera/mesin bermasalah)
export const manualInput = z.object({
  employeeId: z.string().uuid(),
  workDate: z.string().refine(isValidDate, 'Tanggal tidak valid'),
  direction: z.enum(['IN', 'OUT']),
  time: z.string().refine(isValidTime, 'Format jam HH:MM'),
  reason: z.string().trim().min(5, 'Alasan minimal 5 karakter').max(300),
});

export async function manualAttendance(actor: Actor, raw: unknown) {
  if (!can(actor, 'attendance.manual_entry')) throw forbidden();
  const s = await getSettings();
  if (!s['methods.manual']) throw forbidden('Input manual sedang dinonaktifkan di Metode Absensi.');
  const v = manualInput.parse(raw);
  const emp = await getEmployeeInScope(actor, 'attendance.manual_entry', v.employeeId);
  if (emp.id === actor.employeeId) throw forbidden('Petugas tidak boleh menginput absensi untuk dirinya sendiri.');
  const tz = s['org.timezone'];
  const today = todayIn(tz);
  if (v.workDate > today) throw unprocessable('Tanggal tidak boleh di masa depan.', { workDate: 'Maksimal hari ini' });
  if (v.workDate < addDays(today, -Number(s['rules.backdateDays']))) throw unprocessable(`Input manual maksimal ${s['rules.backdateDays']} hari ke belakang. Gunakan koreksi absensi.`, { workDate: 'Terlalu lama' });
  const plan = await dayPlan(emp.id, v.workDate);
  // Jam pulang shift malam yang lebih kecil dari jam masuk jatuh di hari berikutnya.
  const day = v.direction === 'OUT' && plan.schedule && plan.schedule.checkOut <= plan.schedule.checkIn && v.time <= plan.schedule.checkOut ? addDays(v.workDate, 1) : v.workDate;
  const at = zonedToUtc(day, v.time, tz);
  if (at > new Date()) throw unprocessable('Jam tidak boleh di masa depan.', { time: 'Melebihi waktu sekarang' });
  const event = await prisma.attendanceEvent.create({
    data: {
      employeeId: emp.id, direction: v.direction, workDate: toDbDate(v.workDate), method: 'MANUAL', occurredAt: at, note: v.reason,
      actorUserId: realUserId(actor), verification: { create: { outcome: 'SUCCESS', matcher: 'PETUGAS', message: `Diinput ${actor.username}` } },
    },
  });
  const rec = await rebuildRecord(emp.id, v.workDate);
  await audit(actor, { action: 'attendance.manual_entry', entityType: 'AttendanceEvent', entityId: event.id, after: v });
  await notifyEmployee(emp.id, { type: 'attendance', title: `Absen ${v.direction === 'IN' ? 'masuk' : 'pulang'} diinput petugas`, body: `${v.workDate} pukul ${v.time}. Alasan: ${v.reason}`, link: '/absensi/saya' });
  return { event, record: rec };
}
