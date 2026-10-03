import { route } from '@/lib/api';
import { cancelCorrection } from '@/lib/services/corrections';

export const POST = route<{ id: string }>({ perm: 'correction.request' }, async ({ actor, params }) => cancelCorrection(actor, params.id));
