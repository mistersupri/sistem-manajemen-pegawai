import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

// Skrip face-api.js dan bobot model disajikan dari server sendiri (tanpa CDN pihak ketiga).
const ROOT = path.join(process.cwd(), 'node_modules', '@vladmandic', 'face-api');
const ALLOWED: Record<string, [string, string]> = {
  'face-api.js': ['dist/face-api.js', 'text/javascript'],
  ...Object.fromEntries(
    ['tiny_face_detector_model', 'face_landmark_68_model', 'face_recognition_model'].flatMap((m) => [
      [`${m}-weights_manifest.json`, [`model/${m}-weights_manifest.json`, 'application/json']],
      [`${m}.bin`, [`model/${m}.bin`, 'application/octet-stream']],
    ]),
  ),
};

// Berkas tidak berubah selama proses hidup; simpan di memori agar tiap pembukaan kiosk tidak membaca disk lagi.
const cache = new Map<string, Buffer>();

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const name = (await params).path.join('/');
  const f = ALLOWED[name];
  if (!f) return new NextResponse(null, { status: 404 });
  let body = cache.get(name);
  if (!body) { body = await readFile(path.join(ROOT, f[0])); cache.set(name, body); }
  return new NextResponse(new Uint8Array(body), { headers: { 'Content-Type': f[1], 'Cache-Control': 'public, max-age=604800, immutable' } });
}
