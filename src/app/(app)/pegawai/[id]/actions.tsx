'use client';

import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, fieldProps } from '@/components/app/field';
import { api, useAction } from '@/components/app/api-client';

type Mode = null | 'status' | 'revoke' | 'credential';

export function EmployeeActions({ id, name, isActive, hasAccount, hasNip, hasFace, can }: {
  id: string; name: string; isActive: boolean; hasAccount: boolean; hasNip: boolean; hasFace: boolean;
  can: { deactivate: boolean; write: boolean; biometric: boolean };
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [cred, setCred] = useState<{ username: string; password: string } | null>(null);
  const { pending, fields, run } = useAction();
  if (!can.deactivate && !can.write && !can.biometric) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="outline" aria-label="Tindakan lain"><MoreHorizontal />Lainnya</Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {can.write && hasNip && !hasAccount && <DropdownMenuItem onSelect={async () => { const r = await run(() => api<{ username: string; password: string }>('POST', `/api/v1/employees/${id}/account`), { success: 'Akun dibuat.' }); if (r) { setCred(r); setMode('credential'); } }}>Buat akun login</DropdownMenuItem>}
          {can.write && hasAccount && <DropdownMenuItem onSelect={async () => { const r = await run(() => api<{ username: string; password: string }>('POST', `/api/v1/employees/${id}/reset-password`), { success: 'Password direset.' }); if (r) { setCred(r); setMode('credential'); } }}>Reset password ke NIP</DropdownMenuItem>}
          {can.biometric && hasFace && <DropdownMenuItem variant="destructive" onSelect={() => setMode('revoke')}>Cabut template wajah</DropdownMenuItem>}
          {can.deactivate && <DropdownMenuItem variant={isActive ? 'destructive' : 'default'} onSelect={() => setMode('status')}>{isActive ? 'Nonaktifkan pegawai' : 'Aktifkan kembali'}</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={mode === 'status'} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent>
          <form className="grid gap-4" onSubmit={async (e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const r = await run(() => api('POST', `/api/v1/employees/${id}/status`, { active: !isActive, reason: fd.get('reason'), effectiveDate: fd.get('effectiveDate') || null }), { success: isActive ? 'Pegawai dinonaktifkan.' : 'Pegawai diaktifkan.' }); if (r !== undefined) setMode(null); }}>
            <DialogHeader>
              <DialogTitle>{isActive ? `Nonaktifkan ${name}?` : `Aktifkan kembali ${name}?`}</DialogTitle>
              <DialogDescription>{isActive ? 'Akun login ikut dinonaktifkan dan template wajah dihapus. Data dan riwayat absensi tetap tersimpan.' : 'Akun login diaktifkan kembali.'}</DialogDescription>
            </DialogHeader>
            <Field id="effectiveDate" label="Tanggal efektif" error={fields.effectiveDate} hint="Kosong = hari ini."><Input {...fieldProps('effectiveDate', fields.effectiveDate, true)} type="date" /></Field>
            <Field id="reason" label="Alasan" error={fields.reason} required><Textarea {...fieldProps('reason', fields.reason)} rows={2} required /></Field>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setMode(null)}>Batal</Button><Button type="submit" variant={isActive ? 'destructive' : 'default'} disabled={pending}>{isActive ? 'Nonaktifkan' : 'Aktifkan'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={mode === 'revoke'} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent>
          <form className="grid gap-4" onSubmit={async (e) => { e.preventDefault(); const reason = new FormData(e.currentTarget).get('reason'); const r = await run(() => api('DELETE', `/api/v1/employees/${id}/face`, { reason }), { success: 'Template wajah dicabut dan dihapus.' }); if (r !== undefined) setMode(null); }}>
            <DialogHeader>
              <DialogTitle>Cabut template wajah {name}?</DialogTitle>
              <DialogDescription>Isi template dihapus permanen. Pegawai tidak bisa absen wajah sampai mendaftar ulang.</DialogDescription>
            </DialogHeader>
            <Field id="reason" label="Alasan (mis. permintaan pegawai)" error={fields.reason} required><Textarea {...fieldProps('reason', fields.reason)} rows={2} required /></Field>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setMode(null)}>Batal</Button><Button type="submit" variant="destructive" disabled={pending}>Cabut dan hapus</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={mode === 'credential'} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Kredensial login</DialogTitle><DialogDescription>Sampaikan langsung kepada pegawai. Password wajib diganti saat masuk pertama.</DialogDescription></DialogHeader>
          {cred && <p className="rounded-md bg-muted p-3 text-sm">Username <b>{cred.username}</b><br />Password awal: sama dengan NIP</p>}
          <DialogFooter><Button onClick={() => setMode(null)}>Selesai</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
