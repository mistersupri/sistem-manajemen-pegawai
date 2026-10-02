import { route } from '@/lib/api';
import { retryRun } from '@/lib/services/devices';

export const POST = route<{ id: string }>({ perm: 'device.sync' }, async ({ actor, params }) => retryRun(actor, params.id));
