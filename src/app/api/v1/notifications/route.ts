import { route } from '@/lib/api';
import { listNotifications } from '@/lib/services/notifications';

export const GET = route({}, async ({ req, actor }) => listNotifications(actor.userId, { unreadOnly: req.nextUrl.searchParams.get('unread') === '1', page: Number(req.nextUrl.searchParams.get('page')) || 1 }));
