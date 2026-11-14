import { subscribeToOrders } from '@/lib/store';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifyAuthHeaderOrCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: Request) {
  if (!verifyAuthHeaderOrCookie(request, ['kitchen', 'admin'])) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let busy = false;
      let lastRevision = '';
      const send = (event: string) => {
        if (!closed) controller.enqueue(encoder.encode('event: ' + event + '\ndata: {}\n\n'));
      };
      send('connected');
      const unsubscribe = subscribeToOrders(() => send('order'));
      const interval = setInterval(async () => {
        if (closed || busy) return;
        busy = true;
        try {
          if (supabaseServer) {
            const { data, error } = await supabaseServer.from('orders').select('id,updated_at').order('updated_at', { ascending: false }).limit(1);
            if (error) throw error;
            const revision = JSON.stringify(data);
            if (revision !== lastRevision) { lastRevision = revision; send('order'); }
          }
          if (!closed) controller.enqueue(encoder.encode(': ping\n\n'));
        } catch { /* Independent screen polling covers connection failures. */ }
        finally { busy = false; }
      }, 3000);
      const expiry = setTimeout(() => { cleanup(); controller.close(); }, 25000);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(interval); clearTimeout(expiry); unsubscribe();
        request.signal.removeEventListener('abort', onAbort);
      };
      const onAbort = () => { cleanup(); try { controller.close(); } catch {} };
      request.signal.addEventListener('abort', onAbort, { once: true });
      if (request.signal.aborted) onAbort();
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, { headers: {
    'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no',
  } });
}
