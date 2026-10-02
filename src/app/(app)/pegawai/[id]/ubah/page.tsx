import { PageBody, PageHeader } from '@/components/app/page-header';
import { requirePage } from '@/lib/guard';
import { can } from '@/lib/auth/actor';
import { unitOptions } from '@/lib/services/units';
import { employeeStatuses, getEmployee, supervisorOptions } from '@/lib/services/employees';
import { fromDbDate } from '@/lib/time';
import { EmployeeForm } from '../../employee-form';

export const metadata = { title: 'Ubah pegawai' };

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePage(['employee.write']);
  const { id } = await params;
  const e = await getEmployee(actor, id);
  const [units, supervisors, statuses] = await Promise.all([unitOptions(actor, 'employee.write'), supervisorOptions(actor), employeeStatuses()]);
  const d = (x: Date | null) => (x ? fromDbDate(x) : null);
  return (
    <>
      <PageHeader title={`Ubah ${e.fullName}`} crumbs={[{ href: '/pegawai', label: 'Data Pegawai' }, { href: `/pegawai/${id}`, label: e.fullName }, { label: 'Ubah' }]} />
      <PageBody className="max-w-5xl">
        <EmployeeForm
          initial={{ ...e, birthDate: d(e.birthDate), startDate: d(e.startDate) }}
          units={units} supervisors={supervisors} statuses={statuses} canSeeNik={can(actor, 'employee.read_sensitive')} hasNik={e.hasNik}
        />
      </PageBody>
    </>
  );
}
