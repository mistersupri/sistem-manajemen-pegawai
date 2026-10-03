import type { Prisma } from '@/generated/prisma/client';
import { prisma, type Db } from './db';
import { redact, log } from './logger';
import type { Actor } from './auth/actor';
import { requestMeta } from './auth/session';

export interface AuditEntry {
  action: string;
  entityType?: string;
  entityId?: string | null;
  result?: 'SUCCESS' | 'FAILURE';
  before?: unknown;
  after?: unknown;
  meta?: Record<string, unknown>;
}

const json = (v: unknown) => (v === undefined || v === null ? undefined : (JSON.parse(JSON.stringify(redact(v))) as Prisma.InputJsonValue));

/** Catat aktivitas ke audit log. Nilai sensitif disamarkan sebelum disimpan. */
export async function audit(actor: Pick<Actor, 'userId' | 'username'> | null, entry: AuditEntry, db: Db = prisma) {
  let meta: { ip: string | null; userAgent: string | null } = { ip: null, userAgent: null };
  try {
    meta = await requestMeta();
  } catch {
    // di luar konteks request (skrip, scheduler)
  }
  try {
    await db.auditLog.create({
      data: {
        actorUserId: actor && actor.userId !== '00000000-0000-0000-0000-000000000000' ? actor.userId : null,
        actorLabel: actor?.username ?? 'sistem',
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        result: entry.result ?? 'SUCCESS',
        before: json(entry.before),
        after: json(entry.after),
        meta: json(entry.meta),
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });
  } catch (err) {
    log.error('Gagal menulis audit log', { action: entry.action, err: String(err) });
    throw err;
  }
}

/** Selisih field yang berubah, untuk kolom before/after. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const k of Object.keys(after)) {
    const x = before[k] instanceof Date ? (before[k] as Date).toISOString() : before[k];
    const y = after[k] instanceof Date ? (after[k] as Date).toISOString() : after[k];
    if (JSON.stringify(x) !== JSON.stringify(y)) {
      b[k] = x;
      a[k] = y;
    }
  }
  return { before: b, after: a, changed: Object.keys(a).length > 0 };
}
