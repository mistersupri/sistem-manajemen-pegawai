import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { bulkEmployees, bulkUsers } from '@/lib/services/bulk';
import { commitCorrectionImport, previewCorrectionImport } from '@/lib/services/correction-import';
import { ignorePins, restorePin, unmatchedPins } from '@/lib/services/devices';
import { createEmployee } from '@/lib/services/employees';
import { systemActor } from '@/lib/auth/system';
import { actorOf, pastWorkday, seedFixture } from './helpers';

let f: Awaited<ReturnType<typeof seedFixture>>;
beforeAll(async () => { f = await seedFixture(); });

const csv = (rows: string[][]) => Buffer.from(rows.map((r) => r.join(',')).join('\n'));

describe('aksi massal pegawai dan pengguna', () => {
  it('reset password dan nonaktifkan akun: yang tidak bisa dilewati, sisanya tetap jalan', async () => {
    const su = await actorOf(f.users.superUser.id);
    const r = await bulkUsers(su, { action: 'reset-password', ids: [f.users.stafAUser.id, f.users.stafBUser.id] });
    expect(r.done).toBe(2);
    expect(r.credentials).toHaveLength(2);
    expect(r.credentials![0].password).toMatch(/^Sm/);
    const off = await bulkUsers(su, { action: 'deactivate', ids: [f.users.stafAUser.id, f.users.superUser.id] });
    expect(off.done).toBe(1);
    expect(off.skipped[0].reason).toMatch(/sendiri/);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: f.users.stafAUser.id } })).isActive).toBe(false);
  });

  it('beri peran massal melewati akun yang sudah memegangnya', async () => {
    const su = await actorOf(f.users.superUser.id);
    const role = await prisma.role.findUniqueOrThrow({ where: { code: 'AUDITOR' } });
    const body = { action: 'role', ids: [f.users.stafBUser.id], roleId: role.id, unitId: null, includeSubunits: true };
    expect((await bulkUsers(su, body)).done).toBe(1);
    const again = await bulkUsers(su, body);
    expect(again.done).toBe(0);
    expect(again.skipped).toHaveLength(1);
  });

  it('hapus pegawai: tersembunyi, akun ditutup, NIP dan ID mesin bebas dipakai lagi', async () => {
    const admin = await actorOf(f.users.admin.id);
    const r = await bulkEmployees(admin, { action: 'delete', ids: [f.stafB.id], reason: 'Salah input data' });
    expect(r.done).toBe(1);
    const emp = await prisma.employee.findUniqueOrThrow({ where: { id: f.stafB.id } });
    expect(emp.deletedAt).not.toBeNull();
    expect(emp.machinePin).toBeNull();
    expect(emp.employeeNumber).not.toBe('900000000000000003');
    const user = await prisma.user.findUniqueOrThrow({ where: { employeeId: f.stafB.id } });
    expect(user.isActive).toBe(false);
    expect(user.deletedAt).not.toBeNull();
    const again = await createEmployee(systemActor('uji'), { fullName: 'Pengganti', employeeNumber: '900000000000000003', unitId: f.unitB.id, machinePin: '102' });
    expect(again.employee.machinePin).toBe('102');
  });

  it('pegawai di luar kewenangan atau milik akun sendiri tidak ikut terhapus', async () => {
    const op = await actorOf(f.users.operatorB.id);
    const denied = await bulkEmployees(op, { action: 'delete', ids: [f.stafA.id], reason: 'Uji' }).catch((e) => e);
    expect((denied as { status?: number }).status).toBe(403);
    const admin = await actorOf(f.users.admin.id);
    const r = await bulkEmployees(admin, { action: 'delete', ids: [f.kabidA.id], reason: 'Uji' });
    expect(r.done).toBe(1);
    const su = await actorOf(f.users.superUser.id);
    const gone = await bulkEmployees(su, { action: 'delete', ids: [f.kabidA.id], reason: 'Uji' });
    expect(gone.done).toBe(0);
  });
});

describe('ID mesin dilewati', () => {
  it('scan dari ID yang dilewati tidak lagi menunggu pemetaan, dan bisa dipulihkan', async () => {
    const su = await actorOf(f.users.superUser.id);
    await prisma.deviceUser.create({ data: { pin: '77001', name: 'Tamu' } });
    const dev = await prisma.attendanceDevice.create({ data: { name: 'Berkas uji', vendor: 'Uji', adapter: 'FILE_IMPORT', connection: 'USB' } });
    await prisma.deviceRawEvent.create({ data: { deviceId: dev.id, devicePin: '77001', deviceTime: new Date(), idempotencyKey: 'uji-77001' } });
    expect((await unmatchedPins(su)).some((p) => p.pin === '77001')).toBe(true);
    const r = await ignorePins(su, ['77001']);
    expect(r).toMatchObject({ ignored: 1, scans: 1 });
    expect((await unmatchedPins(su)).some((p) => p.pin === '77001')).toBe(false);
    expect(await prisma.deviceRawEvent.count({ where: { devicePin: '77001', processedAt: null } })).toBe(0);
    await restorePin(su, '77001');
    expect((await unmatchedPins(su)).some((p) => p.pin === '77001')).toBe(true);
    expect(await prisma.deviceRawEvent.count({ where: { devicePin: '77001', processedAt: null } })).toBe(1);
  });
});

describe('impor koreksi absensi', () => {
  it('pratinjau memisahkan baris valid dan galat; commit menerapkan koreksi petugas', async () => {
    const admin = await actorOf(f.users.admin.id);
    const day = pastWorkday(2);
    const head = ['NIP', 'Tanggal', 'Jam masuk', 'Jam pulang', 'Status', 'Dispensasi', 'Alasan'];
    const p = await previewCorrectionImport(admin, csv([
      head,
      ['900000000000000002', day, '07:25', '16:05', '', '', 'Mesin sidik jari rusak seharian'],
      ['900000000000000002', day, '07:25', '', '', '', ''],
      ['900000000000009999', day, '07:25', '', '', '', ''],
      ['900000000000000002', '2020-01-01', '07:25', '', '', '', ''],
      ['900000000000000002', pastWorkday(3), '', '', '', '', ''],
      ['900000000000000002', pastWorkday(4), '', '', 'Dinas luar', '', ''],
    ]), 'koreksi.csv');
    expect(p.summary).toMatchObject({ total: 6, koreksi: 2, galat: 4 });
    const by = Object.fromEntries(p.rows.map((r) => [r.line, r]));
    expect(by[3].messages.join()).toContain('sama dengan baris 2');
    expect(by[4].messages.join()).toContain('tidak ditemukan');
    expect(by[5].messages.join()).toContain('batas koreksi');
    expect(by[6].messages.join()).toContain('Isi jam masuk');
    expect(await prisma.attendanceCorrection.count()).toBe(0);

    const r = await commitCorrectionImport(admin, p.token, { defaultReason: 'Koreksi massal hasil verifikasi' });
    expect(r.summary.berhasil).toBe(2);
    const rec = await prisma.attendanceRecord.findFirstOrThrow({ where: { employeeId: f.stafA.id, workDate: new Date(`${day}T00:00:00Z`) } });
    expect(rec.checkInAt).not.toBeNull();
    expect(rec.checkOutAt).not.toBeNull();
    const dl = await prisma.attendanceRecord.findFirstOrThrow({ where: { employeeId: f.stafA.id, workDate: new Date(`${pastWorkday(4)}T00:00:00Z`) } });
    expect(dl.status).toBe('DINAS_LUAR');
    await expect(commitCorrectionImport(admin, p.token, {})).rejects.toMatchObject({ status: 422 });
  });
});
