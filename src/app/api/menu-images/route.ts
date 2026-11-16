import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { verifyAuthHeaderOrCookie } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabaseServer';
import { checkRateLimit, getClientIdentifier } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (!verifyAuthHeaderOrCookie(request, ['admin'])) return NextResponse.json({ error: 'Admin access required' }, { status: 401 });
  if (!checkRateLimit(getClientIdentifier(request, 'menu_image_upload'), 20, 60000).allowed) return NextResponse.json({ error: 'Please wait before saving another image' }, { status: 429 });
  if (!supabaseServer) return NextResponse.json({ error: 'Image storage is not configured' }, { status: 503 });
  const limit = 3 * 1024 * 1024;
  if (Number(request.headers.get('content-length')) > limit) return NextResponse.json({ error: 'Image must be under 3 MB' }, { status: 413 });
  let output: Buffer;
  let width: number;
  let height: number;
  try {
    const bytes = Buffer.from(await request.arrayBuffer());
    if (bytes.length > limit) return NextResponse.json({ error: 'Image must be under 3 MB' }, { status: 413 });
    const image = sharp(bytes, { limitInputPixels: 12_000_000, animated: false });
    const meta = await image.metadata();
    width = meta.width || 0;
    height = meta.height || 0;
    if (!['jpeg', 'png', 'webp'].includes(meta.format || '') || (meta.pages || 1) > 1 || width < 300 || width > 2400 || width * 2 !== height * 3) {
      return NextResponse.json({ error: 'Use the editor to create a landscape image between 300 and 2400 pixels wide' }, { status: 400 });
    }
    output = await image.flatten({ background: '#fff' }).webp({ quality: 88 }).toBuffer();
  } catch {
    return NextResponse.json({ error: 'Unable to read this image. Please try a JPG, PNG or WebP photo.' }, { status: 400 });
  }
  const name = `${randomUUID()}.webp`;
  const { error } = await supabaseServer.storage.from('menu-images').upload(name, output, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
  if (error) return NextResponse.json({ error: 'Image could not be saved. Please retry; your existing dish photo has not changed.' }, { status: 503 });
  return NextResponse.json({ url: `/api/menu-images/${name}`, width, height }, { status: 201 });
}
