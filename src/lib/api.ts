import { NextResponse, type NextRequest } from 'next/server';
import { ZodError, type z } from 'zod';
import { AppError, forbidden, unauthorized, unprocessable } from './errors';
import { log } from './logger';
import { getActor } from './auth/session';
import { can, type Actor } from './auth/actor';
import type { Permission } from './auth/catalog';
import { rateLimit } from './rate-limit';

// Format error seragam untuk seluruh API:
// { "error": { "code": "VALIDATION_ERROR", "message": "...", "fields": { "nama": "..." } } }
export function errorResponse(err: unknown) {
  if (err instanceof AppError) {
    return NextResponse.json({ error: { code: err.code, message: err.message, fields: err.fields } }, { status: err.status });
  }
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const i of err.issues) fields[i.path.join('.') || '_'] ??= i.message;
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Periksa kembali isian yang ditandai.', fields } }, { status: 422 });
  }
  const e = err as { code?: string; meta?: { target?: string[] } };
  if (e?.code === 'P2002') {
    return NextResponse.json({ error: { code: 'CONFLICT', message: 'Data dengan nilai unik yang sama sudah ada.', fields: { [String(e.meta?.target?.[0] ?? '_')]: 'Sudah dipakai.' } } }, { status: 409 });
  }
  log.error('Kesalahan tidak terduga pada API', { err: err instanceof Error ? err.stack : String(err) });
  return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan pada server. Coba lagi atau hubungi admin.' } }, { status: 500 });
}

// Proteksi CSRF untuk permintaan yang mengubah data: Origin harus sama dengan host aplikasi.
// Cookie sesi juga SameSite=Lax sebagai lapisan kedua.
function assertSameOrigin(req: NextRequest) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (!origin || !host || new URL(origin).host !== host) throw forbidden('Permintaan ditolak (asal tidak sah).');
}

type Ctx<P> = { req: NextRequest; actor: Actor; params: P };
type Opts = { perm?: Permission | Permission[]; public?: false; rate?: { key: string; limit: number; windowMs: number } };

/** Pembungkus route handler: sesi, izin, CSRF, rate limit, dan format error. */
export function route<P = Record<string, string>>(opts: Opts, fn: (ctx: Ctx<P>) => Promise<unknown>) {
  return async (req: NextRequest, context: { params: Promise<P> }) => {
    try {
      assertSameOrigin(req);
      const actor = await getActor();
      if (!actor) throw unauthorized();
      if (opts.perm) {
        const list = Array.isArray(opts.perm) ? opts.perm : [opts.perm];
        if (!list.some((p) => can(actor, p))) throw forbidden();
      }
      if (opts.rate) rateLimit(`${opts.rate.key}:${actor.userId}`, opts.rate.limit, opts.rate.windowMs);
      const params = (await context?.params) ?? ({} as P);
      const out = await fn({ req, actor, params });
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** Route publik (login, health). Tetap mendapat CSRF dan format error. */
export function publicRoute<P = Record<string, string>>(fn: (ctx: { req: NextRequest; params: P }) => Promise<unknown>, csrf = true) {
  return async (req: NextRequest, context: { params: Promise<P> }) => {
    try {
      if (csrf) assertSameOrigin(req);
      const params = (await context?.params) ?? ({} as P);
      const out = await fn({ req, params });
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function body<S extends z.ZodType>(req: NextRequest, schema: S): Promise<z.infer<S>> {
  let data: unknown;
  try {
    data = await req.json();
  } catch {
    throw unprocessable('Isi permintaan bukan JSON yang valid.');
  }
  return schema.parse(data);
}

export function query<S extends z.ZodType>(req: NextRequest, schema: S): z.infer<S> {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams));
}

/** Pagination server-side standar. */
export function paging(req: NextRequest, maxSize = 100) {
  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page')) || 1);
  const size = Math.min(maxSize, Math.max(1, Number(req.nextUrl.searchParams.get('pageSize')) || 25));
  return { page, size, skip: (page - 1) * size, take: size };
}
