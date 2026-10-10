'use client';

import { useState } from 'react';
import { CheckCircle2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, fieldProps } from '@/components/app/field';
import { api, useAction } from '@/components/app/api-client';

/** Atasan memberi nilai 1-100 dengan catatan, atau mengembalikan laporan dengan alasan. */
export function ReviewForm({ id }: { id: string }) {
  const { pending, fields, run } = useAction();
  const [score, setScore] = useState('');
  const [note, setNote] = useState('');
  const send = (body: Record<string, unknown>, success: string) => run(() => api('POST', `/api/v1/reports/${id}/review`, body), { success });
  return (
    <Card className="gap-4 p-4 sm:p-5">
      <div><h2 className="font-semibold">Penilaian atasan</h2><p className="text-sm text-muted-foreground">Beri nilai 1 sampai 100 untuk laporan bulan ini, atau kembalikan bila perlu diperbaiki.</p></div>
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        <Field id="score" label="Nilai (1-100)" error={fields.score}>
          <Input {...fieldProps('score', fields.score)} type="number" min={1} max={100} inputMode="numeric" value={score} onChange={(e) => setScore(e.target.value)} className="tabular" />
        </Field>
        <Field id="note" label="Catatan" error={fields.note} hint="Wajib diisi bila dikembalikan.">
          <Textarea {...fieldProps('note', fields.note, true)} rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending || !score} onClick={() => send({ action: 'approve', score: Number(score), note }, 'Laporan dinilai.')}><CheckCircle2 />Beri nilai</Button>
        <Button variant="outline" disabled={pending || note.trim().length < 5} onClick={() => send({ action: 'return', note }, 'Laporan dikembalikan.')}><Undo2 />Kembalikan</Button>
      </div>
    </Card>
  );
}
