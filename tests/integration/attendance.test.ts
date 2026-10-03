import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { enrollFace } from '@/lib/services/biometrics';
import { faceAttendance } from '@/lib/services/attendance';
import { rebuildRecord } from '@/lib/attendance/record';
import { actorOf, pastWorkday, seedFixture } from './helpers';

let f: Awaited<ReturnType<typeof seedFixture>>;
const face = (seed: number) => Array.from({ length: 128 }, (_, i) => Math.sin(i * seed) / 5);
const jitter = (d: number[], k: number) => d.map((x, i) => x + Math.cos(i + k) / 1000);
const q = { score: 0.95, faceWidthPx: 220, brightness: 120 };

beforeAll(async () => {
  f = await seedFixture();
  const staf = await actorOf(f.users.stafAUser.id);
  await enrollFace(staf, f.stafA.id, { descriptors: [face(1), jitter(face(1), 1), jitter(face(1), 2)], consentAccepted: true, consentVersion: '1' });
});

describe('absensi wajah', () => {
  it('template wajah tersimpan terenkripsi, bukan angka mentah', async () => {
    const b = await prisma.employeeBiometric.findFirstOrThrow({ where: { employeeId: f.stafA.id } });
    expect(b.templateEnc).not.toContain('0.');
    expect(b.consentVersion).toBe('1');
  });

  it('wajah orang lain ditolak dan percobaan tetap tercatat, tanpa membuat rekap', async () => {
    const staf = await actorOf(f.users.stafAUser.id);
    const r = await faceAttendance(staf, 'FACE_SELF', { direction: 'IN', descriptor: face(7), quality: q, idempotencyKey: 'uji-gagal-0001' }, 'vitest');
    expect(r.outcome).toBe('NOT_RECOGNIZED');
    const ev = await prisma.attendanceEvent.findUniqueOrThrow({ where: { idempotencyKey: 'uji-gagal-0001' }, include: { verification: true } });
    expect(ev.verification?.outcome).toBe('NOT_RECOGNIZED');
  });

  it('kirim ulang dengan kunci yang sama tidak membuat transaksi ganda', async () => {
    const staf = await actorOf(f.users.stafAUser.id);
    const body = { direction: 'IN', descriptor: jitter(face(1), 3), quality: q, idempotencyKey: 'uji-sukses-0001' };
    const a = await faceAttendance(staf, 'FACE_SELF', body, 'vitest');
    const b = await faceAttendance(staf, 'FACE_SELF', body, 'vitest');
    expect(a.outcome).toBe(b.outcome);
    expect(a.eventId).toBe(b.eventId);
    expect(await prisma.attendanceEvent.count({ where: { idempotencyKey: 'uji-sukses-0001' } })).toBe(1);
  });

  it('kunci transaksi milik pengguna lain tidak bisa dipakai ulang', async () => {
    const other = await actorOf(f.users.stafBUser.id);
    await expect(faceAttendance(other, 'FACE_SELF', { direction: 'IN', descriptor: face(1), quality: q, idempotencyKey: 'uji-sukses-0001' }, 'vitest')).rejects.toMatchObject({ status: 409 });
  });

  it('kualitas gambar rendah ditolak dengan pesan yang bisa ditindaklanjuti', async () => {
    const staf = await actorOf(f.users.stafAUser.id);
    const r = await faceAttendance(staf, 'FACE_SELF', { direction: 'OUT', descriptor: face(1), quality: { score: 0.2, faceWidthPx: 50 }, idempotencyKey: 'uji-kualitas-01' }, 'vitest');
    expect(r.outcome).toBe('LOW_QUALITY');
  });

  it('hari kerja tanpa transaksi tidak otomatis dianggap tidak hadir', async () => {
    const day = pastWorkday(4);
    const rec = await rebuildRecord(f.stafB.id, day);
    expect(rec?.status ?? 'TANPA_TRANSAKSI').not.toBe('TIDAK_HADIR');
  });
});

describe('retensi template wajah', () => {
  it('template dihapus saat pegawai dinonaktifkan', async () => {
    const { setEmployeeActive } = await import('@/lib/services/employees');
    const admin = await actorOf(f.users.admin.id);
    await setEmployeeActive(admin, f.stafA.id, false, { reason: 'Pindah instansi' });
    const b = await prisma.employeeBiometric.findFirstOrThrow({ where: { employeeId: f.stafA.id }, orderBy: { createdAt: 'desc' } });
    expect(b.status).toBe('REVOKED');
    expect(b.templateEnc).toBe('DIHAPUS');
  });
});
