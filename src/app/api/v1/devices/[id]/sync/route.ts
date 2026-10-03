import { route } from '@/lib/api';
import { syncNow } from '@/lib/services/devices';

export const POST = route<{ id: string }>({ perm: 'device.sync', rate: { key: 'sync', limit: 20, windowMs: 600_000 } }, async ({ actor, params }) => syncNow(actor, params.id));
