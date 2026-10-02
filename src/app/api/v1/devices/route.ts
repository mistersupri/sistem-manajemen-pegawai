import { z } from 'zod';
import { body, route } from '@/lib/api';
import { listDevices, saveDevice } from '@/lib/services/devices';

export const GET = route({ perm: 'device.read' }, async ({ actor }) => ({ rows: await listDevices(actor) }));
export const POST = route({ perm: 'device.manage' }, async ({ req, actor }) => saveDevice(actor, null, await body(req, z.unknown())));
