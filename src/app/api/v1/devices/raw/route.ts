import { route } from '@/lib/api';
import { rawEvents } from '@/lib/services/devices';

export const GET = route({ perm: 'device.read' }, async ({ req, actor }) => rawEvents(actor, Object.fromEntries(req.nextUrl.searchParams)));
