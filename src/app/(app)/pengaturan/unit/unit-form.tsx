'use client';

import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Field, fieldProps } from '@/components/app/field';
import { api, useAction } from '@/components/app/api-client';

type U = { id: string; code: string; name: string; parentId: string | null; timezone: string | null };

export function UnitForm({ initial, parents, defaultParent, canRoot }: { initial?: U; parents: { id: string; name: string; depth: number }[]; defaultParent?: string | null; canRoot: boolean }) {
  const [open, setOpen] = useState(false);
  const { pending, fields, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {initial ? <Button variant="ghost" size="sm"><Pencil />Ubah</Button> : defaultParent ? <Button variant="ghost" size="sm"><Plus />Sub-unit</Button> : <Button><Plus />Tambah unit</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
          const data = { code: d.code, name: d.name, parentId: d.parentId || null, timezone: d.timezone || null };
          const r = await run(() => (initial ? api('PATCH', `/api/v1/units/${initial.id}`, data) : api('POST', '/api/v1/units', data)), { success: 'Unit kerja disimpan.' });
          if (r !== undefined) setOpen(false);
        }}>
          <DialogHeader><DialogTitle>{initial ? `Ubah ${initial.name}` : 'Tambah unit kerja'}</DialogTitle><DialogDescription>Struktur unit menentukan cakupan data bagi operator dan pimpinan unit.</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
            <Field id="code" label="Kode" error={fields.code} required><Input {...fieldProps('code', fields.code)} defaultValue={initial?.code} required maxLength={30} /></Field>
            <Field id="name" label="Nama unit" error={fields.name} required><Input {...fieldProps('name', fields.name)} defaultValue={initial?.name} required /></Field>
          </div>
          <Field id="parentId" label="Unit induk" error={fields.parentId}>
            <NativeSelect {...fieldProps('parentId', fields.parentId)} defaultValue={initial?.parentId ?? defaultParent ?? ''}>
              {canRoot && <NativeSelectOption value="">Tidak ada (unit teratas)</NativeSelectOption>}
              {parents.filter((p) => p.id !== initial?.id).map((p) => <NativeSelectOption key={p.id} value={p.id}>{'  '.repeat(p.depth)}{p.name}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
          <Field id="timezone" label="Zona waktu unit" error={fields.timezone} hint="Kosongkan untuk mengikuti zona waktu instansi.">
            <NativeSelect {...fieldProps('timezone', fields.timezone, true)} defaultValue={initial?.timezone ?? ''}>
              <NativeSelectOption value="">Ikuti instansi</NativeSelectOption>
              <NativeSelectOption value="Asia/Jakarta">WIB (Asia/Jakarta)</NativeSelectOption>
              <NativeSelectOption value="Asia/Makassar">WITA (Asia/Makassar)</NativeSelectOption>
              <NativeSelectOption value="Asia/Jayapura">WIT (Asia/Jayapura)</NativeSelectOption>
            </NativeSelect>
          </Field>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button type="submit" disabled={pending}>{pending ? 'Menyimpan...' : 'Simpan'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
