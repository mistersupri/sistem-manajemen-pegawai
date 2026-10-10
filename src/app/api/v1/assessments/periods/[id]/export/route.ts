import { fileResponse, route } from '@/lib/api';
import { periodResultsWorkbook } from '@/lib/services/assessment-export';

export const GET = route<{ id: string }>({ perm: 'assess.manage' }, async ({ actor, params }) =>
  fileResponse(await periodResultsWorkbook(actor, params.id), 'hasil-penilaian-kinerja.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
