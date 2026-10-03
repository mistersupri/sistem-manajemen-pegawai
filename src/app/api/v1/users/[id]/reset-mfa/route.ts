import { route } from '@/lib/api';
import { resetUserMfa } from '@/lib/services/users';

export const POST = route<{ id: string }>({ perm: 'user.manage' }, async ({ actor, params }) => resetUserMfa(actor, params.id));
