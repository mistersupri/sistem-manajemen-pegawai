import { prisma } from '../db';
import { can, employeeScopeWhere, type Actor } from '../auth/actor';
import { pendingLeaveApprovalWhere } from './leave';

/** Jumlah hal yang menunggu tindakan, untuk lencana di sidebar. */
export async function navBadges(actor: Actor): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  out['/notifikasi'] = await prisma.notification.count({ where: { userId: actor.userId, readAt: null } });
  if (can(actor, 'correction.review')) {
    out['/absensi/koreksi'] = await prisma.attendanceCorrection.count({
      // Pengajuan milik sendiri tidak ditinjau sendiri.
      where: { status: 'PENDING', employee: employeeScopeWhere(actor, 'correction.review'), ...(actor.employeeId ? { NOT: { employeeId: actor.employeeId } } : {}) },
    });
  }
  if (can(actor, 'leave.approve') || can(actor, 'leave.manage')) {
    out['/cuti'] = await prisma.leaveApproval.count({ where: await pendingLeaveApprovalWhere(actor) });
  }
  return out;
}
