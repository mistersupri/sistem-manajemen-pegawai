import { fileResponse, route } from '@/lib/api';
import { exportEmployees } from '@/lib/services/exports';

export const GET = route({ perm: 'employee.export' }, async ({ req, actor }) => {
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const f = await exportEmployees(actor, sp, sp.format === 'csv' ? 'csv' : 'xlsx', sp.nik === '1');
  return fileResponse(f.body, f.filename, f.type);
});
