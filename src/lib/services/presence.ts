import { prisma } from '../db';
import { plansFor } from '../attendance/plan';
import { STATUS_LABEL, effectiveStatus } from '../attendance/engine';
import { fromDbDate, monthBounds, toDbDate } from '../time';

// Rekapitulasi presensi satu pegawai untuk satu bulan: ringkasan, rincian per jenis, dan tabel harian.

export type PresenceGroup = 'KEHADIRAN' | 'DINAS_LUAR' | 'CUTI';
export const GROUP_LABEL: Record<PresenceGroup, string> = { KEHADIRAN: 'Kehadiran', DINAS_LUAR: 'Dinas Luar', CUTI: 'Cuti' };
const GROUP_OF: Record<string, PresenceGroup> = { IZIN: 'KEHADIRAN', SAKIT: 'KEHADIRAN', DINAS_LUAR: 'DINAS_LUAR', CUTI: 'CUTI' };

export interface PresenceDay {
  date: string;
  off: boolean;
  offLabel: string | null;
  shiftIn: string | null;
  shiftOut: string | null;
  checkIn: Date | null;
  checkOut: Date | null;
  placeIn: string | null;
  placeOut: string | null;
  lateMinutes: number;
  earlyMinutes: number;
  status: string | null;
  note: string | null;
  hasRecord: boolean;
}

const timeFmt = new Map<string, Intl.DateTimeFormat>();
/** Jam lengkap HH:MM:SS dalam zona waktu instansi. */
export function jamDetik(d: Date | null, tz: string) {
  if (!d) return null;
  let f = timeFmt.get(tz);
  if (!f) { f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }); timeFmt.set(tz, f); }
  return f.format(d);
}

/** Menit menjadi HH:MM:SS, seperti kolom terlambat dan pulang cepat di e-TPP. */
export const durasi = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}:00`;

export async function presenceMonth(employeeId: string, month: string, today: string) {
  const { from, to: monthEnd } = monthBounds(month);
  const to = monthEnd > today ? today : monthEnd;
  const empty = from > to;
  const [plans, records, types, emp] = await Promise.all([
    empty ? Promise.resolve([]) : plansFor(employeeId, from, to),
    prisma.attendanceRecord.findMany({ where: { employeeId, workDate: { gte: toDbDate(from), lte: toDbDate(to) } } }),
    prisma.leaveType.findMany({ where: { isActive: true }, select: { id: true, name: true, attendanceStatus: true } }),
    prisma.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { unit: { select: { name: true } } } }),
  ]);
  const leaveIds = [...new Set(records.map((r) => r.leaveRequestId).filter((x): x is string => !!x))];
  const leaves = leaveIds.length ? await prisma.leaveRequest.findMany({ where: { id: { in: leaveIds } }, select: { id: true, leaveTypeId: true, leaveType: { select: { name: true } } } }) : [];
  const leaveById = new Map(leaves.map((l) => [l.id, l]));

  // Lokasi dari sumber transaksi: mesin (lokasi mesin), titik absen, alamat, atau koordinat.
  const sourceIds = records.flatMap((r) => [r.checkInSourceId, r.checkOutSourceId]).filter((x): x is string => !!x);
  const [events, raws] = sourceIds.length ? await Promise.all([
    prisma.attendanceEvent.findMany({ where: { id: { in: sourceIds } }, select: { id: true, method: true, address: true, latitude: true, longitude: true, station: { select: { name: true } } } }),
    prisma.deviceRawEvent.findMany({ where: { id: { in: sourceIds } }, select: { id: true, device: { select: { name: true, location: true } } } }),
  ]) : [[], []];
  const place = new Map<string, string>();
  for (const e of events) {
    const p = e.method === 'MANUAL' ? 'Input petugas'
      : e.station?.name ?? e.address ?? (e.latitude != null && e.longitude != null ? `${e.latitude.toFixed(5)}, ${e.longitude.toFixed(5)}` : null);
    if (p) place.set(e.id, p);
  }
  for (const r of raws) if (r.device) place.set(r.id, r.device.location || r.device.name);
  const placeOf = (sourceId: string | null, method: string | null) => {
    if (sourceId && place.has(sourceId)) return place.get(sourceId)!;
    if (method === 'MANUAL') return 'Input petugas';
    if (method === 'KOREKSI') return 'Koreksi disetujui';
    if (method === 'FACE_SELF' || method === 'FACE_KIOSK') return emp.unit?.name ?? null;
    return null;
  };

  const byDate = new Map(records.map((r) => [fromDbDate(r.workDate), r]));
  const days: PresenceDay[] = plans.map((p) => {
    const r = byDate.get(p.date);
    const leave = r?.leaveRequestId ? leaveById.get(r.leaveRequestId) : undefined;
    const off = p.isOffDay && !r?.checkInAt && !r?.checkOutAt;
    const scheduled = !p.isOffDay && !!p.schedule;
    return {
      date: p.date,
      off,
      offLabel: off ? (p.holidayName ?? 'Libur') : null,
      shiftIn: scheduled ? p.schedule!.checkIn : null,
      shiftOut: scheduled ? p.schedule!.checkOut : null,
      checkIn: r?.checkInAt ?? null,
      checkOut: r?.checkOutAt ?? null,
      placeIn: r?.checkInAt ? placeOf(r.checkInSourceId, r.checkInMethod) : null,
      placeOut: r?.checkOutAt ? placeOf(r.checkOutSourceId, r.checkOutMethod) : null,
      lateMinutes: r?.lateMinutes ?? 0,
      earlyMinutes: r?.earlyLeaveMinutes ?? 0,
      status: off ? null : effectiveStatus(r ?? null, p, today),
      note: leave?.leaveType.name ?? (r?.status === 'TIDAK_HADIR' ? 'Alfa (ditetapkan petugas)' : r?.note ?? null),
      hasRecord: !!r,
    };
  });

  // Rincian per jenis: semua jenis aktif tampil (termasuk yang nol) agar daftar selalu lengkap.
  const perType = new Map<string, number>();
  for (const r of records) {
    const l = r.leaveRequestId ? leaveById.get(r.leaveRequestId) : undefined;
    if (l) perType.set(l.leaveTypeId, (perType.get(l.leaveTypeId) ?? 0) + 1);
  }
  const byteOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const groups = (['KEHADIRAN', 'DINAS_LUAR', 'CUTI'] as const).map((g) => {
    const rows = types.filter((t) => GROUP_OF[t.attendanceStatus] === g).sort((a, b) => byteOrder(a.name, b.name)).map((t) => ({ label: t.name, days: perType.get(t.id) ?? 0 }));
    if (g === 'KEHADIRAN') {
      rows.push(
        { label: 'Alfa', days: days.filter((d) => d.status === 'ALFA' || d.status === 'TIDAK_HADIR').length },
        { label: 'Alfa Awal', days: days.filter((d) => d.status === 'ALFA_AWAL').length },
        { label: 'Alfa Akhir', days: days.filter((d) => d.status === 'ALFA_AKHIR').length },
        { label: 'Terlambat', days: records.filter((r) => r.lateMinutes > 0).length },
        { label: 'Pulang Cepat', days: records.filter((r) => r.earlyLeaveMinutes > 0).length },
      );
    }
    if (g === 'DINAS_LUAR') {
      // Absen dinas luar lewat foto GPS tanpa surat tugas; tampil hanya bila ada.
      const field = records.filter((r) => r.status === 'DINAS_LUAR' && !r.leaveRequestId).length;
      if (field) rows.push({ label: 'Absen dinas luar (foto GPS)', days: field });
    }
    return { key: g, label: GROUP_LABEL[g], rows };
  });

  const workdays = plans.filter((p) => !p.isOffDay && p.schedule).length;
  const count = (s: string[]) => days.filter((d) => d.status && s.includes(d.status)).length;
  const summary = {
    workdays,
    hadir: count(['HADIR', 'TERLAMBAT']),
    terlambat: records.filter((r) => r.lateMinutes > 0).length,
    pulangCepat: records.filter((r) => r.earlyLeaveMinutes > 0).length,
    izinCuti: count(['IZIN', 'SAKIT', 'CUTI']),
    dinasLuar: count(['DINAS_LUAR']),
    alfa: count(['ALFA', 'TIDAK_HADIR']),
    alfaSebagian: count(['ALFA_AWAL', 'ALFA_AKHIR']),
  };
  return { month, from, to, empty, days, groups, summary };
}

export const statusText = (s: string | null) => (s ? STATUS_LABEL[s] ?? s : '');
