'use client';

// Utilitas kamera dan deteksi wajah di browser (face-api.js). Model dimuat dari server sendiri.
// Descriptor (128 angka) dikirim ke server untuk dicocokkan; template wajah tidak pernah dikirim ke browser.

/* eslint-disable @typescript-eslint/no-explicit-any */
type FaceApi = any;
declare global {
  interface Window { faceapi?: FaceApi }
}

export interface Detection {
  detection: { box: { x: number; y: number; width: number; height: number; area: number }; score: number };
  landmarks: { getLeftEye(): { x: number; y: number }[]; getRightEye(): { x: number; y: number }[] };
  descriptor: Float32Array;
}

let loading: Promise<FaceApi> | null = null;

export function loadFaceApi(): Promise<FaceApi> {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const done = async () => {
      try {
        const f = window.faceapi!;
        await Promise.all([
          f.nets.tinyFaceDetector.loadFromUri('/face-assets'),
          f.nets.faceLandmark68Net.loadFromUri('/face-assets'),
          f.nets.faceRecognitionNet.loadFromUri('/face-assets'),
        ]);
        resolve(f);
      } catch (e) {
        loading = null;
        reject(new Error('Model pengenal wajah gagal dimuat. Muat ulang halaman.'));
      }
    };
    if (window.faceapi) return void done();
    const s = document.createElement('script');
    s.src = '/face-assets/face-api.js';
    s.async = true;
    s.onload = done;
    s.onerror = () => { loading = null; reject(new Error('Skrip pengenal wajah gagal dimuat.')); };
    document.head.appendChild(s);
  });
  return loading;
}

export async function startCamera(video: HTMLVideoElement, facingMode: 'user' | 'environment' = 'user') {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Browser tidak mendukung kamera. Gunakan browser terbaru melalui HTTPS.');
  stopCamera(video);
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
  } catch (e) {
    const name = (e as DOMException).name;
    throw new Error(name === 'NotAllowedError' ? 'Izin kamera ditolak. Izinkan akses kamera pada browser.' : name === 'NotFoundError' ? 'Kamera tidak ditemukan.' : 'Kamera tidak dapat dibuka.');
  }
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  await video.play();
  if (!video.videoWidth) await new Promise((r) => video.addEventListener('loadedmetadata', r, { once: true }));
  return stream;
}

export function stopCamera(video: HTMLVideoElement | null) {
  const s = video?.srcObject as MediaStream | null;
  s?.getTracks().forEach((t) => t.stop());
  if (video) video.srcObject = null;
}

/** Deteksi wajah terbesar beserta descriptor. */
export async function detect(f: FaceApi, input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement, inputSize = 320): Promise<{ detection: Detection | null; count: number }> {
  const sizes = [inputSize, ...[224, 416].filter((s) => s !== inputSize)];
  let all: Detection[] = [];
  for (const size of sizes) {
    all = await f.detectAllFaces(input, new f.TinyFaceDetectorOptions({ inputSize: size, scoreThreshold: 0.45 })).withFaceLandmarks().withFaceDescriptors();
    if (all.length) break;
  }
  if (!all.length) return { detection: null, count: 0 };
  all.sort((a, b) => b.detection.box.area - a.detection.box.area);
  return { detection: all[0], count: all.length };
}

/** Rata-rata kecerahan area wajah (0-255) untuk pemeriksaan pencahayaan. */
export function brightness(video: HTMLVideoElement, d: Detection) {
  const c = document.createElement('canvas');
  const { x, y, width, height } = d.detection.box;
  c.width = 32; c.height = 32;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(video, Math.max(0, x), Math.max(0, y), Math.max(1, width), Math.max(1, height), 0, 0, 32, 32);
  const px = ctx.getImageData(0, 0, 32, 32).data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  return Math.round(sum / (px.length / 4));
}

export function qualityOf(video: HTMLVideoElement, d: Detection) {
  return { score: Math.round(d.detection.score * 1000) / 1000, faceWidthPx: Math.round(d.detection.box.width), brightness: brightness(video, d) };
}

export function draw(canvas: HTMLCanvasElement, video: HTMLVideoElement, d: Detection | null, color = '#00e676') {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  if (!d) return;
  const { x, y, width, height } = d.detection.box;
  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  ctx.strokeRect(x, y, width, height);
}

export function capture(video: HTMLVideoElement, { maxWidth = 640, mirror = true } = {}) {
  const scale = Math.min(1, maxWidth / video.videoWidth);
  const c = document.createElement('canvas');
  c.width = Math.round(video.videoWidth * scale);
  c.height = Math.round(video.videoHeight * scale);
  const ctx = c.getContext('2d')!;
  if (mirror) { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(video, 0, 0, c.width, c.height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return c;
}

export const toArray = (d: Float32Array) => Array.from(d, (v) => Math.round(v * 1e6) / 1e6);

/**
 * Deteksi kedipan sederhana (eye aspect ratio). Ini pemeriksaan dasar di sisi klien untuk
 * mengurangi kecurangan memakai foto, bukan anti-spoofing yang kuat.
 */
export function blinkDetector() {
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
  const ear = (p: { x: number; y: number }[]) => (dist(p[1], p[5]) + dist(p[2], p[4])) / (2 * dist(p[0], p[3]));
  let open = 0;
  let closed = false;
  let blinked = false;
  return {
    update(d: Detection | null) {
      if (!d) return blinked;
      const v = (ear(d.landmarks.getLeftEye()) + ear(d.landmarks.getRightEye())) / 2;
      open = Math.max(open * 0.98, v);
      if (open > 0 && v < open * 0.72) closed = true;
      else if (closed && v > open * 0.88) { blinked = true; closed = false; }
      return blinked;
    },
    reset() { open = 0; closed = false; blinked = false; },
  };
}

export function getLocation(timeout = 15000): Promise<{ lat: number; lng: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Perangkat tidak mendukung GPS.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
      (e) => reject(new Error(e.code === 1 ? 'Izin lokasi ditolak. Aktifkan izin lokasi pada browser.' : 'Gagal mendapatkan lokasi GPS.')),
      { enableHighAccuracy: true, timeout, maximumAge: 0 },
    );
  });
}

export async function reverseGeocode(lat: number, lng: number) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&accept-language=id&lat=${lat}&lon=${lng}`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return '';
    return ((await r.json()).display_name as string) || '';
  } catch {
    return '';
  }
}

/** Jam server: kembalikan fungsi now() yang memakai selisih jam perangkat dan server. */
export async function serverClock() {
  let offset = 0;
  let tz = 'Asia/Jakarta';
  let label = 'WIB';
  try {
    const t0 = Date.now();
    const j = await (await fetch('/api/v1/time', { cache: 'no-store' })).json();
    const t1 = Date.now();
    offset = new Date(j.now).getTime() - (t0 + t1) / 2;
    tz = j.timezone;
    label = j.label;
  } catch {
    // pakai jam perangkat
  }
  return { now: () => new Date(Date.now() + offset), tz, label };
}

export function fmtClock(d: Date, tz: string) {
  return new Intl.DateTimeFormat('id-ID', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(d).replace(/\./g, ':');
}

export function fmtDateLong(d: Date, tz: string) {
  return new Intl.DateTimeFormat('id-ID', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}
