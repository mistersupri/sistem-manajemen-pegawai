import { z } from 'zod';
import { body, route } from '@/lib/api';
import { reviewCorrection } from '@/lib/services/corrections';

export const POST = route<{ id: string }>({ perm: 'correction.review' }, async ({ req, actor, params }) => reviewCorrection(actor, params.id, await body(req, z.unknown())));
