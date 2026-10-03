import { fileResponse, route } from '@/lib/api';
import { prisma } from '@/lib/db';
import { can, getEmployeeInScope } from '@/lib/auth/actor';
import { notFound } from '@/lib/errors';
import { readStored } from '@/lib/storage';

// Foto dinas luar: hanya pemilik dan petugas pemantau dalam cakupannya.
export const GET = route<{ id: string }>({}, async ({ actor, params }) => {
  const ev = await prisma.attendanceEvent.findUnique({ where: { id: params.id } });
  if (!ev?.photoPath || !ev.employeeId) throw notFound();
  if (ev.employeeId !== actor.employeeId) {
    if (!can(actor, 'attendance.monitor')) throw notFound();
    await getEmployeeInScope(actor, 'attendance.monitor', ev.employeeId);
  }
  return fileResponse(await readStored(ev.photoPath), 'foto.jpg', 'image/jpeg', true);
});
