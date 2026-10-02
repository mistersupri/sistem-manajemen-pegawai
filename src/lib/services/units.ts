import { z } from 'zod';
import { prisma } from '../db';
import { audit, diff } from '../audit';
import { assertCan, scopeOf, unitInScope, type Actor } from '../auth/actor';
import { conflict, forbidden, notFound, unprocessable } from '../errors';

export const unitInput = z.object({
  code: z.string().trim().min(1, 'Kode wajib diisi').max(30).regex(/^[A-Za-z0-9._-]+$/, 'Hanya huruf, angka, titik, garis bawah, atau strip'),
  name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(150),
  parentId: z.string().uuid().nullable().optional(),
  timezone: z.string().trim().max(60).nullable().optional(),
});

function validTimezone(tz: string | null | undefined) {
  if (!tz) return true;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function listUnits(actor: Actor) {
  const s = scopeOf(actor, 'unit.read') ?? scopeOf(actor, 'unit.manage');
  if (!s) throw forbidden();
  const units = await prisma.organizationUnit.findMany({
    where: { deletedAt: null, ...(s.all ? {} : { id: { in: s.unitIds } }) },
    include: { _count: { select: { employees: { where: { deletedAt: null, isActive: true } } } } },
    orderBy: [{ name: 'asc' }],
  });
  return units;
}

/** Unit yang boleh dipilih pengguna untuk izin tertentu (untuk dropdown). */
export async function unitOptions(actor: Actor, perm: Parameters<typeof scopeOf>[1]) {
  const s = scopeOf(actor, perm);
  if (!s) return [];
  return prisma.organizationUnit.findMany({
    where: { deletedAt: null, isActive: true, ...(s.all ? {} : { id: { in: s.unitIds } }) },
    select: { id: true, name: true, code: true, parentId: true },
    orderBy: { name: 'asc' },
  });
}

export async function createUnit(actor: Actor, raw: unknown) {
  assertCan(actor, 'unit.manage');
  const input = unitInput.parse(raw);
  if (!validTimezone(input.timezone)) throw unprocessable('Zona waktu tidak dikenal.', { timezone: 'Gunakan nama IANA, mis. Asia/Jakarta' });
  const s = scopeOf(actor, 'unit.manage')!;
  if (!s.all && (!input.parentId || !s.unitIds.includes(input.parentId))) throw forbidden('Unit baru harus berada di bawah unit yang Anda kelola.');
  if (await prisma.organizationUnit.findUnique({ where: { code: input.code } })) throw conflict('Kode unit sudah dipakai.', { code: 'Sudah dipakai' });
  const unit = await prisma.organizationUnit.create({ data: { code: input.code, name: input.name, parentId: input.parentId ?? null, timezone: input.timezone || null } });
  await audit(actor, { action: 'unit.create', entityType: 'OrganizationUnit', entityId: unit.id, after: unit });
  return unit;
}

export async function updateUnit(actor: Actor, id: string, raw: unknown) {
  assertCan(actor, 'unit.manage');
  const input = unitInput.parse(raw);
  const unit = await prisma.organizationUnit.findFirst({ where: { id, deletedAt: null } });
  if (!unit || !unitInScope(actor, 'unit.manage', id)) throw notFound('Unit tidak ditemukan.');
  if (!validTimezone(input.timezone)) throw unprocessable('Zona waktu tidak dikenal.', { timezone: 'Gunakan nama IANA, mis. Asia/Jakarta' });
  if (input.parentId) {
    // Cegah siklus: induk tidak boleh unit itu sendiri atau keturunannya.
    for (let p: string | null = input.parentId; p; p = (await prisma.organizationUnit.findUnique({ where: { id: p } }))?.parentId ?? null) {
      if (p === id) throw unprocessable('Unit induk tidak boleh unit itu sendiri atau sub-unitnya.', { parentId: 'Membentuk siklus' });
    }
  }
  const data = { code: input.code, name: input.name, parentId: input.parentId ?? null, timezone: input.timezone || null };
  const d = diff(unit as unknown as Record<string, unknown>, data);
  const updated = await prisma.organizationUnit.update({ where: { id }, data });
  if (d.changed) await audit(actor, { action: 'unit.update', entityType: 'OrganizationUnit', entityId: id, before: d.before, after: d.after });
  return updated;
}

export async function deactivateUnit(actor: Actor, id: string) {
  assertCan(actor, 'unit.manage');
  const unit = await prisma.organizationUnit.findFirst({ where: { id, deletedAt: null } });
  if (!unit || !unitInScope(actor, 'unit.manage', id)) throw notFound('Unit tidak ditemukan.');
  const active = await prisma.employee.count({ where: { unitId: id, deletedAt: null, isActive: true } });
  if (active) throw conflict(`Unit masih memiliki ${active} pegawai aktif. Pindahkan pegawai terlebih dahulu.`);
  const children = await prisma.organizationUnit.count({ where: { parentId: id, deletedAt: null } });
  if (children) throw conflict('Unit masih memiliki sub-unit aktif.');
  await prisma.organizationUnit.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } });
  await audit(actor, { action: 'unit.deactivate', entityType: 'OrganizationUnit', entityId: id, before: { name: unit.name } });
}
