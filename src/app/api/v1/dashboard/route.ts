import { route } from '@/lib/api';
import { can } from '@/lib/auth/actor';
import { adminDashboard, employeeDashboard } from '@/lib/services/dashboard';
import { forbidden } from '@/lib/errors';

export const GET = route({ perm: ['dashboard.view', 'attendance.self'] }, async ({ req, actor }) => {
  const sp = req.nextUrl.searchParams;
  if (can(actor, 'dashboard.view') && sp.get('view') !== 'pegawai') {
    return adminDashboard(actor, { date: sp.get('date') || undefined, days: Number(sp.get('days')) || 30, unitId: sp.get('unitId') || undefined, employmentStatus: sp.get('employmentStatus') || undefined, method: sp.get('method') || undefined });
  }
  if (!actor.employeeId) throw forbidden();
  return employeeDashboard(actor);
});
