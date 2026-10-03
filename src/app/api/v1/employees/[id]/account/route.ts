import { route } from '@/lib/api';
import { ensureAccount } from '@/lib/services/employees';

export const POST = route<{ id: string }>({ perm: 'employee.write' }, async ({ actor, params }) => ensureAccount(actor, params.id));
