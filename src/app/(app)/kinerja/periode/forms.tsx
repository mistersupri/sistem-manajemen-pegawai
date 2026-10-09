'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field, fieldProps } from '@/components/app/field';
import { api, useAction } from '@/components/app/api-client';
import { confirmDialog } from '@/components/app/confirm-dialog';

export function OpenPeriod({ defaultMonth }: { defaultMonth: string }) {
  const [open, setOpen] = useState(false);
  const { pending, fields, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus />Buka periode</Button></DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
          const r = await run(() => api<{ assignments: number }>('POST', '/api/v1/assessments/periods', { month: d.month, peerCount: Number(d.peerCount) }), { success: (x) => `Periode dibuka, ${x.assignments} penugasan dibagi.` });
          if (r !== undefined) setOpen(false);
        }}>
          <DialogHeader><DialogTitle>Buka periode penilaian</DialogTitle><DialogDescription>Setiap pegawai aktif yang berakun dinilai atasan langsungnya dan sejumlah rekan yang dipilih acak, mendahulukan rekan satu unit. Penilai langsung mendapat notifikasi.</DialogDescription></DialogHeader>
          <Field id="month" label="Bulan" error={fields.month} required><Input {...fieldProps('month', fields.month)} type="month" required defaultValue={defaultMonth} max={defaultMonth} /></Field>
          <Field id="peerCount" label="Jumlah rekan penilai per pegawai" error={fields.peerCount} hint="0 berarti hanya atasan langsung."><Input {...fieldProps('peerCount', fields.peerCount, true)} type="number" min={0} max={10} defaultValue={3} className="w-24 tabular" /></Field>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button type="submit" disabled={pending}>{pending ? 'Membagi penilai...' : 'Buka periode'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PeriodActions({ id, closed }: { id: string; closed: boolean }) {
  const { pending, run } = useAction();
  const post = (action: 'close' | 'reopen' | 'topup', success: string | ((r: { added?: number }) => string)) => run(() => api<{ added?: number }>('POST', `/api/v1/assessments/periods/${id}`, { action }), { success });
  return (
    <>
      {!closed && <Button variant="outline" disabled={pending} onClick={() => post('topup', (r) => `${r.added ?? 0} penugasan baru dibagi.`)}>Lengkapi penilai</Button>}
      {closed
        ? <Button variant="outline" disabled={pending} onClick={() => post('reopen', 'Periode dibuka kembali.')}>Buka kembali</Button>
        : <Button variant="outline-destructive" disabled={pending} onClick={async () => { if (await confirmDialog({ title: 'Tutup periode?', description: 'Penilai tidak bisa lagi mengisi atau mengubah nilai, dan pegawai bisa melihat hasilnya.', confirmLabel: 'Tutup periode', destructive: true })) post('close', 'Periode ditutup.'); }}>Tutup periode</Button>}
    </>
  );
}
