'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Field, fieldProps } from '@/components/app/field';
import { api, useAction } from '@/components/app/api-client';

const KINDS: [string, string][] = [
  ['LUPA_MASUK', 'Lupa absen masuk'], ['LUPA_PULANG', 'Lupa absen pulang'], ['LUPA_KEDUANYA', 'Lupa absen masuk dan pulang'],
  ['TERLAMBAT', 'Terlambat karena alasan sah'], ['PULANG_CEPAT', 'Pulang lebih awal karena alasan sah'], ['GANGGUAN_ALAT', 'Gangguan kamera atau mesin absensi'], ['LAINNYA', 'Lainnya'],
];

export function CorrectionForm({ defaultDate, min, max }: { defaultDate: string; min: string; max: string }) {
  const router = useRouter();
  const { pending, fields, run } = useAction();
  const [kind, setKind] = useState('');
  const showIn = ['LUPA_MASUK', 'LUPA_KEDUANYA', 'GANGGUAN_ALAT', 'LAINNYA', 'TERLAMBAT'].includes(kind);
  const showOut = ['LUPA_PULANG', 'LUPA_KEDUANYA', 'GANGGUAN_ALAT', 'LAINNYA', 'PULANG_CEPAT'].includes(kind);
  return (
    <Card>
      <CardContent>
        <form className="grid gap-4" noValidate onSubmit={async (e) => {
          e.preventDefault();
          const r = await run(() => api<{ id: string }>('POST', '/api/v1/corrections', new FormData(e.currentTarget)), { success: 'Pengajuan koreksi terkirim.', refresh: false });
          if (r) { router.push(`/absensi/koreksi/${r.id}`); router.refresh(); }
        }}>
          <Field id="workDate" label="Tanggal absensi" error={fields.workDate} required><Input {...fieldProps('workDate', fields.workDate)} type="date" defaultValue={defaultDate} min={min} max={max} required /></Field>
          <Field id="kind" label="Jenis koreksi" error={fields.kind} required>
            <NativeSelect {...fieldProps('kind', fields.kind)} value={kind} onChange={(e) => setKind(e.target.value)} required><NativeSelectOption value="" disabled>Pilih jenis</NativeSelectOption>{KINDS.map(([k, v]) => <NativeSelectOption key={k} value={k}>{v}</NativeSelectOption>)}</NativeSelect>
          </Field>
          {(showIn || showOut) && (
            <div className="grid grid-cols-2 gap-3">
              {showIn && <Field id="proposedCheckIn" label="Jam masuk sebenarnya" error={fields.proposedCheckIn} required={['LUPA_MASUK', 'LUPA_KEDUANYA'].includes(kind)}><Input {...fieldProps('proposedCheckIn', fields.proposedCheckIn)} type="time" /></Field>}
              {showOut && <Field id="proposedCheckOut" label="Jam pulang sebenarnya" error={fields.proposedCheckOut} required={['LUPA_PULANG', 'LUPA_KEDUANYA'].includes(kind)}><Input {...fieldProps('proposedCheckOut', fields.proposedCheckOut)} type="time" /></Field>}
            </div>
          )}
          <Field id="reason" label="Alasan" error={fields.reason} required hint="Minimal 10 karakter. Jelaskan yang terjadi, mis. mesin absen mati saat saya tiba pukul 07.20."><Textarea {...fieldProps('reason', fields.reason, true)} rows={4} required /></Field>
          <Field id="attachment" label="Bukti (opsional)" error={fields.attachment} hint="JPG, PNG, atau PDF maksimal 5 MB. Hanya dipakai untuk pengajuan ini."><Input {...fieldProps('attachment', fields.attachment, true)} type="file" accept="image/jpeg,image/png,application/pdf" className="h-auto py-1.5" /></Field>
          <div className="flex gap-2"><Button type="submit" disabled={pending}>{pending ? 'Mengirim...' : 'Kirim pengajuan'}</Button><Button type="button" variant="outline" onClick={() => router.back()}>Batal</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}
