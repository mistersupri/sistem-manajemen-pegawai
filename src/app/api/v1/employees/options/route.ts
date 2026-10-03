import { route } from '@/lib/api';
import { employeeOptions } from '@/lib/services/employee-options';

export const GET = route({}, async ({ req, actor }) => employeeOptions(actor, Object.fromEntries(req.nextUrl.searchParams)));
