'use client';

import { useState } from 'react';
import { Paperclip, Pencil, Plus, Send, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, fieldProps } from '@/components/app/field';
import { api, useAction } from '@/components/app/api-client';
import { confirmDialog } from '@/components/app/confirm-dialog';
import { fmtTanggal } from '@/lib/time';

interface Existing { id: string; content: string; attachments: { id: string; fileName: string; size: number }[] }

const kb = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

/** Isi, ubah, atau hapus laporan satu hari, termasuk lampiran. */
export function DayReportButton({ date, report }: { date: string; report: Existing | null }) {
  const [open, setOpen] = useState(false);
  const [removed, setRemoved] = useState<string[]>([]);
  const { pending, fields, run } = useAction();
  const kept = (report?.attachments ?? []).filter((a) => !removed.includes(a.id));
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setRemoved([]); }}>
      <DialogTrigger asChild>
        <Button variant={report ? 'outline' : 'default'} size="sm">{report ? <Pencil /> : <Plus />}{report ? 'Ubah' : 'Isi laporan'}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          fd.set('date', date);
          fd.set('remove', removed.join(','));
          const r = await run(() => api('POST', '/api/v1/reports/daily', fd), { success: 'Laporan disimpan.' });
          if (r !== undefined) { setOpen(false); setRemoved([]); }
        }}>
          <DialogHeader><DialogTitle>Laporan {fmtTanggal(date)}</DialogTitle><DialogDescription>Tuliskan pekerjaan yang Anda selesaikan hari ini. Lampiran opsional (maks. 5 berkas, 5 MB per berkas).</DialogDescription></DialogHeader>
          <Field id={`content-${date}`} label="Uraian pekerjaan" error={fields.content} required>
            <Textarea {...fieldProps(`content-${date}`, fields.content)} name="content" rows={6} required minLength={5} maxLength={4000} defaultValue={report?.content ?? ''} />
          </Field>
          {kept.length > 0 && (
            <ul className="grid gap-1.5">
              {kept.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm">
                  <span className="inline-flex min-w-0 items-center gap-1.5"><Paperclip className="size-3.5 shrink-0" /><span className="truncate">{a.fileName}</span><span className="shrink-0 text-xs text-muted-foreground">{kb(a.size)}</span></span>
                  <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={`Hapus lampiran ${a.fileName}`} onClick={() => setRemoved((r) => [...r, a.id])}><X /></Button>
                </li>
              ))}
            </ul>
          )}
          <Field id={`files-${date}`} label="Tambah lampiran" error={fields.files} hint="PDF, gambar, Word, Excel, PowerPoint, TXT, atau CSV.">
            <Input {...fieldProps(`files-${date}`, fields.files, true)} name="files" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.pptx,.doc,.xls,.ppt,.txt,.csv" className="h-auto py-1.5" />
          </Field>
          <DialogFooter className="gap-2 sm:justify-between">
            {report ? (
              <Button type="button" variant="outline-destructive" disabled={pending} onClick={async () => {
                if (!(await confirmDialog({ title: 'Hapus laporan hari ini?', description: 'Uraian dan semua lampiran hari ini dihapus.', confirmLabel: 'Hapus', destructive: true }))) return;
                const r = await run(() => api('DELETE', `/api/v1/reports/daily/${report.id}`), { success: 'Laporan dihapus.' });
                if (r !== undefined) setOpen(false);
              }}><Trash2 />Hapus</Button>
            ) : <span />}
            <span className="flex gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button type="submit" disabled={pending}>{pending ? 'Menyimpan...' : 'Simpan'}</Button></span>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Kirim laporan bulan itu ke atasan langsung. */
export function SubmitMonth({ month, filled, summary }: { month: string; filled: number; summary: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(summary);
  const { pending, fields, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button disabled={filled === 0}><Send />Kirim ke atasan</Button></DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          const r = await run(() => api('POST', '/api/v1/reports/month/submit', { month, summary: text }), { success: 'Laporan dikirim ke atasan.' });
          if (r !== undefined) setOpen(false);
        }}>
          <DialogHeader><DialogTitle>Kirim laporan bulan ini?</DialogTitle><DialogDescription>{filled} laporan harian akan dikirim ke atasan langsung. Setelah dikirim laporan terkunci sampai atasan menilai atau mengembalikannya.</DialogDescription></DialogHeader>
          <Field id="summary" label="Ringkasan bulan ini (opsional)" error={fields.summary}>
            <Textarea {...fieldProps('summary', fields.summary)} rows={4} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Capaian utama, kendala, atau hal yang perlu atasan ketahui." />
          </Field>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button type="submit" disabled={pending}>{pending ? 'Mengirim...' : 'Kirim'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
