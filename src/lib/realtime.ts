// Penyiar peristiwa dalam proses untuk notifikasi realtime (Server-Sent Events).
// Satu instance aplikasi: peristiwa dikirim ke koneksi yang terbuka di proses yang sama.
// Untuk beberapa instance, ganti isi publish/subscribe dengan LISTEN/NOTIFY PostgreSQL atau Redis.
type Listener = (event: RealtimeEvent) => void;
export type RealtimeEvent =
  | { type: 'notification'; data: { id: string; type: string; title: string; body: string | null; link: string | null; createdAt: string } }
  | { type: 'unread'; data: { count: number } };

// globalThis agar modul yang dimuat ganda (bundel route berbeda, mode dev) tetap berbagi satu daftar.
const g = globalThis as unknown as { __simpegRealtime?: Map<string, Set<Listener>> };
const listeners = (g.__simpegRealtime ??= new Map());

export function subscribe(userId: string, fn: Listener) {
  let set = listeners.get(userId);
  if (!set) listeners.set(userId, (set = new Set()));
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (!set!.size) listeners.delete(userId);
  };
}

export function publish(userId: string, event: RealtimeEvent) {
  for (const fn of listeners.get(userId) ?? []) {
    try { fn(event); } catch { /* koneksi yang putus dibersihkan lewat unsubscribe */ }
  }
}

export const connectionCount = () => [...listeners.values()].reduce((n, s) => n + s.size, 0);
