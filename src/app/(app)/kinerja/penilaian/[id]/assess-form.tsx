'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Field, fieldProps } from '@/components/app/field';
import { api, useAction } from '@/components/app/api-client';
import { averageOf, COMPETENCE, FOLLOW_UP, INDICATOR_GROUPS, INDICATOR_KEYS, predicateOf } from '@/lib/assessment/indicators';

interface Initial { scores: Record<string, number>; competence: string | null; followUp: string | null; note: string | null }

export function AssessForm({ id, boss, closed, initial }: { id: string; boss: boolean; closed: boolean; initial: Initial | null }) {
  const router = useRouter();
  const { pending, fields, error, run } = useAction();
  const [scores, setScores] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(initial?.scores ?? {}).map(([k, v]) => [k, String(v)])));
  const [competence, setCompetence] = useState(initial?.competence ?? '');
  const [followUp, setFollowUp] = useState(initial?.followUp ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [fill, setFill] = useState('');

  const numeric = useMemo(() => Object.fromEntries(Object.entries(scores).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])), [scores]);
  const filled = INDICATOR_KEYS.filter((k) => Number.isInteger(numeric[k]) && numeric[k] >= 1 && numeric[k] <= 100).length;
  const complete = filled === INDICATOR_KEYS.length;
  const average = filled ? averageOf(numeric) : null;
  const set = (k: string, v: string) => setScores((s) => ({ ...s, [k]: v.replace(/\D/g, '').slice(0, 3) }));

  return (
    <form className="grid gap-4" onSubmit={async (e) => {
      e.preventDefault();
      const r = await run(() => api('POST', `/api/v1/assessments/${id}/submit`, { scores: numeric, competence: boss ? competence || null : null, followUp: boss ? followUp || null : null, note }), { success: 'Penilaian dikirim.', refresh: false });
      if (r !== undefined) router.push('/kinerja/penilaian');
    }}>
      <Card className="flex-row flex-wrap items-end gap-3 p-4">
        <Field id="fill" label="Isi semua indikator dengan" className="w-44">
          <Input id="fill" inputMode="numeric" value={fill} onChange={(e) => setFill(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="mis. 85" disabled={closed} className="tabular" />
        </Field>
        <Button type="button" variant="outline" disabled={closed || !fill || Number(fill) < 1 || Number(fill) > 100} onClick={() => setScores(Object.fromEntries(INDICATOR_KEYS.map((k) => [k, fill])))}>Terapkan</Button>
        <p className="ml-auto text-sm text-muted-foreground tabular-nums">{filled} dari {INDICATOR_KEYS.length} terisi</p>
      </Card>

      {INDICATOR_GROUPS.map((g) => (
        <Card key={g.key} className="gap-0 overflow-hidden py-0">
          <div className="border-b bg-muted px-4 py-2.5 text-sm font-semibold sm:px-6">{g.title}</div>
          <ul className="divide-y">
            {g.items.map((it) => {
              const bad = fields[it.key] || (scores[it.key] && (Number(scores[it.key]) < 1 || Number(scores[it.key]) > 100) ? 'Nilai 1 sampai 100' : '');
              return (
                <li key={it.key} className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
                  <label htmlFor={`s-${it.key}`} className="min-w-0 flex-1 text-sm">{it.text}</label>
                  <div className="grid justify-items-end gap-1">
                    <Input id={`s-${it.key}`} inputMode="numeric" value={scores[it.key] ?? ''} onChange={(e) => set(it.key, e.target.value)} disabled={closed} aria-invalid={!!bad} aria-label={`Nilai: ${it.text}`} className="h-10 w-20 text-center tabular" />
                    {bad && <span className="text-xs text-destructive" role="alert">{bad}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ))}

      <Card className="gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><p className="text-sm text-muted-foreground">Nilai rata-rata indikator</p><p className="text-3xl font-semibold tabular-nums">{average ?? '-'}</p></div>
          {average != null && <Badge variant={predicateOf(average) === 'Baik' ? 'hadir' : 'alpa'} className="text-sm">{predicateOf(average)}</Badge>}
        </div>
        {boss && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="competence" label="Pekerjaan sesuai kompetensi" error={fields.competence} required>
              <NativeSelect {...fieldProps('competence', fields.competence)} value={competence} onChange={(e) => setCompetence(e.target.value)} disabled={closed}>
                <NativeSelectOption value="">Pilih</NativeSelectOption>
                {Object.entries(COMPETENCE).map(([k, v]) => <NativeSelectOption key={k} value={k}>{v}</NativeSelectOption>)}
              </NativeSelect>
            </Field>
            <Field id="followUp" label="Tindak lanjut yang disarankan" error={fields.followUp} required>
              <NativeSelect {...fieldProps('followUp', fields.followUp)} value={followUp} onChange={(e) => setFollowUp(e.target.value)} disabled={closed}>
                <NativeSelectOption value="">Pilih</NativeSelectOption>
                {Object.entries(FOLLOW_UP).map(([k, v]) => <NativeSelectOption key={k} value={k}>{v}</NativeSelectOption>)}
              </NativeSelect>
            </Field>
          </div>
        )}
        <Field id="note" label="Catatan (opsional)" error={fields.note}>
          <Textarea {...fieldProps('note', fields.note)} rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} disabled={closed} />
        </Field>
        {error && <p className="text-sm font-medium text-destructive" role="alert">{error}</p>}
        <Button type="submit" size="lg" className="w-fit" disabled={closed || pending || !complete || (boss && (!competence || !followUp))}><Send />{pending ? 'Mengirim...' : initial ? 'Perbarui penilaian' : 'Kirim penilaian'}</Button>
      </Card>
    </form>
  );
}
