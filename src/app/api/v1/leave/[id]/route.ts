import { route } from '@/lib/api';
import { getLeave } from '@/lib/services/leave';

export const GET = route<{ id: string }>({}, async ({ actor, params }) => getLeave(actor, params.id));
