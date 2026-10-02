'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, LocateFixed, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Field, fieldProps } from './field';
import { api, newKey } from './api-client';
import { capture, detect, fmtClock, fmtDateLong, getLocation, loadFaceApi, qualityOf, reverseGeocode, serverClock, startCamera, stopCamera, toArray, type Detection } from '@/lib/face-client';

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const words = text.split(' ');
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > max && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

/** Absen dinas luar: selfie berstempel jam server + GPS, diverifikasi 1:1 terhadap wajah pemilik akun. */
export function FieldDuty({ employee, org, storePhoto, geocode }: { employee: { name: string; nip: string | null }; org: string; storePhoto: boolean; geocode: boolean }) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const clock = useRef<Awaited<ReturnType<typeof serverClock>> | null>(null);
  const [status, setStatus] = useState('Menyiapkan kamera...');
  const [ready, setReady] = useState(false);
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsMsg, setGpsMsg] = useState('Mengambil lokasi...');
  const [address, setAddress] = useState('');
  const [direction, setDirection] = useState<'IN' | 'OUT'>('IN');
  const [pending, setPending] = useState<{ photo: string; descriptor: number[]; quality: ReturnType<typeof qualityOf> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ ok: boolean; title: string; message: string } | null>(null);

  async function locate() {
    setGpsMsg('Mengambil lokasi...');
    try {
      const l = await getLocation();
      setGps(l);
      setGpsMsg(`${l.lat.toFixed(6)}, ${l.lng.toFixed(6)} (akurasi sekitar ${l.accuracy} m)`);
      if (geocode) setAddress(await reverseGeocode(l.lat, l.lng));
    } catch (e) {
      setGps(null);
      setGpsMsg((e as Error).message);
    }
  }

  useEffect(() => {
    let stopped = false;
    (async () => {
      clock.current = await serverClock();
      locate();
      try {
        await loadFaceApi();
        await startCamera(video.current!);
        if (!stopped) { setReady(true); setStatus('Hadapkan wajah ke kamera, lalu ambil foto.'); }
      } catch (e) {
        setStatus((e as Error).message);
      }
    })();
    return () => { stopped = true; stopCamera(video.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function take() {
    setFields({});
    if (!note.trim()) { setFields({ note: 'Isi tujuan atau keterangan tugas.' }); return; }
    if (!gps) { setFields({ gps: 'Lokasi GPS wajib. Aktifkan GPS lalu tekan Perbarui lokasi.' }); return; }
    const f = await loadFaceApi();
    const v = video.current!;
    setStatus('Memeriksa wajah...');
    const { detection } = await detect(f, v, 416);
    if (!detection) { setStatus('Wajah tidak terdeteksi. Coba lagi.'); return; }
    const canvas = capture(v, { maxWidth: 960 });
    const ctx = canvas.getContext('2d')!;
    const c = clock.current!;
    const now = c.now();
    const W = canvas.width;
    const fs = Math.max(13, Math.round(W / 40));
    ctx.font = `${fs}px sans-serif`;
    const lines: { text: string; bold?: boolean; small?: boolean }[] = [
      { text: `DINAS LUAR · ${employee.name}${employee.nip ? ` (${employee.nip})` : ''}`, bold: true },
      { text: `Waktu: ${fmtDateLong(now, c.tz)} ${fmtClock(now, c.tz)} ${c.label}` },
      { text: `Lokasi: ${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)} (±${gps.accuracy} m)` },
    ];
    if (address) wrap(ctx, address, W - fs * 2).slice(0, 3).forEach((t) => lines.push({ text: t, small: true }));
    wrap(ctx, `Ket: ${note.trim()}`, W - fs * 2).slice(0, 2).forEach((t) => lines.push({ text: t, small: true }));
    lines.push({ text: org, small: true });
    const lh = Math.round(fs * 1.35);
    const boxH = lh * lines.length + fs;
    const grad = ctx.createLinearGradient(0, canvas.height - boxH - fs, 0, canvas.height);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.25, 'rgba(0,0,0,.65)');
    grad.addColorStop(1, 'rgba(0,0,0,.8)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, canvas.height - boxH - fs, W, boxH + fs);
    let y = canvas.height - boxH + lh * 0.6;
    ctx.textBaseline = 'middle';
    for (const l of lines) {
      ctx.font = `${l.bold ? 'bold ' : ''}${l.small ? Math.round(fs * 0.85) : fs}px sans-serif`;
      ctx.fillStyle = l.bold ? '#ffd54f' : '#ffffff';
      ctx.fillText(l.text, fs, y);
      y += lh;
    }
    setPending({ photo: canvas.toDataURL('image/jpeg', 0.82), descriptor: toArray((detection as Detection).descriptor), quality: qualityOf(v, detection as Detection) });
    setStatus('Periksa foto lalu kirim.');
  }

  async function send() {
    if (!pending || !gps) return;
    setBusy(true);
    try {
      const r = await api<{ outcome: string; message: string; time?: string }>('POST', '/api/v1/attendance/field-duty', {
        direction, descriptor: pending.descriptor, quality: pending.quality, photo: storePhoto ? pending.photo : null,
        latitude: gps.lat, longitude: gps.lng, accuracyM: gps.accuracy, address: address || null, note: note.trim(),
        idempotencyKey: newKey(), clientTime: new Date().toISOString(),
      });
      const ok = r.outcome === 'SUCCESS';
      setResult({ ok, title: ok ? `Absen ${direction === 'IN' ? 'masuk' : 'pulang'} dinas luar tercatat pukul ${r.time}` : 'Belum tercatat', message: ok ? 'Status hari ini: dinas luar.' : r.message });
      if (ok) { stopCamera(video.current); router.refresh(); }
    } catch (e) {
      const err = e as { message: string; fields?: Record<string, string> };
      setFields(err.fields || {});
      setResult({ ok: false, title: 'Gagal mengirim', message: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[7fr_5fr]">
      <div>
        <div className="camera-wrap mirror" hidden={!!pending}>
          <video ref={video} autoPlay muted playsInline aria-label="Pratinjau kamera" />
          <div className="camera-status" aria-live="polite">{status}</div>
        </div>
        {pending && <img src={pending.photo} alt="Pratinjau foto dengan stempel waktu dan lokasi" className="w-full rounded-xl border" />}
      </div>
      <Card>
        <CardContent className="grid gap-4">
          <div>
            <div className="text-sm text-muted-foreground">Lokasi GPS</div>
            <p className="text-sm" aria-live="polite">{gpsMsg}</p>
            {address && <p className="text-sm text-muted-foreground">{address}</p>}
            {fields.gps && <p className="text-sm font-medium text-destructive" role="alert">{fields.gps}</p>}
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={locate}><LocateFixed />Perbarui lokasi</Button>
          </div>
          <Field id="note" label="Tujuan atau keterangan tugas" error={fields.note} required>
            <Input {...fieldProps('note', fields.note)} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Mis. rapat koordinasi di kantor wilayah" />
          </Field>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Jenis absen</legend>
            <div className="grid grid-cols-2 gap-1 rounded-full border bg-card p-1">
              {(['IN', 'OUT'] as const).map((d) => (
                <button key={d} type="button" aria-pressed={direction === d} onClick={() => setDirection(d)}
                  className={`min-h-10 rounded-full text-sm font-medium ${direction === d ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                  {d === 'IN' ? 'Masuk' : 'Pulang'}
                </button>
              ))}
            </div>
          </fieldset>
          {!pending ? (
            <Button size="lg" className="h-12 text-base" disabled={!ready} onClick={take}><Camera />Ambil foto</Button>
          ) : (
            <div className="grid gap-2">
              <Button size="lg" className="h-12 text-base" disabled={busy || result?.ok} onClick={send}>{busy ? 'Mengirim...' : 'Kirim absensi'}</Button>
              <Button variant="outline" disabled={busy || result?.ok} onClick={() => { setPending(null); setResult(null); setStatus('Hadapkan wajah ke kamera, lalu ambil foto.'); }}><RotateCcw />Ulangi foto</Button>
            </div>
          )}
          {!storePhoto && <p className="text-xs text-muted-foreground">Pengaturan privasi instansi: foto tidak disimpan di server, hanya hasil verifikasi dan lokasi.</p>}
          <div aria-live="polite">
            {result && <Alert variant={result.ok ? 'success' : 'destructive'}><AlertTitle>{result.title}</AlertTitle><AlertDescription>{result.message}</AlertDescription></Alert>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
