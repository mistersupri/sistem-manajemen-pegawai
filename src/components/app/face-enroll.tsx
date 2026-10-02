'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { api } from './api-client';
import { blinkDetector, detect, draw, loadFaceApi, qualityOf, startCamera, stopCamera, toArray, type Detection } from '@/lib/face-client';

const TARGET = 5;

/**
 * Registrasi wajah: pemberitahuan dan persetujuan, perekaman beberapa sampel dengan pemeriksaan
 * kualitas, lalu pengiriman descriptor ke server (template disimpan terenkripsi di server).
 */
export function FaceEnroll({ employeeId, employeeName, consentText, consentVersion, mode, minScore, minSize, backHref }: {
  employeeId: string;
  employeeName: string;
  consentText: string;
  consentVersion: string;
  mode: 'self' | 'admin';
  minScore: number;
  minSize: number;
  backHref: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<'consent' | 'capture' | 'done'>('consent');
  const [agreed, setAgreed] = useState(false);
  const [status, setStatus] = useState('Memuat model pengenal wajah...');
  const [samples, setSamples] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const buf = useRef<number[][]>([]);
  const rec = useRef(false);

  async function submit() {
    setStatus('Menyimpan data wajah...');
    try {
      const r = await api<{ status: string }>('POST', `/api/v1/employees/${employeeId}/face`, { descriptors: buf.current, consentAccepted: true, consentVersion });
      setResult(r);
      setStep('done');
      stopCamera(video.current);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      buf.current = [];
      setSamples(0);
      setStatus('Gagal menyimpan. Ulangi perekaman.');
    }
  }

  useEffect(() => {
    if (step !== 'capture') return;
    const el = video.current;
    let stop = false;
    let last = 0;
    const blink = blinkDetector();
    (async () => {
      try {
        const f = await loadFaceApi();
        await startCamera(video.current!);
        setReady(true);
        setStatus('Kamera siap. Posisikan wajah di dalam bingkai lalu tekan Mulai rekam.');
        const loop = async () => {
          if (stop || !video.current) return;
          if (video.current.readyState >= 2) {
            const { detection, count } = await detect(f, video.current, 416);
            const q = detection ? qualityOf(video.current, detection as Detection) : null;
            const problem = !detection ? 'Wajah belum terdeteksi.' : count > 1 ? 'Hanya satu wajah yang boleh terlihat.'
              : q!.score < minScore ? 'Wajah kurang jelas, hadapkan lurus ke kamera.' : q!.faceWidthPx < minSize ? 'Dekatkan wajah ke kamera.'
                : q!.brightness < 40 ? 'Pencahayaan terlalu gelap.' : q!.brightness > 225 ? 'Pencahayaan terlalu terang.' : null;
            draw(overlay.current!, video.current, detection, problem ? '#ffc107' : '#00e676');
            blink.update(detection);
            if (!rec.current) setStatus(problem ?? 'Wajah terdeteksi dengan baik. Tekan Mulai rekam.');
            else if (problem) setStatus(problem);
            else if (Date.now() - last > 700) {
              last = Date.now();
              buf.current.push(toArray(detection!.descriptor));
              setSamples(buf.current.length);
              setStatus(`Merekam sampel ${buf.current.length} dari ${TARGET}. Gerakkan kepala sedikit ke kiri, kanan, dan atas.`);
              if (buf.current.length >= TARGET) {
                rec.current = false;
                setRecording(false);
                await submit();
                return;
              }
            }
          }
          requestAnimationFrame(loop);
        };
        loop();
      } catch (e) {
        setError((e as Error).message);
        setStatus('Tidak dapat memulai kamera.');
      }
    })();
    return () => { stop = true; stopCamera(el); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  if (step === 'consent') {
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Pemberitahuan pemrosesan data wajah</CardTitle>
          <CardDescription>Baca sebelum melanjutkan. Pendaftaran wajah bersifat sukarela; metode absensi lain tetap tersedia.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="rounded-lg bg-muted p-4 text-sm leading-relaxed whitespace-pre-wrap">{consentText}</p>
          <div className="flex items-start gap-3">
            <Checkbox id="agree" checked={agreed} onCheckedChange={(v) => setAgreed(!!v)} className="mt-0.5" />
            <Label htmlFor="agree" className="leading-snug font-normal">
              {mode === 'self' ? 'Saya telah membaca pemberitahuan ini dan menyetujui pemrosesan data wajah saya untuk absensi.' : `Pemberitahuan ini telah disampaikan kepada ${employeeName} dan yang bersangkutan menyetujui pemrosesan data wajahnya.`}
            </Label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!agreed} onClick={() => setStep('capture')}>Lanjut ke perekaman</Button>
            <Button variant="outline" onClick={() => router.push(backHref)}>Batal</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (step === 'done' && result) {
    return (
      <Alert variant="success" className="max-w-2xl">
        <AlertTitle>{result.status === 'ACTIVE' ? 'Wajah berhasil didaftarkan' : 'Pendaftaran menunggu verifikasi petugas'}</AlertTitle>
        <AlertDescription>
          <p>{result.status === 'ACTIVE' ? 'Template wajah aktif dan bisa dipakai untuk absensi.' : 'Petugas kepegawaian akan memverifikasi pendaftaran ini.'}</p>
          <Button className="mt-2" size="sm" onClick={() => router.push(backHref)}>Selesai</Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[7fr_5fr]">
      <div>
        <div className="camera-wrap mirror">
          <video ref={video} autoPlay muted playsInline aria-label="Pratinjau kamera" />
          <canvas ref={overlay} aria-hidden />
          <div className="face-guide" aria-hidden />
          <div className="camera-status" aria-live="polite">{status}</div>
        </div>
        <div className="mt-4 mb-2 flex justify-between text-sm"><span>Sampel terekam</span><span className="tabular">{samples} dari {TARGET}</span></div>
        <Progress value={(samples / TARGET) * 100} aria-label={`Sampel terekam ${samples} dari ${TARGET}`} />
      </div>
      <Card>
        <CardHeader><CardTitle>Petunjuk</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <ol className="grid list-decimal gap-1 pl-4 text-sm text-muted-foreground">
            <li>Pastikan pencahayaan cukup, wajah tidak tertutup masker atau kacamata gelap.</li>
            <li>Posisikan wajah di dalam bingkai oval.</li>
            <li>Tekan Mulai rekam, lalu gerakkan kepala sedikit agar sampel bervariasi.</li>
          </ol>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <Button disabled={!ready || recording} onClick={() => { buf.current = []; setSamples(0); setError(null); rec.current = true; setRecording(true); }}>
            {recording ? 'Merekam...' : samples ? 'Ulangi perekaman' : 'Mulai rekam'}
          </Button>
          <Button variant="outline" onClick={() => router.push(backHref)}>Batal</Button>
          <p className="text-xs text-muted-foreground">Foto tidak disimpan. Yang dikirim ke server hanya data numerik wajah, lalu disimpan terenkripsi.</p>
        </CardContent>
      </Card>
    </div>
  );
}
