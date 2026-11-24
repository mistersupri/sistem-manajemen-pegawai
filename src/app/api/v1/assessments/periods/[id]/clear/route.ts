import { route } from '@/lib/api';
import { clearAssignments } from '@/lib/services/assessment-mapping';

export const POST = route<{ id: string }>({ perm: 'assess.manage', rate: { key: 'assessclear', limit: 10, windowMs: 600_000 } }, async ({ actor, params }) => clearAssignments(actor, params.id));
