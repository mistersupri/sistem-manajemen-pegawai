import { fileResponse, route } from '@/lib/api';
import { employeeTemplate } from '@/lib/services/exports';

export const GET = route({ perm: 'employee.import' }, async () =>
  fileResponse(await employeeTemplate(), 'template-impor-pegawai.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
