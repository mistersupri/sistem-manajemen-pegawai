import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from './env';

// AES-256-GCM. Format: v1.<iv>.<tag>.<ciphertext> (base64url).
function key() {
  return Buffer.from(env().BIOMETRIC_ENCRYPTION_KEY, 'base64');
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

export function decrypt(payload: string): string {
  const [v, iv, tag, data] = payload.split('.');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Format data terenkripsi tidak dikenal');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}

export const encryptOptional = (v: string | null | undefined) => (v ? encrypt(v) : null);
export const decryptOptional = (v: string | null | undefined) => (v ? decrypt(v) : null);

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(v: string) {
  return createHash('sha256').update(v).digest('hex');
}

export function hmac(v: string) {
  return createHmac('sha256', env().APP_SECRET).update(v).digest('base64url');
}

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
