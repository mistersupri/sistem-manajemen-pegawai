'use client';

import { useState } from 'react';
import { BellRing, Check, CircleDashed, Plus, Shuffle, Trash2, UserRoundPen, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Field, fieldProps } from '@/components/app/field';
import { api, useAction } from '@/components/app/api-client';
import { confirmDialog } from '@/components/app/confirm-dialog';
import { EmployeePicker } from '@/components/app/employee-picker';
import { cn } from '@/lib/utils';

type Unit = { id: string; name: string };
const base = (id: string) => `/api/v1/assessments/periods/${id}`;

/** Acak penilai rekan untuk semua pegawai atau satu unit. */
export function AutoAssignCard({ periodId, units, peerCount }: { periodId: string; units: Unit[]; peerCount: number }) {
  const { pending, fields, run } = useAction();
  const [reset, setReset] = useState(false);
  const [sub, setSub] = useState(true);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Shuffle className="size-4 text-primary" aria-hidden />Acak penilai</CardTitle>
        <CardDescription>Sistem memilih rekan penilai secara acak, mendahulukan rekan satu unit dan menyebar beban merata. Hasilnya bisa diubah satu per satu di daftar bawah.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-3" onSubmit={async (e) => {
          e.preventDefault();
          const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
          if (reset && !(await confirmDialog({ title: 'Acak ulang penilai rekan?', description: 'Penugasan rekan yang belum dinilai dihapus lalu diacak ulang. Penilai atasan dan penilaian yang sudah dikirim tetap.', confirmLabel: 'Acak ulang', destructive: true }))) return;
          await run(() => api<{ created: number; removed: number }>('POST', `${base(periodId)}/auto`, { peerCount: Number(d.peerCount), reset, unitId: d.unitId || null, includeSubunits: sub }), { success: (r) => `${r.created} penugasan dibuat${r.removed ? `, ${r.removed} diacak ulang` : ''}.` });
        }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="peerCount" label="Rekan penilai per pegawai" error={fields.peerCount}><Input {...fieldProps('peerCount', fields.peerCount)} type="number" min={0} max={10} defaultValue={peerCount} className="w-24 tabular" /></Field>
            <Field id="auto-unit" label="Hanya untuk unit (opsional)" error={fields.unitId}>
              <NativeSelect {...fieldProps('auto-unit', fields.unitId)} name="unitId" defaultValue=""><NativeSelectOption value="">Semua unit</NativeSelectOption>{units.map((u) => <NativeSelectOption key={u.id} value={u.id}>{u.name}</NativeSelectOption>)}</NativeSelect>
            </Field>
          </div>
          <div className="flex items-start gap-3"><Checkbox id="auto-sub" checked={sub} onCheckedChange={(v) => setSub(!!v)} className="mt-0.5" /><Label htmlFor="auto-sub" className="font-normal">Termasuk sub-unit</Label></div>
          <div className="flex items-start gap-3"><Checkbox id="auto-reset" checked={reset} onCheckedChange={(v) => setReset(!!v)} className="mt-0.5" /><Label htmlFor="auto-reset" className="leading-snug font-normal">Acak ulang dari awal (hapus rekan yang belum menilai). Tanpa ini hanya yang kurang dilengkapi.</Label></div>
          <Button type="submit" className="w-fit" disabled={pending}>{pending ? 'Mengacak...' : 'Acak penilai'}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** Pemetaan unit: unit penilai menilai unit yang dinilai, semua menilai semua atau diacak per pegawai. */
export function UnitMapCard({ periodId, units }: { periodId: string; units: Unit[] }) {
  const { pending, fields, run } = useAction();
  const [mode, setMode] = useState<'SEMUA' | 'ACAK'>('ACAK');
  const [sub, setSub] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Workflow className="size-4 text-primary" aria-hidden />Pemetaan unit</CardTitle>
        <CardDescription>Pegawai di satu unit menilai pegawai di unit lain. Pilih semua menilai semua, atau acak per pegawai: tiap pegawai yang dinilai mendapat sejumlah penilai acak dari unit penilai.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-3" onSubmit={async (e) => {
          e.preventDefault();
          const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
          await run(() => api<{ created: number; assessors: number; targets: number }>('POST', `${base(periodId)}/map-units`, { assessorUnitId: d.assessorUnitId, targetUnitId: d.targetUnitId, mode, perTarget: Number(d.perTarget || 3), includeSubunits: sub }),
            { success: (r) => `${r.created} penugasan dibuat dari ${r.assessors} penilai untuk ${r.targets} pegawai.` });
        }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="assessorUnitId" label="Unit penilai" error={fields.assessorUnitId} required>
              <NativeSelect {...fieldProps('assessorUnitId', fields.assessorUnitId)} required defaultValue=""><NativeSelectOption value="" disabled>Pilih unit</NativeSelectOption>{units.map((u) => <NativeSelectOption key={u.id} value={u.id}>{u.name}</NativeSelectOption>)}</NativeSelect>
            </Field>
            <Field id="targetUnitId" label="Unit yang dinilai" error={fields.targetUnitId} required>
              <NativeSelect {...fieldProps('targetUnitId', fields.targetUnitId)} required defaultValue=""><NativeSelectOption value="" disabled>Pilih unit</NativeSelectOption>{units.map((u) => <NativeSelectOption key={u.id} value={u.id}>{u.name}</NativeSelectOption>)}</NativeSelect>
            </Field>
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Cara membagi</legend>
            {([['ACAK', 'Acak per pegawai'], ['SEMUA', 'Semua menilai semua']] as const).map(([k, l]) => (
              <label key={k} className="inline-flex min-h-9 items-center gap-2 text-sm"><input type="radio" name="mode" checked={mode === k} onChange={() => setMode(k)} className="size-4 accent-[var(--primary)]" />{l}</label>
            ))}
          </fieldset>
          {mode === 'ACAK' && <Field id="perTarget" label="Penilai per pegawai yang dinilai" error={fields.perTarget}><Input {...fieldProps('perTarget', fields.perTarget)} type="number" min={1} max={20} defaultValue={3} className="w-24 tabular" /></Field>}
          <div className="flex items-start gap-3"><Checkbox id="map-sub" checked={sub} onCheckedChange={(v) => setSub(!!v)} className="mt-0.5" /><Label htmlFor="map-sub" className="font-normal">Termasuk sub-unit dari kedua unit</Label></div>
          <Button type="submit" className="w-fit" disabled={pending}>{pending ? 'Memetakan...' : 'Petakan unit'}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function RemindButton({ periodId, pendingCount }: { periodId: string; pendingCount: number }) {
  const { pending, run } = useAction();
  return (
    <Button variant="outline" disabled={pending || pendingCount === 0} onClick={() => run(() => api<{ reminded: number }>('POST', `${base(periodId)}/remind`), { success: (r) => `${r.reminded} penilai diingatkan.` })}>
      <BellRing />Ingatkan yang belum selesai
    </Button>
  );
}

/** Satu penilai pada seorang pegawai: status selesai/belum, dan (selama belum menilai) ganti atau hapus. */
export function AssessorChip({ id, name, unit, role, status, source }: { id: string; name: string; unit: string | null; role: string; status: 'PENDING' | 'SUBMITTED'; source: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const { pending, fields, run } = useAction();
  const done = status === 'SUBMITTED';
  return (
    <li className={cn('flex items-center gap-1.5 rounded-lg border py-1 pr-1 pl-2 text-sm', done ? 'border-[#7ee2a8] bg-[#7ee2a8]/10' : 'bg-card')}>
      {done ? <Check className="size-3.5 shrink-0 text-[#15803d]" aria-label="Sudah menilai" /> : <CircleDashed className="size-3.5 shrink-0 text-muted-foreground" aria-label="Belum menilai" />}
      <span className="min-w-0"><span className="font-medium">{name}</span>{unit && <span className="ml-1 text-xs text-muted-foreground">{unit}</span>}<span className="ml-1.5 text-xs text-muted-foreground">{role === 'ATASAN' ? 'atasan' : source === 'AUTO' ? 'acak' : source === 'UNIT' ? 'unit' : 'manual'}</span></span>
      {!done && (
        <span className="ml-1 flex">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button type="button" variant="ghost" size="icon" className="size-8" aria-label={`Ganti penilai ${name}`}><UserRoundPen /></Button></DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <form className="grid gap-4" onSubmit={async (e) => { e.preventDefault(); const r = await run(() => api('PATCH', `/api/v1/assessments/assignments/${id}`, { assessorId: value }), { success: 'Penilai diganti.' }); if (r !== undefined) setOpen(false); }}>
                <DialogHeader><DialogTitle>Ganti penilai</DialogTitle><DialogDescription>Menggantikan {name}. Penilai baru mendapat notifikasi.</DialogDescription></DialogHeader>
                <Field id={`re-${id}`} label="Penilai baru" error={fields.assessorId} required><EmployeePicker id={`re-${id}`} name="assessorId" purpose="nilai" required onChange={setValue} /></Field>
                <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button type="submit" disabled={pending || !value}>{pending ? 'Menyimpan...' : 'Ganti'}</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <Button type="button" variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive" aria-label={`Hapus penilai ${name}`} disabled={pending}
            onClick={async () => { if (await confirmDialog({ title: `Hapus ${name} sebagai penilai?`, description: 'Penugasan ini dihapus. Pegawai lain bisa ditambahkan atau diacak ulang.', confirmLabel: 'Hapus', destructive: true })) run(() => api('DELETE', `/api/v1/assessments/assignments/${id}`), { success: 'Penilai dihapus.' }); }}><Trash2 /></Button>
        </span>
      )}
    </li>
  );
}

/** Tambah penilai manual untuk satu pegawai. */
export function AddAssessor({ periodId, targetId, targetName, hasBoss }: { periodId: string; targetId: string; targetName: string; hasBoss: boolean }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [role, setRole] = useState('REKAN');
  const { pending, fields, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button type="button" variant="outline" size="sm" aria-label={`Tambah penilai untuk ${targetName}`}><Plus />Tambah</Button></DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form className="grid gap-4" onSubmit={async (e) => { e.preventDefault(); const r = await run(() => api('POST', `${base(periodId)}/assign`, { targetId, assessorId: value, role }), { success: 'Penilai ditambahkan.' }); if (r !== undefined) { setOpen(false); setValue(''); } }}>
          <DialogHeader><DialogTitle>Tambah penilai untuk {targetName}</DialogTitle><DialogDescription>Penilai mendapat notifikasi. Pegawai tidak bisa menilai dirinya sendiri.</DialogDescription></DialogHeader>
          <Field id={`add-${targetId}`} label="Penilai" error={fields.assessorId} required><EmployeePicker id={`add-${targetId}`} name="assessorId" purpose="nilai" required onChange={setValue} /></Field>
          <Field id={`role-${targetId}`} label="Sebagai" error={fields.role}>
            <NativeSelect {...fieldProps(`role-${targetId}`, fields.role)} value={role} onChange={(e) => setRole(e.target.value)}>
              <NativeSelectOption value="REKAN">Rekan</NativeSelectOption>
              <NativeSelectOption value="ATASAN" disabled={hasBoss}>Atasan langsung{hasBoss ? ' (sudah ada)' : ''}</NativeSelectOption>
            </NativeSelect>
          </Field>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button type="submit" disabled={pending || !value}>{pending ? 'Menyimpan...' : 'Tambahkan'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
