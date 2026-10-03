import { z } from 'zod';
import { body, route } from '@/lib/api';
import { createStation, listStations } from '@/lib/services/stations';

export const GET = route({ perm: 'device.read' }, async ({ actor }) => ({ rows: (await listStations(actor)).map(({ tokenHash: _h, ...r }) => r) }));
export const POST = route({ perm: 'device.manage' }, async ({ req, actor }) => createStation(actor, await body(req, z.unknown())));
