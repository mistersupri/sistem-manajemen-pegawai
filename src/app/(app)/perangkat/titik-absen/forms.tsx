'use client';

import { useState } from 'react';
import QRCode from 'qrcode';
import { Copy, MoreHorizontal, Plus } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Field, fieldProps } from '@/components/app/field';
import { api, useAction } from '@/components/app/api-client';
import { toast } from 'sonner';

type Opt = { id: string; name: string };
type Values = { name: string; unitId: string | null; allowFieldDuty: boolean; requireLocation: boolean };

/** Tautan dan QR yang hanya tampil sekali setelah dibuat atau diganti. */
function LinkReveal({ token, onClose }: { token: string | null; onClose: () => void }) {
  const [qr, setQr] = useState<{ token: string; url: string } | null>(null);
  const url = token ? `${window.location.origin}/absen/${token}` : '';
  if (token && qr?.token !== token) QRCode.toDataURL(url, { width: 320, margin: 1 }).then((u) => setQr({ token, url: u }));
  return (
    <Dialog open={!!token} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tautan titik absen</DialogTitle>
          <DialogDescription>Hanya ditampilkan sekali. Simpan atau buka di tablet kiosk sekarang. Siapa pun yang memegang tautan ini bisa membuka halaman absen, jadi bagikan seperlunya; ganti tautan bila bocor.</DialogDescription>
        </DialogHeader>
        {qr?.token === token && <img src={qr.url} alt="Kode QR tautan titik absen" className="mx-auto size-56 rounded-lg border bg-white p-2" />}
        <div className="flex gap-2">
          <Input readOnly value={url} aria-label="Tautan titik absen" className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
          <Button type="button" variant="outline" size="icon" aria-label="Salin tautan" onClick={async () => { await navigator.clipboard.writeText(url); toast.success('Tautan disalin.'); }}><Copy /></Button>
        </div>
        <DialogFooter>
          <Button asChild variant="outline"><a href={url} target="_blank" rel="noreferrer">Buka halaman</a></Button>
          <Button onClick={onClose}>Selesai</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StationFields({ units, canAllUnits, initial, fields }: { units: Opt[]; canAllUnits: boolean; initial?: Values; fields: Record<string, string> }) {
  const [fd, setFd] = useState(initial?.allowFieldDuty ?? false);
  const [loc, setLoc] = useState(initial?.requireLocation ?? false);
  return (
    <>
      <Field id="name" label="Nama titik absen" error={fields.name} required hint="Mis. Lobi gedung utama, atau Tautan ponsel Bidang A.">
        <Input {...fieldProps('name', fields.name)} defaultValue={initial?.name} required maxLength={80} />
      </Field>
      <Field id="unitId" label="Pegawai yang dikenali" error={fields.unitId} hint="Wajah hanya dicocokkan dengan pegawai unit ini dan sub-unitnya.">
        <NativeSelect {...fieldProps('unitId', fields.unitId)} defaultValue={initial ? initial.unitId ?? '' : canAllUnits ? '' : units[0]?.id}>
          {canAllUnits && <NativeSelectOption value="">Semua unit</NativeSelectOption>}
          {units.map((u) => <NativeSelectOption key={u.id} value={u.id}>{u.name}</NativeSelectOption>)}
        </NativeSelect>
      </Field>
      <div className="flex items-start gap-3">
        <Checkbox id="requireLocation" name="requireLocation" checked={loc} onCheckedChange={(v) => setLoc(!!v)} className="mt-0.5" />
        <div className="grid gap-1">
          <Label htmlFor="requireLocation" className="font-normal">Wajib di area kantor (GPS)</Label>
          <p className="text-xs text-muted-foreground">Pakai radius kantor di Pengaturan, Metode Absensi. Aktifkan bila tautan dibagikan ke ponsel pegawai.</p>
          {fields.requireLocation && <p className="text-xs font-medium text-destructive">{fields.requireLocation}</p>}
        </div>
      </div>
      <div className="flex items-start gap-3">
        <Checkbox id="allowFieldDuty" name="allowFieldDuty" checked={fd} onCheckedChange={(v) => setFd(!!v)} className="mt-0.5" />
        <div className="grid gap-1">
          <Label htmlFor="allowFieldDuty" className="font-normal">Layani absen dinas luar</Label>
          <p className="text-xs text-muted-foreground">Menambah halaman dinas luar (selfie, GPS, keterangan) tanpa login. Radius kantor tidak berlaku untuk dinas luar.</p>
        </div>
      </div>
    </>
  );
}

const values = (form: HTMLFormElement): Values => {
  const d = new FormData(form);
  return { name: String(d.get('name') ?? ''), unitId: String(d.get('unitId') ?? '') || null, allowFieldDuty: d.get('allowFieldDuty') === 'on', requireLocation: d.get('requireLocation') === 'on' };
};

export function CreateStation({ units, canAllUnits }: { units: Opt[]; canAllUnits: boolean }) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const { pending, fields, run } = useAction();
  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button><Plus />Buat titik absen</Button></DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <form className="grid gap-4" onSubmit={async (e) => {
            e.preventDefault();
            const r = await run(() => api<{ token: string }>('POST', '/api/v1/stations', values(e.currentTarget)), { success: 'Titik absen dibuat.' });
            if (r) { setOpen(false); setToken(r.token); }
          }}>
            <DialogHeader><DialogTitle>Buat titik absen</DialogTitle><DialogDescription>Menghasilkan tautan rekam wajah tanpa login untuk tablet kiosk atau ponsel pegawai.</DialogDescription></DialogHeader>
            <StationFields units={units} canAllUnits={canAllUnits} fields={fields} />
            <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button type="submit" disabled={pending}>{pending ? 'Menyimpan...' : 'Buat tautan'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <LinkReveal token={token} onClose={() => setToken(null)} />
    </>
  );
}

export function StationActions({ station, units, canAllUnits, used }: { station: Values & { id: string; isActive: boolean }; units: Opt[]; canAllUnits: boolean; used: boolean }) {
  const [edit, setEdit] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const { pending, fields, error, run } = useAction();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Aksi untuk ${station.name}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEdit(true)}>Ubah</DropdownMenuItem>
          <DropdownMenuItem onSelect={async () => {
            if (!confirm(`Ganti tautan ${station.name}? Tautan lama langsung tidak berlaku; perangkat yang memakainya perlu dibuka ulang dengan tautan baru.`)) return;
            const r = await run(() => api<{ token: string }>('POST', `/api/v1/stations/${station.id}/token`), { success: 'Tautan baru dibuat.' });
            if (r) setToken(r.token);
          }}>Ganti tautan</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant={station.isActive ? 'destructive' : 'default'} onSelect={() => run(() => api('PATCH', `/api/v1/stations/${station.id}`, { isActive: !station.isActive }), { success: station.isActive ? 'Titik absen dinonaktifkan.' : 'Titik absen diaktifkan.' })}>{station.isActive ? 'Nonaktifkan' : 'Aktifkan'}</DropdownMenuItem>
          {!used && <DropdownMenuItem variant="destructive" onSelect={() => { if (confirm(`Hapus ${station.name}?`)) run(() => api('DELETE', `/api/v1/stations/${station.id}`), { success: 'Titik absen dihapus.' }); }}>Hapus</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={edit} onOpenChange={setEdit}>
        <DialogContent className="sm:max-w-md">
          <form className="grid gap-4" onSubmit={async (e) => {
            e.preventDefault();
            const r = await run(() => api('PATCH', `/api/v1/stations/${station.id}`, values(e.currentTarget)), { success: 'Titik absen disimpan.' });
            if (r !== undefined) setEdit(false);
          }}>
            <DialogHeader><DialogTitle>Ubah {station.name}</DialogTitle><DialogDescription>Tautan tetap sama.</DialogDescription></DialogHeader>
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <StationFields units={units} canAllUnits={canAllUnits} initial={station} fields={fields} />
            <DialogFooter><Button type="button" variant="outline" onClick={() => setEdit(false)}>Batal</Button><Button type="submit" disabled={pending}>{pending ? 'Menyimpan...' : 'Simpan'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <LinkReveal token={token} onClose={() => setToken(null)} />
    </>
  );
}
