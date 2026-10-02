import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { prisma, type Db } from '../db';
import { audit, diff } from '../audit';
import { assertCan, can, employeeScopeWhere, getEmployeeInScope, unitInScope, type Actor } from '../auth/actor';
import { conflict, forbidden, notFound, unprocessable } from '../errors';
import { decryptOptional, encryptOptional } from '../crypto';
import { hashPassword } from '../auth/password';
import { addDays, fromDbDate, isValidDate, toDbDate, todayIn } from '../time';
import { getSetting } from '../settings';
import { realUserId } from '../auth/system';

const optText = (max = 150) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const optDate = z.string().optional().nullable().transform((v) => (v ? v : null)).refine((v) => v === null || isValidDate(v), 'Tanggal tidak valid');

export const employeeInput = z.object({
  employeeNumber: z.string().trim().max(30).regex(/^[0-9A-Za-z.-]*$/, 'NIP hanya boleh huruf/angka').optional().nullable().transform((v) => (v ? v : null)),
  nik: z.string().trim().optional().nullable().transform((v) => (v ? v : null)).refine((v) => v === null || /^\d{16}$/.test(v), 'NIK terdiri dari 16 angka'),
  fullName: z.string().trim().min(2, 'Nama minimal 2 karakter').max(150),
  frontTitle: optText(30),
  backTitle: optText(50),
  birthPlace: optText(80),
  birthDate: optDate,
  gender: z.enum(['L', 'P']).optional().nullable().transform((v) => v ?? null),
  address: optText(300),
  phone: z.string().trim().max(20).regex(/^[0-9+() -]*$/, 'Nomor telepon tidak valid').optional().nullable().transform((v) => (v ? v : null)),
  email: z.string().trim().max(150).optional().nullable().transform((v) => (v ? v : null)).refine((v) => v === null || z.email().safeParse(v).success, 'Email tidak valid'),
  employmentStatus: optText(50),
  position: optText(150),
  rank: optText(50),
  unitId: z.string().uuid('Pilih unit kerja').nullable().optional().transform((v) => v ?? null),
  supervisorId: z.string().uuid().nullable().optional().transform((v) => v ?? null),
  startDate: optDate,
  machinePin: z.string().trim().max(30).regex(/^[A-Za-z0-9_-]*$/, 'ID mesin hanya huruf/angka').optional().nullable().transform((v) => (v ? v : null)),
});
export type EmployeeInput = z.infer<typeof employeeInput>;

export const changeMeta = z.object({
  effectiveDate: optDate,
  changeNote: optText(300),
});

export const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  unitId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  status: z.enum(['aktif', 'nonaktif', 'semua']).optional().default('aktif'),
  employmentStatus: z.string().max(50).optional().or(z.literal('')).transform((v) => v || undefined),
  face: z.enum(['terdaftar', 'belum', 'menunggu']).optional().or(z.literal('')).transform((v) => v || undefined),
  sort: z.enum(['nama', 'nip', 'unit', 'terbaru']).optional().default('nama'),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(25),
});
export type ListQuery = z.infer<typeof listQuery>;

export function employeeWhere(actor: Actor, q: Partial<ListQuery>, perm: 'employee.read' | 'employee.export' = 'employee.read'): Prisma.EmployeeWhereInput {
  const and: Prisma.EmployeeWhereInput[] = [{ deletedAt: null }, employeeScopeWhere(actor, perm)];
  if (q.status === 'aktif' || !q.status) and.push({ isActive: true });
  if (q.status === 'nonaktif') and.push({ isActive: false });
  if (q.unitId) and.push({ unitId: q.unitId });
  if (q.employmentStatus) and.push({ employmentStatus: q.employmentStatus });
  if (q.face === 'terdaftar') and.push({ biometrics: { some: { status: 'ACTIVE' } } });
  if (q.face === 'menunggu') and.push({ biometrics: { some: { status: 'PENDING_VERIFICATION' } } });
  if (q.face === 'belum') and.push({ biometrics: { none: { status: { in: ['ACTIVE', 'PENDING_VERIFICATION'] } } } });
  if (q.q) {
    const t = q.q;
    and.push({ OR: [{ fullName: { contains: t, mode: 'insensitive' } }, { employeeNumber: { contains: t } }, { position: { contains: t, mode: 'insensitive' } }, { machinePin: t }] });
  }
  return { AND: and };
}

const ORDER: Record<string, Prisma.EmployeeOrderByWithRelationInput[]> = {
  nama: [{ fullName: 'asc' }],
  nip: [{ employeeNumber: 'asc' }],
  unit: [{ unit: { name: 'asc' } }, { fullName: 'asc' }],
  terbaru: [{ createdAt: 'desc' }],
};

export async function listEmployees(actor: Actor, raw: unknown) {
  assertCan(actor, 'employee.read');
  const q = listQuery.parse(raw);
  const where = employeeWhere(actor, q);
  const [total, rows] = await Promise.all([
    prisma.employee.count({ where }),
    prisma.employee.findMany({
      where,
      orderBy: ORDER[q.sort],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        unit: { select: { id: true, name: true } },
        biometrics: { where: { status: { in: ['ACTIVE', 'PENDING_VERIFICATION'] } }, select: { status: true } },
        user: { select: { id: true, username: true, isActive: true } },
      },
    }),
  ]);
  return { total, page: q.page, pageSize: q.pageSize, rows: rows.map(publicEmployee) };
}

/** Bentuk data pegawai yang aman dikirim ke klien (tanpa NIK dan template biometrik). */
export function publicEmployee<T extends { nikEnc?: string | null; biometrics?: { status: string }[] }>(e: T) {
  const { nikEnc: _nik, biometrics, ...rest } = e;
  return { ...rest, hasNik: !!_nik, faceStatus: biometrics?.find((b) => b.status === 'ACTIVE') ? 'ACTIVE' : biometrics?.[0]?.status ?? null };
}

export async function getEmployee(actor: Actor, id: string) {
  const base = await getEmployeeInScope(actor, 'employee.read', id);
  const emp = await prisma.employee.findUniqueOrThrow({
    where: { id: base.id },
    include: {
      unit: true,
      supervisor: { select: { id: true, fullName: true } },
      user: { select: { id: true, username: true, isActive: true, lastLoginAt: true } },
      positionHistory: { orderBy: { startDate: 'desc' } },
      unitHistory: { orderBy: { startDate: 'desc' }, include: { unit: { select: { name: true } } } },
      biometrics: { where: { status: { in: ['ACTIVE', 'PENDING_VERIFICATION'] } }, select: { id: true, status: true, sampleCount: true, createdAt: true, verifiedAt: true, consentAt: true, model: true } },
    },
  });
  const sensitive = can(actor, 'employee.read_sensitive');
  return { ...publicEmployee(emp), biometricsInfo: emp.biometrics, nik: sensitive ? decryptOptional(emp.nikEnc) : null, canSeeNik: sensitive };
}

async function assertUnique(input: EmployeeInput, exceptId: string | null, db: Db) {
  const fields: Record<string, string> = {};
  if (input.employeeNumber) {
    const x = await db.employee.findFirst({ where: { employeeNumber: input.employeeNumber, NOT: exceptId ? { id: exceptId } : undefined } });
    if (x) fields.employeeNumber = 'NIP sudah dipakai pegawai lain.';
  }
  if (input.machinePin) {
    const x = await db.employee.findFirst({ where: { machinePin: input.machinePin, NOT: exceptId ? { id: exceptId } : undefined } });
    if (x) fields.machinePin = `ID mesin sudah dipakai ${x.fullName}.`;
  }
  if (Object.keys(fields).length) throw conflict('Ada data yang sudah dipakai pegawai lain.', fields);
}

function data(input: EmployeeInput) {
  return {
    employeeNumber: input.employeeNumber,
    nikEnc: encryptOptional(input.nik),
    fullName: input.fullName,
    frontTitle: input.frontTitle,
    backTitle: input.backTitle,
    birthPlace: input.birthPlace,
    birthDate: input.birthDate ? toDbDate(input.birthDate) : null,
    gender: input.gender,
    address: input.address,
    phone: input.phone,
    email: input.email,
    employmentStatus: input.employmentStatus,
    position: input.position,
    rank: input.rank,
    unitId: input.unitId,
    supervisorId: input.supervisorId,
    startDate: input.startDate ? toDbDate(input.startDate) : null,
    machinePin: input.machinePin,
  };
}

export async function createEmployee(actor: Actor, raw: unknown, opts: { createAccount?: boolean; db?: Db } = {}) {
  assertCan(actor, 'employee.write');
  const input = employeeInput.parse(raw);
  const db = opts.db ?? prisma;
  if (!unitInScope(actor, 'employee.write', input.unitId)) throw forbidden('Unit kerja di luar kewenangan Anda.');
  await assertUnique(input, null, db);
  const tz = await getSetting('org.timezone', db);
  const start = input.startDate ?? todayIn(tz);
  const run = async (tx: Db) => {
    const emp = await tx.employee.create({ data: data(input) });
    await tx.employeePositionHistory.create({ data: { employeeId: emp.id, position: input.position, rank: input.rank, employmentStatus: input.employmentStatus, startDate: toDbDate(start), note: 'Data awal', createdById: realUserId(actor) } });
    await tx.employeeUnitHistory.create({ data: { employeeId: emp.id, unitId: input.unitId, startDate: toDbDate(start), note: 'Data awal', createdById: realUserId(actor) } });
    let account: { username: string; password: string } | null = null;
    if (opts.createAccount && input.employeeNumber) account = await createAccount(tx, emp.id, input.employeeNumber);
    await audit(actor, { action: 'employee.create', entityType: 'Employee', entityId: emp.id, after: { ...input, nik: input.nik ? '[ada]' : null } }, tx);
    return { employee: emp, account };
  };
  return opts.db ? run(opts.db) : prisma.$transaction(run);
}


/** Akun login pegawai: username = NIP, password awal = NIP, wajib diganti saat masuk pertama. */
async function createAccount(db: Db, employeeId: string, nip: string) {
  const username = nip.toLowerCase();
  if (await db.user.findUnique({ where: { username } })) return null;
  const role = await db.role.findUniqueOrThrow({ where: { code: 'PEGAWAI' } });
  await db.user.create({
    data: { username, passwordHash: await hashPassword(nip), mustChangePassword: true, employeeId, roles: { create: { roleId: role.id } } },
  });
  return { username, password: nip };
}

export async function updateEmployee(actor: Actor, id: string, raw: unknown, metaRaw: unknown = {}) {
  assertCan(actor, 'employee.write');
  const current = await getEmployeeInScope(actor, 'employee.write', id);
  const input = employeeInput.parse(raw);
  const meta = changeMeta.parse(metaRaw);
  if (!unitInScope(actor, 'employee.write', input.unitId)) throw forbidden('Unit kerja tujuan di luar kewenangan Anda.');
  if (input.supervisorId === id) throw unprocessable('Atasan tidak boleh diri sendiri.', { supervisorId: 'Pilih pegawai lain' });
  await assertUnique(input, id, prisma);
  // NIK tidak dikirim balik ke form tanpa izin sensitif; kosong berarti "tidak diubah".
  const next = data(input);
  if (!can(actor, 'employee.read_sensitive') || !input.nik) next.nikEnc = current.nikEnc;
  const tz = await getSetting('org.timezone');
  const effective = meta.effectiveDate ?? todayIn(tz);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.employee.update({ where: { id }, data: next });
    const posChanged = current.position !== input.position || current.rank !== input.rank || current.employmentStatus !== input.employmentStatus;
    if (posChanged) await rotateHistory(tx, 'position', id, effective, { position: input.position, rank: input.rank, employmentStatus: input.employmentStatus }, meta.changeNote, actor);
    if (current.unitId !== input.unitId) await rotateHistory(tx, 'unit', id, effective, { unitId: input.unitId }, meta.changeNote, actor);
    const before = { ...current, nikEnc: current.nikEnc ? '[ada]' : null } as unknown as Record<string, unknown>;
    const d = diff(before, { ...next, nikEnc: next.nikEnc ? '[ada]' : null });
    if (d.changed) await audit(actor, { action: 'employee.update', entityType: 'Employee', entityId: id, before: d.before, after: d.after, meta: { effectiveDate: effective, note: meta.changeNote } }, tx);
    if (input.machinePin && input.machinePin !== current.machinePin) await tx.deviceRawEvent.updateMany({ where: { devicePin: input.machinePin, employeeId: null }, data: { employeeId: id, processedAt: null } });
    return updated;
  });
}

/** Tutup riwayat yang berjalan (endDate = efektif - 1) lalu buka riwayat baru mulai tanggal efektif. */
async function rotateHistory(tx: Db, kind: 'position' | 'unit', employeeId: string, effective: string, values: Record<string, string | null>, note: string | null, actor: Actor) {
  const model = (kind === 'position' ? tx.employeePositionHistory : tx.employeeUnitHistory) as unknown as {
    findFirst: (a: unknown) => Promise<{ id: string; startDate: Date } | null>;
    update: (a: unknown) => Promise<unknown>;
    create: (a: unknown) => Promise<unknown>;
  };
  const open = await model.findFirst({ where: { employeeId, endDate: null }, orderBy: { startDate: 'desc' } });
  if (open) {
    const openStart = fromDbDate(open.startDate);
    if (openStart > effective) throw unprocessable('Tanggal efektif tidak boleh sebelum awal riwayat yang sedang berjalan.', { effectiveDate: `Minimal ${openStart}` });
    if (openStart === effective) {
      // Perubahan pada hari yang sama dengan awal riwayat: perbarui baris itu saja.
      await model.update({ where: { id: open.id }, data: { ...values, note } });
      return;
    }
    await model.update({ where: { id: open.id }, data: { endDate: toDbDate(addDays(effective, -1)) } });
  }
  await model.create({ data: { employeeId, ...values, startDate: toDbDate(effective), note, createdById: realUserId(actor) } });
}

export async function setEmployeeActive(actor: Actor, id: string, active: boolean, raw: unknown) {
  assertCan(actor, 'employee.deactivate');
  const emp = await getEmployeeInScope(actor, 'employee.deactivate', id);
  const meta = z.object({ effectiveDate: optDate, reason: z.string().trim().min(3, 'Alasan wajib diisi').max(300) }).parse(raw);
  const tz = await getSetting('org.timezone');
  const effective = meta.effectiveDate ?? todayIn(tz);
  await prisma.$transaction(async (tx) => {
    await tx.employee.update({ where: { id }, data: { isActive: active, activeEffectiveDate: toDbDate(effective) } });
    await tx.user.updateMany({ where: { employeeId: id }, data: { isActive: active } });
    if (!active) await tx.session.deleteMany({ where: { user: { employeeId: id } } });
    await audit(actor, { action: active ? 'employee.activate' : 'employee.deactivate', entityType: 'Employee', entityId: id, before: { isActive: emp.isActive }, after: { isActive: active, effectiveDate: effective }, meta: { reason: meta.reason } }, tx);
  });
}

/** Buat akun login untuk pegawai yang belum punya. */
export async function ensureAccount(actor: Actor, id: string) {
  assertCan(actor, 'employee.write');
  const emp = await getEmployeeInScope(actor, 'employee.write', id);
  if (!emp.employeeNumber) throw unprocessable('Isi NIP terlebih dahulu; NIP dipakai sebagai username.');
  const acc = await prisma.$transaction((tx) => createAccount(tx, emp.id, emp.employeeNumber!));
  if (!acc) throw conflict('Pegawai sudah memiliki akun atau username NIP sudah dipakai.');
  await audit(actor, { action: 'user.create', entityType: 'Employee', entityId: id, meta: { username: acc.username } });
  return acc;
}

export async function resetEmployeePassword(actor: Actor, id: string) {
  assertCan(actor, 'employee.write');
  const emp = await getEmployeeInScope(actor, 'employee.write', id);
  const user = await prisma.user.findUnique({ where: { employeeId: emp.id } });
  if (!user || !emp.employeeNumber) throw notFound('Pegawai belum memiliki akun.');
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(emp.employeeNumber), mustChangePassword: true, failedLoginCount: 0, lockedUntil: null } });
  await prisma.session.deleteMany({ where: { userId: user.id } });
  await audit(actor, { action: 'user.reset_password', entityType: 'User', entityId: user.id });
  return { username: user.username, password: emp.employeeNumber };
}

/** Pilihan atasan langsung (pegawai aktif dalam cakupan). */
export async function supervisorOptions(actor: Actor) {
  return prisma.employee.findMany({
    where: { AND: [{ deletedAt: null, isActive: true }, employeeScopeWhere(actor, 'employee.read')] },
    select: { id: true, fullName: true, position: true },
    orderBy: { fullName: 'asc' },
    take: 1000,
  });
}

/** Nilai status kepegawaian yang sudah dipakai (untuk saran isian). */
export async function employeeStatuses() {
  const rows = await prisma.employee.findMany({ where: { employmentStatus: { not: null } }, distinct: ['employmentStatus'], select: { employmentStatus: true } });
  return rows.map((r) => r.employmentStatus!).sort();
}
