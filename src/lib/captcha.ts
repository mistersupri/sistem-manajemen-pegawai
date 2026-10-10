import { createHash, randomInt } from 'node:crypto';
import { env } from './env';
import { hmac, randomToken, safeEqual } from './crypto';
import { AppError } from './errors';

// Captcha buatan sendiri tanpa layanan luar. Token berisi kunci jawaban (hash) dan masa berlaku,
// ditandatangani HMAC, jadi server tidak perlu menyimpan tantangan. Tiap token hanya berlaku sekali.
const TTL_MS = 3 * 60_000;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // tanpa I, O, 0, 1 yang mudah tertukar
const used = new Map<string, number>();

export const captchaEnabled = () => env().LOGIN_CAPTCHA !== '0';

const answerHash = (nonce: string, answer: string) => createHash('sha256').update(`${nonce}:${answer}`).digest('base64url');
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '').replace(/I/g, '');

function svgOf(code: string) {
  const w = 168;
  const h = 56;
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  const colors = ['#1d3b6b', '#7a2e0e', '#0f5c4b', '#4a2c7a'];
  let body = `<rect width="${w}" height="${h}" rx="8" fill="#f3f6fb"/>`;
  for (let i = 0; i < 5; i++) {
    body += `<path d="M${rnd(0, 20).toFixed(1)} ${rnd(8, 48).toFixed(1)} C ${rnd(40, 70).toFixed(1)} ${rnd(0, 56).toFixed(1)}, ${rnd(90, 120).toFixed(1)} ${rnd(0, 56).toFixed(1)}, ${rnd(148, 168).toFixed(1)} ${rnd(8, 48).toFixed(1)}" stroke="${colors[i % colors.length]}" stroke-opacity=".35" stroke-width="1.4" fill="none"/>`;
  }
  for (let i = 0; i < 28; i++) body += `<circle cx="${rnd(0, w).toFixed(1)}" cy="${rnd(0, h).toFixed(1)}" r="${rnd(0.6, 1.6).toFixed(1)}" fill="#1d3b6b" fill-opacity=".3"/>`;
  [...code].forEach((ch, i) => {
    const x = 18 + i * 28;
    const y = rnd(35, 42);
    body += `<text x="${x}" y="${y.toFixed(1)}" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="${rnd(26, 31).toFixed(0)}" font-weight="700" fill="${colors[randomInt(colors.length)]}" transform="rotate(${rnd(-22, 22).toFixed(1)} ${x} ${y.toFixed(1)})">${ch}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Gambar kode keamanan">${body}</svg>`;
}

/** Buat tantangan baru: token untuk dikirim balik dan gambar SVG (data URL). */
export function newCaptcha() {
  const code = Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return issueCaptcha(code);
}

/** Terpisah dari newCaptcha agar pengujian bisa menentukan kodenya. */
export function issueCaptcha(code: string) {
  const nonce = randomToken(9);
  const exp = Date.now() + TTL_MS;
  const payload = `${nonce}.${exp}.${answerHash(nonce, code)}`;
  const token = `${payload}.${hmac(payload)}`;
  return { token, image: `data:image/svg+xml;base64,${Buffer.from(svgOf(code)).toString('base64')}` };
}

const fail = (msg: string) => new AppError(422, 'CAPTCHA', msg, { captcha: msg });

/** Periksa jawaban. Token dipakai sekali, benar atau salah. */
export function verifyCaptcha(token: unknown, answer: unknown) {
  if (!captchaEnabled()) return;
  if (typeof token !== 'string' || typeof answer !== 'string' || !answer.trim()) throw fail('Isi kode keamanan pada gambar.');
  const parts = token.split('.');
  if (parts.length !== 4) throw fail('Kode keamanan tidak valid. Muat ulang gambar.');
  const [nonce, expRaw, hash, sig] = parts;
  if (!safeEqual(sig, hmac(`${nonce}.${expRaw}.${hash}`))) throw fail('Kode keamanan tidak valid. Muat ulang gambar.');
  const now = Date.now();
  for (const [k, e] of used) if (e < now) used.delete(k);
  if (Number(expRaw) < now) throw fail('Kode keamanan kedaluwarsa. Muat ulang gambar.');
  if (used.has(nonce)) throw fail('Kode keamanan sudah dipakai. Muat ulang gambar.');
  used.set(nonce, Number(expRaw));
  if (!safeEqual(answerHash(nonce, norm(answer)), hash)) throw fail('Kode keamanan salah.');
}

export function _resetCaptchaForTest() {
  used.clear();
}
