import { route } from '@/lib/api';
import { listAudit } from '@/lib/services/settings-admin';

export const GET = route({ perm: 'audit.read' }, async ({ req, actor }) => listAudit(actor, Object.fromEntries(req.nextUrl.searchParams)));
