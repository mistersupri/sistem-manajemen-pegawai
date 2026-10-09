import { z } from 'zod';
import { clampPage, listSchema } from '../list';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '../db';
import { audit } from '../audit';
import { assertCan, scopeOf, type Actor } from '../auth/actor';
import { forbidden, unprocessable } from '../errors';
import { getSettings, SETTING_DEFAULTS, type SettingKey } from '../settings';

const num = (min: number, max: number) => z.coerce.number().min(min).max(max);
const optNum = (min: number, max: number) => z.union([z.literal(''), z.null()]).transform(() => null).or(z.coerce.number().min(min).max(max));

// Validasi per kunci pengaturan; kunci yang tidak terdaftar ditolak.
const SCHEMAS: Partial<Record<SettingKey, z.ZodType>> = {
  'org.name': z.string().trim().min(2).max(150),
  'org.timezone': z.string().refine((tz) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } }, 'Zona waktu tidak dikenal'),
  'org.timezoneLabel': z.string().trim().min(1).max(10),
  'methods.faceSelf': z.boolean(),
  'methods.faceKiosk': z.boolean(),
  'methods.fieldDuty': z.boolean(),
  'methods.manual': z.boolean(),
  'face.matchThreshold': num(0.2, 0.8),
  'face.minDetectionScore': num(0.3, 0.99),
  'face.minFaceSizePx': num(40, 600),
  'face.requireLiveness': z.boolean(),
  'face.requireOfficerVerification': z.boolean(),
  'face.consentText': z.string().trim().min(50).max(3000),
  'geo.enforce': z.boolean(),
  'geo.officeLat': optNum(-90, 90),
  'geo.officeLng': optNum(-180, 180),
  'geo.radiusM': num(10, 100000),
  'geo.reverseGeocode': z.boolean(),
  'rules.checkoutGraceHours': num(0, 12),
  'rules.blockOutsideSchedule': z.boolean(),
  'rules.backdateDays': num(1, 366),
  'rules.duplicateWindowMinutes': num(0, 60),
  'rules.clockSkewToleranceMinutes': num(1, 1440),
  'privacy.storeFieldDutyPhotos': z.boolean(),
  'privacy.photoRetentionDays': optNum(1, 3650),
  'security.mfaRequiredForAdmins': z.boolean(),
  'security.sessionHours': num(1, 72),
  'modules.leave': z.boolean(),
  'notify.reminders': z.boolean(),
  'notify.reminderLeadMin': num(0, 120),
  'holidays.autoSync': z.boolean(),
  'holidays.includeCutiBersama': z.boolean(),
};

export async function updateSettings(actor: Actor, raw: unknown) {
  assertCan(actor, 'settings.manage');
  if (!scopeOf(actor, 'settings.manage')!.all) throw forbidden('Pengaturan sistem hanya untuk pengelola dengan cakupan seluruh unit.');
  const input = z.record(z.string(), z.unknown()).parse(raw);
  const current = await getSettings();
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    const schema = SCHEMAS[key as SettingKey];
    if (!schema) { fields[key] = 'Pengaturan tidak dikenal'; continue; }
    const r = schema.safeParse(value);
    if (!r.success) { fields[key] = r.error.issues[0].message; continue; }
    if (JSON.stringify(r.data) !== JSON.stringify(current[key as SettingKey])) changes[key] = { before: current[key as SettingKey], after: r.data };
  }
  if (Object.keys(fields).length) throw unprocessable('Periksa kembali isian yang ditandai.', fields);
  const next = { ...current, ...Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.after])) };
  if (next['geo.enforce'] && (next['geo.officeLat'] == null || next['geo.officeLng'] == null)) {
    throw unprocessable('Isi koordinat kantor sebelum mengaktifkan pembatasan radius.', { 'geo.officeLat': 'Wajib diisi' });
  }
  if (changes['face.consentText']) {
    // Teks persetujuan berubah: versi naik, pendaftaran berikutnya mencatat versi baru.
    const v = String(Number(current['face.consentVersion']) + 1);
    changes['face.consentVersion'] = { before: current['face.consentVersion'], after: v };
  }
  for (const [key, c] of Object.entries(changes)) {
    await prisma.systemSetting.upsert({ where: { key }, update: { value: c.after as Prisma.InputJsonValue, updatedById: actor.userId }, create: { key, value: c.after as Prisma.InputJsonValue, updatedById: actor.userId } });
  }
  if (Object.keys(changes).length) await audit(actor, { action: 'settings.update', entityType: 'SystemSetting', before: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.before])), after: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.after])) });
  return { changed: Object.keys(changes) };
}

export const knownSettingKeys = Object.keys(SETTING_DEFAULTS);

export const auditQuery = z.object({
  q: z.string().max(100).optional(),
  action: z.string().max(60).optional(),
  result: z.enum(['SUCCESS', 'FAILURE', '']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
}).and(listSchema(['waktu', 'pelaku', 'aksi'] as const, { sort: 'waktu', dir: 'desc' }));

const AUDIT_ORDER: Record<string, (d: 'asc' | 'desc') => Prisma.AuditLogOrderByWithRelationInput[]> = {
  waktu: (d) => [{ createdAt: d }, { id: d }],
  pelaku: (d) => [{ actorLabel: { sort: d, nulls: 'last' } }, { createdAt: 'desc' }],
  aksi: (d) => [{ action: d }, { createdAt: 'desc' }],
};

export async function listAudit(actor: Actor, raw: unknown) {
  assertCan(actor, 'audit.read');
  const q = auditQuery.parse(raw);
  const where: Prisma.AuditLogWhereInput = {
    ...(q.action ? { action: { startsWith: q.action } } : {}),
    ...(q.result ? { result: q.result } : {}),
    ...(q.q ? { OR: [{ actorLabel: { contains: q.q, mode: 'insensitive' } }, { entityId: q.q }, { action: { contains: q.q } }] } : {}),
    ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(`${q.from}T00:00:00Z`) } : {}), ...(q.to ? { lte: new Date(`${q.to}T23:59:59Z`) } : {}) } } : {}),
  };
  const size = q.per;
  const total = await prisma.auditLog.count({ where });
  const page = clampPage(q.page, size, total);
  const rows = await prisma.auditLog.findMany({ where, orderBy: AUDIT_ORDER[q.sort](q.dir), skip: (page - 1) * size, take: size });
  return { total, page, pageSize: size, sort: q.sort, dir: q.dir, rows };
}
