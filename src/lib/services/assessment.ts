import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '../db';
import { audit } from '../audit';
import { assertCan, can, employeeScopeWhere, unitInScope, type Actor } from '../auth/actor';
import { conflict, forbidden, notFound, unprocessable } from '../errors';
import { getSetting } from '../settings';
import { todayIn, zonedParts } from '../time';
import { averageOf, COMPETENCE, FOLLOW_UP, INDICATOR_KEYS, predicateOf, round2 } from '../assessment/indicators';
import { pickPeers, type Candidate } from '../assessment/pick';
import { notifyUsers } from './notifications';
import { monthText } from './performance';

const isMonth = (m: unknown): m is string => typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

// ---------------------------------------------------------------------------
// Pengelola: periode dan pembagian penilai
// ---------------------------------------------------------------------------

export const periodInput = z.object({
  month: z.string().refine(isMonth, 'Bulan tidak valid'),
  peerCount: z.coerce.number().int().min(0, 'Minimal 0').max(10, 'Maksimal 10').default(3),
});

/**
 * Bagi penilai untuk semua pegawai aktif yang berakun dalam cakupan: atasan langsung (bila ada) dan N rekan acak.
 * Aman dijalankan ulang: penugasan yang sudah ada dipertahankan, hanya kekurangannya yang dilengkapi.
 */
export async function generateAssignments(actor: Actor, periodId: string, peerCount: number, opts: { targetUnitIds?: string[] } = {}) {
  const emps = await prisma.employee.findMany({
    where: { AND: [{ deletedAt: null, isActive: true, user: { isActive: true, deletedAt: null } }, employeeScopeWhere(actor, 'assess.manage')] },
    select: { id: true, unitId: true, supervisorId: true, unit: { select: { parentId: true } } },
  });
  const pool: Candidate[] = emps.map((e) => ({ id: e.id, unitId: e.unitId, parentUnitId: e.unit?.parentId ?? null }));
  const have = await prisma.assessmentAssignment.findMany({ where: { periodId }, select: { targetEmployeeId: true, assessorEmployeeId: true, role: true } });
  const load = new Map<string, number>();
  for (const a of have) load.set(a.assessorEmployeeId, (load.get(a.assessorEmployeeId) ?? 0) + 1);
  const active = new Set(emps.map((e) => e.id));

  const rows: { periodId: string; targetEmployeeId: string; assessorEmployeeId: string; role: string; source: string }[] = [];
  for (const t of emps) {
    if (opts.targetUnitIds && !(t.unitId && opts.targetUnitIds.includes(t.unitId))) continue;
    const mine = have.filter((a) => a.targetEmployeeId === t.id);
    if (t.supervisorId && active.has(t.supervisorId) && !mine.some((a) => a.role === 'ATASAN')) {
      rows.push({ periodId, targetEmployeeId: t.id, assessorEmployeeId: t.supervisorId, role: 'ATASAN', source: 'AUTO' });
      load.set(t.supervisorId, (load.get(t.supervisorId) ?? 0) + 1);
    }
    const peers = mine.filter((a) => a.role === 'REKAN').length;
    if (peers < peerCount) {
      const exclude = new Set([...mine.map((a) => a.assessorEmployeeId), ...(t.supervisorId ? [t.supervisorId] : [])]);
      const target = pool.find((c) => c.id === t.id)!;
      for (const id of pickPeers(target, pool, peerCount - peers, load, exclude)) rows.push({ periodId, targetEmployeeId: t.id, assessorEmployeeId: id, role: 'REKAN', source: 'AUTO' });
    }
  }
  if (rows.length) await prisma.assessmentAssignment.createMany({ data: rows, skipDuplicates: true });
  return rows;
}

export async function notifyAssessors(rows: { assessorEmployeeId: string }[], month: string) {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.assessorEmployeeId, (counts.get(r.assessorEmployeeId) ?? 0) + 1);
  const users = await prisma.user.findMany({ where: { employeeId: { in: [...counts.keys()] }, isActive: true, deletedAt: null }, select: { id: true, employeeId: true } });
  for (const u of users) {
    await notifyUsers([u.id], {
      type: 'assessment_assigned', title: `Penilaian kinerja ${monthText(month)}`,
      body: `Anda ditugaskan menilai ${counts.get(u.employeeId!)} pegawai.`, link: '/kinerja/penilaian',
    });
  }
}

export async function openPeriod(actor: Actor, raw: unknown) {
  assertCan(actor, 'assess.manage');
  const v = periodInput.parse(raw);
  const today = todayIn(await getSetting('org.timezone'));
  if (v.month > today.slice(0, 7)) throw unprocessable('Periode belum dimulai.', { month: 'Maksimal bulan ini' });
  if (await prisma.assessmentPeriod.findUnique({ where: { month: v.month } })) throw conflict(`Periode ${monthText(v.month)} sudah dibuka.`, { month: 'Sudah ada' });
  const period = await prisma.assessmentPeriod.create({ data: { month: v.month, peerCount: v.peerCount, createdById: actor.userId } });
  const rows = await generateAssignments(actor, period.id, v.peerCount);
  await notifyAssessors(rows, v.month);
  await audit(actor, { action: 'assessment.open', entityType: 'AssessmentPeriod', entityId: period.id, meta: { month: v.month, assignments: rows.length } });
  return { id: period.id, assignments: rows.length };
}

/** Lengkapi penugasan untuk pegawai baru atau yang belum punya penilai cukup. */
export async function topUpPeriod(actor: Actor, periodId: string) {
  assertCan(actor, 'assess.manage');
  const p = await prisma.assessmentPeriod.findUnique({ where: { id: periodId } });
  if (!p) throw notFound('Periode tidak ditemukan.');
  if (p.isClosed) throw conflict('Periode sudah ditutup.');
  const rows = await generateAssignments(actor, p.id, p.peerCount);
  await notifyAssessors(rows, p.month);
  await audit(actor, { action: 'assessment.topup', entityType: 'AssessmentPeriod', entityId: p.id, meta: { added: rows.length } });
  return { added: rows.length };
}

export async function setPeriodClosed(actor: Actor, periodId: string, closed: boolean) {
  assertCan(actor, 'assess.manage');
  const p = await prisma.assessmentPeriod.findUnique({ where: { id: periodId } });
  if (!p) throw notFound('Periode tidak ditemukan.');
  await prisma.assessmentPeriod.update({ where: { id: periodId }, data: { isClosed: closed } });
  await audit(actor, { action: closed ? 'assessment.close' : 'assessment.reopen', entityType: 'AssessmentPeriod', entityId: periodId, meta: { month: p.month } });
  if (closed) {
    // Hasil terbuka bagi pegawai yang dinilai.
    const targets = await prisma.assessmentAssignment.findMany({ where: { periodId, status: 'SUBMITTED' }, distinct: ['targetEmployeeId'], select: { targetEmployeeId: true } });
    const users = await prisma.user.findMany({ where: { employeeId: { in: targets.map((t) => t.targetEmployeeId) }, isActive: true, deletedAt: null }, select: { id: true } });
    await notifyUsers(users.map((u) => u.id), { type: 'assessment_result', title: `Hasil penilaian kinerja ${monthText(p.month)} tersedia`, link: `/kinerja/penilaian?periode=${periodId}`, dedupeKey: `hasil:${periodId}` });
  }
}

export async function listPeriods(actor: Actor) {
  assertCan(actor, 'assess.manage');
  const periods = await prisma.assessmentPeriod.findMany({ orderBy: { month: 'desc' }, take: 36 });
  const stats = await prisma.assessmentAssignment.groupBy({ by: ['periodId', 'status'], where: { periodId: { in: periods.map((p) => p.id) } }, _count: { _all: true } });
  return periods.map((p) => {
    const done = stats.find((s) => s.periodId === p.id && s.status === 'SUBMITTED')?._count._all ?? 0;
    const pending = stats.find((s) => s.periodId === p.id && s.status === 'PENDING')?._count._all ?? 0;
    return { ...p, done, total: done + pending };
  });
}

// ---------------------------------------------------------------------------
// Hasil
// ---------------------------------------------------------------------------

type Sub = { role: string; scores: unknown; average: number | null; competence: string | null; followUp: string | null; note: string | null };
const asScores = (j: unknown): Record<string, number> => (j && typeof j === 'object' ? (j as Record<string, number>) : {});

/**
 * Gabungkan penilaian satu pegawai: nilai atasan dan rata-rata rekan dihitung terpisah, nilai akhir per indikator
 * adalah rata-rata keduanya bila keduanya ada, atau yang tersedia saja. Kesimpulan diambil dari atasan.
 */
export function combine(subs: Sub[]) {
  const boss = subs.find((s) => s.role === 'ATASAN' && s.average != null);
  const peers = subs.filter((s) => s.role === 'REKAN' && s.average != null);
  const peerScores = (k: string) => {
    const v = peers.map((p) => asScores(p.scores)[k]).filter((x) => typeof x === 'number');
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const final: Record<string, number> = {};
  for (const k of INDICATOR_KEYS) {
    const b = boss ? asScores(boss.scores)[k] : null;
    const p = peerScores(k);
    const parts = [b, p].filter((x): x is number => typeof x === 'number');
    if (parts.length) final[k] = round2(parts.reduce((a, c) => a + c, 0) / parts.length);
  }
  const average = Object.keys(final).length ? averageOf(final) : null;
  return {
    bossAverage: boss?.average ?? null,
    peerAverage: peers.length ? round2(peers.reduce((a, p) => a + (p.average ?? 0), 0) / peers.length) : null,
    peerCount: peers.length,
    final, average, predicate: average == null ? null : predicateOf(average),
    competence: boss?.competence ?? null, followUp: boss?.followUp ?? null, notes: boss?.note ? [boss.note] : [],
  };
}

export async function periodResults(actor: Actor, periodId: string) {
  assertCan(actor, 'assess.manage');
  const period = await prisma.assessmentPeriod.findUnique({ where: { id: periodId } });
  if (!period) throw notFound('Periode tidak ditemukan.');
  const rows = await prisma.assessmentAssignment.findMany({
    where: { periodId, target: employeeScopeWhere(actor, 'assess.manage') },
    include: { target: { select: { id: true, fullName: true, employeeNumber: true, position: true, unit: { select: { name: true } } } } },
  });
  const byTarget = new Map<string, typeof rows>();
  for (const r of rows) byTarget.set(r.targetEmployeeId, [...(byTarget.get(r.targetEmployeeId) ?? []), r]);
  const results = [...byTarget.values()].map((list) => {
    const submitted = list.filter((a) => a.status === 'SUBMITTED');
    return {
      employee: list[0].target, assigned: list.length, submitted: submitted.length,
      hasBoss: list.some((a) => a.role === 'ATASAN'),
      ...combine(submitted),
    };
  }).sort((a, b) => a.employee.fullName.localeCompare(b.employee.fullName, 'id'));
  return { period, results };
}

/** Data lembar penilaian siap cetak untuk satu pegawai pada satu periode. */
export async function resultSheet(actor: Actor, periodId: string, employeeId: string) {
  const period = await prisma.assessmentPeriod.findUnique({ where: { id: periodId } });
  if (!period) throw notFound('Periode tidak ditemukan.');
  const emp = await prisma.employee.findFirst({
    where: { id: employeeId, deletedAt: null },
    select: {
      id: true, fullName: true, employeeNumber: true, nikEnc: true, position: true, unitId: true, supervisorId: true, unit: { select: { name: true } },
      supervisor: { select: { fullName: true, employeeNumber: true, position: true, unit: { select: { name: true } } } },
    },
  });
  if (!emp) throw notFound('Pegawai tidak ditemukan.');
  const manage = can(actor, 'assess.manage') && unitInScope(actor, 'assess.manage', emp.unitId);
  const isBoss = !!actor.employeeId && emp.supervisorId === actor.employeeId;
  const own = emp.id === actor.employeeId && period.isClosed;
  if (!manage && !isBoss && !own) throw notFound('Hasil penilaian tidak ditemukan.');
  const subs = await prisma.assessmentAssignment.findMany({ where: { periodId, targetEmployeeId: employeeId, status: 'SUBMITTED' }, select: { role: true, scores: true, average: true, competence: true, followUp: true, note: true } });
  const { nikEnc, ...person } = emp;
  void nikEnc;
  return { period, employee: person, ...combine(subs) };
}

// ---------------------------------------------------------------------------
// Penilai
// ---------------------------------------------------------------------------

async function ownId(actor: Actor) {
  if (!actor.employeeId || !can(actor, 'assess.self')) throw forbidden('Penilaian kinerja hanya untuk akun pegawai.');
  return actor.employeeId;
}

export async function myAssignments(actor: Actor) {
  const me = await ownId(actor);
  const rows = await prisma.assessmentAssignment.findMany({
    where: { assessorEmployeeId: me, period: { isClosed: false } },
    include: { period: { select: { month: true } }, target: { select: { id: true, fullName: true, position: true, unit: { select: { name: true } } } } },
    orderBy: [{ status: 'asc' }, { period: { month: 'desc' } }],
  });
  return rows.map((r) => ({ id: r.id, month: r.period.month, role: r.role, status: r.status, average: r.average, target: r.target }));
}

/** Periode tertutup yang sudah ada hasil untuk pegawai yang login. */
export async function myResultPeriods(actor: Actor) {
  const me = await ownId(actor);
  const rows = await prisma.assessmentAssignment.findMany({
    where: { targetEmployeeId: me, status: 'SUBMITTED', period: { isClosed: true } },
    distinct: ['periodId'], select: { period: { select: { id: true, month: true } } }, orderBy: { period: { month: 'desc' } },
  });
  return rows.map((r) => r.period);
}

export async function getAssignment(actor: Actor, id: string) {
  const me = await ownId(actor);
  const a = await prisma.assessmentAssignment.findFirst({
    where: { id, assessorEmployeeId: me },
    include: { period: true, target: { select: { id: true, fullName: true, employeeNumber: true, position: true, unit: { select: { name: true } } } } },
  });
  if (!a) throw notFound('Penugasan penilaian tidak ditemukan.');
  return a;
}

export const submitInput = z.object({
  scores: z.record(z.string(), z.coerce.number().int().min(1, 'Nilai 1 sampai 100').max(100, 'Nilai 1 sampai 100')),
  competence: z.enum(Object.keys(COMPETENCE) as [keyof typeof COMPETENCE, ...(keyof typeof COMPETENCE)[]]).optional().nullable(),
  followUp: z.enum(Object.keys(FOLLOW_UP) as [keyof typeof FOLLOW_UP, ...(keyof typeof FOLLOW_UP)[]]).optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
});

export async function submitAssessment(actor: Actor, id: string, raw: unknown) {
  const a = await getAssignment(actor, id);
  if (a.period.isClosed) throw conflict('Periode penilaian sudah ditutup.');
  const v = submitInput.parse(raw);
  const missing = INDICATOR_KEYS.filter((k) => v.scores[k] == null);
  if (missing.length) throw unprocessable(`Masih ada ${missing.length} indikator yang belum dinilai.`, Object.fromEntries(missing.map((k) => [k, 'Wajib diisi'])));
  const boss = a.role === 'ATASAN';
  if (boss && (!v.competence || !v.followUp)) throw unprocessable('Isi kesimpulan kompetensi dan tindak lanjut.', { competence: v.competence ? '' : 'Wajib diisi', followUp: v.followUp ? '' : 'Wajib diisi' });
  const scores = Object.fromEntries(INDICATOR_KEYS.map((k) => [k, v.scores[k]]));
  const average = averageOf(scores);
  await prisma.assessmentAssignment.update({
    where: { id },
    data: {
      status: 'SUBMITTED', scores: scores as Prisma.InputJsonValue, average, predicate: predicateOf(average),
      competence: boss ? v.competence : null, followUp: boss ? v.followUp : null, note: v.note || null, submittedAt: new Date(),
    },
  });
  // Skor tidak dicatat di audit agar rekan tidak bisa dilacak lewat nilai; cukup bahwa penilaian dikirim.
  await audit(actor, { action: 'assessment.submit', entityType: 'AssessmentAssignment', entityId: id, meta: { month: a.period.month, role: a.role } });
  return { average, predicate: predicateOf(average) };
}

/** Jumlah penilaian yang masih harus dikerjakan (lencana). */
export async function pendingAssessmentCount(actor: Actor) {
  if (!actor.employeeId || !can(actor, 'assess.self')) return 0;
  return prisma.assessmentAssignment.count({ where: { assessorEmployeeId: actor.employeeId, status: 'PENDING', period: { isClosed: false } } });
}

/** Pengingat untuk penilai yang belum selesai; dikirim tiap penjadwal dengan kunci per periode per hari. */
export async function remindAssessors(now = new Date()) {
  const tz = await getSetting('org.timezone');
  const today = todayIn(tz, now);
  const hour = Number(zonedParts(now, tz).time.slice(0, 2));
  if (hour < 8 || hour >= 17) return 0; // pengingat hanya di jam kerja
  const rows = await prisma.assessmentAssignment.groupBy({ by: ['assessorEmployeeId', 'periodId'], where: { status: 'PENDING', period: { isClosed: false } }, _count: { _all: true } });
  if (!rows.length) return 0;
  const users = await prisma.user.findMany({ where: { employeeId: { in: rows.map((r) => r.assessorEmployeeId) }, isActive: true, deletedAt: null }, select: { id: true, employeeId: true } });
  let sent = 0;
  for (const r of rows) {
    const u = users.find((x) => x.employeeId === r.assessorEmployeeId);
    if (!u) continue;
    sent += await notifyUsers([u.id], { type: 'assessment_reminder', title: 'Penilaian kinerja belum selesai', body: `${r._count._all} pegawai menunggu penilaian Anda.`, link: '/kinerja/penilaian', dedupeKey: `nilai:${r.periodId}:${today}` });
  }
  return sent;
}

