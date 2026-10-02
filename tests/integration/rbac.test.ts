import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { getEmployee, listEmployees } from '@/lib/services/employees';
import { assignRole, revokeRole } from '@/lib/services/users';
import { listAudit } from '@/lib/services/settings-admin';
import { actorOf, seedFixture } from './helpers';

let f: Awaited<ReturnType<typeof seedFixture>>;
beforeAll(async () => { f = await seedFixture(); });

const status = async (p: Promise<unknown>) => { try { await p; return 200; } catch (e) { return (e as AppError).status ?? 500; } };

describe('RBAC dan cakupan unit', () => {
  it('operator unit B hanya melihat pegawai unit B', async () => {
    const op = await actorOf(f.users.operatorB.id);
    const r = await listEmployees(op, {});
    expect(r.rows.map((e) => e.fullName)).toEqual(['Staf Uji B']);
  });

  it('data pegawai di luar cakupan dijawab 404, bukan 403 (tidak membocorkan keberadaan data)', async () => {
    const op = await actorOf(f.users.operatorB.id);
    expect(await status(getEmployee(op, f.stafA.id))).toBe(404);
    expect(await status(getEmployee(op, f.stafB.id))).toBe(200);
  });

  it('pimpinan unit A melihat sub-unit A1 tetapi tidak unit B', async () => {
    const kabid = await actorOf(f.users.kabidUser.id);
    const names = (await listEmployees(kabid, {})).rows.map((e) => e.fullName).sort();
    expect(names).toEqual(['Kabid Uji', 'Staf Uji A']);
  });

  it('akun pegawai tidak bisa membuka daftar pegawai', async () => {
    const staf = await actorOf(f.users.stafAUser.id);
    expect(await status(listEmployees(staf, {}))).toBe(403);
  });

  it('mencegah eskalasi: admin kepegawaian tidak bisa memberi peran Super Admin', async () => {
    const admin = await actorOf(f.users.admin.id);
    const sa = await prisma.role.findUniqueOrThrow({ where: { code: 'SUPER_ADMIN' } });
    expect(await status(assignRole(admin, f.users.stafBUser.id, { roleId: sa.id, unitId: null }))).toBe(403);
  });

  it('Super Admin terakhir tidak bisa dicabut', async () => {
    const su = await actorOf(f.users.superUser.id);
    const ur = await prisma.userRole.findFirstOrThrow({ where: { userId: f.users.superUser.id, role: { code: 'SUPER_ADMIN' } } });
    expect(await status(revokeRole(su, f.users.superUser.id, ur.id))).toBeGreaterThanOrEqual(403);
    expect(await prisma.userRole.count({ where: { id: ur.id } })).toBe(1);
  });

  it('audit log tidak bisa diubah atau dihapus, bahkan langsung di database', async () => {
    const su = await actorOf(f.users.superUser.id);
    const { rows } = await listAudit(su, {});
    expect(rows.length).toBeGreaterThan(0);
    await expect(prisma.auditLog.update({ where: { id: rows[0].id }, data: { action: 'dipalsukan' } })).rejects.toThrow();
    await expect(prisma.auditLog.delete({ where: { id: rows[0].id } })).rejects.toThrow();
  });
});
