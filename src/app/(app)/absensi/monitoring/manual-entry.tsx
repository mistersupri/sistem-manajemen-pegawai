'use client';

import { useState } from 'react';
import { PencilLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Field, fieldProps } from '@/components/app/field';
import { api, useAction } from '@/components/app/api-client';
import { EmployeePicker } from '@/components/app/employee-picker';

/** Input manual oleh petugas: metode alternatif bila wajah/kamera/mesin bermasalah. */
export function ManualEntry({ date }: { date: string }) {
  const [open, setOpen] = useState(false);
  const { pending, fields, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="highlight"><PencilLine />Input manual</Button></DialogTrigger>
      <DialogContent>
        <form className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const r = await run(() => api('POST', '/api/v1/attendance/manual', Object.fromEntries(fd)), { success: 'Absensi manual dicatat.' });
          if (r !== undefined) setOpen(false);
        }}>
          <DialogHeader>
            <DialogTitle>Input absensi manual</DialogTitle>
            <DialogDescription>Untuk pegawai yang tidak bisa absen lewat wajah atau mesin. Tercatat sebagai input petugas beserta alasannya di audit log.</DialogDescription>
          </DialogHeader>
          <Field id="employeeId" label="Pegawai" error={fields.employeeId} required>
            <EmployeePicker id="employeeId" name="employeeId" purpose="manual" required invalid={!!fields.employeeId} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="workDate" label="Tanggal kerja" error={fields.workDate} required><Input {...fieldProps('workDate', fields.workDate)} type="date" defaultValue={date} required /></Field>
            <Field id="time" label="Jam" error={fields.time} required><Input {...fieldProps('time', fields.time)} type="time" required /></Field>
          </div>
          <Field id="direction" label="Jenis" error={fields.direction} required>
            <NativeSelect {...fieldProps('direction', fields.direction)} defaultValue="IN"><NativeSelectOption value="IN">Masuk</NativeSelectOption><NativeSelectOption value="OUT">Pulang</NativeSelectOption></NativeSelect>
          </Field>
          <Field id="reason" label="Alasan" error={fields.reason} required hint="Mis. kamera kiosk rusak, pegawai hadir disaksikan kepala unit."><Textarea {...fieldProps('reason', fields.reason, true)} rows={2} required /></Field>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button type="submit" disabled={pending}>{pending ? 'Menyimpan...' : 'Simpan'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
