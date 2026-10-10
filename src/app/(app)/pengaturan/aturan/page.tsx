import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { StatusBadge } from '@/components/app/status-badge';
import { EmptyState } from '@/components/app/empty-state';
import { requirePage } from '@/lib/guard';
import { can, scopeOf } from '@/lib/auth/actor';
import { getSettings } from '@/lib/settings';
import { listLeaveTypes } from '@/lib/services/leave';
import { employeeStatuses } from '@/lib/services/employees';
import { SettingsCard, type SettingField } from '../settings-form';
import { LeaveTypeForm } from './leave-types';

export const metadata = { title: 'Aturan Absensi' };

const RULES: SettingField[] = [
  { key: 'rules.checkoutGraceHours', label: 'Batas absen pulang setelah jam pulang', type: 'number', min: 0, max: 12, suffix: 'jam', hint: 'Scan setelah batas ini dianggap milik hari berikutnya.' },
  { key: 'rules.duplicateWindowMinutes', label: 'Abaikan scan berulang dalam', type: 'number', min: 0, max: 60, suffix: 'menit', hint: 'Scan dalam rentang ini dianggap satu transaksi.' },
  { key: 'rules.backdateDays', label: 'Batas koreksi dan input manual', type: 'number', min: 1, max: 366, suffix: 'hari ke belakang' },
  { key: 'rules.clockSkewToleranceMinutes', label: 'Toleransi selisih jam perangkat', type: 'number', min: 1, max: 1440, suffix: 'menit', hint: 'Scan dengan selisih lebih besar dari waktu server ditandai untuk ditinjau.' },
  { key: 'rules.blockOutsideSchedule', label: 'Tolak absen di hari tanpa jadwal atau libur', type: 'bool', hint: 'Bila mati, absen tetap dicatat dengan keterangan dan tidak memengaruhi status hari kerja.' },
  { key: 'modules.leave', label: 'Modul cuti dan izin aktif', type: 'bool' },
  { key: 'holidays.autoSync', label: 'Perbarui hari libur nasional otomatis', type: 'bool', hint: 'Ditarik setiap hari dari sumber daring gratis untuk tahun ini dan tahun depan. Server perlu akses internet.' },
  { key: 'holidays.includeCutiBersama', label: 'Cuti bersama dihitung hari libur', type: 'bool', hint: 'Matikan bila instansi tetap masuk pada cuti bersama. Berlaku pada pembaruan libur berikutnya.' },
];

const REMINDERS: SettingField[] = [
  { key: 'notify.reminders', label: 'Kirim pengingat absen masuk dan pulang', type: 'bool', hint: 'Pegawai yang berakun, dijadwalkan bekerja, dan belum absen mendapat notifikasi realtime. Pengingat pulang dikirim bila sudah absen masuk tetapi belum absen pulang.' },
  { key: 'notify.reminderLeadMin', label: 'Pengingat masuk dikirim', type: 'number', min: 0, max: 120, suffix: 'menit sebelum jam masuk' },
];

export default async function RulesPage() {
  const actor = await requirePage(['settings.manage', 'schedule.manage', 'leave.manage']);
  const settingsOk = can(actor, 'settings.manage') && !!scopeOf(actor, 'settings.manage')?.all;
  const [s, types, statuses] = await Promise.all([getSettings(), listLeaveTypes(true), employeeStatuses()]);
  return (
    <>
      <PageHeader title="Aturan Absensi" description="Aturan umum, jenis cuti/izin, dan tautan ke jadwal kerja. Semua perubahan tercatat di audit log." crumbs={[{ label: 'Pengaturan' }, { label: 'Aturan Absensi' }]} />
      <PageBody className="grid max-w-5xl gap-6">
        {settingsOk && <SettingsCard title="Aturan perhitungan" description="Perubahan berlaku untuk perhitungan berikutnya. Rekap lama tidak berubah sampai dihitung ulang." fields={RULES} values={s} />}
        {settingsOk && <SettingsCard title="Pengingat" description="Notifikasi tampil langsung di aplikasi tanpa memuat ulang halaman." fields={REMINDERS} values={s} />}
        {can(actor, 'schedule.manage') && (
          <Card>
            <CardHeader><CardTitle>Jam kerja, toleransi, dan hari libur</CardTitle><CardDescription>Diatur per jenis jadwal dengan riwayat versi.</CardDescription></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild variant="outline"><Link href="/jadwal?tab=jadwal">Jenis jadwal<ArrowRight /></Link></Button>
              <Button asChild variant="outline"><Link href="/jadwal?tab=libur">Hari libur<ArrowRight /></Link></Button>
            </CardContent>
          </Card>
        )}
        {can(actor, 'leave.manage') && (
          <Card id="cuti" className="gap-0 pb-0">
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-4">
              <div className="grid gap-1.5"><CardTitle>Jenis cuti dan izin</CardTitle><CardDescription>Kuota, syarat, dan tahap persetujuan per jenis.</CardDescription></div>
              <LeaveTypeForm statuses={statuses} />
            </CardHeader>
            <Table className="table-stack border-t">
              <TableHeader><TableRow><TableHead className="pl-6">Jenis</TableHead><TableHead>Saldo</TableHead><TableHead>Hitungan</TableHead><TableHead>Persetujuan</TableHead><TableHead>Status</TableHead><TableHead className="pr-6"><span className="sr-only">Aksi</span></TableHead></TableRow></TableHeader>
              <TableBody>
                {types.length === 0 && <TableRow><TableCell colSpan={6}><EmptyState title="Belum ada jenis cuti/izin" description="Pegawai belum bisa mengajukan cuti atau izin. Tambahkan jenisnya dengan form di bawah tabel ini." /></TableCell></TableRow>}
                {types.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="stack-head pl-6"><b>{t.code}</b> {t.name}{t.eligibleEmploymentStatuses.length > 0 && <span className="block text-xs text-muted-foreground">Hanya {t.eligibleEmploymentStatuses.join(', ')}</span>}</TableCell>
                    <TableCell data-label="Saldo">{t.usesBalance ? `${t.defaultAnnualQuota ?? '-'} hari/tahun${t.maxCarryOver ? `, bawa sisa maks. ${t.maxCarryOver}` : ''}` : 'Tanpa saldo'}</TableCell>
                    <TableCell data-label="Hitungan" className="whitespace-normal">{t.countWorkdaysOnly ? 'Hari kerja' : 'Hari kalender'}{t.maxDaysPerRequest ? `, maks. ${t.maxDaysPerRequest}` : ''}</TableCell>
                    <TableCell data-label="Persetujuan">{t.approvalLevels === 2 ? '2 tahap' : 'Atasan'}</TableCell>
                    <TableCell data-label="Status"><StatusBadge status={t.isActive ? 'ACTIVE' : 'CANCELLED'} label={t.isActive ? 'Aktif' : 'Nonaktif'} /></TableCell>
                    <TableCell className="pr-6 text-right"><LeaveTypeForm initial={t} statuses={statuses} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </PageBody>
    </>
  );
}
