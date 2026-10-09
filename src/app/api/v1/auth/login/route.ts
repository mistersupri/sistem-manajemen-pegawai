import { NextResponse } from 'next/server';
import { z } from 'zod';
import { body, errorResponse, publicRoute } from '@/lib/api';
import { AppError } from '@/lib/errors';
import { login } from '@/lib/services/auth';
import { verifyCaptcha } from '@/lib/captcha';

const schema = z.object({
  username: z.string().trim().min(1, 'Wajib diisi'),
  password: z.string().min(1, 'Wajib diisi'),
  captchaToken: z.string().optional(),
  captchaAnswer: z.string().optional(),
});

export const POST = publicRoute(async ({ req }) => {
  // Cadangan tanpa JavaScript: form POST biasa, lalu redirect (kredensial tidak pernah masuk URL).
  if ((req.headers.get('content-type') || '').includes('application/x-www-form-urlencoded')) {
    const fd = await req.formData();
    try {
      verifyCaptcha(fd.get('captchaToken'), fd.get('captchaAnswer'));
      const r = await login(String(fd.get('username') || ''), String(fd.get('password') || ''));
      return NextResponse.redirect(new URL(r.mfaRequired ? '/login?mfa=1' : '/dashboard', req.url), 303);
    } catch (err) {
      const msg = err instanceof AppError ? err.message : 'Gagal masuk.';
      if (!(err instanceof AppError)) return errorResponse(err);
      return NextResponse.redirect(new URL(`/login?galat=${encodeURIComponent(msg)}`, req.url), 303);
    }
  }
  const { username, password, captchaToken, captchaAnswer } = await body(req, schema);
  // Captcha diperiksa sebelum kredensial agar tebakan password tidak bisa otomatis.
  verifyCaptcha(captchaToken, captchaAnswer);
  return login(username, password);
});
