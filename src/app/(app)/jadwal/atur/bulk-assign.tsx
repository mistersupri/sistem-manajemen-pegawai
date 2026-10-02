'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Users } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { Field, fieldProps } from '@/components/app/field';
import { api, useAction } from '@/components/app/api-client';
import { cn } from '@/lib/utils';

type Unit = { id: string; name: string; parentId: string | null };
type Schedule = { id: string; name: string; code: string; checkIn: string; checkOut: string; color: string };
type Emp = { id: string; name: string; nip: string | null; position: string | null; unitId: string | null; unit: string | null; current: string | null; currentSource: string };

const HARI = [[1, 'Sen'], [2, 'Sel'], [3, 'Rab'], [4, 'Kam'], [5, 'Jum'], [6, 'Sab'], [0, 'Min']] as const;
const SOURCE: Record<string, string> = { PEGAWAI: 'tetap pegawai', UNIT: 'ikut unit', SEMENTARA: 'sementara', TANPA_JADWAL: 'tanpa jadwal' };

export function BulkAssign({ employees, units, schedules, today }: { employees: Emp[]; units: Unit[]; schedules: Schedule[]; today: string }) {
  const router = useRouter();
  const [unit, setUnit] = useState('');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [kind, setKind] = useState<'TETAP' | 'SEMENTARA'>('TETAP');
  const [byDay, setByDay] = useState(false);
  const [days, setDays] = useState<number[]>([6]);
  const [done, setDone] = useState<{ employees: number; assignments: number } | null>(null);
  const { pending, fields, error, run } = useAction();

  const subtree = useMemo(() => {
    if (!unit) return null;
    const out = new Set([unit]);
    let grew = true;
    while (grew) { grew = false; for (const u of units) if (u.parentId && out.has(u.parentId) && !out.has(u.id)) { out.add(u.id); grew = true; } }
    return out;
  }, [unit, units]);
  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return employees.filter((e) => (!subtree || (e.unitId && subtree.has(e.unitId))) && (!term || e.name.toLowerCase().includes(term) || (e.nip ?? '').includes(term) || (e.position ?? '').toLowerCase().includes(term)));
  }, [employees, subtree, q]);
  const allVisible = visible.length > 0 && visible.every((e) => sel.has(e.id));
  const someVisible = visible.some((e) => sel.has(e.id));

  const toggle = (id: string, on: boolean) => setSel((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const toggleVisible = (on: boolean) => setSel((s) => { const n = new Set(s); for (const e of visible) if (on) n.add(e.id); else n.delete(e.id); return n; });

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const payload = {
      employeeIds: [...sel], kind, scheduleId: d.scheduleId || null, startDate: d.startDate, endDate: d.endDate || null,
      weekdays: kind === 'SEMENTARA' && byDay ? days : null, note: d.note || null,
    };
    const r = await run(() => api<{ employees: number; assignments: number }>('POST', '/api/v1/schedules/assignments/bulk', payload), {
      success: (x) => `Jadwal diterapkan ke ${x.employees} pegawai.`,
    });
    if (r) { setDone(r); setSel(new Set()); router.refresh(); }
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="min-w-0 rounded-xl border bg-card" aria-labelledby="pilihPegawai">
        <div className="grid gap-3 border-b p-4 sm:grid-cols-[1fr_1fr]">
          <h2 id="pilihPegawai" className="sr-only">Pilih pegawai</h2>
          <div className="grid gap-2">
            <Label htmlFor="unitFilter">Unit kerja</Label>
            <NativeSelect id="unitFilter" value={unit} onChange={(e) => setUnit(e.target.value)}>
              <NativeSelectOption value="">Semua unit dalam kewenangan</NativeSelectOption>
              {units.map((u) => <NativeSelectOption key={u.id} value={u.id}>{u.name}</NativeSelectOption>)}
            </NativeSelect>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cari">Cari</Label>
            <div className="relative"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input id="cari" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nama, NIP, atau jabatan" className="rounded-full pl-9" /></div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5 text-sm">
          <label className="flex min-h-9 items-center gap-2 font-medium">
            <Checkbox checked={allVisible ? true : someVisible ? 'indeterminate' : false} onCheckedChange={(v) => toggleVisible(v === true)} disabled={!visible.length} aria-label="Pilih semua pegawai yang tampil" />
            Pilih semua yang tampil ({visible.length})
          </label>
          <span className="ml-auto text-muted-foreground">{sel.size} dipilih</span>
          {sel.size > 0 && <Button type="button" size="sm" variant="ghost" onClick={() => setSel(new Set())}>Kosongkan</Button>}
        </div>
        <ul className="max-h-[calc(100dvh-20rem)] min-h-64 divide-y overflow-y-auto">
          {visible.length === 0 && <li className="px-4 py-10 text-center text-sm text-muted-foreground">Tidak ada pegawai untuk filter ini.</li>}
          {visible.map((e) => (
            <li key={e.id}>
              <label className={cn('flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-accent/50', sel.has(e.id) && 'bg-accent/60')}>
                <Checkbox checked={sel.has(e.id)} onCheckedChange={(v) => toggle(e.id, v === true)} aria-label={e.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{e.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{[e.nip, e.position, e.unit].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="shrink-0 text-right text-xs">
                  <span className="block font-semibold tabular">{e.current ?? '-'}</span>
                  <span className="block text-muted-foreground">{SOURCE[e.currentSource] ?? e.currentSource}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <form onSubmit={submit} className="grid gap-4 rounded-xl border bg-card p-4 lg:sticky lg:top-4" aria-label="Jadwal yang diterapkan">
        <h2 className="flex items-center gap-2 font-semibold"><Users className="size-4 text-primary" aria-hidden />{sel.size ? `Terapkan ke ${sel.size} pegawai` : 'Pilih pegawai di daftar'}</h2>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {done && !error && <Alert variant="success"><AlertTitle>Tersimpan</AlertTitle><AlertDescription>{done.assignments} penugasan untuk {done.employees} pegawai. Kolom jadwal di daftar sudah diperbarui.</AlertDescription></Alert>}
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Jenis penugasan</legend>
          <div className="grid grid-cols-2 gap-1 rounded-full border p-1">
            {(['TETAP', 'SEMENTARA'] as const).map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={cn('min-h-9 rounded-full text-sm font-medium', kind === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{k === 'TETAP' ? 'Tetap' : 'Sementara'}</button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">{kind === 'TETAP' ? 'Jadwal rutin sejak tanggal mulai sampai diganti. Libur nasional dan hari nonkerja jadwal tetap berlaku.' : 'Menggantikan jadwal rutin pada rentang tanggal, termasuk di hari libur. Cocok untuk piket, shift, atau tugas khusus.'}</p>
        </fieldset>
        <Field id="scheduleId" label="Jadwal" error={fields.scheduleId} required={kind === 'TETAP'}>
          <NativeSelect key={kind} {...fieldProps('scheduleId', fields.scheduleId)} defaultValue="" required={kind === 'TETAP'}>
            <NativeSelectOption value="" disabled={kind === 'TETAP'}>{kind === 'TETAP' ? 'Pilih jadwal' : 'Libur (tanpa jadwal)'}</NativeSelectOption>
            {schedules.map((s) => <NativeSelectOption key={s.id} value={s.id}>{`${s.code}, ${s.name} (${s.checkIn} sampai ${s.checkOut})`}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="startDate" label="Mulai" error={fields.startDate} required><Input {...fieldProps('startDate', fields.startDate)} type="date" defaultValue={today} required /></Field>
          <Field id="endDate" label="Sampai" error={fields.endDate} required={kind === 'SEMENTARA'} hint={kind === 'TETAP' ? 'Boleh kosong' : undefined}><Input {...fieldProps('endDate', fields.endDate, kind === 'TETAP')} type="date" required={kind === 'SEMENTARA'} /></Field>
        </div>
        {kind === 'SEMENTARA' && (
          <fieldset className="grid gap-2">
            <label className="flex items-center gap-2 text-sm font-medium"><Checkbox checked={byDay} onCheckedChange={(v) => setByDay(v === true)} />Hanya pada hari tertentu</label>
            {byDay && (
              <div className="flex flex-wrap gap-1" role="group" aria-label="Hari">
                {HARI.map(([d, label]) => (
                  <button key={d} type="button" aria-pressed={days.includes(d)} onClick={() => setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]))}
                    className={cn('min-h-9 min-w-11 rounded-md border px-2 text-sm font-medium', days.includes(d) ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent')}>{label}</button>
                ))}
              </div>
            )}
            {fields.weekdays && <p className="text-xs font-medium text-destructive">{fields.weekdays}</p>}
            {byDay && <p className="text-xs text-muted-foreground">Mis. piket setiap Sabtu dalam rentang tanggal di atas.</p>}
          </fieldset>
        )}
        <Field id="note" label="Catatan" error={fields.note}><Textarea {...fieldProps('note', fields.note)} maxLength={300} rows={2} placeholder="Mis. SK Kepala Dinas No. ..." /></Field>
        {fields.employeeIds && <p className="text-sm font-medium text-destructive">{fields.employeeIds}</p>}
        <Button type="submit" size="lg" disabled={pending || sel.size === 0 || (byDay && kind === 'SEMENTARA' && days.length === 0)}>{pending ? 'Menyimpan...' : sel.size ? `Terapkan ke ${sel.size} pegawai` : 'Pilih pegawai dulu'}</Button>
      </form>
    </div>
  );
}
