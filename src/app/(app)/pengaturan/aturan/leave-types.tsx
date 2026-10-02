'use client';

import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Field, fieldProps } from '@/components/app/field';
import { api, useAction } from '@/components/app/api-client';

export interface LeaveTypeValues {
  id: string; code: string; name: string; attendanceStatus: string; usesBalance: boolean; defaultAnnualQuota: number | null; eligibleEmploymentStatuses: string[];
  maxDaysPerRequest: number | null; minNoticeDays: number; approvalLevels: number; countWorkdaysOnly: boolean; allowAttachment: boolean; isActive: boolean;
}

const STATUS = [['CUTI', 'Cuti'], ['IZIN', 'Izin'], ['SAKIT', 'Sakit'], ['DINAS_LUAR', 'Dinas luar']];

export function LeaveTypeForm({ initial, statuses }: { initial?: LeaveTypeValues; statuses: string[] }) {
  const [open, setOpen] = useState(false);
  const [flags, setFlags] = useState({ usesBalance: initial?.usesBalance ?? false, countWorkdaysOnly: initial?.countWorkdaysOnly ?? true, allowAttachment: initial?.allowAttachment ?? false, isActive: initial?.isActive ?? true });
  const [eligible, setEligible] = useState<string[]>(initial?.eligibleEmploymentStatuses ?? []);
  const { pending, fields, run } = useAction();
  const flag = (k: keyof typeof flags, label: string) => (
    <div className="flex items-start gap-3"><Checkbox id={`lt-${k}`} checked={flags[k]} onCheckedChange={(v) => setFlags((f) => ({ ...f, [k]: !!v }))} className="mt-0.5" /><Label htmlFor={`lt-${k}`} className="leading-snug font-normal">{label}</Label></div>
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{initial ? <Button variant="outline" size="sm"><Pencil />Ubah</Button> : <Button><Plus />Tambah jenis</Button>}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <form className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
          const data = {
            ...d, ...flags, eligibleEmploymentStatuses: eligible,
            defaultAnnualQuota: flags.usesBalance && d.defaultAnnualQuota ? Number(d.defaultAnnualQuota) : null,
            maxDaysPerRequest: d.maxDaysPerRequest ? Number(d.maxDaysPerRequest) : null,
          };
          const r = await run(() => (initial ? api('PATCH', `/api/v1/leave/types/${initial.id}`, data) : api('POST', '/api/v1/leave/types', data)), { success: 'Jenis cuti/izin disimpan.' });
          if (r !== undefined) setOpen(false);
        }}>
          <DialogHeader>
            <DialogTitle>{initial ? `Ubah ${initial.name}` : 'Tambah jenis cuti/izin'}</DialogTitle>
            <DialogDescription>Isi sesuai peraturan kepegawaian yang berlaku di instansi Anda. Sistem tidak menetapkan kuota bawaan.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
            <Field id="code" label="Kode" error={fields.code} required><Input {...fieldProps('code', fields.code)} defaultValue={initial?.code} required maxLength={20} /></Field>
            <Field id="name" label="Nama" error={fields.name} required><Input {...fieldProps('name', fields.name)} defaultValue={initial?.name} required /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="attendanceStatus" label="Status di rekap absensi" error={fields.attendanceStatus}>
              <NativeSelect {...fieldProps('attendanceStatus', fields.attendanceStatus)} defaultValue={initial?.attendanceStatus ?? 'CUTI'}>{STATUS.map(([v, l]) => <NativeSelectOption key={v} value={v}>{l}</NativeSelectOption>)}</NativeSelect>
            </Field>
            <Field id="approvalLevels" label="Tahap persetujuan" error={fields.approvalLevels}>
              <NativeSelect {...fieldProps('approvalLevels', fields.approvalLevels)} defaultValue={String(initial?.approvalLevels ?? 1)}><NativeSelectOption value="1">Atasan langsung</NativeSelectOption><NativeSelectOption value="2">Atasan, lalu admin kepegawaian</NativeSelectOption></NativeSelect>
            </Field>
            <Field id="maxDaysPerRequest" label="Maks. hari per pengajuan" error={fields.maxDaysPerRequest} hint="Kosongkan bila tidak dibatasi."><Input {...fieldProps('maxDaysPerRequest', fields.maxDaysPerRequest, true)} type="number" min={1} max={366} defaultValue={initial?.maxDaysPerRequest ?? ''} /></Field>
            <Field id="minNoticeDays" label="Diajukan minimal (hari sebelumnya)" error={fields.minNoticeDays}><Input {...fieldProps('minNoticeDays', fields.minNoticeDays)} type="number" min={0} max={90} defaultValue={initial?.minNoticeDays ?? 0} /></Field>
          </div>
          <div className="grid gap-3">
            {flag('usesBalance', 'Memakai saldo tahunan')}
            {flags.usesBalance && (
              <Field id="defaultAnnualQuota" label="Kuota bawaan per tahun" error={fields.defaultAnnualQuota} hint="Dipakai saat membuat saldo tahunan. Saldo tiap pegawai bisa disesuaikan." className="pl-7">
                <Input {...fieldProps('defaultAnnualQuota', fields.defaultAnnualQuota, true)} type="number" min={0} max={366} defaultValue={initial?.defaultAnnualQuota ?? ''} className="w-32" />
              </Field>
            )}
            {flag('countWorkdaysOnly', 'Hitung hari kerja terjadwal saja (bukan hari kalender)')}
            {flag('allowAttachment', 'Boleh melampirkan berkas (mis. surat dokter)')}
            {flag('isActive', 'Aktif dan bisa diajukan')}
          </div>
          {statuses.length > 0 && (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Berlaku untuk status kepegawaian</legend>
              <p className="text-sm text-muted-foreground">Tidak dicentang semua berarti berlaku untuk semua status.</p>
              <div className="flex flex-wrap gap-3">
                {statuses.map((s) => (
                  <label key={s} className="inline-flex min-h-10 items-center gap-2 text-sm"><Checkbox checked={eligible.includes(s)} onCheckedChange={(v) => setEligible((x) => (v ? [...x, s] : x.filter((y) => y !== s)))} />{s}</label>
                ))}
              </div>
            </fieldset>
          )}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button type="submit" disabled={pending}>{pending ? 'Menyimpan...' : 'Simpan'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
