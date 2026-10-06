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

interface Row { line: number; action: 'KOREKSI' | 'GALAT'; messages: string[]; values: Record<string, string>; result?: string }
interface Preview { token: string; summary: { total: number; koreksi: number; galat: number; berhasil: number; gagal: number }; rows: Row[] }

export function ImportFlow() {
  const { pending, fields, run } = useAction();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [done, setDone] = useState<Preview | null>(null);
  const [reason, setReason] = useState('');
  const [onlyErrors, setOnlyErrors] = useState(false);

  if (done) {
    return (
      <div className="grid gap-4">
        <Alert variant={done.summary.gagal ? 'warning' : 'success'}>
          <AlertTitle>Impor selesai: {done.summary.berhasil} koreksi diterapkan, {done.summary.gagal} gagal, {done.summary.total - done.summary.berhasil - done.summary.gagal} dilewati</AlertTitle>
          <AlertDescription>Rekap absensi pegawai terkait sudah dihitung ulang. Unduh hasil untuk melihat status setiap baris.</AlertDescription>
        </Alert>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><a href={`/api/v1/corrections/import/${done.token}`}><Download />Unduh hasil impor</a></Button>
          <Button asChild><Link href="/absensi/koreksi?lihat=tinjau&status=APPROVED">Lihat daftar koreksi</Link></Button>
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
            Gunakan <a className="text-primary underline" href="/api/v1/corrections/template" download>template koreksi (.xlsx)</a>. Satu baris satu pegawai dan tanggal: isi jam masuk, jam pulang, status, atau dispensasi yang perlu diubah. Kolom yang kosong tidak mengubah data yang ada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={async (e) => { e.preventDefault(); const r = await run(() => api<Preview>('POST', '/api/v1/corrections/import/preview', new FormData(e.currentTarget)), { refresh: false }); if (r) setPreview(r); }}>
            <Field id="file" label="Berkas .xlsx atau .csv (maks. 10 MB, 2.000 baris)" error={fields.file}><Input {...fieldProps('file', fields.file)} type="file" accept=".xlsx,.csv" required className="h-auto py-1.5" /></Field>
            <Button type="submit" disabled={pending}><FileUp />{pending && !preview ? 'Memeriksa...' : 'Periksa berkas'}</Button>
          </form>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle>2. Pratinjau dan validasi</CardTitle>
            <CardDescription>{preview.summary.total} baris: {preview.summary.koreksi} siap diterapkan, {preview.summary.galat} galat (tidak akan diterapkan).</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field id="defaultReason" label="Alasan umum" hint="Dipakai untuk baris yang kolom Alasannya kosong atau kurang dari 10 karakter. Kosong = &quot;Koreksi massal dari berkas&quot;.">
              <Input id="defaultReason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} placeholder="Mis. Perbaikan data setelah rekap mesin diverifikasi" />
            </Field>
            <div className="flex items-center gap-2"><Checkbox id="err" checked={onlyErrors} onCheckedChange={(v) => setOnlyErrors(!!v)} /><Label htmlFor="err" className="font-normal">Tampilkan galat saja</Label></div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={pending || preview.summary.koreksi === 0}
                onClick={async () => { const r = await run(() => api<Preview>('POST', '/api/v1/corrections/import/commit', { token: preview.token, defaultReason: reason })); if (r) setDone(r); }}>
                {pending ? 'Menerapkan...' : `Terapkan ${preview.summary.koreksi} koreksi`}
              </Button>
              <Button asChild variant="outline"><a href={`/api/v1/corrections/import/${preview.token}`}><Download />Unduh hasil validasi</a></Button>
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
        <TableHeader className="sticky top-0 bg-card"><TableRow><TableHead className="pl-4">Baris</TableHead><TableHead>Status</TableHead>{showResult && <TableHead>Hasil</TableHead>}<TableHead>Pegawai</TableHead><TableHead>Tanggal</TableHead><TableHead>Masuk</TableHead><TableHead>Pulang</TableHead><TableHead>Status absen</TableHead><TableHead className="pr-4">Pesan</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map((r) => (
          <TableRow key={r.line}>
            <TableCell className="pl-4 tabular">{r.line}</TableCell>
            <TableCell><Badge variant={r.action === 'GALAT' ? 'alpa' : 'hadir'}>{r.action === 'GALAT' ? 'Galat' : 'Siap'}</Badge></TableCell>
            {showResult && <TableCell>{r.result ?? '-'}</TableCell>}
            <TableCell>{r.values.nama ?? r.values.nip}<span className="block text-xs tabular text-muted-foreground">{r.values.nip}</span></TableCell>
            <TableCell className="tabular">{r.values.tanggal}</TableCell>
            <TableCell className="tabular">{r.values.jam_masuk}</TableCell>
            <TableCell className="tabular">{r.values.jam_pulang}</TableCell>
            <TableCell>{r.values.status}{r.values.dispensasi && /^(ya|y)$/i.test(r.values.dispensasi) ? ' (dispensasi)' : ''}</TableCell>
            <TableCell className="pr-4 whitespace-normal text-sm text-muted-foreground">{r.messages.join('; ')}</TableCell>
          </TableRow>
        ))}</TableBody>
      </Table>
    </div>
  );
}
