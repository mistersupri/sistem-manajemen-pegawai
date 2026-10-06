'use client';

import { EmployeePicker } from '@/components/app/employee-picker';
import { useState } from 'react';
import { FileUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Field, fieldProps } from '@/components/app/field';
import { api, useAction } from '@/components/app/api-client';

interface ImportSummary { format: string; period: { from: string; to: string } | null; received: number; inserted: number; duplicates: number; failed: number; employees: number; days: number; unmatchedPins: string[] }

export function ImportFile({ devices }: { devices: { id: string; name: string }[] }) {
  const { pending, fields, run } = useAction();
  const [res, setRes] = useState<ImportSummary | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Impor data dari flashdisk (USB)</CardTitle>
        <CardDescription>Untuk mesin seperti Solution P280. Format: laporan standar .xls/.xlsx, attlog .dat/.txt, atau CSV berkolom ID dan Waktu. Scan yang sudah pernah diimpor dilewati otomatis.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form className="grid gap-3" onSubmit={async (e) => { e.preventDefault(); const r = await run(() => api<ImportSummary>('POST', '/api/v1/devices/import', new FormData(e.currentTarget))); if (r) setRes(r); }}>
          <Field id="deviceId" label="Dari perangkat" error={fields.deviceId}>
            <NativeSelect {...fieldProps('deviceId', fields.deviceId)} defaultValue={devices[0]?.id ?? ''}><NativeSelectOption value="">Tidak ditentukan</NativeSelectOption>{devices.map((d) => <NativeSelectOption key={d.id} value={d.id}>{d.name}</NativeSelectOption>)}</NativeSelect>
          </Field>
          <Field id="file" label="Berkas ekspor mesin" error={fields.file}><Input {...fieldProps('file', fields.file)} type="file" accept=".xls,.xlsx,.dat,.txt,.csv" required className="h-auto py-1.5" /></Field>
          <Button type="submit" className="w-fit" disabled={pending}><FileUp />{pending ? 'Mengimpor...' : 'Impor scan'}</Button>
        </form>
        {res && (
          <Alert variant={res.unmatchedPins.length ? 'warning' : 'success'} role="status">
            <AlertTitle>Impor selesai ({res.format})</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4">
                {res.period && <li>Periode {res.period.from} sampai {res.period.to}</li>}
                <li><b>{res.received}</b> scan dibaca: <b>{res.inserted}</b> baru, {res.duplicates} sudah pernah diimpor{res.failed ? `, ${res.failed} gagal` : ''}.</li>
                <li><b>{res.employees}</b> pegawai terhubung, <b>{res.days}</b> hari rekap dihitung ulang.</li>
                {res.unmatchedPins.length > 0 && <li><b>{res.unmatchedPins.length}</b> ID mesin belum terhubung: {res.unmatchedPins.slice(0, 15).join(', ')}{res.unmatchedPins.length > 15 ? ', dan lainnya' : ''}. Hubungkan di daftar samping, atau lewati bila memang tidak perlu masuk rekap.</li>}
              </ul>
              {res.unmatchedPins.length > 0 && <IgnorePins pins={res.unmatchedPins} label="Anggap selesai dan lewati ID ini" className="mt-3" />}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

/** Lewati ID mesin yang tidak perlu dihubungkan ke pegawai (mis. ID tamu); scan-nya tidak masuk rekap. */
export function IgnorePins({ pins, label = 'Lewati', size = 'sm', variant = 'outline', className }: { pins: string[]; label?: string; size?: 'sm' | 'default'; variant?: 'outline' | 'ghost'; className?: string }) {
  const { pending, run } = useAction();
  return (
    <Button type="button" size={size} variant={variant} className={className} disabled={pending}
      onClick={() => run(() => api<{ ignored: number; scans: number }>('POST', '/api/v1/devices/ignore-pin', { pins }), { success: (r) => `${r.ignored} ID mesin dilewati, ${r.scans} scan tidak dimasukkan ke rekap.` })}>
      {pending ? 'Memproses...' : label}
    </Button>
  );
}

export function RestorePin({ pin }: { pin: string }) {
  const { pending, run } = useAction();
  return (
    <Button type="button" size="sm" variant="ghost" disabled={pending}
      onClick={() => run(() => api<{ scans: number }>('DELETE', '/api/v1/devices/ignore-pin', { pin }), { success: `ID ${pin} kembali menunggu pemetaan.` })}>
      Tampilkan lagi
    </Button>
  );
}

export function MapPin({ pin, name }: { pin: string; name: string | null }) {
  const { pending, run } = useAction();
  const [value, setValue] = useState('');
  return (
    <form className="grid gap-2 sm:min-w-72" onSubmit={async (e) => { e.preventDefault(); await run(() => api<{ days: number }>('POST', '/api/v1/devices/map-pin', { pin, employeeId: value }), { success: (r) => `ID ${pin} terhubung, ${r.days} hari rekap diperbarui.` }); }}>
      <label className="sr-only" htmlFor={`map-${pin}`}>Pegawai untuk ID {pin}</label>
      <EmployeePicker id={`map-${pin}`} name="employeeId" purpose="pin" lazy defaultQuery={name ?? ''} onChange={setValue} />
      <Button type="submit" size="sm" disabled={!value || pending} className="justify-self-end">Hubungkan</Button>
    </form>
  );
}
