'use client';

import { useState } from 'react';
import { CloudDownload, Pencil, Plus, Upload, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Field, fieldProps } from '@/components/app/field';
import { confirmDialog } from '@/components/app/confirm-dialog';
import { api, useAction } from '@/components/app/api-client';
import { cn } from '@/lib/utils';

const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const ORDER = [1, 2, 3, 4, 5, 6, 0];

export interface ScheduleValues {
  id: string; code: string; name: string; kind: string; checkIn: string; checkOut: string; breakStart: string | null; breakEnd: string | null;
  lateToleranceMin: number; earlyLeaveToleranceMin: number; workdays: number[]; color: string; version: number;
}

export function ScheduleForm({ initial }: { initial?: ScheduleValues }) {
  const editing = !!initial;
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<number[]>(initial?.workdays ?? [1, 2, 3, 4, 5]);
  const { pending, fields, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{editing ? <Button variant="outline" size="sm"><Pencil />Ubah</Button> : <Button><Plus />Tambah jadwal</Button>}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <form className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, unknown>;
          const data = { ...d, workdays: days };
          const r = await run(() => (editing ? api('PATCH', `/api/v1/schedules/${initial!.id}`, data) : api('POST', '/api/v1/schedules', data)), { success: 'Jadwal disimpan.' });
          if (r !== undefined) setOpen(false);
        }}>
          <DialogHeader>
            <DialogTitle>{editing ? `Ubah jadwal ${initial!.code}` : 'Tambah jadwal kerja'}</DialogTitle>
            <DialogDescription>
              {editing ? `Saat ini versi ${initial!.version}. Perubahan aturan membuat versi baru; rekap lama tetap mencatat versi yang dipakai saat dihitung.` : 'Jam, toleransi, dan hari kerja mengikuti aturan instansi Anda. Jadwal yang melewati tengah malam otomatis dihitung sebagai shift malam.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-[8rem_1fr_10rem]">
            <Field id="code" label="Kode" error={fields.code} required><Input {...fieldProps('code', fields.code)} defaultValue={initial?.code} required maxLength={10} /></Field>
            <Field id="name" label="Nama" error={fields.name} required><Input {...fieldProps('name', fields.name)} defaultValue={initial?.name} required /></Field>
            <Field id="kind" label="Jenis" error={fields.kind}>
              <NativeSelect {...fieldProps('kind', fields.kind)} defaultValue={initial?.kind ?? 'REGULER'}><NativeSelectOption value="REGULER">Reguler</NativeSelectOption><NativeSelectOption value="SHIFT">Shift</NativeSelectOption></NativeSelect>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field id="checkIn" label="Jam masuk" error={fields.checkIn} required><Input {...fieldProps('checkIn', fields.checkIn)} type="time" defaultValue={initial?.checkIn ?? '07:30'} required /></Field>
            <Field id="checkOut" label="Jam pulang" error={fields.checkOut} required><Input {...fieldProps('checkOut', fields.checkOut)} type="time" defaultValue={initial?.checkOut ?? '16:00'} required /></Field>
            <Field id="breakStart" label="Mulai istirahat" error={fields.breakStart}><Input {...fieldProps('breakStart', fields.breakStart)} type="time" defaultValue={initial?.breakStart ?? ''} /></Field>
            <Field id="breakEnd" label="Selesai istirahat" error={fields.breakEnd}><Input {...fieldProps('breakEnd', fields.breakEnd)} type="time" defaultValue={initial?.breakEnd ?? ''} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field id="lateToleranceMin" label="Toleransi terlambat (menit)" error={fields.lateToleranceMin}><Input {...fieldProps('lateToleranceMin', fields.lateToleranceMin)} type="number" min={0} max={240} defaultValue={initial?.lateToleranceMin ?? 0} /></Field>
            <Field id="earlyLeaveToleranceMin" label="Toleransi pulang awal (menit)" error={fields.earlyLeaveToleranceMin}><Input {...fieldProps('earlyLeaveToleranceMin', fields.earlyLeaveToleranceMin)} type="number" min={0} max={240} defaultValue={initial?.earlyLeaveToleranceMin ?? 0} /></Field>
            <Field id="color" label="Warna penanda" error={fields.color}><Input {...fieldProps('color', fields.color)} type="color" className="h-9 p-1" defaultValue={initial?.color ?? '#2a78d6'} /></Field>
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Hari kerja</legend>
            <div className="flex flex-wrap gap-2">
              {ORDER.map((d) => (
                <label key={d} className={cn('inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm', days.includes(d) && 'border-primary bg-accent')}>
                  <Checkbox checked={days.includes(d)} onCheckedChange={(v) => setDays((x) => (v ? [...x, d] : x.filter((y) => y !== d)))} />{HARI[d]}
                </label>
              ))}
            </div>
            {fields.workdays && <p className="text-sm font-medium text-destructive" role="alert">{fields.workdays}</p>}
          </fieldset>
          {editing && (
            <Field id="changeNote" label="Alasan perubahan" error={fields.changeNote} hint="Wajib bila jam, toleransi, atau hari kerja berubah. Tercatat di riwayat versi.">
              <Textarea {...fieldProps('changeNote', fields.changeNote, true)} rows={2} />
            </Field>
          )}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button type="submit" disabled={pending}>{pending ? 'Menyimpan...' : 'Simpan'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Opt = { id: string; name: string };

export function AssignmentForm({ schedules, employees, units, canAllUnits }: { schedules: (Opt & { code: string })[]; employees: (Opt & { unit: string | null })[]; units: Opt[]; canAllUnits: boolean }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<'employee' | 'unit'>('employee');
  const [kind, setKind] = useState('TETAP');
  const { pending, fields, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus />Tambah penugasan</Button></DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <form className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
          const data = {
            kind, scheduleId: d.scheduleId || null, startDate: d.startDate, endDate: d.endDate || null, note: d.note || null,
            employeeId: target === 'employee' ? d.employeeId || null : null, unitId: target === 'unit' ? d.unitId || null : null,
          };
          const r = await run(() => api('POST', '/api/v1/schedules/assignments', data), { success: 'Penugasan disimpan. Rekap yang terdampak dihitung ulang.' });
          if (r !== undefined) setOpen(false);
        }}>
          <DialogHeader>
            <DialogTitle>Tambah penugasan jadwal</DialogTitle>
            <DialogDescription>Tetap: berlaku sejak tanggal mulai sampai diganti. Sementara: menggantikan jadwal tetap pada rentang tanggal tertentu (mis. rotasi shift atau tugas khusus).</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="kind" label="Jenis penugasan">
              <NativeSelect id="kind" value={kind} onChange={(e) => setKind(e.target.value)}><NativeSelectOption value="TETAP">Tetap</NativeSelectOption><NativeSelectOption value="SEMENTARA">Sementara</NativeSelectOption></NativeSelect>
            </Field>
            <Field id="target" label="Berlaku untuk">
              <NativeSelect id="target" value={target} onChange={(e) => setTarget(e.target.value as 'employee' | 'unit')}><NativeSelectOption value="employee">Satu pegawai</NativeSelectOption><NativeSelectOption value="unit">Seluruh unit kerja</NativeSelectOption></NativeSelect>
            </Field>
          </div>
          {target === 'employee' ? (
            <Field id="employeeId" label="Pegawai" error={fields.employeeId} required>
              <NativeSelect {...fieldProps('employeeId', fields.employeeId)} required defaultValue=""><NativeSelectOption value="" disabled>Pilih pegawai</NativeSelectOption>{employees.map((e) => <NativeSelectOption key={e.id} value={e.id}>{e.name}{e.unit ? ` (${e.unit})` : ''}</NativeSelectOption>)}</NativeSelect>
            </Field>
          ) : (
            <Field id="unitId" label="Unit kerja" error={fields.unitId} required hint="Berlaku juga untuk sub-unit, kecuali pegawai yang punya penugasan sendiri.">
              <NativeSelect {...fieldProps('unitId', fields.unitId, true)} required defaultValue=""><NativeSelectOption value="" disabled>Pilih unit</NativeSelectOption>{units.map((u) => <NativeSelectOption key={u.id} value={u.id}>{u.name}</NativeSelectOption>)}</NativeSelect>
            </Field>
          )}
          <Field id="scheduleId" label="Jadwal" error={fields.scheduleId} required={kind === 'TETAP'}>
            <NativeSelect {...fieldProps('scheduleId', fields.scheduleId)} defaultValue="">
              <NativeSelectOption value="" disabled={kind === 'TETAP'}>{kind === 'TETAP' ? 'Pilih jadwal' : 'Libur (tanpa jadwal)'}</NativeSelectOption>
              {schedules.map((s) => <NativeSelectOption key={s.id} value={s.id}>{s.name} ({s.code})</NativeSelectOption>)}
            </NativeSelect>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="startDate" label="Mulai berlaku" error={fields.startDate} required><Input {...fieldProps('startDate', fields.startDate)} type="date" required /></Field>
            <Field id="endDate" label="Berakhir" error={fields.endDate} hint={kind === 'TETAP' ? 'Kosongkan bila tidak ditentukan.' : undefined}><Input {...fieldProps('endDate', fields.endDate, kind === 'TETAP')} type="date" required={kind === 'SEMENTARA'} /></Field>
          </div>
          <Field id="note" label="Catatan" error={fields.note}><Input {...fieldProps('note', fields.note)} maxLength={300} /></Field>
          {!canAllUnits && target === 'unit' && <p className="text-sm text-muted-foreground">Hanya unit dalam kewenangan Anda yang tersedia.</p>}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button type="submit" disabled={pending}>{pending ? 'Menyimpan...' : 'Simpan'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EndAssignment({ id, startDate }: { id: string; startDate: string }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const { pending, fields, error, run } = useAction();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button variant="outline" size="sm">Akhiri</Button></PopoverTrigger>
      <PopoverContent className="grid w-72 gap-3">
        <Field id={`end-${id}`} label="Berakhir pada" error={fields.endDate ?? error ?? undefined}>
          <Input id={`end-${id}`} type="date" min={startDate} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={pending || !date} onClick={async () => { if (await run(() => api('PATCH', `/api/v1/schedules/assignments/${id}`, { endDate: date }), { success: 'Penugasan diakhiri.' }) !== undefined) setOpen(false); }}>Simpan</Button>
          <Button size="sm" variant="outline-destructive" disabled={pending} onClick={async () => { if (!(await confirmDialog({ title: 'Hapus penugasan ini?', description: 'Pakai bila penugasan salah input. Rekap yang terdampak dihitung ulang.', confirmLabel: 'Hapus penugasan', destructive: true }))) return; if (await run(() => api('PATCH', `/api/v1/schedules/assignments/${id}`, { remove: true }), { success: 'Penugasan dihapus.' }) !== undefined) setOpen(false); }}>Hapus penugasan</Button>
        </div>
        <p className="text-xs text-muted-foreground">Hapus dipakai bila penugasan salah input. Rekap terdampak dihitung ulang.</p>
      </PopoverContent>
    </Popover>
  );
}

export function HolidayForm({ units, canAllUnits }: { units: Opt[]; canAllUnits: boolean }) {
  const [open, setOpen] = useState(false);
  const { pending, fields, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus />Tambah hari libur</Button></DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
          const r = await run(() => api('POST', '/api/v1/holidays', { date: d.date, name: d.name, unitId: d.unitId || null, kind: d.kind }), { success: 'Hari libur ditambahkan.' });
          if (r !== undefined) setOpen(false);
        }}>
          <DialogHeader><DialogTitle>Tambah hari libur</DialogTitle><DialogDescription>Pegawai dengan jadwal tetap tidak dijadwalkan bekerja pada tanggal ini.</DialogDescription></DialogHeader>
          <Field id="date" label="Tanggal" error={fields.date} required><Input {...fieldProps('date', fields.date)} type="date" required /></Field>
          <Field id="name" label="Keterangan" error={fields.name} required><Input {...fieldProps('name', fields.name)} required placeholder="Mis. Hari Kemerdekaan" /></Field>
          <Field id="kind" label="Jenis" error={fields.kind}>
            <NativeSelect {...fieldProps('kind', fields.kind)} defaultValue="INSTANSI">
              <NativeSelectOption value="INSTANSI">Libur instansi</NativeSelectOption>
              <NativeSelectOption value="NASIONAL">Libur nasional</NativeSelectOption>
              <NativeSelectOption value="CUTI_BERSAMA">Cuti bersama</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field id="unitId" label="Berlaku untuk" error={fields.unitId}>
            <NativeSelect {...fieldProps('unitId', fields.unitId)} defaultValue={canAllUnits ? '' : units[0]?.id}>
              {canAllUnits && <NativeSelectOption value="">Semua unit</NativeSelectOption>}
              {units.map((u) => <NativeSelectOption key={u.id} value={u.id}>{u.name}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button type="submit" disabled={pending}>{pending ? 'Menyimpan...' : 'Simpan'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const HARI_PANJANG = [[0, 'Minggu'], [1, 'Senin'], [2, 'Selasa'], [3, 'Rabu'], [4, 'Kamis'], [5, 'Jumat'], [6, 'Sabtu']] as const;

/** Ubah harian massal: satu shift, libur, atau kembali ke shift default untuk beberapa pegawai pada rentang tanggal. */
export function BulkDaysDialog({ employees, schedules, from, to }: { employees: (Opt & { unit: string | null })[]; schedules: (Opt & { code: string; checkIn: string; checkOut: string })[]; from: string; to: string }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [days, setDays] = useState<number[]>([]);
  const { pending, fields, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="highlight"><Users />Atur banyak pegawai</Button></DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <form className="grid gap-5" onSubmit={async (e) => {
          e.preventDefault();
          const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
          const r = await run(() => api<{ employees: number; days: number }>('POST', '/api/v1/schedules/days', { employeeIds: sel, from: d.from, to: d.to, weekdays: days, value: d.value }), {
            success: (x) => `Jadwal diterapkan: ${x.employees} pegawai, ${x.days} hari. Rekap yang terdampak dihitung ulang.`,
          });
          if (r) { setOpen(false); setSel([]); }
        }}>
          <DialogHeader>
            <DialogTitle>Atur jadwal banyak pegawai</DialogTitle>
            <DialogDescription>Terapkan satu shift, libur, atau shift default untuk beberapa pegawai pada rentang tanggal.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid content-start gap-2">
              <label htmlFor="bulkEmployees" className="text-sm font-medium">Pegawai {sel.length > 0 && <span className="font-normal text-muted-foreground">({sel.length} dipilih)</span>}</label>
              <select id="bulkEmployees" multiple size={9} value={sel} aria-invalid={!!fields.employeeIds || undefined} aria-describedby="bulkEmployeesHint"
                onChange={(e) => setSel(Array.from(e.currentTarget.selectedOptions, (o) => o.value))}
                className="w-full rounded-md border border-input bg-card px-1 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive [&>option]:rounded-sm [&>option]:px-2 [&>option]:py-1">
                {employees.map((e) => <option key={e.id} value={e.id}>{e.unit ? `${e.name} · ${e.unit}` : e.name}</option>)}
              </select>
              <p id="bulkEmployeesHint" className="text-sm text-muted-foreground">Tahan Ctrl (atau Cmd) untuk memilih lebih dari satu.</p>
              {fields.employeeIds && <p className="text-sm font-medium text-destructive">{fields.employeeIds}</p>}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setSel(employees.map((e) => e.id))}>Pilih semua pegawai</Button>
                {sel.length > 0 && <Button type="button" variant="ghost" size="sm" onClick={() => setSel([])}>Kosongkan</Button>}
              </div>
            </div>
            <div className="grid content-start gap-4">
              <div className="grid grid-cols-2 gap-3">
                <Field id="from" label="Dari" error={fields.from} required><Input {...fieldProps('from', fields.from)} type="date" defaultValue={from} required /></Field>
                <Field id="to" label="Sampai" error={fields.to} required><Input {...fieldProps('to', fields.to)} type="date" defaultValue={to} required /></Field>
              </div>
              <fieldset className="grid gap-2">
                <legend className="mb-2 text-sm font-medium">Hanya hari <span className="font-normal text-muted-foreground">(kosongkan untuk semua hari)</span></legend>
                <div className="flex flex-wrap gap-x-4 gap-y-2.5">
                  {HARI_PANJANG.map(([d, label]) => (
                    <label key={d} className="flex min-h-6 items-center gap-2 text-sm">
                      <Checkbox checked={days.includes(d)} onCheckedChange={(v) => setDays((x) => (v ? [...x, d] : x.filter((y) => y !== d)))} />{label}
                    </label>
                  ))}
                </div>
                {fields.weekdays && <p className="text-sm font-medium text-destructive">{fields.weekdays}</p>}
              </fieldset>
              <Field id="value" label="Jadwal" error={fields.value} required>
                <NativeSelect {...fieldProps('value', fields.value)} defaultValue={schedules[0]?.id ?? 'LIBUR'} required>
                  {schedules.map((s) => <NativeSelectOption key={s.id} value={s.id}>{`${s.code} · ${s.name} (${s.checkIn} sampai ${s.checkOut})`}</NativeSelectOption>)}
                  <NativeSelectOption value="LIBUR">Libur</NativeSelectOption>
                  <NativeSelectOption value="BAWAAN">Shift default (ikuti jadwal tetap)</NativeSelectOption>
                </NativeSelect>
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" disabled={pending || sel.length === 0}>{pending ? 'Menerapkan...' : 'Terapkan jadwal'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type SyncResult = { created: number; updated: number; removed: number; keptManual: number; skippedCuti: number };
const syncSummary = (r: SyncResult) => {
  const parts = [r.created && `${r.created} ditambahkan`, r.updated && `${r.updated} diperbarui`, r.removed && `${r.removed} dihapus`, r.keptManual && `${r.keptManual} isian petugas dipertahankan`].filter(Boolean);
  return parts.length ? `Hari libur: ${parts.join(', ')}.` : 'Daftar hari libur sudah sesuai.';
};

/** Tarik libur nasional dan cuti bersama dari internet untuk satu tahun. */
export function HolidaySync({ year }: { year: number }) {
  const { pending, run } = useAction();
  return (
    <Button variant="outline" disabled={pending} onClick={() => run(() => api<SyncResult>('POST', '/api/v1/holidays/sync', { year }), { success: syncSummary })}>
      <CloudDownload />{pending ? 'Menarik...' : `Perbarui libur nasional ${year}`}
    </Button>
  );
}

/** Impor berkas .ics (mis. ekspor kalender) atau .csv bila server tidak punya akses internet. */
export function HolidayImport({ year }: { year: number }) {
  const [open, setOpen] = useState(false);
  const { pending, fields, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline"><Upload />Impor berkas</Button></DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          fd.set('year', String(year));
          const r = await run(() => api<SyncResult>('POST', '/api/v1/holidays/import', fd), { success: syncSummary });
          if (r !== undefined) setOpen(false);
        }}>
          <DialogHeader>
            <DialogTitle>Impor hari libur {year}</DialogTitle>
            <DialogDescription>Untuk server tanpa akses internet. Berkas .ics dari aplikasi kalender, atau .csv berkolom tanggal (YYYY-MM-DD), keterangan, dan jenis (isi &quot;cuti bersama&quot; bila cuti bersama). Hanya tanggal tahun {year} yang diambil; isian petugas tidak ditimpa.</DialogDescription>
          </DialogHeader>
          <Field id="file" label="Berkas" error={fields.file} required><Input {...fieldProps('file', fields.file)} type="file" accept=".ics,.csv,text/calendar,text/csv" required /></Field>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button type="submit" disabled={pending}>{pending ? 'Mengimpor...' : 'Impor'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Nonaktifkan libur dari sumber otomatis tanpa menghapusnya, agar tidak muncul lagi saat tarik berikutnya. */
export function HolidayToggle({ id, name, disabled }: { id: string; name: string; disabled: boolean }) {
  const { pending, run } = useAction();
  return (
    <Button size="sm" variant="ghost" disabled={pending} aria-label={`${disabled ? 'Aktifkan' : 'Nonaktifkan'} ${name}`}
      onClick={() => run(() => api('PATCH', `/api/v1/holidays/${id}`, { disabled: !disabled }), { success: disabled ? 'Hari libur diaktifkan. Rekap tanggal itu dihitung ulang.' : 'Hari libur dinonaktifkan. Tanggal itu kembali menjadi hari kerja biasa.' })}>
      {disabled ? 'Aktifkan' : 'Nonaktifkan'}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Grid bulanan
// ---------------------------------------------------------------------------

type Cell = { date: string; scheduleId: string | null; code: string | null; isOffDay: boolean; offReason: string | null; holidayName: string | null; source: string; overridden: boolean };
type Row = { employee: { id: string; fullName: string; employeeNumber: string | null; unit: { name: string } | null }; days: Cell[] };

const OFF_TEXT: Record<string, string> = { HARI_LIBUR: 'Hari libur', BUKAN_HARI_KERJA: 'Bukan hari kerja', LIBUR_TERJADWAL: 'Libur terjadwal' };

export function ScheduleGrid({ dates, rows: initialRows, schedules, editable, today }: {
  dates: string[];
  rows: Row[];
  schedules: { id: string; code: string; name: string; color: string; checkIn: string; checkOut: string }[];
  editable: boolean;
  today: string;
}) {
  const [rows, setRows] = useState(initialRows);
  const color = new Map(schedules.map((s) => [s.id, s.color]));
  const byId = new Map(schedules.map((s) => [s.id, s]));
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="schedule-grid w-full border-collapse text-sm">
        <caption className="sr-only">Jadwal kerja per pegawai per tanggal</caption>
        <thead>
          <tr className="border-b">
            <th scope="col" className="name px-3 py-2 font-medium">Pegawai</th>
            {dates.map((d) => {
              const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
              return (
                <th key={d} scope="col" className={cn('px-1 py-2 font-medium tabular', d === today && 'text-primary', (wd === 0 || wd === 6) && 'text-muted-foreground')}>
                  <span className="block text-[11px] font-normal">{HARI[wd]}</span>{Number(d.slice(8))}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={r.employee.id} className="border-b last:border-0">
              <th scope="row" className="name px-3 py-1.5 font-normal">
                <span className="block truncate font-medium">{r.employee.fullName}</span>
                <span className="block truncate text-xs text-muted-foreground">{r.employee.unit?.name ?? ''}</span>
              </th>
              {r.days.map((c, ci) => {
                const s = c.scheduleId ? byId.get(c.scheduleId) : null;
                const title = `${r.employee.fullName}, ${c.date}: ${c.isOffDay ? (c.holidayName ?? OFF_TEXT[c.offReason ?? ''] ?? 'Libur') : s ? `${s.code} ${s.checkIn} sampai ${s.checkOut}` : 'Tanpa jadwal'}${c.overridden ? ' (diubah harian)' : ''}`;
                const body = (
                  <span
                    className={cn('flex h-9 w-full items-center justify-center overflow-hidden rounded-sm text-[11px] font-semibold', c.isOffDay && 'text-muted-foreground', c.overridden && 'ring-1 ring-primary ring-inset')}
                    style={!c.isOffDay && c.scheduleId ? { background: `${color.get(c.scheduleId) ?? '#888888'}26`, boxShadow: `inset 0 -3px 0 ${color.get(c.scheduleId) ?? '#888888'}` } : undefined}
                  >
                    {c.isOffDay ? (c.offReason === 'HARI_LIBUR' ? 'LN' : 'L') : (c.code ?? '-')}
                  </span>
                );
                return (
                  <td key={c.date} className={cn('p-0.5', c.isOffDay && 'off')}>
                    {editable ? (
                      <DayPicker title={title} schedules={schedules} onPick={async (value) => {
                        const p = await api<{ schedule: { id: string; code: string } | null; isOffDay: boolean; offReason: string | null; holidayName: string | null; source: string }>('PUT', '/api/v1/schedules/grid', { employeeId: r.employee.id, date: c.date, value });
                        setRows((all) => all.map((row, i) => i !== ri ? row : { ...row, days: row.days.map((x, j) => j !== ci ? x : { ...x, scheduleId: p.schedule?.id ?? null, code: p.schedule?.code ?? null, isOffDay: p.isOffDay, offReason: p.offReason ?? null, holidayName: p.holidayName ?? null, source: p.source, overridden: value !== 'BAWAAN' }) }));
                      }}>{body}</DayPicker>
                    ) : <span title={title}>{body}</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DayPicker({ title, schedules, onPick, children }: { title: string; schedules: { id: string; code: string; name: string; checkIn: string; checkOut: string }[]; onPick: (v: string) => Promise<void>; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useAction();
  const pick = async (v: string) => { if (await run(() => onPick(v).then(() => true), { refresh: false }) !== undefined) setOpen(false); };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><button type="button" className="block w-full rounded-sm focus-visible:outline-2 focus-visible:outline-ring" aria-label={`Ubah jadwal: ${title}`} title={title}>{children}</button></PopoverTrigger>
      <PopoverContent className="w-64 p-2">
        <p className="px-2 pb-2 text-xs text-muted-foreground">{title}</p>
        <div className="grid gap-1" role="group" aria-label="Pilih jadwal">
          {schedules.map((s) => (
            <Button key={s.id} variant="ghost" size="sm" className="justify-start" disabled={pending} onClick={() => pick(s.id)}><b className="w-12 text-left">{s.code}</b><span className="truncate text-muted-foreground">{s.checkIn} sampai {s.checkOut}</span></Button>
          ))}
          <Button variant="ghost" size="sm" className="justify-start" disabled={pending} onClick={() => pick('LIBUR')}><b className="w-12 text-left">L</b><span className="text-muted-foreground">Libur pada tanggal ini</span></Button>
          <Button variant="ghost" size="sm" className="justify-start" disabled={pending} onClick={() => pick('BAWAAN')}><b className="w-12 text-left">↺</b><span className="text-muted-foreground">Kembali ke jadwal tetap</span></Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

