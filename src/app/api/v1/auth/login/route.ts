import { NextResponse } from 'next/server';
import { z } from 'zod';
import { body, errorResponse, publicRoute } from '@/lib/api';
import { AppError } from '@/lib/errors';
import { login } from '@/lib/services/auth';

const schema = z.object({ username: z.string().trim().min(1, 'Wajib diisi'), password: z.string().min(1, 'Wajib diisi') });

export const POST = publicRoute(async ({ req }) => {
  // Cadangan tanpa JavaScript: form POST biasa, lalu redirect (kredensial tidak pernah masuk URL).
  if ((req.headers.get('content-type') || '').includes('application/x-www-form-urlencoded')) {
    const fd = await req.formData();
    try {
      const r = await login(String(fd.get('username') || ''), String(fd.get('password') || ''));
      return NextResponse.redirect(new URL(r.mfaRequired ? '/login?mfa=1' : '/dashboard', req.url), 303);
    } catch (err) {
      const msg = err instanceof AppError ? err.message : 'Gagal masuk.';
      if (!(err instanceof AppError)) return errorResponse(err);
      return NextResponse.redirect(new URL(`/login?galat=${encodeURIComponent(msg)}`, req.url), 303);
    }
  }
  const { username, password } = await body(req, schema);
  return login(username, password);
});
