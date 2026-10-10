import { z } from 'zod';
import { body, route } from '@/lib/api';
import { addAssignment } from '@/lib/services/assessment-mapping';

export const POST = route<{ id: string }>({ perm: 'assess.manage' }, async ({ req, actor, params }) => addAssignment(actor, params.id, await body(req, z.unknown())));
