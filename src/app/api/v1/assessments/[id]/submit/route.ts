import { z } from 'zod';
import { body, route } from '@/lib/api';
import { submitAssessment } from '@/lib/services/assessment';

export const POST = route<{ id: string }>({ perm: 'assess.self' }, async ({ req, actor, params }) => submitAssessment(actor, params.id, await body(req, z.unknown())));
