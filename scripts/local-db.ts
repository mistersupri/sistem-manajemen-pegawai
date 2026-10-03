// PostgreSQL lokal untuk pengembangan dan uji coba, tanpa instal PostgreSQL atau mengatur DATABASE_URL.
//
//   npm run dev:local              database lokal + aplikasi (next dev); data demo dibuat saat pertama kali
//   npm run dev:local -- --tanpa-demo   sama, tanpa data demo (hanya peran dan akun Super Admin)
//   npm run db:local               database lokal saja (untuk dipakai npm run dev, tes, Prisma Studio)
//   npm run db:local -- --reset    hapus database lokal lalu buat ulang
//
// Binari PostgreSQL 16 berasal dari paket npm `embedded-postgres` (Windows, macOS, Linux).
// Data disimpan di folder .local-db/ (tidak masuk git). Jangan dipakai untuk produksi.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { parse } from 'dotenv';
import EmbeddedPostgres from 'embedded-postgres';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA_DIR = path.join(ROOT, '.local-db');
const PORT = Number(process.env.LOCAL_DB_PORT || 54329);
const USER = 'simpeg';
const PASSWORD = 'simpeg-lokal';
const DB = 'simpeg';
const LOCAL_URL = `postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DB}`;

const args = process.argv.slice(2);
const mode = args.includes('dev') ? 'dev' : 'db';
const log = (m: string) => console.log(`[db lokal] ${m}`);

/** Lengkapi .env: isi yang kosong atau masih contoh; nilai yang sudah diisi tidak diubah. */
function ensureEnv() {
  const file = path.join(ROOT, '.env');
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const cur = parse(text);
  const validKey = (v?: string) => !!v && Buffer.from(v, 'base64').length === 32;
  const wanted: Record<string, string> = {};
  if (!cur.DATABASE_URL || cur.DATABASE_URL.includes('ganti-dengan-password-kuat')) wanted.DATABASE_URL = LOCAL_URL;
  if (!cur.APP_SECRET || cur.APP_SECRET.length < 32) wanted.APP_SECRET = randomBytes(36).toString('base64');
  if (!validKey(cur.BIOMETRIC_ENCRYPTION_KEY)) wanted.BIOMETRIC_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  if (!cur.COOKIE_SECURE) wanted.COOKIE_SECURE = '0';
  if (!cur.STORAGE_DIR) wanted.STORAGE_DIR = './storage';
  if (!Object.keys(wanted).length) return;
  let out = text;
  for (const [k, v] of Object.entries(wanted)) {
    const re = new RegExp(`^${k}=.*$`, 'm');
    out = re.test(out) ? out.replace(re, `${k}=${v}`) : `${out}${out && !out.endsWith('\n') ? '\n' : ''}${k}=${v}\n`;
  }
  writeFileSync(file, out);
  log(`.env dilengkapi: ${Object.keys(wanted).join(', ')}`);
}

function run(cmd: string[], env: NodeJS.ProcessEnv) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(process.execPath, cmd, { cwd: ROOT, env, stdio: 'inherit' });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd.join(' ')} gagal (kode ${code})`))));
  });
}

async function main() {
  if (args.includes('--reset') && existsSync(DATA_DIR)) {
    rmSync(DATA_DIR, { recursive: true, force: true });
    log('database lokal dihapus');
  }
  ensureEnv();
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    port: PORT,
    user: USER,
    password: PASSWORD,
    persistent: true,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    // PostgreSQL menolak berjalan sebagai root (mis. di container); paket ini lalu memakai pengguna khusus.
    createPostgresUser: typeof process.getuid === 'function' && process.getuid() === 0,
    onLog: () => {},
    onError: (e) => { const m = String(e instanceof Error ? e.message : e); if (/FATAL|ERROR/.test(m)) console.error(m.trim()); },
  });
  const fresh = !existsSync(path.join(DATA_DIR, 'PG_VERSION'));
  if (fresh) {
    log('menyiapkan database baru (sekali saja)...');
    await pg.initialise();
  }
  await pg.start();
  if (fresh) await pg.createDatabase(DB);
  log(`berjalan di ${LOCAL_URL}`);

  let stopping = false;
  let child: ReturnType<typeof spawn> | null = null;
  const stop = async (code = 0) => {
    if (stopping) return;
    stopping = true;
    if (child && child.exitCode === null) child.kill('SIGINT');
    await pg.stop().catch(() => undefined);
    process.exit(code);
  };
  process.on('SIGINT', () => stop());
  process.on('SIGTERM', () => stop());

  const env = { ...process.env, DATABASE_URL: LOCAL_URL };
  const bin = (p: string) => path.join(ROOT, 'node_modules', p);
  try {
    await run([bin('prisma/build/index.js'), 'migrate', 'deploy'], env);
    const client = pg.getPgClient(DB);
    await client.connect();
    const users = Number((await client.query('SELECT count(*) FROM users')).rows[0].count);
    const hasDemo = Number((await client.query("SELECT count(*) FROM organization_units WHERE code = 'DEMO'")).rows[0].count) > 0;
    await client.end();
    // Pertama kali: demo kecuali --tanpa-demo. Berikutnya: ikuti isi database (demo tidak ditambahkan diam-diam).
    const demo = users ? hasDemo : !args.includes('--tanpa-demo');
    const fileEnv = parse(existsSync(path.join(ROOT, '.env')) ? readFileSync(path.join(ROOT, '.env'), 'utf8') : '');
    const envPassword = process.env.ADMIN_PASSWORD || fileEnv.ADMIN_PASSWORD;
    const envUser = (process.env.ADMIN_USERNAME || fileEnv.ADMIN_USERNAME || 'superadmin').trim().toLowerCase();
    // Tanpa demo dan tanpa ADMIN_PASSWORD saat pertama kali: password sementara, wajib diganti saat masuk.
    const tempPassword = !users && !demo && !envPassword ? `Lokal-${randomBytes(6).toString('base64url')}9` : undefined;
    if (!users) log(demo ? 'mengisi data demo (bertanda "(demo)")...' : 'membuat peran dan akun Super Admin...');
    // Seed dijalankan setiap start agar akun ADMIN_USERNAME/ADMIN_PASSWORD di .env ikut dibuat bila belum ada.
    await run([bin('tsx/dist/cli.mjs'), 'prisma/seed.ts'], { ...env, SEED_DEMO: demo ? '1' : '0', DISABLE_SCHEDULER: '1', ...(tempPassword ? { ADMIN_PASSWORD: tempPassword } : {}) });
    log('akun untuk masuk:');
    if (envPassword) log(`  ${envUser} / (ADMIN_PASSWORD di .env)`);
    if (tempPassword) log(`  ${envUser} / ${tempPassword}  (password sementara, catat sekarang)`);
    if (demo && !(envPassword && envUser === 'superadmin')) log('  superadmin / Demo#2026  (akun demo)');
    log('lupa password atau akun terkunci: jalankan npm run admin:reset di terminal lain');
    if (fileEnv.DATABASE_URL && fileEnv.DATABASE_URL !== LOCAL_URL) log(`catatan: DATABASE_URL di .env menunjuk database lain; npm run admin:reset dan npm run dev memakai database itu, bukan database lokal ini.`);
  } catch (err) {
    console.error((err as Error).message);
    return stop(1);
  }

  if (mode === 'dev') {
    child = spawn(process.execPath, [bin('next/dist/bin/next'), 'dev', ...args.filter((a) => !a.startsWith('--') && a !== 'dev')], { cwd: ROOT, env, stdio: 'inherit' });
    child.on('exit', (code) => stop(code ?? 0));
  } else {
    log('tekan Ctrl+C untuk berhenti');
  }
}

main().catch((err) => {
  console.error(`[db lokal] gagal: ${(err as Error).message}`);
  process.exit(1);
});
