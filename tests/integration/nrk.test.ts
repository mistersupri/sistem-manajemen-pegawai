// NRK sebagai pengenal login selain username/NIP. Data fiktif.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { createEmployee, updateEmployee } from '@/lib/services/employees';
import { systemActor } from '@/lib/auth/system';
import { mockNextHeaders, PASSWORD, seedFixture } from './helpers';

let f: Awaited<ReturnType<typeof seedFixture>>;
beforeAll(async () => {
  f = await seedFixture();
  vi.resetModules();
  mockNextHeaders();
  await prisma.employee.update({ where: { id: f.stafA.id }, data: { nrk: '123456' } });
});

const code = async (p: Promise<unknown>) => { try { await p; return 'OK'; } catch (e) { return (e as AppError).code; } };

describe('NRK', () => {
  it('bisa dipakai untuk login dengan password akun yang sama', async () => {
    const { login } = await import('@/lib/services/auth');
    expect(await code(login('123456', PASSWORD))).toBe('OK');
    expect(await code(login('123456', 'salah'))).toBe('UNAUTHENTICATED');
    expect(await code(login('999999', PASSWORD))).toBe('UNAUTHENTICATED');
  });

  it('NRK tidak boleh kembar, dan tidak boleh sama dengan username akun lain', async () => {
    const sys = systemActor('uji');
    await expect(createEmployee(sys, { fullName: 'Pegawai NRK Kembar', employeeNumber: '900000000000000055', unitId: f.unitB.id, employmentStatus: 'PNS', nrk: '123456' })).rejects.toMatchObject({ status: 409 });
    await expect(updateEmployee(sys, f.stafB.id, { fullName: 'Staf Uji B', unitId: f.unitB.id, employmentStatus: 'PNS', nrk: 'kabid.uji' })).rejects.toMatchObject({ status: 409 });
  });

  it('akun nonaktif tetap ditolak lewat NRK', async () => {
    await prisma.user.update({ where: { employeeId: f.stafA.id }, data: { isActive: false } });
    const { login } = await import('@/lib/services/auth');
    expect(await code(login('123456', PASSWORD))).toBe('UNAUTHENTICATED');
  });
});
