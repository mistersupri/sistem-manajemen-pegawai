import { NextResponse } from 'next/server';
import { z } from 'zod';
import { body, publicRoute } from '@/lib/api';
import { AppError } from '@/lib/errors';
import { completeMfa } from '@/lib/services/auth';

const schema = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Kode terdiri dari 6 angka') });

export const POST = publicRoute(async ({ req }) => {
  if ((req.headers.get('content-type') || '').includes('application/x-www-form-urlencoded')) {
    const code = String((await req.formData()).get('code') || '');
    try {
      await completeMfa(code);
      return NextResponse.redirect(new URL('/dashboard', req.url), 303);
    } catch (err) {
      const msg = err instanceof AppError ? err.message : 'Verifikasi gagal.';
      return NextResponse.redirect(new URL(`/login?mfa=1&galat=${encodeURIComponent(msg)}`, req.url), 303);
    }
  }
  return completeMfa((await body(req, schema)).code);
});
