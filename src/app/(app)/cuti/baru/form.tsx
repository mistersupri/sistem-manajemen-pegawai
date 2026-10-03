'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { Field, fieldProps } from '@/components/app/field';
import { api, useAction } from '@/components/app/api-client';

interface TypeOpt {
  id: string; name: string; usesBalance: boolean; allowAttachment: boolean; approvalLevels: number; countWorkdaysOnly: boolean;
  maxDaysPerRequest: number | null; minDate: string | null; minNoticeDays: number; remaining: number | null;
}

export function LeaveForm({ types }: { types: TypeOpt[] }) {
  const router = useRouter();
  const [typeId, setTypeId] = useState(types[0].id);
  const [start, setStart] = useState('');
  const { pending, fields, run } = useAction();
  const t = types.find((x) => x.id === typeId)!;
  const rules = [
    t.usesBalance && (t.remaining == null ? 'Saldo belum diatur, pengajuan akan ditolak sistem.' : `Sisa saldo ${t.remaining} hari.`),
    t.countWorkdaysOnly ? 'Dihitung hari kerja terjadwal saja.' : 'Dihitung hari kalender.',
    t.maxDaysPerRequest && `Maksimal ${t.maxDaysPerRequest} hari per pengajuan.`,
    t.minNoticeDays > 0 && `Diajukan paling lambat ${t.minNoticeDays} hari sebelumnya.`,
    t.approvalLevels >= 2 ? 'Persetujuan: atasan langsung, lalu admin kepegawaian.' : 'Persetujuan: atasan langsung.',
  ].filter(Boolean).join(' ');
  return (
    <Card>
      <CardContent>
        <form className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const r = await run(() => api<{ id: string }>('POST', '/api/v1/leave', fd), { success: 'Pengajuan terkirim.', refresh: false });
          if (r) router.push(`/cuti/${r.id}`);
        }}>
          <Field id="leaveTypeId" label="Jenis" error={fields.leaveTypeId} hint={rules} required>
            <NativeSelect {...fieldProps('leaveTypeId', fields.leaveTypeId, true)} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              {types.map((x) => <NativeSelectOption key={x.id} value={x.id}>{x.name}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="startDate" label="Mulai" error={fields.startDate} required><Input {...fieldProps('startDate', fields.startDate)} type="date" required min={t.minDate ?? undefined} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field id="endDate" label="Sampai" error={fields.endDate} required><Input {...fieldProps('endDate', fields.endDate)} type="date" required min={start || t.minDate || undefined} /></Field>
          </div>
          <Field id="reason" label="Alasan" error={fields.reason} required><Textarea {...fieldProps('reason', fields.reason)} rows={3} required minLength={5} maxLength={1000} /></Field>
          {t.allowAttachment && (
            <Field id="attachment" label="Lampiran" error={fields.attachment} hint="Opsional. JPG, PNG, atau PDF, maksimal 5 MB. Mis. surat keterangan dokter.">
              <Input {...fieldProps('attachment', fields.attachment, true)} type="file" accept="image/jpeg,image/png,application/pdf" />
            </Field>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>{pending ? 'Mengirim...' : 'Kirim pengajuan'}</Button>
            <Button type="button" variant="outline" onClick={() => router.push('/cuti')}>Batal</Button>
          </div>
          <p className="text-xs text-muted-foreground">Jumlah hari dihitung otomatis dari jadwal kerja Anda.</p>
        </form>
      </CardContent>
    </Card>
  );
}
