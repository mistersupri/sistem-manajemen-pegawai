import { route } from '@/lib/api';
import { rotateStationToken } from '@/lib/services/stations';

export const POST = route<{ id: string }>({ perm: 'device.manage' }, async ({ actor, params }) => rotateStationToken(actor, params.id));
