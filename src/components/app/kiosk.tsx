'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CircleCheck, CircleX, Maximize } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api, newKey } from './api-client';
import { blinkDetector, detect, draw, fmtClock, fmtDateLong, loadFaceApi, qualityOf, serverClock, startCamera, stopCamera, toArray, type Detection } from '@/lib/face-client';

interface Res { outcome: string; message: string; time?: string; status?: string; lateMinutes?: number; similarity?: number | null; schedule?: string | null; employee?: { name: string; employeeNumber: string | null; position: string | null } }

export function Kiosk({ org, logo, enabled, requireLiveness, enrolled }: { org: string; logo: string | null; enabled: boolean; requireLiveness: boolean; enrolled: number }) {
  const video = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef<'IN' | 'OUT'>('IN');
  const [mode, setMode] = useState<'IN' | 'OUT'>('IN');
  const [clock, setClock] = useState('--:--:--');
  const [date, setDate] = useState('');
  const [status, setStatus] = useState('Memuat model pengenal wajah...');
  const [result, setResult] = useState<Res | null>(null);
  const [log, setLog] = useState<{ t: string; text: string; ok: boolean }[]>([]);

  const pick = (m: 'IN' | 'OUT') => { modeRef.current = m; setMode(m); };

  useEffect(() => {
    if (!enabled) return;
    const el = video.current;
    let stop = false;
    let busy = false;
    let pauseUntil = 0;
    let stable = 0;
    let timer: ReturnType<typeof setInterval> | undefined;
    const blink = blinkDetector();
    (async () => {
      const c = await serverClock();
      const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: c.tz, hour: '2-digit', hourCycle: 'h23' }).format(c.now()));
      if (hour >= 12) pick('OUT');
      timer = setInterval(() => { const n = c.now(); setClock(`${fmtClock(n, c.tz)} ${c.label}`); setDate(fmtDateLong(n, c.tz)); }, 500);
      try {
        const f = await loadFaceApi();
        await startCamera(video.current!);
        setStatus('Siap. Silakan hadapkan wajah ke kamera.');
        const loop = async () => {
          if (stop || !video.current) return;
          if (!busy && video.current.readyState >= 2 && Date.now() > pauseUntil) {
            const { detection, count } = await detect(f, video.current, 320);
            draw(overlay.current!, video.current, detection, detection && count === 1 ? '#00e676' : '#ffc107');
            if (!detection) { stable = 0; blink.reset(); setStatus('Silakan hadapkan wajah ke kamera.'); }
            else if (count > 1) { stable = 0; setStatus('Terdeteksi lebih dari satu wajah. Satu per satu.'); }
            else {
              const blinked = requireLiveness ? blink.update(detection) : true;
              stable = detection.detection.score > 0.5 ? stable + 1 : 0;
              if (!blinked) setStatus('Wajah terdeteksi. Silakan kedipkan mata.');
              else if (stable >= 3) {
                busy = true;
                setStatus('Mencocokkan wajah...');
                const d = detection as Detection;
                try {
                  const r = await api<Res>('POST', '/api/v1/attendance/kiosk', {
                    direction: modeRef.current, descriptor: toArray(d.descriptor), quality: qualityOf(video.current, d),
                    liveness: requireLiveness ? { method: 'kedip', passed: true } : undefined, idempotencyKey: newKey(), clientTime: new Date().toISOString(),
                  });
                  setResult(r);
                  const ok = r.outcome === 'SUCCESS';
                  setLog((l) => [{ t: fmtClock(c.now(), c.tz).slice(0, 5), text: ok ? `${r.employee?.name}, ${modeRef.current === 'IN' ? 'masuk' : 'pulang'} ${r.time}` : r.message.split('.')[0], ok }, ...l].slice(0, 30));
                  setStatus(ok ? `Terima kasih, ${r.employee?.name}.` : r.message);
                  pauseUntil = Date.now() + (ok ? 4000 : 3500);
                } catch (e) {
                  setResult({ outcome: 'ERROR', message: (e as Error).message });
                  pauseUntil = Date.now() + 3500;
                }
                blink.reset();
                stable = 0;
                busy = false;
              } else setStatus('Tahan posisi...');
            }
          } else if (Date.now() <= pauseUntil) {
            overlay.current?.getContext('2d')?.clearRect(0, 0, overlay.current.width, overlay.current.height);
          }
          requestAnimationFrame(loop);
        };
        loop();
      } catch (e) {
        setStatus((e as Error).message);
      }
    })();
    return () => { stop = true; clearInterval(timer); stopCamera(el); };
  }, [enabled, requireLiveness]);

  const ok = result?.outcome === 'SUCCESS';
  return (
    <div className="mx-auto max-w-7xl px-4 py-4 lg:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {logo && <img src={logo} alt="" className="h-12 rounded-lg bg-white p-1" />}
          <div><h1 className="text-xl font-bold">Absensi wajah</h1><p className="text-sm text-muted-foreground">{org}</p></div>
        </div>
        <div className="text-right"><div className="text-3xl font-bold tabular md:text-4xl" aria-live="off">{clock}</div><div className="text-sm text-muted-foreground">{date}</div></div>
      </div>
      {!enabled ? (
        <div className="rounded-xl border bg-card p-8 text-center"><p className="text-lg font-semibold">Kiosk wajah sedang dinonaktifkan</p><p className="mt-1 text-muted-foreground">Aktifkan di Pengaturan, Metode Absensi.</p></div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[7fr_5fr]">
          <div>
            <fieldset className="mb-3">
              <legend className="sr-only">Jenis absen</legend>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                {(['IN', 'OUT'] as const).map((m) => (
                  <button key={m} type="button" aria-pressed={mode === m} onClick={() => pick(m)}
                    className={`min-h-12 rounded-md text-base font-medium transition-colors ${mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                    {m === 'IN' ? 'Absen masuk' : 'Absen pulang'}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="camera-wrap mirror">
              <video ref={video} autoPlay muted playsInline aria-label="Pratinjau kamera" />
              <canvas ref={overlay} aria-hidden />
              <div className="face-guide" aria-hidden />
              <div className="camera-status" aria-live="polite">{status}</div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
              <span>{requireLiveness ? 'Hadapkan wajah, lalu kedipkan mata.' : 'Hadapkan wajah ke kamera, satu orang setiap kali.'}</span>
              <span className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())}><Maximize />Layar penuh</Button>
                <Button asChild size="sm" variant="outline"><Link href="/dashboard">Keluar kiosk</Link></Button>
              </span>
            </div>
          </div>
          <div className="grid gap-4">
            <div aria-live="assertive">
              {result ? (
                <div data-result={ok ? 'ok' : 'gagal'} className={`flex items-center gap-4 rounded-xl border-2 bg-card p-6 ${ok ? 'border-[#7ee2a8]' : 'border-[#ff9b94]'}`}>
                  {ok ? <CircleCheck className="size-14 shrink-0 text-[#7ee2a8]" aria-hidden /> : <CircleX className="size-14 shrink-0 text-[#ff9b94]" aria-hidden />}
                  {ok ? (
                    <div>
                      <div className="text-2xl font-bold">{result.employee?.name}</div>
                      <div className="text-muted-foreground">{[result.employee?.employeeNumber, result.employee?.position].filter(Boolean).join(' · ')}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">Absen <b>{mode === 'IN' ? 'MASUK' : 'PULANG'}</b> pukul <b className="tabular">{result.time}</b>
                        {result.status === 'TERLAMBAT' ? <Badge variant="terlambat">Terlambat {result.lateMinutes} menit</Badge> : <Badge variant="hadir">{mode === 'IN' ? 'Tepat waktu' : 'Tercatat'}</Badge>}
                      </div>
                      {result.schedule && <div className="mt-1 text-sm text-muted-foreground">{result.schedule}</div>}
                    </div>
                  ) : <div className="text-lg font-semibold">{result.message}</div>}
                </div>
              ) : (
                <div className="rounded-xl border bg-card px-6 py-12 text-center text-muted-foreground">{enrolled ? `${enrolled} pegawai siap dikenali. Hasil absen tampil di sini.` : 'Belum ada wajah terdaftar. Daftarkan wajah pegawai dari menu Data Pegawai.'}</div>
              )}
            </div>
            <section className="rounded-xl border bg-card" aria-labelledby="logTitle">
              <h2 id="logTitle" className="border-b px-6 py-3 text-sm font-medium">Riwayat di perangkat ini</h2>
              <ul className="max-h-72 divide-y overflow-y-auto text-sm">
                {log.length ? log.map((l, i) => (
                  <li key={i} className="flex justify-between gap-3 px-6 py-2.5"><span><Badge variant={l.ok ? 'hadir' : 'alpa'} className="mr-1.5">{l.ok ? 'Berhasil' : 'Gagal'}</Badge>{l.text}</span><span className="tabular text-muted-foreground">{l.t}</span></li>
                )) : <li className="px-6 py-3 text-muted-foreground">Belum ada absen sejak halaman dibuka.</li>}
              </ul>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
