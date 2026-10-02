import { z } from 'zod';
import { body, route } from '@/lib/api';
import { deleteDevice, getDeviceDetail, saveDevice } from '@/lib/services/devices';

export const GET = route<{ id: string }>({ perm: 'device.read' }, async ({ actor, params }) => getDeviceDetail(actor, params.id));
export const PATCH = route<{ id: string }>({ perm: 'device.manage' }, async ({ req, actor, params }) => saveDevice(actor, params.id, await body(req, z.unknown())));
export const DELETE = route<{ id: string }>({ perm: 'device.manage' }, async ({ actor, params }) => deleteDevice(actor, params.id));
