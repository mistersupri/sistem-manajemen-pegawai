import type { Db } from '../db';
import { hashPassword } from './password';

/**
 * Pastikan akun Super Admin dengan username tertentu ada.
 * - Belum ada: dibuat dengan password yang diberikan.
 * - Sudah ada: password tidak diubah, kecuali `reset` (juga membuka kunci, mengaktifkan akun,
 *   memastikan peran Super Admin, dan mengakhiri semua sesinya).
 */
export async function ensureSuperAdmin(db: Db, opts: { username: string; password: string; mustChangePassword: boolean; reset?: boolean }) {
  const username = opts.username.trim().toLowerCase();
  const role = await db.role.findUniqueOrThrow({ where: { code: 'SUPER_ADMIN' } });
  const existing = await db.user.findUnique({ where: { username }, include: { roles: true } });
  if (!existing) {
    await db.user.create({
      data: { username, passwordHash: await hashPassword(opts.password), mustChangePassword: opts.mustChangePassword, roles: { create: { roleId: role.id } } },
    });
    return 'created' as const;
  }
  if (!opts.reset) return 'exists' as const;
  await db.user.update({
    where: { id: existing.id },
    data: { passwordHash: await hashPassword(opts.password), mustChangePassword: opts.mustChangePassword, isActive: true, deletedAt: null, failedLoginCount: 0, lockedUntil: null },
  });
  if (!existing.roles.some((r) => r.roleId === role.id && r.unitId === null)) {
    await db.userRole.create({ data: { userId: existing.id, roleId: role.id, unitId: null, includeSubunits: true } });
  }
  await db.session.deleteMany({ where: { userId: existing.id } });
  return 'reset' as const;
}
