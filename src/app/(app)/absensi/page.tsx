import { redirect } from 'next/navigation';
import { requirePage } from '@/lib/guard';
import { can } from '@/lib/auth/actor';
import { ADMIN_ROLE_CODES } from '@/lib/nav';

export default async function AttendanceIndex() {
  const actor = await requirePage();
  const admin = actor.roleCodes.some((c) => ADMIN_ROLE_CODES.includes(c));
  const own = actor.employeeId && can(actor, 'attendance.self') && !admin;
  redirect(own ? '/absensi/saya' : can(actor, 'attendance.monitor') ? '/absensi/monitoring' : can(actor, 'attendance.report') ? '/absensi/rekap' : '/absensi/koreksi');
}
