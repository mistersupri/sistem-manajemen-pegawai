import { z } from 'zod';
import { body, route } from '@/lib/api';
import { getSettings } from '@/lib/settings';
import { updateSettings } from '@/lib/services/settings-admin';

export const GET = route({ perm: 'settings.manage' }, async () => getSettings());
export const PATCH = route({ perm: 'settings.manage' }, async ({ req, actor }) => updateSettings(actor, await body(req, z.unknown())));
