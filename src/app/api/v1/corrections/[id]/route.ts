import { route } from '@/lib/api';
import { getCorrection } from '@/lib/services/corrections';

export const GET = route<{ id: string }>({ perm: ['correction.request', 'correction.review'] }, async ({ actor, params }) => getCorrection(actor, params.id));
