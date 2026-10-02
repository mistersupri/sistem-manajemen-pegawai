'use client';

import { useState } from 'react';
import { FilePen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Field, fieldProps } from '@/components/app/field';
import { api, useAction } from '@/components/app/api-client';

const STATUSES: [string, string][] = [['', 'Dihitung dari jam'], ['DINAS_LUAR', 'Dinas luar'], ['IZIN', 'Izin'], ['SAKIT', 'Sakit'], ['CUTI', 'Cuti'], ['TIDAK_HADIR', 'Tidak hadir (setelah pemeriksaan)']];

/** Koreksi oleh petugas: nilai awal tetap tersimpan, alasan wajib, tercatat di audit log. */
export function AdminCorrection({ employeeId, date, current }: { employeeId: string; date: string; current: { checkIn: string | null; checkOut: string | null; status: string | null } }) {
  const [open, setOpen] = useState(false);
  const [disp, setDisp] = useState(false);
  const { pending, fields, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><FilePen />Koreksi</Button></DialogTrigger>
      <DialogContent>
        <form className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const r = await run(() => api('POST', '/api/v1/corrections/admin', {
            employeeId, workDate: date, proposedCheckIn: fd.get('proposedCheckIn') || null, proposedCheckOut: fd.get('proposedCheckOut') || null,
            proposedStatus: fd.get('proposedStatus') || null, dispensation: disp, reason: fd.get('reason'),
          }), { success: 'Koreksi disimpan dan rekap dihitung ulang.' });
          if (r !== undefined) setOpen(false);
        }}>
          <DialogHeader>
            <DialogTitle>Koreksi absensi</DialogTitle>
            <DialogDescription>Nilai saat ini: masuk {current.checkIn ?? '-'}, pulang {current.checkOut ?? '-'}. Kosongkan kolom yang tidak diubah. Transaksi mentah tidak dihapus.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field id="proposedCheckIn" label="Jam masuk" error={fields.proposedCheckIn}><Input {...fieldProps('proposedCheckIn', fields.proposedCheckIn)} type="time" /></Field>
            <Field id="proposedCheckOut" label="Jam pulang" error={fields.proposedCheckOut}><Input {...fieldProps('proposedCheckOut', fields.proposedCheckOut)} type="time" /></Field>
          </div>
          <Field id="proposedStatus" label="Tetapkan status" error={fields.proposedStatus}>
            <NativeSelect {...fieldProps('proposedStatus', fields.proposedStatus)} defaultValue="">{STATUSES.map(([k, v]) => <NativeSelectOption key={k} value={k}>{v}</NativeSelectOption>)}</NativeSelect>
          </Field>
          <div className="flex items-start gap-3"><Checkbox id="disp" checked={disp} onCheckedChange={(v) => setDisp(!!v)} className="mt-0.5" /><Label htmlFor="disp" className="leading-snug font-normal">Beri dispensasi: hapus hitungan terlambat dan pulang awal</Label></div>
          <Field id="reason" label="Alasan" error={fields.reason} required><Textarea {...fieldProps('reason', fields.reason)} rows={3} required /></Field>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button type="submit" disabled={pending}>{pending ? 'Menyimpan...' : 'Simpan koreksi'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
