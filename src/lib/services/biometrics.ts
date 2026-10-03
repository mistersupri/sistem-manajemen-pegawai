import { z } from 'zod';
import { prisma } from '../db';
import { audit } from '../audit';
import { can, getEmployeeInScope, type Actor } from '../auth/actor';
import { realUserId } from '../auth/system';
import { conflict, forbidden, notFound, unprocessable } from '../errors';
import { getSettings } from '../settings';
import { activeMatcher, bestDistance, parseDescriptor } from '../biometric/matcher';
import { activeTemplates, forgetTemplate, sealTemplate } from '../biometric/templates';
import { notifyEmployee } from './notifications';

export const enrollInput = z.object({
  descriptors: z.array(z.array(z.number())).min(3, 'Minimal 3 sampel wajah').max(10),
  consentAccepted: z.literal(true, { message: 'Persetujuan pemrosesan data wajah wajib diberikan' }),
  consentVersion: z.string().min(1),
});

/** Status pendaftaran wajah tanpa membuka isi template. */
export async function biometricStatus(employeeId: string) {
  return prisma.employeeBiometric.findMany({
    where: { employeeId },
    select: { id: true, status: true, sampleCount: true, model: true, consentAt: true, consentVersion: true, verifiedAt: true, revokedAt: true, revokedReason: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
}

export async function enrollFace(actor: Actor, employeeId: string, raw: unknown) {
  const isSelf = actor.employeeId === employeeId;
  const manage = can(actor, 'biometric.manage');
  if (!manage && !(isSelf && can(actor, 'biometric.enroll_self'))) throw forbidden();
  const emp = await getEmployeeInScope(actor, manage ? 'biometric.manage' : 'biometric.enroll_self', employeeId);
  if (!emp.isActive) throw unprocessable('Pegawai nonaktif tidak dapat didaftarkan.');
  const input = enrollInput.parse(raw);
  const settings = await getSettings();
  if (input.consentVersion !== settings['face.consentVersion']) throw unprocessable('Teks persetujuan sudah diperbarui. Muat ulang halaman lalu baca kembali.');
  const m = activeMatcher();
  const samples = input.descriptors.map((d) => parseDescriptor(d, m));
  if (samples.some((s) => !s)) throw unprocessable('Data sampel wajah tidak valid.');
  const descriptors = samples as number[][];
  const threshold = Number(settings['face.matchThreshold']);

  // Semua sampel harus dari wajah yang sama.
  for (let i = 1; i < descriptors.length; i++) {
    if (m.distance(descriptors[0], descriptors[i]) > threshold * 1.2) throw unprocessable('Sampel wajah tidak konsisten (kemungkinan lebih dari satu orang). Ulangi perekaman.');
  }
  const existing = await prisma.employeeBiometric.findMany({ where: { employeeId, status: { in: ['ACTIVE', 'PENDING_VERIFICATION'] } } });
  if (existing.length && isSelf && !manage) throw conflict('Wajah Anda sudah terdaftar. Hubungi admin kepegawaian bila perlu didaftarkan ulang.');

  // Tolak bila wajah ini sudah terdaftar atas nama pegawai lain.
  for (const t of await activeTemplates()) {
    if (t.employeeId === employeeId) continue;
    const d = Math.min(...descriptors.map((s) => bestDistance(t.descriptors, s, m)));
    if (d <= threshold) {
      await audit(actor, { action: 'biometric.enroll', entityType: 'Employee', entityId: employeeId, result: 'FAILURE', meta: { reason: 'wajah_milik_pegawai_lain' } });
      throw conflict('Wajah ini sudah terdaftar atas nama pegawai lain. Hubungi admin kepegawaian.');
    }
  }

  const status = settings['face.requireOfficerVerification'] && !manage ? 'PENDING_VERIFICATION' : 'ACTIVE';
  const created = await prisma.$transaction(async (tx) => {
    for (const e of existing) {
      await tx.employeeBiometric.update({ where: { id: e.id }, data: { status: 'REVOKED', templateEnc: 'DIHAPUS', revokedAt: new Date(), revokedById: realUserId(actor), revokedReason: 'Diganti pendaftaran baru' } });
      forgetTemplate(e.id);
    }
    const b = await tx.employeeBiometric.create({
      data: {
        employeeId, model: m.model, templateEnc: sealTemplate(m.model, descriptors), sampleCount: descriptors.length, status,
        consentVersion: input.consentVersion, consentAt: new Date(), consentById: realUserId(actor), enrolledById: realUserId(actor),
        ...(status === 'ACTIVE' ? { verifiedById: realUserId(actor), verifiedAt: new Date() } : {}),
      },
    });
    await audit(actor, { action: existing.length ? 'biometric.update' : 'biometric.enroll', entityType: 'EmployeeBiometric', entityId: b.id, meta: { employeeId, samples: descriptors.length, status, consentVersion: input.consentVersion } }, tx);
    return b;
  });
  await notifyEmployee(employeeId, {
    type: 'biometric', title: status === 'ACTIVE' ? 'Wajah terdaftar' : 'Pendaftaran wajah menunggu verifikasi petugas',
    body: status === 'ACTIVE' ? 'Template wajah Anda aktif dan bisa dipakai untuk absensi.' : 'Petugas kepegawaian akan memverifikasi pendaftaran wajah Anda.',
    link: '/absensi/saya/absen',
  });
  return { id: created.id, status, samples: descriptors.length };
}

export async function verifyEnrollment(actor: Actor, biometricId: string, approve: boolean, note?: string) {
  const b = await prisma.employeeBiometric.findUnique({ where: { id: biometricId } });
  if (!b || b.status !== 'PENDING_VERIFICATION') throw notFound('Pendaftaran tidak ditemukan atau sudah diproses.');
  await getEmployeeInScope(actor, 'biometric.manage', b.employeeId);
  if (!can(actor, 'biometric.manage')) throw forbidden();
  await prisma.employeeBiometric.update({
    where: { id: biometricId },
    data: approve
      ? { status: 'ACTIVE', verifiedById: realUserId(actor), verifiedAt: new Date() }
      : { status: 'REVOKED', templateEnc: 'DIHAPUS', revokedAt: new Date(), revokedById: realUserId(actor), revokedReason: note || 'Ditolak petugas' },
  });
  forgetTemplate(biometricId);
  await audit(actor, { action: approve ? 'biometric.verify' : 'biometric.reject', entityType: 'EmployeeBiometric', entityId: biometricId, meta: { employeeId: b.employeeId, note } });
  await notifyEmployee(b.employeeId, { type: 'biometric', title: approve ? 'Pendaftaran wajah disetujui' : 'Pendaftaran wajah ditolak', body: approve ? 'Anda sudah bisa absen dengan wajah.' : note || 'Silakan daftar ulang.', link: '/absensi/saya' });
}

/** Cabut dan hapus isi template wajah (atas permintaan pegawai atau kebijakan). */
export async function revokeFace(actor: Actor, employeeId: string, reason: string) {
  if (!can(actor, 'biometric.manage')) throw forbidden();
  await getEmployeeInScope(actor, 'biometric.manage', employeeId);
  if (!reason || reason.trim().length < 3) throw unprocessable('Alasan pencabutan wajib diisi.', { reason: 'Wajib diisi' });
  const list = await prisma.employeeBiometric.findMany({ where: { employeeId, status: { in: ['ACTIVE', 'PENDING_VERIFICATION'] } } });
  if (!list.length) throw notFound('Pegawai tidak memiliki template wajah aktif.');
  await prisma.$transaction(async (tx) => {
    for (const b of list) {
      await tx.employeeBiometric.update({ where: { id: b.id }, data: { status: 'REVOKED', templateEnc: 'DIHAPUS', revokedAt: new Date(), revokedById: realUserId(actor), revokedReason: reason.trim() } });
      forgetTemplate(b.id);
    }
    await audit(actor, { action: 'biometric.revoke', entityType: 'Employee', entityId: employeeId, meta: { reason: reason.trim(), count: list.length } }, tx);
  });
  await notifyEmployee(employeeId, { type: 'biometric', title: 'Template wajah dihapus', body: `Alasan: ${reason.trim()}. Gunakan metode absensi lain atau daftar ulang.`, link: '/absensi/saya' });
}

export async function pendingVerifications(actor: Actor) {
  if (!can(actor, 'biometric.manage')) return [];
  const rows = await prisma.employeeBiometric.findMany({
    where: { status: 'PENDING_VERIFICATION' },
    include: { employee: { select: { id: true, fullName: true, employeeNumber: true, unitId: true, unit: { select: { name: true } } } } },
    orderBy: { createdAt: 'asc' },
  });
  const s = actor.permissions.get('biometric.manage')!;
  return rows.filter((r) => s.all || (r.employee.unitId && s.unitIds.includes(r.employee.unitId))).map(({ templateEnc: _t, ...r }) => r);
}
