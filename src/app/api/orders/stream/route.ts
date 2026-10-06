import { subscribeToOrders } from '@/lib/store';
import { Order } from '@/lib/types';
import { verifyAuthHeaderOrCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Guard: Only authenticated kitchen staff or admin can subscribe to real-time order stream
  if (!verifyAuthHeaderOrCookie(request, ['kitchen', 'admin'])) {
    return new Response(JSON.stringify({ error: 'Unauthorized. Kitchen staff access required.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial heartbeat
      controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ time: Date.now() })}\n\n`));

      // Subscribe to internal order updates
      const unsubscribe = subscribeToOrders((order: Order) => {
        try {
          controller.enqueue(encoder.encode(`event: order\ndata: ${JSON.stringify(order)}\n\n`));
        } catch {
          unsubscribe();
        }
      });

      // Keepalive ping every 15s to keep connections open
      const interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(interval);
          unsubscribe();
        }
      }, 15000);

      // Clean up on cancel
      return () => {
        clearInterval(interval);
        unsubscribe();
      };
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
