'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field, fieldProps } from '@/components/app/field';
import { ConfirmButton } from '@/components/app/confirm-button';
import { api, useAction } from '@/components/app/api-client';

export function GenerateBalances({ year }: { year: number }) {
  return (
    <ConfirmButton variant="highlight" destructive={false} label={`Buat saldo ${year}`} title={`Buat saldo tahun ${year}?`}
      description="Saldo dibuat dari kuota bawaan tiap jenis cuti untuk pegawai aktif yang memenuhi syarat. Saldo yang sudah ada tidak diubah."
      confirmLabel="Buat saldo" url="/api/v1/leave/balances/generate" body={{ year }} success="Saldo dibuat." />
  );
}

export function BalanceEdit({ employee, employeeId, type, year, cell }: {
  employee: string; employeeId: string; year: number;
  type: { id: string; name: string; defaultAnnualQuota: number | null };
  cell: { configured: boolean; base: number; carriedOver: number; adjustment: number; note: string | null; used: number; reserved: number };
}) {
  const [open, setOpen] = useState(false);
  const { pending, fields, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="ghost" size="icon" aria-label={`Ubah saldo ${type.name} ${employee}`}><Pencil /></Button></DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          const d = Object.fromEntries(new FormData(e.currentTarget));
          const r = await run(() => api('PUT', '/api/v1/leave/balances', { ...d, employeeId, leaveTypeId: type.id, year }), { success: 'Saldo disimpan.' });
          if (r !== undefined) setOpen(false);
        }}>
          <DialogHeader>
            <DialogTitle>Saldo {type.name} {year}</DialogTitle>
            <DialogDescription>{employee}. Terpakai {cell.used} hari{cell.reserved ? `, menunggu ${cell.reserved} hari` : ''}. Perubahan tercatat di audit log.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-3">
            <Field id="entitled" label="Hak" error={fields.entitled}><Input {...fieldProps('entitled', fields.entitled)} type="number" min={0} max={366} defaultValue={cell.configured ? cell.base : type.defaultAnnualQuota ?? 0} /></Field>
            <Field id="carriedOver" label="Sisa tahun lalu" error={fields.carriedOver}><Input {...fieldProps('carriedOver', fields.carriedOver)} type="number" min={0} max={366} defaultValue={cell.carriedOver} /></Field>
            <Field id="adjustment" label="Penyesuaian" error={fields.adjustment}><Input {...fieldProps('adjustment', fields.adjustment)} type="number" min={-366} max={366} defaultValue={cell.adjustment} /></Field>
          </div>
          <Field id="note" label="Catatan" error={fields.note} hint="Mis. dasar penyesuaian."><Input {...fieldProps('note', fields.note, true)} defaultValue={cell.note ?? ''} maxLength={300} /></Field>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button type="submit" disabled={pending}>{pending ? 'Menyimpan...' : 'Simpan'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
