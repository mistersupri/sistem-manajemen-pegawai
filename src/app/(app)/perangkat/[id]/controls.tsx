'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlugZap, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ConfirmButton } from '@/components/app/confirm-button';
import { api, useAction } from '@/components/app/api-client';

export function DeviceControls({ id, pull, active, canSync, canManage }: { id: string; pull: boolean; active: boolean; canSync: boolean; canManage: boolean }) {
  const router = useRouter();
  const { pending, run } = useAction();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [recon, setRecon] = useState<{ date: string; stored: number; unmatched: number }[] | null>(null);
  const [weekAgo] = useState(() => new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10));
  return (
    <Card>
      <CardHeader><CardTitle>Tindakan</CardTitle><CardDescription>Setiap tindakan tercatat di audit log.</CardDescription></CardHeader>
      <CardContent className="grid gap-4">
        {canSync && pull && active && (
          <div className="flex flex-wrap gap-2">
            <Button disabled={pending} onClick={async () => { const r = await run(() => api<{ ok: boolean; message: string }>('POST', `/api/v1/devices/${id}/test`)); if (r) setMsg({ ok: r.ok, text: r.message }); }}><PlugZap />Uji koneksi</Button>
            <Button variant="outline" disabled={pending} onClick={async () => { const r = await run(() => api<{ inserted: number; duplicates: number; received: number }>('POST', `/api/v1/devices/${id}/sync`)); if (r) setMsg({ ok: true, text: `Diterima ${r.received}, baru ${r.inserted}, duplikat ${r.duplicates}.` }); }}><RefreshCw />Tarik data sekarang</Button>
          </div>
        )}
        {msg && <Alert variant={msg.ok ? 'success' : 'destructive'}><AlertDescription>{msg.text}</AlertDescription></Alert>}
        {canSync && pull && active && (
          <form className="grid gap-2 rounded-lg border p-3" onSubmit={async (e) => {
            e.preventDefault();
            const from = new FormData(e.currentTarget).get('from');
            const r = await run(() => api<{ days: { date: string; stored: number; unmatched: number }[] }>('POST', `/api/v1/devices/${id}/reconcile`, { from }), { success: 'Rekonsiliasi selesai.' });
            if (r) setRecon(r.days);
          }}>
            <Label htmlFor="recon-from" className="font-semibold">Rekonsiliasi</Label>
            <p className="text-sm text-muted-foreground">Tarik ulang semua data sejak tanggal ini tanpa kursor. Scan yang belum ada disimpan, yang sudah ada dilewati.</p>
            <div className="flex gap-2"><Input id="recon-from" name="from" type="date" defaultValue={weekAgo} className="w-auto" /><Button type="submit" variant="outline" disabled={pending}>Jalankan</Button></div>
            {recon && (
              <ul className="mt-2 grid gap-1 text-sm">{recon.length ? recon.map((d) => <li key={d.date} className="flex justify-between"><span>{d.date}</span><span className="tabular">{d.stored} scan{d.unmatched ? `, ${d.unmatched} belum terpetakan` : ''}</span></li>) : <li className="text-muted-foreground">Tidak ada scan pada rentang ini.</li>}</ul>
            )}
          </form>
        )}
        {!pull && <p className="text-sm text-muted-foreground">Perangkat ini dibaca lewat impor berkas USB di menu Status Sinkronisasi.</p>}
        {canManage && (
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button variant="outline" disabled={pending} onClick={() => run(() => api('POST', `/api/v1/devices/${id}/status`, { active: !active }), { success: active ? 'Perangkat dinonaktifkan.' : 'Perangkat diaktifkan.' })}>{active ? 'Nonaktifkan' : 'Aktifkan'}</Button>
            <ConfirmButton label="Hapus" title="Hapus perangkat?" description="Perangkat disembunyikan dan tidak disinkronkan lagi. Raw event dan riwayat sinkronisasi tetap tersimpan." confirmLabel="Hapus perangkat" method="DELETE" url={`/api/v1/devices/${id}`} success="Perangkat dihapus." onDone={() => router.push('/perangkat')} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function RetryButton({ id }: { id: string }) {
  const { pending, run } = useAction();
  return <Button size="sm" variant="outline" className="ml-2" disabled={pending} onClick={() => run(() => api('POST', `/api/v1/devices/runs/${id}/retry`), { success: 'Sinkronisasi diulang.' })}>{pending ? 'Mengulang...' : 'Ulangi'}</Button>;
}
