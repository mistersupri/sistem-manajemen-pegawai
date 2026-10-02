'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Field, fieldProps } from '@/components/app/field';
import { api, useAction } from '@/components/app/api-client';

export function LeaveDecision({ id, level, last }: { id: string; level: number; last: boolean }) {
  const { pending, fields, run } = useAction();
  async function decide(form: HTMLFormElement, approve: boolean) {
    const note = new FormData(form).get('note') || null;
    await run(() => api('POST', `/api/v1/leave/${id}/decision`, { approve, note }), {
      success: !approve ? 'Pengajuan ditolak.' : last ? 'Pengajuan disetujui. Rekap absensi pada tanggal tersebut diperbarui.' : 'Disetujui, diteruskan ke tahap berikutnya.',
    });
  }
  return (
    <Card className="border-primary/40">
      <CardHeader><CardTitle>Keputusan tahap {level}</CardTitle><CardDescription>{last ? 'Ini tahap terakhir. Bila disetujui, status absensi pada rentang tanggal tersebut menjadi cuti/izin.' : 'Bila disetujui, pengajuan diteruskan ke admin kepegawaian.'}</CardDescription></CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); decide(e.currentTarget, true); }}>
          <Field id="note" label="Catatan" error={fields.note} hint="Wajib diisi bila menolak. Terlihat oleh pegawai."><Textarea {...fieldProps('note', fields.note, true)} rows={2} /></Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>Setujui</Button>
            <Button type="button" variant="outline-destructive" disabled={pending} onClick={(e) => decide(e.currentTarget.form!, false)}>Tolak</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
