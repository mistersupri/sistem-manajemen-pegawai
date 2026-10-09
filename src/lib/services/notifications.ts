import { prisma, type Db } from '../db';
import { log } from '../logger';
import { unitDescendants } from '../auth/actor';
import type { Permission } from '../auth/catalog';
import { publish } from '../realtime';

export interface NotificationInput {
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  /** Bila diisi, notifikasi dengan kunci yang sama tidak dibuat dua kali. */
  dedupeKey?: string | null;
}

// Kanal tambahan (email/WhatsApp) bersifat opsional. Aplikasi berfungsi penuh hanya dengan
// notifikasi in-app; kanal eksternal dipasang dengan mengimplementasikan interface ini.
export interface ExternalChannel {
  name: string;
  send(userId: string, n: NotificationInput): Promise<void>;
}
const channels: ExternalChannel[] = [];
export const registerChannel = (c: ExternalChannel) => channels.push(c);

/** Mengembalikan jumlah notifikasi yang benar-benar dibuat (yang terkena kunci anti-ganda tidak dihitung). */
export async function notifyUsers(userIds: string[], n: NotificationInput, db: Db = prisma) {
  const ids = [...new Set(userIds)];
  if (!ids.length) return 0;
  // Kunci anti-ganda dibuat per penerima; yang sudah ada dilewati.
  const rows = await db.notification.createManyAndReturn({
    data: ids.map((userId) => ({ userId, type: n.type, title: n.title, body: n.body ?? null, link: n.link ?? null, dedupeKey: n.dedupeKey ? `${n.dedupeKey}:${userId}` : null })),
    skipDuplicates: true,
  });
  for (const r of rows) {
    publish(r.userId, { type: 'notification', data: { id: r.id, type: r.type, title: r.title, body: r.body, link: r.link, createdAt: r.createdAt.toISOString() } });
    void unreadCount(r.userId).then((count) => publish(r.userId, { type: 'unread', data: { count } })).catch(() => undefined);
  }
  for (const c of channels) {
    for (const r of rows) c.send(r.userId, n).catch((err) => log.warn('Kanal notifikasi gagal', { channel: c.name, err: String(err) }));
  }
  return rows.length;
}

export async function notifyEmployee(employeeId: string, n: NotificationInput, db: Db = prisma) {
  const user = await db.user.findFirst({ where: { employeeId, isActive: true, deletedAt: null }, select: { id: true } });
  if (user) await notifyUsers([user.id], n, db);
}

/** Pengguna aktif yang memiliki izin tertentu dengan cakupan yang mencakup unit tersebut. */
export async function usersWithPermission(perm: Permission, unitId: string | null, db: Db = prisma) {
  const rows = await db.userRole.findMany({
    where: { user: { isActive: true, deletedAt: null }, role: { permissions: { some: { permission: { code: perm } } } } },
    select: { userId: true, unitId: true, includeSubunits: true },
  });
  const walk = await unitDescendants(db);
  return [...new Set(rows.filter((r) => {
    if (!r.unitId) return true;
    if (!unitId) return false;
    return r.includeSubunits ? walk(r.unitId).includes(unitId) : r.unitId === unitId;
  }).map((r) => r.userId))];
}

export async function notifyPermission(perm: Permission, unitId: string | null, n: NotificationInput, exceptUserId?: string | null, db: Db = prisma) {
  const ids = (await usersWithPermission(perm, unitId, db)).filter((id) => id !== exceptUserId);
  await notifyUsers(ids, n, db);
}

export async function listNotifications(userId: string, opts: { unreadOnly?: boolean; page?: number; pageSize?: number } = {}) {
  const page = opts.page ?? 1;
  const size = opts.pageSize ?? 30;
  const where = { userId, ...(opts.unreadOnly ? { readAt: null } : {}) };
  const [total, unread, rows] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, readAt: null } }),
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * size, take: size }),
  ]);
  return { total, unread, page, pageSize: size, rows };
}

export const unreadCount = (userId: string) => prisma.notification.count({ where: { userId, readAt: null } });

export async function markRead(userId: string, ids: string[] | 'all') {
  await prisma.notification.updateMany({ where: { userId, readAt: null, ...(ids === 'all' ? {} : { id: { in: ids } }) }, data: { readAt: new Date() } });
  // Tab lain milik pengguna yang sama ikut memperbarui lencananya.
  publish(userId, { type: 'unread', data: { count: await unreadCount(userId) } });
}
