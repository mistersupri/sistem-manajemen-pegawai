import { route } from '@/lib/api';
import { unmatchedPins } from '@/lib/services/devices';

export const GET = route({ perm: 'device.read' }, async ({ actor }) => ({ rows: await unmatchedPins(actor) }));
