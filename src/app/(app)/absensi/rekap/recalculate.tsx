'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field, fieldProps } from '@/components/app/field';
import { api, useAction } from '@/components/app/api-client';

export function Recalculate({ from, to }: { from: string; to: string }) {
  const [open, setOpen] = useState(false);
  const { pending, fields, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline"><RefreshCw />Hitung ulang</Button></DialogTrigger>
      <DialogContent>
        <form className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const r = await run(() => api<{ employees: number; unmatchedPins: number }>('POST', '/api/v1/attendance/recalculate', Object.fromEntries(fd)), { success: (x) => `Selesai. ${x.employees} pegawai dihitung ulang${x.unmatchedPins ? `, ${x.unmatchedPins} ID mesin belum terhubung` : ''}.` });
          if (r) setOpen(false);
        }}>
          <DialogHeader>
            <DialogTitle>Hitung ulang rekap dari transaksi sumber</DialogTitle>
            <DialogDescription>Jalankan setelah jadwal, hari libur, atau aturan berubah. Transaksi mentah tidak diubah; rekap disusun ulang dengan aturan dan versi terbaru, dan tindakan ini tercatat di audit log.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field id="from" label="Dari" error={fields.from}><Input {...fieldProps('from', fields.from)} type="date" defaultValue={from} required /></Field>
            <Field id="to" label="Sampai" error={fields.to}><Input {...fieldProps('to', fields.to)} type="date" defaultValue={to} required /></Field>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button type="submit" disabled={pending}>{pending ? 'Menghitung...' : 'Hitung ulang'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
