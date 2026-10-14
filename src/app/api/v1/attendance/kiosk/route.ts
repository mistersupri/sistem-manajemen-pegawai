import { z } from 'zod';
import { body, publicRoute } from '@/lib/api';
import { can } from '@/lib/auth/actor';
import { getActor, requestMeta } from '@/lib/auth/session';
import { systemActor } from '@/lib/auth/system';
import { forbidden, unauthorized } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';
import { getSetting } from '@/lib/settings';
import { faceAttendance } from '@/lib/services/attendance';

// Petugas yang login memakai izin kiosk.operate. Tanpa login, hanya bila "Kiosk bisa dibuka tanpa login" aktif di pengaturan.
export const POST = publicRoute(async ({ req }) => {
  const payload = await body(req, z.unknown());
  const actor = await getActor();
  if (actor && can(actor, 'kiosk.operate')) return faceAttendance(actor, 'FACE_KIOSK', payload, req.headers.get('user-agent'));
  if (!(await getSetting('kiosk.openAccess'))) throw actor ? forbidden() : unauthorized();
  const meta = await requestMeta();
  rateLimit(`kiosk-open:${meta.ip ?? 'unknown'}`, 120, 60_000);
  return faceAttendance(systemActor('kiosk-terbuka'), 'FACE_KIOSK', payload, req.headers.get('user-agent'));
});
