'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Download, FileUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Field, fieldProps } from '@/components/app/field';
import { api, useAction } from '@/components/app/api-client';

interface Row { line: number; action: 'BARU' | 'PERBARUI' | 'GALAT'; messages: string[]; values: Record<string, string>; result?: string }
interface Preview { token: string; fileName?: string; summary: { total: number; baru: number; perbarui: number; galat: number; berhasil: number; gagal: number }; rows: Row[] }

const ACTION: Record<string, { label: string; variant: 'hadir' | 'dinas' | 'alpa' }> = {
  BARU: { label: 'Baru', variant: 'hadir' }, PERBARUI: { label: 'Perbarui', variant: 'dinas' }, GALAT: { label: 'Galat', variant: 'alpa' },
};

export function ImportFlow() {
  const { pending, fields, run } = useAction();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [done, setDone] = useState<Preview | null>(null);
  const [updateExisting, setUpdate] = useState(true);
  const [createAccounts, setAccounts] = useState(true);
  const [onlyErrors, setOnlyErrors] = useState(false);

  if (done) {
    return (
      <div className="grid gap-4">
        <Alert variant={done.summary.gagal ? 'warning' : 'success'}>
          <AlertTitle>Impor selesai: {done.summary.berhasil} berhasil, {done.summary.gagal} gagal, {done.summary.total - done.summary.berhasil - done.summary.gagal} dilewati</AlertTitle>
          <AlertDescription>Unduh hasil untuk melihat status setiap baris.</AlertDescription>
        </Alert>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><a href={`/api/v1/employees/import/${done.token}`}><Download />Unduh hasil impor</a></Button>
          <Button asChild><Link href="/pegawai">Ke daftar pegawai</Link></Button>
          <Button variant="ghost" onClick={() => { setDone(null); setPreview(null); }}>Impor berkas lain</Button>
        </div>
        <RowsTable rows={done.rows} showResult />
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>1. Unggah berkas</CardTitle>
          <CardDescription>
            Gunakan <a className="text-primary underline" href="/api/v1/employees/template" download>template impor (.xlsx)</a>. Kolom kode unit memakai kode di sheet &quot;Kode unit&quot;. NIP yang sudah ada akan diperbarui (bila dipilih); kolom kosong tidak menghapus data lama.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={async (e) => { e.preventDefault(); const r = await run(() => api<Preview>('POST', '/api/v1/employees/import/preview', new FormData(e.currentTarget)), { refresh: false }); if (r) setPreview(r); }}>
            <Field id="file" label="Berkas .xlsx atau .csv (maks. 10 MB, 5.000 baris)" error={fields.file}><Input {...fieldProps('file', fields.file)} type="file" accept=".xlsx,.csv" required className="h-auto py-1.5" /></Field>
            <Button type="submit" disabled={pending}><FileUp />{pending && !preview ? 'Memeriksa...' : 'Periksa berkas'}</Button>
          </form>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle>2. Pratinjau dan validasi</CardTitle>
            <CardDescription>{preview.summary.total} baris: {preview.summary.baru} pegawai baru, {preview.summary.perbarui} pembaruan, {preview.summary.galat} galat (tidak akan diimpor).</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              <div className="flex items-center gap-2"><Checkbox id="upd" checked={updateExisting} onCheckedChange={(v) => setUpdate(!!v)} /><Label htmlFor="upd" className="font-normal">Perbarui pegawai yang NIP-nya sudah ada</Label></div>
              <div className="flex items-center gap-2"><Checkbox id="acc" checked={createAccounts} onCheckedChange={(v) => setAccounts(!!v)} /><Label htmlFor="acc" className="font-normal">Buat akun login untuk pegawai baru</Label></div>
              <div className="flex items-center gap-2"><Checkbox id="err" checked={onlyErrors} onCheckedChange={(v) => setOnlyErrors(!!v)} /><Label htmlFor="err" className="font-normal">Tampilkan galat saja</Label></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={pending || preview.summary.baru + (updateExisting ? preview.summary.perbarui : 0) === 0}
                onClick={async () => { const r = await run(() => api<Preview>('POST', '/api/v1/employees/import/commit', { token: preview.token, updateExisting, createAccounts })); if (r) setDone(r); }}>
                {pending ? 'Mengimpor...' : `Impor ${preview.summary.baru + (updateExisting ? preview.summary.perbarui : 0)} baris valid`}
              </Button>
              <Button asChild variant="outline"><a href={`/api/v1/employees/import/${preview.token}`}><Download />Unduh hasil validasi</a></Button>
            </div>
            <RowsTable rows={onlyErrors ? preview.rows.filter((r) => r.action === 'GALAT') : preview.rows} />
            {preview.summary.total > preview.rows.length && <p className="text-sm text-muted-foreground">Menampilkan {preview.rows.length} baris pertama. Unduh hasil validasi untuk melihat semua.</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RowsTable({ rows, showResult }: { rows: Row[]; showResult?: boolean }) {
  return (
    <div className="max-h-[32rem] overflow-auto rounded-lg border">
      <Table>
        <TableHeader className="sticky top-0 bg-card"><TableRow><TableHead className="pl-4">Baris</TableHead><TableHead>Tindakan</TableHead>{showResult && <TableHead>Hasil</TableHead>}<TableHead>Nama</TableHead><TableHead>NIP</TableHead><TableHead>Unit</TableHead><TableHead className="pr-4">Pesan</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map((r) => (
          <TableRow key={r.line}>
            <TableCell className="pl-4 tabular">{r.line}</TableCell>
            <TableCell><Badge variant={ACTION[r.action].variant}>{ACTION[r.action].label}</Badge></TableCell>
            {showResult && <TableCell>{r.result ?? '-'}</TableCell>}
            <TableCell>{r.values.nama}</TableCell>
            <TableCell className="tabular">{r.values.nip}</TableCell>
            <TableCell>{r.values.kode_unit}</TableCell>
            <TableCell className="pr-4 whitespace-normal text-sm text-muted-foreground">{r.messages.join('; ')}</TableCell>
          </TableRow>
        ))}</TableBody>
      </Table>
    </div>
  );
}
