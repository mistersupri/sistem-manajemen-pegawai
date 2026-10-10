import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '../db';
import { audit } from '../audit';
import { assertCan, employeeScopeWhere, unitDescendants, unitInScope, type Actor } from '../auth/actor';
import { conflict, notFound, unprocessable } from '../errors';
import { pickPeers, type Candidate } from '../assessment/pick';
import { generateAssignments, notifyAssessors } from './assessment';
import { monthText } from './performance';
import { notifyUsers } from './notifications';

const MAX_ROWS = 20000;

async function openPeriodOf(actor: Actor, periodId: string) {
  assertCan(actor, 'assess.manage');
  const p = await prisma.assessmentPeriod.findUnique({ where: { id: periodId } });
  if (!p) throw notFound('Periode tidak ditemukan.');
  if (p.isClosed) throw conflict('Periode sudah ditutup. Buka kembali untuk mengubah penilai.');
  return p;
}

/** Pegawai yang boleh dinilai atau menilai: aktif, berakun, dalam cakupan pengelola. */
function eligibleWhere(actor: Actor): Prisma.EmployeeWhereInput {
  return { AND: [{ deletedAt: null, isActive: true, user: { isActive: true, deletedAt: null } }, employeeScopeWhere(actor, 'assess.manage')] };
}

// ---------------------------------------------------------------------------
// Tampilan: siapa menilai siapa, dan beban tiap penilai
// ---------------------------------------------------------------------------

export const overviewQuery = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  unitId: z.string().uuid().optional().catch(undefined),
  status: z.enum(['semua', 'belum', 'selesai', 'kurang']).catch('semua').default('semua'),
  page: z.coerce.number().int().min(1).catch(1).default(1),
  per: z.coerce.number().int().catch(20).default(20),
});

/**
 * Daftar pegawai yang dinilai beserta penilainya dan statusnya. Hanya admin yang melihat identitas penilai;
 * pegawai yang dinilai tidak pernah melihatnya. `status`: belum = ada penilai yang belum selesai,
 * selesai = semua penilai sudah selesai, kurang = belum punya penilai sama sekali.
 */
export async function periodOverview(actor: Actor, periodId: string, raw: unknown) {
  assertCan(actor, 'assess.manage');
  const q = overviewQuery.parse(raw);
  const period = await prisma.assessmentPeriod.findUnique({ where: { id: periodId } });
  if (!period) throw notFound('Periode tidak ditemukan.');
  const per = [5, 10, 20, 50, 100, 200, 500].includes(q.per) ? q.per : 20;

  const scope = employeeScopeWhere(actor, 'assess.manage');
  const base: Prisma.EmployeeWhereInput = {
    AND: [
      { deletedAt: null, isActive: true, user: { isActive: true, deletedAt: null } }, scope,
      q.unitId ? { unitId: q.unitId } : {},
      q.q ? { OR: [{ fullName: { contains: q.q, mode: 'insensitive' } }, { employeeNumber: { contains: q.q } }] } : {},
    ],
  };
  const all = await prisma.employee.findMany({
    where: base, select: { id: true },
  });
  const assigns = await prisma.assessmentAssignment.findMany({
    where: { periodId, targetEmployeeId: { in: all.map((e) => e.id) } },
    select: { targetEmployeeId: true, status: true },
  });
  const stat = new Map<string, { total: number; pending: number }>();
  for (const a of assigns) {
    const s = stat.get(a.targetEmployeeId) ?? { total: 0, pending: 0 };
    s.total += 1;
    if (a.status === 'PENDING') s.pending += 1;
    stat.set(a.targetEmployeeId, s);
  }
  const keep = all.filter((e) => {
    const s = stat.get(e.id) ?? { total: 0, pending: 0 };
    return q.status === 'belum' ? s.pending > 0 : q.status === 'selesai' ? s.total > 0 && s.pending === 0 : q.status === 'kurang' ? s.total === 0 : true;
  }).map((e) => e.id);
  const total = keep.length;
  const page = Math.min(q.page, Math.max(1, Math.ceil(total / per)));
  const rows = await prisma.employee.findMany({
    where: { id: { in: keep } }, orderBy: [{ fullName: 'asc' }, { id: 'asc' }], skip: (page - 1) * per, take: per,
    select: {
      id: true, fullName: true, employeeNumber: true, position: true, unit: { select: { id: true, name: true } },
      assessmentsOf: {
        where: { periodId }, orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, role: true, source: true, status: true, submittedAt: true, average: true, assessor: { select: { id: true, fullName: true, unit: { select: { name: true } } } } },
      },
    },
  });
  return {
    period, total, page, pageSize: per,
    rows: rows.map((r) => ({
      id: r.id, fullName: r.fullName, employeeNumber: r.employeeNumber, position: r.position, unit: r.unit,
      assessors: r.assessmentsOf.map((a) => ({ id: a.id, role: a.role, source: a.source, status: a.status, submittedAt: a.submittedAt, assessor: a.assessor })),
    })),
  };
}

/** Beban tiap penilai pada satu periode: jumlah yang ditugaskan dan yang sudah selesai. */
export async function assessorLoads(actor: Actor, periodId: string) {
  assertCan(actor, 'assess.manage');
  const rows = await prisma.assessmentAssignment.groupBy({ by: ['assessorEmployeeId', 'status'], where: { periodId, target: employeeScopeWhere(actor, 'assess.manage') }, _count: { _all: true } });
  const ids = [...new Set(rows.map((r) => r.assessorEmployeeId))];
  const emps = await prisma.employee.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, unit: { select: { name: true } } } });
  return emps.map((e) => {
    const done = rows.find((r) => r.assessorEmployeeId === e.id && r.status === 'SUBMITTED')?._count._all ?? 0;
    const pending = rows.find((r) => r.assessorEmployeeId === e.id && r.status === 'PENDING')?._count._all ?? 0;
    return { id: e.id, fullName: e.fullName, unit: e.unit?.name ?? null, total: done + pending, done, pending };
  }).sort((a, b) => b.total - a.total || a.fullName.localeCompare(b.fullName, 'id'));
}

/** Pemetaan unit yang pernah dibuat pada periode ini, dengan nama unit. */
export async function unitMaps(actor: Actor, periodId: string) {
  assertCan(actor, 'assess.manage');
  const maps = await prisma.assessmentUnitMap.findMany({ where: { periodId }, orderBy: { createdAt: 'desc' } });
  const units = await prisma.organizationUnit.findMany({ where: { id: { in: [...new Set(maps.flatMap((m) => [m.assessorUnitId, m.targetUnitId]))] } }, select: { id: true, name: true } });
  const name = new Map(units.map((u) => [u.id, u.name]));
  return maps.map((m) => ({ ...m, assessorUnit: name.get(m.assessorUnitId) ?? '-', targetUnit: name.get(m.targetUnitId) ?? '-' }));
}

// ---------------------------------------------------------------------------
// Mengubah penugasan
// ---------------------------------------------------------------------------

async function assertEligible(actor: Actor, employeeId: string, what: string) {
  const e = await prisma.employee.findFirst({ where: { AND: [{ id: employeeId }, eligibleWhere(actor)] }, select: { id: true, unitId: true } });
  if (!e) throw unprocessable(`${what} tidak ditemukan, tidak aktif, belum punya akun, atau di luar kewenangan Anda.`);
  if (e.unitId && !unitInScope(actor, 'assess.manage', e.unitId)) throw unprocessable(`${what} di luar kewenangan Anda.`);
  return e;
}

export const addInput = z.object({ targetId: z.string().uuid(), assessorId: z.string().uuid(), role: z.enum(['REKAN', 'ATASAN']).default('REKAN') });

/** Tambah satu penilai secara manual untuk satu pegawai. */
export async function addAssignment(actor: Actor, periodId: string, raw: unknown) {
  const p = await openPeriodOf(actor, periodId);
  const v = addInput.parse(raw);
  if (v.targetId === v.assessorId) throw unprocessable('Pegawai tidak bisa menilai dirinya sendiri.', { assessorId: 'Pilih pegawai lain' });
  await assertEligible(actor, v.targetId, 'Pegawai yang dinilai');
  await assertEligible(actor, v.assessorId, 'Penilai');
  if (await prisma.assessmentAssignment.findUnique({ where: { periodId_targetEmployeeId_assessorEmployeeId: { periodId, targetEmployeeId: v.targetId, assessorEmployeeId: v.assessorId } } })) {
    throw conflict('Penilai ini sudah ditugaskan untuk pegawai tersebut.', { assessorId: 'Sudah ditugaskan' });
  }
  if (v.role === 'ATASAN' && (await prisma.assessmentAssignment.findFirst({ where: { periodId, targetEmployeeId: v.targetId, role: 'ATASAN' } }))) {
    throw conflict('Pegawai ini sudah punya penilai atasan. Ganti penilainya, bukan menambah.', { role: 'Sudah ada atasan' });
  }
  const a = await prisma.assessmentAssignment.create({ data: { periodId, targetEmployeeId: v.targetId, assessorEmployeeId: v.assessorId, role: v.role, source: 'MANUAL' } });
  await audit(actor, { action: 'assessment.assign', entityType: 'AssessmentAssignment', entityId: a.id, meta: { month: p.month, role: v.role } });
  await notifyAssessors([{ assessorEmployeeId: v.assessorId }], p.month);
  return { id: a.id };
}

async function loadAssignment(actor: Actor, id: string) {
  assertCan(actor, 'assess.manage');
  const a = await prisma.assessmentAssignment.findFirst({ where: { id, target: employeeScopeWhere(actor, 'assess.manage') }, include: { period: true } });
  if (!a) throw notFound('Penugasan tidak ditemukan.');
  if (a.period.isClosed) throw conflict('Periode sudah ditutup. Buka kembali untuk mengubah penilai.');
  return a;
}

/** Hapus penugasan yang belum dinilai. Penilaian yang sudah dikirim tidak bisa dihapus. */
export async function removeAssignment(actor: Actor, id: string) {
  const a = await loadAssignment(actor, id);
  if (a.status === 'SUBMITTED') throw conflict('Penilai ini sudah mengirim nilai, jadi penugasannya tidak bisa dihapus.');
  await prisma.assessmentAssignment.delete({ where: { id } });
  await audit(actor, { action: 'assessment.unassign', entityType: 'AssessmentAssignment', entityId: id, meta: { month: a.period.month, role: a.role } });
}

/** Ganti penilai pada penugasan yang belum dinilai, mis. untuk menyeimbangkan beban. */
export async function reassign(actor: Actor, id: string, assessorId: string) {
  const a = await loadAssignment(actor, id);
  if (a.status === 'SUBMITTED') throw conflict('Penilai ini sudah mengirim nilai, jadi tidak bisa diganti.');
  if (assessorId === a.targetEmployeeId) throw unprocessable('Pegawai tidak bisa menilai dirinya sendiri.', { assessorId: 'Pilih pegawai lain' });
  await assertEligible(actor, assessorId, 'Penilai');
  if (await prisma.assessmentAssignment.findUnique({ where: { periodId_targetEmployeeId_assessorEmployeeId: { periodId: a.periodId, targetEmployeeId: a.targetEmployeeId, assessorEmployeeId: assessorId } } })) {
    throw conflict('Penilai ini sudah ditugaskan untuk pegawai tersebut.', { assessorId: 'Sudah ditugaskan' });
  }
  await prisma.assessmentAssignment.update({ where: { id }, data: { assessorEmployeeId: assessorId, source: 'MANUAL' } });
  await audit(actor, { action: 'assessment.reassign', entityType: 'AssessmentAssignment', entityId: id, meta: { month: a.period.month } });
  await notifyAssessors([{ assessorEmployeeId: assessorId }], a.period.month);
}

// ---------------------------------------------------------------------------
// Pembagian massal
// ---------------------------------------------------------------------------

export const autoInput = z.object({
  peerCount: z.coerce.number().int().min(0).max(10).default(3),
  /** true: hapus dulu penugasan rekan yang belum dinilai, lalu acak ulang. false: hanya lengkapi yang kurang. */
  reset: z.boolean().default(false),
  /** Batasi pengacakan pada pegawai di unit ini (opsional). */
  unitId: z.string().uuid().nullable().optional(),
  includeSubunits: z.boolean().default(true),
});

/** Acak penilai rekan. Hanya penugasan rekan yang belum dinilai yang boleh dihapus saat reset; atasan dan yang sudah dinilai dipertahankan. */
export async function autoAssign(actor: Actor, periodId: string, raw: unknown) {
  const p = await openPeriodOf(actor, periodId);
  const v = autoInput.parse(raw);
  let unitIds: string[] | undefined;
  if (v.unitId) {
    const walk = await unitDescendants();
    unitIds = v.includeSubunits ? walk(v.unitId) : [v.unitId];
  }
  let removed = 0;
  if (v.reset) {
    const where: Prisma.AssessmentAssignmentWhereInput = {
      periodId, role: 'REKAN', status: 'PENDING', target: { AND: [employeeScopeWhere(actor, 'assess.manage'), unitIds ? { unitId: { in: unitIds } } : {}] },
    };
    removed = (await prisma.assessmentAssignment.deleteMany({ where })).count;
  }
  if (v.peerCount !== p.peerCount) await prisma.assessmentPeriod.update({ where: { id: periodId }, data: { peerCount: v.peerCount } });
  const rows = await generateAssignments(actor, periodId, v.peerCount, { targetUnitIds: unitIds });
  await notifyAssessors(rows, p.month);
  await audit(actor, { action: 'assessment.auto', entityType: 'AssessmentPeriod', entityId: periodId, meta: { month: p.month, created: rows.length, removed, reset: v.reset, unitId: v.unitId ?? null } });
  return { created: rows.length, removed };
}

export const unitMapInput = z.object({
  assessorUnitId: z.string().uuid('Pilih unit penilai'),
  targetUnitId: z.string().uuid('Pilih unit yang dinilai'),
  /** SEMUA: setiap pegawai unit penilai menilai semua pegawai unit yang dinilai. ACAK: tiap pegawai yang dinilai mendapat N penilai acak dari unit penilai. */
  mode: z.enum(['SEMUA', 'ACAK']),
  perTarget: z.coerce.number().int().min(1, 'Minimal 1').max(20, 'Maksimal 20').default(3),
  includeSubunits: z.boolean().default(false),
});

/**
 * Pemetaan unit: pegawai di unit penilai menilai pegawai di unit yang dinilai. Langsung diurai menjadi penugasan per
 * pegawai, jadi tetap bisa diubah satu per satu sesudahnya. Pegawai yang ada di kedua unit tidak menilai dirinya sendiri.
 */
export async function mapUnits(actor: Actor, periodId: string, raw: unknown) {
  const p = await openPeriodOf(actor, periodId);
  const v = unitMapInput.parse(raw);
  const walk = await unitDescendants();
  const units = (id: string) => (v.includeSubunits ? walk(id) : [id]);
  const [assessors, targets] = await Promise.all([
    prisma.employee.findMany({ where: { AND: [eligibleWhere(actor), { unitId: { in: units(v.assessorUnitId) } }] }, select: { id: true, unitId: true, unit: { select: { parentId: true } } } }),
    prisma.employee.findMany({ where: { AND: [eligibleWhere(actor), { unitId: { in: units(v.targetUnitId) } }] }, select: { id: true, unitId: true, unit: { select: { parentId: true } } } }),
  ]);
  if (!assessors.length) throw unprocessable('Unit penilai tidak punya pegawai aktif berakun dalam kewenangan Anda.', { assessorUnitId: 'Tidak ada pegawai' });
  if (!targets.length) throw unprocessable('Unit yang dinilai tidak punya pegawai aktif berakun dalam kewenangan Anda.', { targetUnitId: 'Tidak ada pegawai' });
  if (assessors.length * targets.length > MAX_ROWS) throw unprocessable('Pemetaan terlalu besar. Pilih mode acak atau unit yang lebih kecil.');

  const existing = await prisma.assessmentAssignment.findMany({ where: { periodId }, select: { targetEmployeeId: true, assessorEmployeeId: true } });
  const has = new Set(existing.map((e) => `${e.targetEmployeeId}|${e.assessorEmployeeId}`));
  const load = new Map<string, number>();
  for (const e of existing) load.set(e.assessorEmployeeId, (load.get(e.assessorEmployeeId) ?? 0) + 1);

  const rows: { periodId: string; targetEmployeeId: string; assessorEmployeeId: string; role: string; source: string }[] = [];
  const add = (target: string, assessor: string) => {
    if (target === assessor || has.has(`${target}|${assessor}`)) return;
    has.add(`${target}|${assessor}`);
    rows.push({ periodId, targetEmployeeId: target, assessorEmployeeId: assessor, role: 'REKAN', source: 'UNIT' });
  };
  if (v.mode === 'SEMUA') {
    for (const t of targets) for (const a of assessors) add(t.id, a.id);
  } else {
    const pool: Candidate[] = assessors.map((a) => ({ id: a.id, unitId: a.unitId, parentUnitId: a.unit?.parentId ?? null }));
    for (const t of targets) {
      // Penilai yang sudah ditugaskan untuk pegawai ini dihitung lebih dulu agar jumlahnya tidak melebihi N.
      const already = pool.filter((c) => has.has(`${t.id}|${c.id}`)).length;
      const need = Math.max(0, v.perTarget - already);
      const exclude = new Set(pool.filter((c) => has.has(`${t.id}|${c.id}`)).map((c) => c.id));
      for (const id of pickPeers({ id: t.id, unitId: t.unitId, parentUnitId: t.unit?.parentId ?? null }, pool, need, load, exclude)) add(t.id, id);
    }
  }
  if (rows.length) await prisma.assessmentAssignment.createMany({ data: rows, skipDuplicates: true });
  await prisma.assessmentUnitMap.create({ data: { periodId, assessorUnitId: v.assessorUnitId, targetUnitId: v.targetUnitId, mode: v.mode, perTarget: v.mode === 'ACAK' ? v.perTarget : null, includeSubunits: v.includeSubunits, created: rows.length, createdById: actor.userId } });
  await notifyAssessors(rows, p.month);
  await audit(actor, { action: 'assessment.map_units', entityType: 'AssessmentPeriod', entityId: periodId, meta: { month: p.month, ...v, created: rows.length } });
  return { created: rows.length, assessors: assessors.length, targets: targets.length };
}

/** Ingatkan semua penilai yang masih punya tugas belum selesai. */
export async function remindPending(actor: Actor, periodId: string) {
  assertCan(actor, 'assess.manage');
  const p = await prisma.assessmentPeriod.findUnique({ where: { id: periodId } });
  if (!p) throw notFound('Periode tidak ditemukan.');
  if (p.isClosed) throw conflict('Periode sudah ditutup.');
  const rows = await prisma.assessmentAssignment.groupBy({ by: ['assessorEmployeeId'], where: { periodId, status: 'PENDING', target: employeeScopeWhere(actor, 'assess.manage') }, _count: { _all: true } });
  const users = await prisma.user.findMany({ where: { employeeId: { in: rows.map((r) => r.assessorEmployeeId) }, isActive: true, deletedAt: null }, select: { id: true, employeeId: true } });
  let sent = 0;
  for (const r of rows) {
    const u = users.find((x) => x.employeeId === r.assessorEmployeeId);
    if (!u) continue;
    sent += await notifyUsers([u.id], { type: 'assessment_reminder', title: `Penilaian kinerja ${monthText(p.month)} belum selesai`, body: `${r._count._all} pegawai menunggu penilaian Anda.`, link: '/kinerja/penilaian' });
  }
  await audit(actor, { action: 'assessment.remind', entityType: 'AssessmentPeriod', entityId: periodId, meta: { month: p.month, reminded: sent } });
  return { reminded: sent };
}
