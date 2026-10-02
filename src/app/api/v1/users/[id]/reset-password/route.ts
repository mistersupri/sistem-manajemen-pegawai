import { route } from '@/lib/api';
import { resetUserPassword } from '@/lib/services/users';

export const POST = route<{ id: string }>({ perm: 'user.manage' }, async ({ actor, params }) => resetUserPassword(actor, params.id));
