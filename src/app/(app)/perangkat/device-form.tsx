'use client';

import { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Field, fieldProps } from '@/components/app/field';
import { api, useAction } from '@/components/app/api-client';

export interface AdapterInfo { id: string; label: string; maturity: string; connection: string; pull: boolean; note: string }
export interface DeviceValues { id?: string; name?: string; vendor?: string | null; model?: string | null; serialNumber?: string | null; adapter?: string; host?: string | null; port?: number | null; hasSecret?: boolean; location?: string | null; unitId?: string | null; syncIntervalMinutes?: number; timeoutMs?: number; maxRetries?: number }

const MATURITY: Record<string, string> = { SIAP: 'Sudah diuji dengan perangkat fisik', BELUM_DIUJI: 'Belum diuji dengan perangkat fisik di instansi', MOCK: 'Simulasi, hanya untuk pengembangan dan demo' };

export function DeviceForm({ adapters, units, initial }: { adapters: AdapterInfo[]; units: { id: string; name: string }[]; initial?: DeviceValues }) {
  const editing = !!initial?.id;
  const [open, setOpen] = useState(false);
  const [adapter, setAdapter] = useState(initial?.adapter ?? 'SOLUTION_SOAP');
  const { pending, fields, run } = useAction();
  const a = adapters.find((x) => x.id === adapter);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{editing ? <Button variant="outline"><Pencil />Ubah</Button> : <Button><Plus />Tambah perangkat</Button>}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <form className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const data: Record<string, unknown> = Object.fromEntries(fd);
          if (!data.secret) delete data.secret;
          const r = await run(() => (editing ? api('PATCH', `/api/v1/devices/${initial!.id}`, data) : api('POST', '/api/v1/devices', data)), { success: 'Perangkat disimpan.' });
          if (r !== undefined) setOpen(false);
        }}>
          <DialogHeader>
            <DialogTitle>{editing ? `Ubah ${initial!.name}` : 'Tambah perangkat absensi'}</DialogTitle>
            <DialogDescription>Konektor nyata hanya untuk merek/model yang spesifikasinya sudah diterima. Untuk merek lain, kirim merek, model, protokol, dan contoh data agar adapter bisa dibuat.</DialogDescription>
          </DialogHeader>
          <Field id="adapter" label="Adapter / protokol" error={fields.adapter} hint={a ? `${MATURITY[a.maturity]}. ${a.note}` : undefined}>
            <NativeSelect {...fieldProps('adapter', fields.adapter, true)} value={adapter} onChange={(e) => setAdapter(e.target.value)}>{adapters.map((x) => <NativeSelectOption key={x.id} value={x.id}>{x.label}</NativeSelectOption>)}</NativeSelect>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="name" label="Nama perangkat" error={fields.name} required><Input {...fieldProps('name', fields.name)} defaultValue={initial?.name ?? ''} required placeholder="Mis. X302 lobi utama" /></Field>
            <Field id="location" label="Lokasi" error={fields.location}><Input {...fieldProps('location', fields.location)} defaultValue={initial?.location ?? ''} /></Field>
            <Field id="vendor" label="Merek" error={fields.vendor}><Input {...fieldProps('vendor', fields.vendor)} defaultValue={initial?.vendor ?? (adapter === 'SOLUTION_SOAP' || adapter === 'FILE_IMPORT' ? 'Solution' : '')} /></Field>
            <Field id="model" label="Model" error={fields.model}><Input {...fieldProps('model', fields.model)} defaultValue={initial?.model ?? ''} placeholder="Mis. X302 atau P280" /></Field>
            <Field id="serialNumber" label="Nomor seri / ID perangkat" error={fields.serialNumber} hint="Dipakai sebagai kunci identitas perangkat."><Input {...fieldProps('serialNumber', fields.serialNumber, true)} defaultValue={initial?.serialNumber ?? ''} /></Field>
            <Field id="unitId" label="Unit kerja" error={fields.unitId}><NativeSelect {...fieldProps('unitId', fields.unitId)} defaultValue={initial?.unitId ?? ''}><NativeSelectOption value="">Semua unit</NativeSelectOption>{units.map((u) => <NativeSelectOption key={u.id} value={u.id}>{u.name}</NativeSelectOption>)}</NativeSelect></Field>
          </div>
          {a?.connection !== 'USB' && (
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1.5fr]">
              <Field id="host" label={a?.id === 'MOCK' ? 'Host simulasi' : 'Alamat IP'} error={fields.host} hint={a?.id === 'MOCK' ? 'mock://nama; mock://gagal untuk simulasi offline' : undefined}><Input {...fieldProps('host', fields.host, a?.id === 'MOCK')} defaultValue={initial?.host ?? (a?.id === 'MOCK' ? 'mock://demo' : '')} placeholder="192.168.1.201" /></Field>
              <Field id="port" label="Port" error={fields.port}><Input {...fieldProps('port', fields.port)} type="number" defaultValue={initial?.port ?? 80} /></Field>
              <Field id="secret" label="Comm Key / kata sandi" error={fields.secret} hint={initial?.hasSecret ? 'Tersimpan. Kosongkan bila tidak diubah.' : 'Disimpan terenkripsi, tidak pernah ditampilkan.'}><Input {...fieldProps('secret', fields.secret, true)} type="password" autoComplete="off" /></Field>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="syncIntervalMinutes" label="Tarik otomatis" error={fields.syncIntervalMinutes}>
              <NativeSelect {...fieldProps('syncIntervalMinutes', fields.syncIntervalMinutes)} defaultValue={String(initial?.syncIntervalMinutes ?? 0)} disabled={!a?.pull}>
                {[[0, 'Manual saja'], [5, 'Tiap 5 menit'], [15, 'Tiap 15 menit'], [30, 'Tiap 30 menit'], [60, 'Tiap 1 jam']].map(([v, l]) => <NativeSelectOption key={v} value={v}>{l}</NativeSelectOption>)}
              </NativeSelect>
            </Field>
            <Field id="timeoutMs" label="Timeout (ms)" error={fields.timeoutMs}><Input {...fieldProps('timeoutMs', fields.timeoutMs)} type="number" defaultValue={initial?.timeoutMs ?? 10000} min={1000} max={120000} /></Field>
            <Field id="maxRetries" label="Coba ulang bila gagal" error={fields.maxRetries}><Input {...fieldProps('maxRetries', fields.maxRetries)} type="number" defaultValue={initial?.maxRetries ?? 2} min={0} max={5} /></Field>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button type="submit" disabled={pending}>{pending ? 'Menyimpan...' : 'Simpan'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
