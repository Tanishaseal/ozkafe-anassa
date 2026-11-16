import { supabaseServer } from '@/lib/supabaseServer';

export const runtime = 'nodejs';
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.webp$/.test(name)) return new Response('Not found', { status: 404 });
  if (!supabaseServer) return new Response('Image storage unavailable', { status: 503 });
  const { data, error } = await supabaseServer.storage.from('menu-images').download(name);
  if (error || !data) return new Response('Image unavailable', { status: 404 });
  return new Response(data, { headers: {
    'Content-Type': 'image/webp',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  } });
}
