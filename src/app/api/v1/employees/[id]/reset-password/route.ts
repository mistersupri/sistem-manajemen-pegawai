import { route } from '@/lib/api';
import { resetEmployeePassword } from '@/lib/services/employees';

export const POST = route<{ id: string }>({ perm: 'employee.write' }, async ({ actor, params }) => resetEmployeePassword(actor, params.id));
