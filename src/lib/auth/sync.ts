import { prisma, type Db } from '../db';
import { PERMISSIONS, ROLES, type Permission } from './catalog';

/**
 * Pastikan semua izin dan peran bawaan ada. Izin pada peran bawaan hanya diisi saat peran
 * pertama kali dibuat, agar penyesuaian admin di halaman Pengguna & Peran tidak tertimpa.
 */
export async function syncRbac(db: Db = prisma) {
  for (const [code, [group, name]] of Object.entries(PERMISSIONS)) {
    await db.permission.upsert({ where: { code }, update: { name, group }, create: { code, name, group } });
  }
  const perms = new Map((await db.permission.findMany()).map((p) => [p.code, p.id]));
  for (const [code, def] of Object.entries(ROLES)) {
    const existing = await db.role.findUnique({ where: { code } });
    if (existing) {
      await db.role.update({ where: { id: existing.id }, data: { name: def.name, description: def.description, isSystem: true } });
      // Super Admin selalu memiliki semua izin, termasuk izin baru.
      if (code === 'SUPER_ADMIN') await setRolePermissions(existing.id, def.permissions, perms, db);
      continue;
    }
    const role = await db.role.create({ data: { code, name: def.name, description: def.description, isSystem: true } });
    await setRolePermissions(role.id, def.permissions, perms, db);
  }
}

async function setRolePermissions(roleId: string, list: Permission[], perms: Map<string, string>, db: Db) {
  await db.rolePermission.deleteMany({ where: { roleId } });
  await db.rolePermission.createMany({ data: list.map((p) => ({ roleId, permissionId: perms.get(p)! })), skipDuplicates: true });
}
