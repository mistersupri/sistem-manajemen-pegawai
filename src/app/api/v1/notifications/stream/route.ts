import { route } from '@/lib/api';
import { subscribe, type RealtimeEvent } from '@/lib/realtime';
import { unreadCount } from '@/lib/services/notifications';

// Server-Sent Events: notifikasi baru dan jumlah belum dibaca dikirim begitu terjadi.
export const dynamic = 'force-dynamic';

const HEARTBEAT_MS = 25_000;

export const GET = route({}, async ({ req, actor }) => {
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => { try { controller.enqueue(enc.encode(chunk)); } catch { cleanup(); } };
      const emit = (e: RealtimeEvent) => send(`event: ${e.type}\ndata: ${JSON.stringify(e.data)}\n\n`);
      const unsubscribe = subscribe(actor.userId, emit);
      // Komentar berkala menjaga koneksi hidup melewati proxy dan load balancer.
      const beat = setInterval(() => send(': ping\n\n'), HEARTBEAT_MS);
      cleanup = () => {
        clearInterval(beat);
        unsubscribe();
        try { controller.close(); } catch { /* sudah tertutup */ }
      };
      req.signal.addEventListener('abort', cleanup);
      send('retry: 5000\n\n');
      emit({ type: 'unread', data: { count: await unreadCount(actor.userId) } });
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
});
