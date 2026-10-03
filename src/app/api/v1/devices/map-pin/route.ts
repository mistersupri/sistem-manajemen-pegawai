import { z } from 'zod';
import { body, route } from '@/lib/api';
import { mapPin } from '@/lib/services/devices';

export const POST = route({ perm: ['employee.write', 'device.manage'] }, async ({ req, actor }) => {
  const v = await body(req, z.object({ pin: z.string().min(1).max(30), employeeId: z.string().uuid('Pilih pegawai') }));
  return mapPin(actor, v.pin, v.employeeId);
});
