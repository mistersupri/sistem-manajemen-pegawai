import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomToken } from './crypto';
import { env } from './env';
import { notFound } from './errors';

// Penyimpanan berkas lokal (foto dinas luar, lampiran pengajuan, logo, berkas impor sementara).
// Path yang disimpan di database selalu relatif terhadap STORAGE_DIR.
const root = () => path.resolve(env().STORAGE_DIR);

function resolveSafe(rel: string) {
  const full = path.resolve(root(), rel);
  if (!full.startsWith(root() + path.sep)) throw notFound();
  return full;
}

export async function saveFile(dir: string, data: Buffer, ext: string) {
  const name = `${Date.now()}-${randomToken(9)}.${ext.replace(/[^a-z0-9]/gi, '')}`;
  const rel = path.posix.join(dir, name);
  const full = resolveSafe(rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data, { mode: 0o640 });
  return rel;
}

export async function readStored(rel: string) {
  try {
    return await readFile(resolveSafe(rel));
  } catch {
    throw notFound('Berkas tidak ditemukan.');
  }
}

export async function removeStored(rel: string | null | undefined) {
  if (!rel) return;
  await rm(resolveSafe(rel), { force: true });
}

const SIGNATURES: [string, number[]][] = [
  ['jpg', [0xff, 0xd8, 0xff]],
  ['png', [0x89, 0x50, 0x4e, 0x47]],
  ['webp', [0x52, 0x49, 0x46, 0x46]],
  ['pdf', [0x25, 0x50, 0x44, 0x46]],
];

/** Tentukan jenis berkas dari isinya (bukan dari nama/ekstensi yang dikirim klien). */
export function sniff(buf: Buffer): string | null {
  for (const [ext, sig] of SIGNATURES) if (sig.every((b, i) => buf[i] === b)) return ext;
  return null;
}

export const MIME: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' };

/** data:image/jpeg;base64,... menjadi Buffer JPEG yang tervalidasi. */
export function jpegFromDataUrl(dataUrl: unknown, maxBytes = 1_500_000) {
  if (typeof dataUrl !== 'string') return null;
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > maxBytes || sniff(buf) !== 'jpg') return null;
  return buf;
}
