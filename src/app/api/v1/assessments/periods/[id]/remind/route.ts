import { route } from '@/lib/api';
import { remindPending } from '@/lib/services/assessment-mapping';

export const POST = route<{ id: string }>({ perm: 'assess.manage', rate: { key: 'assessremind', limit: 6, windowMs: 3600_000 } }, async ({ actor, params }) => remindPending(actor, params.id));
