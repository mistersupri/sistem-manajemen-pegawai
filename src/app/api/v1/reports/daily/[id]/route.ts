import { route } from '@/lib/api';
import { deleteDailyReport } from '@/lib/services/performance';

export const DELETE = route<{ id: string }>({ perm: 'report.self' }, async ({ actor, params }) => deleteDailyReport(actor, params.id));
