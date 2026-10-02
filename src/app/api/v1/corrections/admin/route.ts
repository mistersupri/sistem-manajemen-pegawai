import { z } from 'zod';
import { body, route } from '@/lib/api';
import { adminCorrection } from '@/lib/services/corrections';

export const POST = route({ perm: 'correction.review' }, async ({ req, actor }) => adminCorrection(actor, await body(req, z.unknown())));
