'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import { Download, KeyRound, ShieldPlus, Trash2, UserCheck, UserX, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { TableCell, TableHead } from '@/components/ui/table';
import { Field, fieldProps } from '@/components/app/field';
import { api, useAction } from '@/components/app/api-client';
import { confirmDialog } from '@/components/app/confirm-dialog';
import { cn } from '@/lib/utils';

interface Ctx { selected: Set<string>; pageIds: string[]; toggle: (id: string, on: boolean) => void; toggleAll: (on: boolean) => void; clear: () => void }
const BulkContext = createContext<Ctx | null>(null);
const useBulk = () => {
  const c = useContext(BulkContext);
  if (!c) throw new Error('Komponen pilihan massal harus di dalam BulkSelect');
  return c;
};

/** Pembungkus tabel dengan pilihan baris. `pageIds` adalah id semua baris di halaman ini. */
export function BulkSelect({ pageIds, children }: { pageIds: string[]; children: React.ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const value = useMemo<Ctx>(() => ({
    selected: new Set([...selected].filter((id) => pageIds.includes(id))),
    pageIds,
    toggle: (id, on) => setSelected((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; }),
    toggleAll: (on) => setSelected(on ? new Set(pageIds) : new Set()),
    clear: () => setSelected(new Set()),
  }), [selected, pageIds]);
  return <BulkContext.Provider value={value}>{children}</BulkContext.Provider>;
}

export function BulkHeadCell() {
  const { selected, pageIds, toggleAll } = useBulk();
  const state = selected.size === 0 ? false : selected.size === pageIds.length ? true : 'indeterminate';
  return (
    <TableHead className="w-10 pl-4 lg:pl-6">
      <Checkbox checked={state} onCheckedChange={(v) => toggleAll(v === true)} aria-label="Pilih semua di halaman ini" />
    </TableHead>
  );
}

export function BulkRowCell({ id, name }: { id: string; name: string }) {
  const { selected, toggle } = useBulk();
  return (
    <TableCell className="w-10 pl-4 lg:pl-6 max-md:absolute max-md:top-3 max-md:right-3 max-md:w-auto max-md:p-0!">
      <Checkbox checked={selected.has(id)} onCheckedChange={(v) => toggle(id, v === true)} aria-label={`Pilih ${name}`} />
    </TableCell>
  );
}

interface Outcome { done: number; skipped: { name: string; reason: string }[]; credentials?: { name: string; username: string; password: string }[] }
type Opt = { id: string; name: string };

function csvOf(rows: NonNullable<Outcome['credentials']>) {
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return ['Nama,Username,Password sementara', ...rows.map((r) => [r.name, r.username, r.password].map(q).join(','))].join('\r\n');
}

/**
 * Bilah aksi massal. `mode` menentukan apakah id terpilih adalah id pegawai atau id pengguna.
 * Kata sandi sementara hanya tampil sekali setelah reset.
 */
export function BulkBar({ mode, roles, units, canAllUnits, canAccounts, canDelete, noun }: {
  mode: 'employee' | 'user';
  roles: Opt[];
  units: Opt[];
  canAllUnits: boolean;
  /** Punya izin kelola pengguna: tombol peran, reset password, dan (non)aktifkan akun tampil. */
  canAccounts: boolean;
  canDelete?: boolean;
  noun: string;
}) {
  const { selected, clear } = useBulk();
  const { pending, fields, error, run } = useAction();
  const [dialog, setDialog] = useState<null | 'role' | 'delete'>(null);
  const [sub, setSub] = useState(true);
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<{ title: string; outcome: Outcome } | null>(null);
  const url = mode === 'employee' ? '/api/v1/employees/bulk' : '/api/v1/users/bulk';
  const ids = [...selected];
  const send = async (body: Record<string, unknown>, title: string) => {
    const r = await run(() => api<Outcome>('POST', url, { ids, ...body }), { refresh: true });
    if (r) { setResult({ title, outcome: r }); setDialog(null); setReason(''); clear(); }
  };
  if (!ids.length && !result) return null;
  const accountNote = mode === 'employee' ? ' Pegawai yang belum punya akun dilewati.' : '';
  return (
    <>
      {ids.length > 0 && (
        <div role="region" aria-label="Aksi untuk data terpilih" className="sticky bottom-3 z-20 mx-3 mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2.5 shadow-lg max-md:bottom-[calc(5.5rem+env(safe-area-inset-bottom))]">
          <span className="px-2 text-sm font-medium"><span className="tabular-nums">{ids.length}</span> {noun} dipilih</span>
          <div className="flex flex-1 flex-wrap items-center gap-2">
            {canAccounts && <>
            <Button size="sm" variant="outline" onClick={() => setDialog('role')}><ShieldPlus />Beri peran</Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={async () => {
              if (await confirmDialog({ title: `Reset password ${ids.length} akun?`, description: `Setiap akun mendapat password sementara baru dan semua sesinya diakhiri. Password hanya ditampilkan sekali.${accountNote}`, confirmLabel: 'Reset password', destructive: true })) await send({ action: 'reset-password' }, 'Reset password');
            }}><KeyRound />Reset password</Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={async () => {
              if (await confirmDialog({ title: `Nonaktifkan ${ids.length} akun?`, description: `Sesi aktif langsung diakhiri dan pemilik akun tidak bisa masuk sampai diaktifkan lagi. Akun Anda sendiri dilewati.${accountNote}`, confirmLabel: 'Nonaktifkan', destructive: true })) await send({ action: 'deactivate' }, 'Nonaktifkan akun');
            }}><UserX />Nonaktifkan akun</Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={async () => {
              if (await confirmDialog({ title: `Aktifkan ${ids.length} akun?`, description: `Pemilik akun bisa masuk lagi.${accountNote}`, confirmLabel: 'Aktifkan' })) await send({ action: 'activate' }, 'Aktifkan akun');
            }}><UserCheck />Aktifkan akun</Button>
            </>}
            {mode === 'employee' && canDelete && <Button size="sm" variant="outline-destructive" onClick={() => setDialog('delete')}><Trash2 />Hapus data</Button>}
          </div>
          <Button size="sm" variant="ghost" onClick={clear}><X />Batal pilih</Button>
        </div>
      )}

      <Dialog open={dialog === 'role'} onOpenChange={(o) => setDialog(o ? 'role' : null)}>
        <DialogContent className="sm:max-w-md">
          <form className="grid gap-4" onSubmit={async (e) => {
            e.preventDefault();
            const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
            await send({ action: 'role', roleId: d.roleId, unitId: d.unitId || null, includeSubunits: sub }, 'Beri peran');
          }}>
            <DialogHeader><DialogTitle>Beri peran ke {ids.length} {noun}</DialogTitle><DialogDescription>Anda hanya bisa memberikan izin dan cakupan unit yang Anda miliki sendiri. Akun yang sudah memegang peran ini dilewati.{accountNote}</DialogDescription></DialogHeader>
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <Field id="bulk-roleId" label="Peran" error={fields.roleId} required>
              <NativeSelect {...fieldProps('bulk-roleId', fields.roleId)} name="roleId" required defaultValue=""><NativeSelectOption value="" disabled>Pilih peran</NativeSelectOption>{roles.map((r) => <NativeSelectOption key={r.id} value={r.id}>{r.name}</NativeSelectOption>)}</NativeSelect>
            </Field>
            <Field id="bulk-unitId" label="Cakupan unit" error={fields.unitId}>
              <NativeSelect {...fieldProps('bulk-unitId', fields.unitId)} name="unitId" defaultValue={canAllUnits ? '' : units[0]?.id}>
                {canAllUnits && <NativeSelectOption value="">Seluruh unit</NativeSelectOption>}
                {units.map((u) => <NativeSelectOption key={u.id} value={u.id}>{u.name}</NativeSelectOption>)}
              </NativeSelect>
            </Field>
            <div className="flex items-start gap-3"><Checkbox id="bulk-sub" checked={sub} onCheckedChange={(v) => setSub(!!v)} className="mt-0.5" /><Label htmlFor="bulk-sub" className="font-normal">Termasuk sub-unit</Label></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setDialog(null)}>Batal</Button><Button type="submit" disabled={pending}>{pending ? 'Menyimpan...' : 'Berikan peran'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'delete'} onOpenChange={(o) => setDialog(o ? 'delete' : null)}>
        <DialogContent className="sm:max-w-md">
          <form className="grid gap-4" onSubmit={async (e) => { e.preventDefault(); await send({ action: 'delete', reason }, 'Hapus data pegawai'); }}>
            <DialogHeader><DialogTitle>Hapus data {ids.length} pegawai?</DialogTitle><DialogDescription>Pegawai disembunyikan dari daftar, akun login ditutup, data wajah dihapus, dan NIP serta ID mesin bisa dipakai lagi. Riwayat absensi dan audit tetap tersimpan. Akun Anda sendiri dan pemegang peran Super Admin dilewati.</DialogDescription></DialogHeader>
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <Field id="bulk-reason" label="Alasan" error={fields.reason} required>
              <Textarea {...fieldProps('bulk-reason', fields.reason)} name="reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} maxLength={300} />
            </Field>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setDialog(null)}>Batal</Button><Button type="submit" variant="destructive" disabled={pending || reason.trim().length < 3}>{pending ? 'Menghapus...' : 'Hapus data'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!result} onOpenChange={(o) => { if (!o) setResult(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{result?.title}</DialogTitle><DialogDescription>{result?.outcome.done} berhasil{result?.outcome.skipped.length ? `, ${result.outcome.skipped.length} dilewati` : ''}.</DialogDescription></DialogHeader>
          {result?.outcome.credentials && result.outcome.credentials.length > 0 && (
            <Alert variant="success">
              <AlertTitle>Password sementara</AlertTitle>
              <AlertDescription className="grid gap-2">
                <p>Hanya ditampilkan sekali. Unduh lalu sampaikan ke pemiliknya; mereka wajib menggantinya saat masuk.</p>
                <Button size="sm" variant="outline" className="w-fit" onClick={() => {
                  const url = URL.createObjectURL(new Blob([`﻿${csvOf(result.outcome.credentials!)}`], { type: 'text/csv;charset=utf-8' }));
                  const a = document.createElement('a');
                  a.href = url; a.download = 'password-sementara.csv'; a.click();
                  URL.revokeObjectURL(url);
                }}><Download />Unduh CSV</Button>
                <ul className="max-h-48 divide-y overflow-y-auto rounded-md border bg-card text-sm">
                  {result.outcome.credentials.map((c) => <li key={c.username} className="flex flex-wrap justify-between gap-x-3 px-3 py-1.5"><span>{c.name}<span className="ml-2 text-muted-foreground">{c.username}</span></span><code className="font-semibold select-all">{c.password}</code></li>)}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          {result && result.outcome.skipped.length > 0 && (
            <Alert variant="warning">
              <AlertTitle>Dilewati</AlertTitle>
              <AlertDescription>
                <ul className={cn('max-h-48 list-disc overflow-y-auto pl-4 text-sm')}>
                  {result.outcome.skipped.map((s, i) => <li key={i}><b>{s.name}</b>: {s.reason}</li>)}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter><Button onClick={() => setResult(null)}>Selesai</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
