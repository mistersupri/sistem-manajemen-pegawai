import { PageBody, PageHeader } from '@/components/app/page-header';
import { requirePage } from '@/lib/guard';
import { can } from '@/lib/auth/actor';
import { unitOptions } from '@/lib/services/units';
import { employeeStatuses, supervisorOptions } from '@/lib/services/employees';
import { EmployeeForm } from '../employee-form';

export const metadata = { title: 'Tambah pegawai' };

export default async function NewEmployeePage() {
  const actor = await requirePage(['employee.write']);
  const [units, supervisors, statuses] = await Promise.all([unitOptions(actor, 'employee.write'), supervisorOptions(actor), employeeStatuses()]);
  return (
    <>
      <PageHeader title="Tambah pegawai" crumbs={[{ href: '/pegawai', label: 'Data Pegawai' }, { label: 'Tambah' }]} />
      <PageBody className="max-w-5xl">
        <EmployeeForm initial={{}} units={units} supervisors={supervisors} statuses={statuses} canSeeNik={can(actor, 'employee.read_sensitive')} hasNik={false} />
      </PageBody>
    </>
  );
}
