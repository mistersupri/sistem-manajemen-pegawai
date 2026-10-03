import { z } from 'zod';
import { body, route } from '@/lib/api';
import { cancelLeave } from '@/lib/services/leave';

export const POST = route<{ id: string }>({}, async ({ req, actor, params }) => cancelLeave(actor, params.id, (await body(req, z.object({ reason: z.string() }))).reason));
