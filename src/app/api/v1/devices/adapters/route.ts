import { route } from '@/lib/api';
import { ADAPTERS } from '@/lib/devices/registry';

export const GET = route({ perm: 'device.read' }, async () => ({
  rows: Object.values(ADAPTERS).map((a) => ({ id: a.id, label: a.label, maturity: a.maturity, connection: a.connection, pull: a.pull, note: a.note })),
}));
