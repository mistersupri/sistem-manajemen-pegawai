import { fileResponse, route } from '@/lib/api';
import { importResultFile } from '@/lib/services/employee-import';

export const GET = route<{ token: string }>({ perm: 'employee.import' }, async ({ actor, params }) =>
  fileResponse(await importResultFile(actor, params.token), 'hasil-validasi-impor.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
