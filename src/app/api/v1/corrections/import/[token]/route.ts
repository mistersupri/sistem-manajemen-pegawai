import { fileResponse, route } from '@/lib/api';
import { correctionImportResultFile } from '@/lib/services/correction-import';

export const GET = route<{ token: string }>({ perm: 'correction.review' }, async ({ actor, params }) =>
  fileResponse(await correctionImportResultFile(actor, params.token), 'hasil-impor-koreksi.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
