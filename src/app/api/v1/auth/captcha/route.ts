import { NextResponse } from 'next/server';
import { publicRoute } from '@/lib/api';
import { captchaEnabled, newCaptcha } from '@/lib/captcha';
import { rateLimit } from '@/lib/rate-limit';
import { requestMeta } from '@/lib/auth/session';

export const GET = publicRoute(async () => {
  if (!captchaEnabled()) return NextResponse.json({ enabled: false });
  const meta = await requestMeta();
  rateLimit(`captcha:${meta.ip ?? 'unknown'}`, 60, 5 * 60_000);
  const res = NextResponse.json({ enabled: true, ...newCaptcha() });
  res.headers.set('Cache-Control', 'no-store');
  return res;
});
