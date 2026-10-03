'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Field, fieldProps } from '@/components/app/field';
import { api, useAction } from '@/components/app/api-client';

export type SettingField = {
  key: string;
  label: string;
  hint?: string;
  type: 'bool' | 'number' | 'optnumber' | 'text' | 'textarea' | 'select';
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  options?: { value: string; label: string }[];
  wide?: boolean;
};

/** Kartu pengaturan: hanya kunci di kartu ini yang dikirim saat disimpan. */
export function SettingsCard({ title, description, fields, values, children }: { title: string; description?: string; fields: SettingField[]; values: Record<string, unknown>; children?: React.ReactNode }) {
  const [state, setState] = useState<Record<string, unknown>>(() => Object.fromEntries(fields.map((f) => [f.key, values[f.key]])));
  const { pending, fields: errors, run } = useAction();
  const dirty = fields.some((f) => JSON.stringify(state[f.key] ?? null) !== JSON.stringify(values[f.key] ?? null));
  const set = (k: string, v: unknown) => setState((s) => ({ ...s, [k]: v }));
  const id = (k: string) => `s-${k.replace(/\./g, '-')}`;
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle>{description && <CardDescription>{description}</CardDescription>}</CardHeader>
      <CardContent>
        <form className="grid gap-5" onSubmit={async (e) => {
          e.preventDefault();
          const payload = Object.fromEntries(fields.filter((f) => JSON.stringify(state[f.key] ?? null) !== JSON.stringify(values[f.key] ?? null)).map((f) => [f.key, state[f.key]]));
          await run(() => api('PATCH', '/api/v1/settings', payload), { success: 'Pengaturan disimpan.' });
        }}>
          <div className="grid gap-5 sm:grid-cols-2">
            {fields.map((f) => f.type === 'bool' ? (
              <div key={f.key} className="flex items-start justify-between gap-4 rounded-lg border p-3 sm:col-span-2">
                <div className="grid gap-1">
                  <Label htmlFor={id(f.key)}>{f.label}</Label>
                  {f.hint && <p id={`${id(f.key)}-hint`} className="text-sm text-muted-foreground">{f.hint}</p>}
                  {errors[f.key] && <p className="text-sm font-medium text-destructive" role="alert">{errors[f.key]}</p>}
                </div>
                <Switch id={id(f.key)} checked={!!state[f.key]} onCheckedChange={(v) => set(f.key, v)} aria-describedby={f.hint ? `${id(f.key)}-hint` : undefined} />
              </div>
            ) : (
              <Field key={f.key} id={id(f.key)} label={f.label} hint={f.hint} error={errors[f.key]} className={f.wide || f.type === 'textarea' ? 'sm:col-span-2' : undefined}>
                {f.type === 'textarea' ? (
                  <Textarea {...fieldProps(id(f.key), errors[f.key], !!f.hint)} rows={5} value={String(state[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)} />
                ) : f.type === 'select' ? (
                  <NativeSelect {...fieldProps(id(f.key), errors[f.key], !!f.hint)} value={String(state[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)}>
                    {f.options!.map((o) => <NativeSelectOption key={o.value} value={o.value}>{o.label}</NativeSelectOption>)}
                  </NativeSelect>
                ) : (
                  <div className="flex items-center gap-2">
                    <Input
                      {...fieldProps(id(f.key), errors[f.key], !!f.hint)}
                      type={f.type === 'text' ? 'text' : 'number'} min={f.min} max={f.max} step={f.step ?? 'any'}
                      value={state[f.key] == null ? '' : String(state[f.key])}
                      onChange={(e) => set(f.key, f.type === 'text' ? e.target.value : e.target.value === '' ? (f.type === 'optnumber' ? null : '') : Number(e.target.value))}
                    />
                    {f.suffix && <span className="shrink-0 text-sm text-muted-foreground">{f.suffix}</span>}
                  </div>
                )}
              </Field>
            ))}
          </div>
          {children}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending || !dirty}>{pending ? 'Menyimpan...' : 'Simpan'}</Button>
            {dirty && <Button type="button" variant="outline" onClick={() => setState(Object.fromEntries(fields.map((f) => [f.key, values[f.key]])))}>Batalkan perubahan</Button>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
