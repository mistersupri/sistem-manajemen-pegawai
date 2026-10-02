'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { api, newKey } from './api-client';
import { blinkDetector, detect, draw, fmtClock, getLocation, loadFaceApi, qualityOf, serverClock, startCamera, stopCamera, toArray, type Detection } from '@/lib/face-client';

interface Result { outcome: string; message: string; time?: string; status?: string; lateMinutes?: number; similarity?: number | null }

/** Absen wajah dari perangkat pribadi: verifikasi 1:1 terhadap pemilik akun. */
export function FaceCheck({ suggested, requireLiveness, wantGps }: { suggested: 'IN' | 'OUT'; requireLiveness: boolean; wantGps: boolean }) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const current = useRef<Detection | null>(null);
  const [status, setStatus] = useState('Memuat model pengenal wajah...');
  const [canSubmit, setCanSubmit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState('--:--:--');
  const [loc, setLoc] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [locMsg, setLocMsg] = useState(wantGps ? 'Mengambil lokasi GPS...' : '');
  const [result, setResult] = useState<Result | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  useEffect(() => {
    const el = video.current;
    let stop = false;
    const blink = blinkDetector();
    let timer: ReturnType<typeof setInterval> | undefined;
    (async () => {
      const c = await serverClock();
      timer = setInterval(() => setClock(`${fmtClock(c.now(), c.tz)} ${c.label}`), 500);
      if (wantGps) getLocation().then((l) => { setLoc(l); setLocMsg(`Lokasi terdeteksi (akurasi sekitar ${l.accuracy} m).`); }).catch((e) => setLocMsg((e as Error).message));
      try {
        const f = await loadFaceApi();
        await startCamera(video.current!);
        const loop = async () => {
          if (stop || !video.current) return;
          if (video.current.readyState >= 2) {
            const { detection, count } = await detect(f, video.current, 320);
            const blinked = requireLiveness ? blink.update(detection) : true;
            const ok = !!detection && count === 1 && blinked;
            current.current = ok ? (detection as Detection) : null;
            setCanSubmit(ok);
            draw(overlay.current!, video.current, detection, ok ? '#00e676' : '#ffc107');
            setStatus(!detection ? 'Hadapkan wajah ke kamera.' : count > 1 ? 'Hanya wajah Anda yang boleh terlihat.' : !blinked ? 'Kedipkan mata untuk verifikasi.' : 'Wajah terdeteksi. Pilih absen masuk atau pulang.');
          }
          requestAnimationFrame(loop);
        };
        loop();
      } catch (e) {
        setFatal((e as Error).message);
        setStatus('Kamera atau model tidak tersedia.');
      }
    })();
    return () => { stop = true; clearInterval(timer); stopCamera(el); };
  }, [requireLiveness, wantGps]);

  async function submit(direction: 'IN' | 'OUT') {
    const det = current.current;
    if (!det || !video.current) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await api<Result>('POST', '/api/v1/attendance/face', {
        direction, descriptor: toArray(det.descriptor), quality: qualityOf(video.current, det),
        liveness: requireLiveness ? { method: 'kedip', passed: true } : undefined,
        latitude: loc?.lat ?? null, longitude: loc?.lng ?? null, accuracyM: loc?.accuracy ?? null,
        idempotencyKey: newKey(), clientTime: new Date().toISOString(),
      });
      setResult(r);
      if (r.outcome === 'SUCCESS') { stopCamera(video.current); router.refresh(); }
    } catch (e) {
      setResult({ outcome: 'ERROR', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const ok = result?.outcome === 'SUCCESS';
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[7fr_5fr]">
      <div className="camera-wrap mirror">
        <video ref={video} autoPlay muted playsInline aria-label="Pratinjau kamera" />
        <canvas ref={overlay} aria-hidden />
        <div className="face-guide" aria-hidden />
        <div className="camera-status" aria-live="polite">{status}</div>
      </div>
      <Card>
        <CardContent className="grid gap-4">
          <div><div className="text-sm text-muted-foreground">Jam server</div><div className="text-3xl font-bold tabular">{clock}</div></div>
          {wantGps && <div><div className="text-sm text-muted-foreground">Lokasi</div><p className="text-sm" aria-live="polite">{locMsg}</p></div>}
          {fatal && <Alert variant="destructive"><AlertTitle>Absen wajah tidak dapat dipakai</AlertTitle><AlertDescription>{fatal} Gunakan mesin absensi atau minta petugas mencatat absensi Anda.</AlertDescription></Alert>}
          <div className="grid gap-2">
            <Button size="lg" className="h-12 text-base" variant={suggested === 'IN' ? 'default' : 'outline'} disabled={!canSubmit || busy || ok} onClick={() => submit('IN')}>Absen masuk</Button>
            <Button size="lg" className="h-12 text-base" variant={suggested === 'OUT' ? 'default' : 'outline'} disabled={!canSubmit || busy || ok} onClick={() => submit('OUT')}>Absen pulang</Button>
            <p className="text-sm text-muted-foreground">Tombol aktif setelah wajah terdeteksi{requireLiveness ? ' dan Anda berkedip' : ''}.</p>
          </div>
          <div aria-live="polite">
            {busy && <Alert><AlertDescription>Memverifikasi wajah...</AlertDescription></Alert>}
            {result && (
              <Alert variant={ok ? 'success' : 'destructive'}>
                <AlertTitle>{ok ? `Tercatat pukul ${result.time}` : 'Belum tercatat'}</AlertTitle>
                <AlertDescription>
                  <p>{ok ? `Status: ${result.status === 'TERLAMBAT' ? `terlambat ${result.lateMinutes} menit` : result.status === 'DINAS_LUAR' ? 'dinas luar' : 'hadir'}.` : result.message}</p>
                  {!ok && <p>Bila terus gagal, gunakan mesin absensi, minta petugas mencatat, atau <Link className="underline" href="/absensi/koreksi/baru">ajukan koreksi</Link>. Kegagalan verifikasi tidak dianggap pelanggaran.</p>}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
