import { z } from 'zod';
import { body, route } from '@/lib/api';
import { reconcile } from '@/lib/services/devices';

export const POST = route<{ id: string }>({ perm: 'device.sync', rate: { key: 'recon', limit: 5, windowMs: 600_000 } }, async ({ req, actor, params }) => reconcile(actor, params.id, (await body(req, z.object({ from: z.string() }))).from));
