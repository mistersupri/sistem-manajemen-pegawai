import { route } from '@/lib/api';
import { revokeRole } from '@/lib/services/users';

export const DELETE = route<{ id: string; urId: string }>({ perm: 'user.manage' }, async ({ actor, params }) => revokeRole(actor, params.id, params.urId));
