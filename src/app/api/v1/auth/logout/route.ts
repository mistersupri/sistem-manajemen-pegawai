import { publicRoute } from '@/lib/api';
import { logout } from '@/lib/services/auth';

export const POST = publicRoute(async () => {
  await logout();
  return { ok: true };
});
