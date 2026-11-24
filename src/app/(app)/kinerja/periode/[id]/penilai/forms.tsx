'use client';

import { useState } from 'react';
import { ArrowRight, BellRing, Check, CircleDashed, Plus, Shuffle, Trash2, UserRoundPen, Workflow } from 'lucide-react';
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

/** Cara 1: sistem membagi penilai otomatis untuk semua pegawai, atau satu unit saja. */
export function AutoAssignCard({ periodId, units, peerCount }: { periodId: string; units: Unit[]; peerCount: number }) {
  const { pending, fields, run } = useAction();
  const [reset, setReset] = useState(false);
  const [sub, setSub] = useState(true);
  const [count, setCount] = useState(String(peerCount));
  const [unitId, setUnitId] = useState('');
  const unit = units.find((u) => u.id === unitId)?.name;
  return (
    <Card>
      <CardHeader>
        <p className="text-xs font-medium text-primary">Cara 1, otomatis</p>
        <CardTitle className="flex items-center gap-2"><Shuffle className="size-4 text-primary" aria-hidden />Acak penilai untuk semua pegawai</CardTitle>
        <CardDescription>Pegawai dinilai oleh atasan langsungnya dan beberapa rekan yang dipilih acak, mendahulukan rekan satu unit. Hasilnya bisa diubah satu per satu di daftar bawah.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          if (reset && !(await confirmDialog({ title: 'Acak ulang penilai rekan?', description: 'Penugasan rekan yang belum dinilai dihapus lalu diacak ulang. Penilai atasan dan penilaian yang sudah dikirim tetap.', confirmLabel: 'Acak ulang', destructive: true }))) return;
          await run(() => api<{ created: number; removed: number }>('POST', `${base(periodId)}/auto`, { peerCount: Number(count), reset, unitId: unitId || null, includeSubunits: sub }), { success: (r) => `${r.created} penugasan dibuat${r.removed ? `, ${r.removed} diacak ulang` : ''}.` });
        }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="peerCount" label="Jumlah rekan penilai per pegawai" error={fields.peerCount}><Input {...fieldProps('peerCount', fields.peerCount)} type="number" min={0} max={10} value={count} onChange={(e) => setCount(e.target.value)} className="w-24 tabular" /></Field>
            <Field id="auto-unit" label="Pegawai yang diacak" error={fields.unitId}>
              <NativeSelect {...fieldProps('auto-unit', fields.unitId)} value={unitId} onChange={(e) => setUnitId(e.target.value)}><NativeSelectOption value="">Semua unit</NativeSelectOption>{units.map((u) => <NativeSelectOption key={u.id} value={u.id}>Hanya {u.name}</NativeSelectOption>)}</NativeSelect>
            </Field>
          </div>
          {unitId && <div className="flex items-start gap-3"><Checkbox id="auto-sub" checked={sub} onCheckedChange={(v) => setSub(!!v)} className="mt-0.5" /><Label htmlFor="auto-sub" className="font-normal">Termasuk sub-unit</Label></div>}
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-sm font-medium">Penilai yang sudah ada</legend>
            {([[false, 'Pertahankan, hanya lengkapi pegawai yang penilainya kurang'], [true, 'Acak ulang dari awal (rekan yang belum menilai dihapus)']] as const).map(([k, l]) => (
              <label key={String(k)} className="flex min-h-9 items-start gap-2 text-sm"><input type="radio" name="reset" checked={reset === k} onChange={() => setReset(k)} className="mt-1 size-4 accent-[var(--primary)]" />{l}</label>
            ))}
          </fieldset>
          <p className="rounded-lg bg-muted px-3 py-2 text-sm">Hasil: {unit ? `pegawai ${unit}` : 'setiap pegawai'} dinilai atasan langsung dan {Number(count) || 0} rekan acak.</p>
          <Button type="submit" className="w-fit" disabled={pending}>{pending ? 'Mengacak...' : reset ? 'Acak ulang penilai' : 'Acak penilai sekarang'}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** Cara 2: tentukan unit mana yang menilai unit mana. */
export function UnitMapCard({ periodId, units }: { periodId: string; units: Unit[] }) {
  const { pending, fields, run } = useAction();
  const [mode, setMode] = useState<'SEMUA' | 'ACAK'>('ACAK');
  const [sub, setSub] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [per, setPer] = useState('3');
  const name = (id: string) => units.find((u) => u.id === id)?.name;
  const ready = from && to;
  return (
    <Card>
      <CardHeader>
        <p className="text-xs font-medium text-primary">Cara 2, per unit</p>
        <CardTitle className="flex items-center gap-2"><Workflow className="size-4 text-primary" aria-hidden />Tentukan unit mana menilai unit mana</CardTitle>
        <CardDescription>Contoh: pegawai Unit A menilai pegawai Unit B. Pemetaan ini ditambahkan ke penilai yang sudah ada dan bisa diulang untuk pasangan unit lain.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          await run(() => api<{ created: number; assessors: number; targets: number }>('POST', `${base(periodId)}/map-units`, { assessorUnitId: from, targetUnitId: to, mode, perTarget: Number(per || 3), includeSubunits: sub }),
            { success: (r) => `${r.created} penugasan dibuat dari ${r.assessors} penilai untuk ${r.targets} pegawai.` });
        }}>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
            <Field id="assessorUnitId" label="Unit yang menilai" error={fields.assessorUnitId} required>
              <NativeSelect {...fieldProps('assessorUnitId', fields.assessorUnitId)} required value={from} onChange={(e) => setFrom(e.target.value)}><NativeSelectOption value="" disabled>Pilih unit</NativeSelectOption>{units.map((u) => <NativeSelectOption key={u.id} value={u.id}>{u.name}</NativeSelectOption>)}</NativeSelect>
            </Field>
            <span className="hidden pb-2 text-muted-foreground sm:block" aria-hidden><ArrowRight className="size-4" /></span>
            <Field id="targetUnitId" label="Unit yang dinilai" error={fields.targetUnitId} required>
              <NativeSelect {...fieldProps('targetUnitId', fields.targetUnitId)} required value={to} onChange={(e) => setTo(e.target.value)}><NativeSelectOption value="" disabled>Pilih unit</NativeSelectOption>{units.map((u) => <NativeSelectOption key={u.id} value={u.id}>{u.name}</NativeSelectOption>)}</NativeSelect>
            </Field>
          </div>
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-sm font-medium">Cara membagi</legend>
            {([['ACAK', 'Acak per pegawai', 'Setiap pegawai yang dinilai mendapat beberapa penilai acak dari unit penilai.'], ['SEMUA', 'Semua menilai semua', 'Setiap pegawai di unit penilai menilai setiap pegawai di unit yang dinilai.']] as const).map(([k, l, d]) => (
              <label key={k} className="flex min-h-9 items-start gap-2 text-sm"><input type="radio" name="mode" checked={mode === k} onChange={() => setMode(k)} className="mt-1 size-4 accent-[var(--primary)]" /><span><span className="font-medium">{l}</span><span className="block text-muted-foreground">{d}</span></span></label>
            ))}
          </fieldset>
          {mode === 'ACAK' && <Field id="perTarget" label="Jumlah penilai per pegawai yang dinilai" error={fields.perTarget}><Input {...fieldProps('perTarget', fields.perTarget)} type="number" min={1} max={20} value={per} onChange={(e) => setPer(e.target.value)} className="w-24 tabular" /></Field>}
          <div className="flex items-start gap-3"><Checkbox id="map-sub" checked={sub} onCheckedChange={(v) => setSub(!!v)} className="mt-0.5" /><Label htmlFor="map-sub" className="font-normal">Sertakan pegawai di sub-unit kedua unit</Label></div>
          <p className="rounded-lg bg-muted px-3 py-2 text-sm">{ready ? <>Hasil: pegawai <b>{name(from)}</b> menilai pegawai <b>{name(to)}</b>, {mode === 'ACAK' ? `${Number(per) || 0} penilai acak untuk tiap pegawai` : 'semua menilai semua'}.</> : 'Pilih unit penilai dan unit yang dinilai untuk melihat hasilnya.'}</p>
          <Button type="submit" className="w-fit" disabled={pending || !ready}>{pending ? 'Memetakan...' : 'Terapkan pemetaan'}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** Hapus semua penugasan yang belum dinilai pada periode. */
export function ClearAllButton({ periodId, pendingCount }: { periodId: string; pendingCount: number }) {
  const { pending, run } = useAction();
  return (
    <Button variant="outline" className="text-destructive hover:text-destructive" disabled={pending || pendingCount === 0}
      onClick={async () => {
        if (!(await confirmDialog({ title: 'Hapus semua penilai?', description: `${pendingCount} penugasan yang belum dinilai dihapus, termasuk atasan dan rekan. Penilaian yang sudah dikirim tetap tersimpan. Setelah itu Anda bisa mengacak atau memetakan ulang.`, confirmLabel: 'Hapus semua', destructive: true }))) return;
        await run(() => api<{ removed: number; kept: number }>('POST', `${base(periodId)}/clear`), { success: (r) => `${r.removed} penugasan dihapus${r.kept ? `, ${r.kept} yang sudah dinilai dipertahankan` : ''}.` });
      }}>
      <Trash2 />Hapus semua penilai
    </Button>
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
