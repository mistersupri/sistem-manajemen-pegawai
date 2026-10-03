import { redirect } from 'next/navigation';
import { requirePage } from '@/lib/guard';
import { can } from '@/lib/auth/actor';

export default async function AttendanceIndex() {
  const actor = await requirePage();
  redirect(actor.employeeId && can(actor, 'attendance.self') ? '/absensi/saya' : can(actor, 'attendance.monitor') ? '/absensi/monitoring' : '/absensi/koreksi');
}
