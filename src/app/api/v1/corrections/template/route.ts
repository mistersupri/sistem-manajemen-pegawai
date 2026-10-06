import { fileResponse, route } from '@/lib/api';
import { correctionTemplate } from '@/lib/services/correction-import';

export const GET = route({ perm: 'correction.review' }, async () =>
  fileResponse(await correctionTemplate(), 'template-koreksi-absensi.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
