import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db';
import { audit, diff } from '../audit';
import { assertCan, scopeOf, unitDescendants, unitInScope, type Actor } from '../auth/actor';
import { realUserId, systemActor } from '../auth/system';
import { conflict, forbidden, notFound, unprocessable } from '../errors';
import { getSettings } from '../settings';
import { rateLimit } from '../rate-limit';
import { faceAttendance } from './attendance';

/**
 * Titik absen: tautan rahasia untuk rekam wajah tanpa login, mis. tablet di lobi atau
 * tautan/QR yang dibuka pegawai di ponselnya. Token hanya ditampilkan sekali; yang disimpan hash-nya.
 * Wajah dicocokkan 1:N terhadap pegawai aktif di unit titik absen (dan sub-unitnya).
 */

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

export const stationInput = z.object({
  name: z.string().trim().min(3, 'Nama minimal 3 karakter').max(80),
  unitId: z.string().uuid().nullable().optional().or(z.literal('')).transform((v) => v || null),
  allowFieldDuty: z.boolean().default(false),
  requireLocation: z.boolean().default(false),
});

async function assertOffice(requireLocation: boolean | undefined) {
  if (!requireLocation) return;
  const s = await getSettings();
  if (s['geo.officeLat'] == null || s['geo.officeLng'] == null) throw unprocessable('Isi koordinat kantor di Pengaturan, Metode Absensi, sebelum mewajibkan lokasi.', { requireLocation: 'Koordinat kantor belum diatur' });
}

function assertUnit(actor: Actor, unitId: string | null) {
  if (!unitId && !scopeOf(actor, 'device.manage')!.all) throw forbidden('Titik absen untuk semua unit hanya bisa dibuat pengguna dengan cakupan seluruh unit.');
  if (unitId && !unitInScope(actor, 'device.manage', unitId)) throw forbidden('Unit di luar kewenangan Anda.');
}

export async function listStations(actor: Actor) {
  assertCan(actor, 'device.read');
  const s = scopeOf(actor, 'device.read')!;
  return prisma.attendanceStation.findMany({
    where: s.all ? {} : { unitId: { in: s.unitIds } },
    include: { unit: { select: { name: true } }, _count: { select: { events: true } } },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });
}

/** Buat titik absen. Token mentah dikembalikan sekali ini saja. */
export async function createStation(actor: Actor, raw: unknown) {
  assertCan(actor, 'device.manage');
  const v = stationInput.parse(raw);
  assertUnit(actor, v.unitId);
  await assertOffice(v.requireLocation);
  const token = randomBytes(24).toString('base64url');
  const st = await prisma.attendanceStation.create({ data: { ...v, tokenHash: hashToken(token), tokenHint: token.slice(-4), createdById: realUserId(actor) } });
  await audit(actor, { action: 'station.create', entityType: 'AttendanceStation', entityId: st.id, after: v });
  return { id: st.id, token };
}

export async function updateStation(actor: Actor, id: string, raw: unknown) {
  assertCan(actor, 'device.manage');
  const st = await prisma.attendanceStation.findUnique({ where: { id } });
  if (!st) throw notFound('Titik absen tidak ditemukan.');
  assertUnit(actor, st.unitId);
  const v = stationInput.partial().extend({ isActive: z.boolean().optional() }).parse(raw);
  if (v.unitId !== undefined) assertUnit(actor, v.unitId ?? null);
  await assertOffice(v.requireLocation);
  const out = await prisma.attendanceStation.update({ where: { id }, data: v });
  const d = diff(st as unknown as Record<string, unknown>, v);
  if (d.changed) await audit(actor, { action: 'station.update', entityType: 'AttendanceStation', entityId: id, before: d.before, after: d.after });
  return out;
}

/** Ganti token: tautan lama langsung tidak berlaku. */
export async function rotateStationToken(actor: Actor, id: string) {
  assertCan(actor, 'device.manage');
  const st = await prisma.attendanceStation.findUnique({ where: { id } });
  if (!st) throw notFound('Titik absen tidak ditemukan.');
  assertUnit(actor, st.unitId);
  const token = randomBytes(24).toString('base64url');
  await prisma.attendanceStation.update({ where: { id }, data: { tokenHash: hashToken(token), tokenHint: token.slice(-4) } });
  await audit(actor, { action: 'station.rotate_token', entityType: 'AttendanceStation', entityId: id });
  return { id, token };
}

/** Hapus hanya bila belum pernah dipakai; yang sudah punya transaksi cukup dinonaktifkan agar jejaknya tetap ada. */
export async function deleteStation(actor: Actor, id: string) {
  assertCan(actor, 'device.manage');
  const st = await prisma.attendanceStation.findUnique({ where: { id }, include: { _count: { select: { events: true } } } });
  if (!st) throw notFound('Titik absen tidak ditemukan.');
  assertUnit(actor, st.unitId);
  if (st._count.events) throw conflict('Titik absen ini sudah punya transaksi. Nonaktifkan saja agar riwayatnya tetap utuh.');
  await prisma.attendanceStation.delete({ where: { id } });
  await audit(actor, { action: 'station.delete', entityType: 'AttendanceStation', entityId: id, before: { name: st.name } });
}

/** Titik absen aktif untuk token, atau null. Token yang salah tidak membedakan "tidak ada" dan "nonaktif". */
export async function resolveStation(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const st = await prisma.attendanceStation.findUnique({ where: { tokenHash: hashToken(token) }, include: { unit: { select: { name: true } } } });
  return st?.isActive ? st : null;
}

/** Rekam absen dari titik absen publik. `ip` dipakai untuk membatasi percobaan per sumber. */
export async function stationAttendance(token: string, kind: 'kiosk' | 'field-duty', raw: unknown, meta: { ip: string | null; userAgent: string | null }) {
  rateLimit(`station-ip:${meta.ip ?? 'unknown'}`, 120, 60_000);
  const st = await resolveStation(token);
  if (!st) throw notFound('Tautan absen tidak berlaku. Minta tautan baru ke admin.');
  if (kind === 'field-duty' && !st.allowFieldDuty) throw forbidden('Titik absen ini tidak melayani dinas luar.');
  rateLimit(`station:${st.id}`, 90, 60_000);
  const scope = st.unitId ? (await unitDescendants())(st.unitId) : null;
  const actor = { ...systemActor(`titik-absen:${st.name}`.slice(0, 60)) };
  const r = await faceAttendance(actor, kind === 'kiosk' ? 'FACE_KIOSK' : 'FIELD_DUTY', raw, meta.userAgent, {
    station: { id: st.id, unitIds: scope, requireLocation: st.requireLocation },
  });
  // lastUsedAt cukup kasar: perbarui paling sering sekali per menit.
  if (!st.lastUsedAt || Date.now() - st.lastUsedAt.getTime() > 60_000) await prisma.attendanceStation.update({ where: { id: st.id }, data: { lastUsedAt: new Date() } });
  return r;
}
