import { route } from '@/lib/api';
import { deleteHoliday } from '@/lib/services/schedules';

export const DELETE = route<{ id: string }>({ perm: 'schedule.manage' }, async ({ actor, params }) => deleteHoliday(actor, params.id));
