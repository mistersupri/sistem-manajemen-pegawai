import { z } from 'zod';
import { body, route } from '@/lib/api';
import { setDeviceActive } from '@/lib/services/devices';

export const POST = route<{ id: string }>({ perm: 'device.manage' }, async ({ req, actor, params }) => setDeviceActive(actor, params.id, (await body(req, z.object({ active: z.boolean() }))).active));
