import { route } from '@/lib/api';
import { testDevice } from '@/lib/services/devices';

export const POST = route<{ id: string }>({ perm: 'device.sync', rate: { key: 'devtest', limit: 20, windowMs: 600_000 } }, async ({ actor, params }) => testDevice(actor, params.id));
