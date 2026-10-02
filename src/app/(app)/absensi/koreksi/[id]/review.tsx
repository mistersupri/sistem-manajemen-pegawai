'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Field, fieldProps } from '@/components/app/field';
import { confirmDialog } from '@/components/app/confirm-dialog';
import { api, useAction } from '@/components/app/api-client';

export function ReviewForm({ id, proposed }: { id: string; proposed: { checkIn: string | null; checkOut: string | null } }) {
  const { pending, fields, run } = useAction();
  const [disp, setDisp] = useState(false);
  async function decide(form: HTMLFormElement, approve: boolean) {
    const fd = new FormData(form);
    await run(() => api('POST', `/api/v1/corrections/${id}/review`, {
      approve, note: fd.get('note') || null, proposedCheckIn: fd.get('proposedCheckIn') || null, proposedCheckOut: fd.get('proposedCheckOut') || null,
      proposedStatus: fd.get('proposedStatus') || null, dispensation: disp,
    }), { success: approve ? 'Koreksi disetujui, rekap dihitung ulang.' : 'Koreksi ditolak.' });
  }
  return (
    <Card className="border-primary/40">
      <CardHeader><CardTitle>Keputusan</CardTitle><CardDescription>Bila disetujui, rekap tanggal tersebut disusun ulang dengan nilai di bawah. Anda bisa menyesuaikan usulan.</CardDescription></CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); decide(e.currentTarget, true); }}>
          <div className="grid grid-cols-2 gap-3">
            <Field id="proposedCheckIn" label="Jam masuk" error={fields.proposedCheckIn}><Input {...fieldProps('proposedCheckIn', fields.proposedCheckIn)} type="time" defaultValue={proposed.checkIn ?? ''} /></Field>
            <Field id="proposedCheckOut" label="Jam pulang" error={fields.proposedCheckOut}><Input {...fieldProps('proposedCheckOut', fields.proposedCheckOut)} type="time" defaultValue={proposed.checkOut ?? ''} /></Field>
          </div>
          <Field id="proposedStatus" label="Tetapkan status (opsional)" error={fields.proposedStatus}>
            <NativeSelect {...fieldProps('proposedStatus', fields.proposedStatus)} defaultValue=""><NativeSelectOption value="">Dihitung dari jam</NativeSelectOption><NativeSelectOption value="DINAS_LUAR">Dinas luar</NativeSelectOption><NativeSelectOption value="IZIN">Izin</NativeSelectOption><NativeSelectOption value="SAKIT">Sakit</NativeSelectOption></NativeSelect>
          </Field>
          <div className="flex items-start gap-3"><Checkbox id="disp" checked={disp} onCheckedChange={(v) => setDisp(!!v)} className="mt-0.5" /><Label htmlFor="disp" className="leading-snug font-normal">Beri dispensasi keterlambatan dan pulang awal</Label></div>
          <Field id="note" label="Catatan untuk pegawai" error={fields.note} hint="Wajib diisi bila menolak."><Textarea {...fieldProps('note', fields.note, true)} rows={2} /></Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>Setujui</Button>
            <Button type="button" variant="outline-destructive" disabled={pending} onClick={async (e) => { const form = e.currentTarget.form!; if (await confirmDialog({ title: 'Tolak koreksi ini?', description: 'Keputusan tidak bisa diubah. Pastikan catatan untuk pegawai sudah diisi.', confirmLabel: 'Tolak', destructive: true })) decide(form, false); }}>Tolak</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
