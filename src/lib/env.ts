import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL wajib diisi'),
  // Kunci HMAC sesi/CSRF. Minimal 32 karakter.
  APP_SECRET: z.string().min(32, 'APP_SECRET minimal 32 karakter'),
  // Kunci AES-256 (base64, 32 byte) untuk template wajah, NIK, secret perangkat, dan secret MFA.
  BIOMETRIC_ENCRYPTION_KEY: z.string().refine((v) => Buffer.from(v, 'base64').length === 32, 'BIOMETRIC_ENCRYPTION_KEY harus 32 byte dalam base64'),
  STORAGE_DIR: z.string().default('./storage'),
  APP_TIMEZONE: z.string().default('Asia/Jakarta'),
  COOKIE_SECURE: z.enum(['0', '1']).optional(),
  TRUST_PROXY: z.enum(['0', '1']).optional(),
  DISABLE_SCHEDULER: z.enum(['0', '1']).optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof schema>;
let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Konfigurasi environment tidak valid: ${msg}`);
  }
  cached = parsed.data;
  return cached;
}
