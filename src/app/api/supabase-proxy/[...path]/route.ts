/**
 * Supabase REST API Proxy Route
 *
 * This route handler acts as a transparent proxy from:
 *   /api/supabase-proxy/rest/v1/orders → https://<project>.supabase.co/rest/v1/orders
 *
 * Purpose:
 *   - Bypass Indian ISP DNS blocks on *.supabase.co
 *   - Provide a self-hosted alternative route to reach Supabase
 *   - Used as a diagnostic/fallback path alongside the primary
 *     custom-fetch approach in supabaseServer.ts
 *
 * Security:
 *   - Only accessible server-side (headers contain service role key)
 *   - No sensitive keys are exposed to the client
 */

import { NextResponse } from 'next/server';
import { verifyAuthHeaderOrCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Allowed Supabase path prefixes (prevent open proxy abuse)
const ALLOWED_PREFIXES = ['rest/', 'auth/', 'storage/', 'functions/'];

async function proxyRequest(
  request: Request,
  params: Promise<{ path: string[] }>
): Promise<Response> {
  if (!verifyAuthHeaderOrCookie(request, ['admin'])) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: 'Supabase not configured' },
      { status: 503 }
    );
  }

  const { path: pathSegments } = await params;
  const joinedPath = pathSegments.join('/');

  // Security: only allow known Supabase API paths
  if (!ALLOWED_PREFIXES.some((prefix) => joinedPath.startsWith(prefix))) {
    return NextResponse.json(
      { error: 'Forbidden path' },
      { status: 403 }
    );
  }

  const targetUrl = `${supabaseUrl.replace(/\/+$/, '')}/${joinedPath}`;

  // Preserve query string
  const { searchParams } = new URL(request.url);
  const queryString = searchParams.toString();
  const fullUrl = queryString ? `${targetUrl}?${queryString}` : targetUrl;

  // Forward relevant headers (exclude host-specific ones)
  const forwardHeaders = new Headers();
  const skipHeaders = new Set(['host', 'connection', 'transfer-encoding', 'content-length']);

  request.headers.forEach((value, key) => {
    if (!skipHeaders.has(key.toLowerCase())) {
      forwardHeaders.set(key, value);
    }
  });

  // Ensure API key is always present
  if (!forwardHeaders.has('apikey')) {
    forwardHeaders.set('apikey', supabaseKey);
  }
  if (!forwardHeaders.has('authorization')) {
    forwardHeaders.set('authorization', `Bearer ${supabaseKey}`);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const body = ['GET', 'HEAD'].includes(request.method)
      ? undefined
      : await request.text();

    const response = await fetch(fullUrl, {
      method: request.method,
      headers: forwardHeaders,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    // Forward the response with CORS headers
    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      // Skip hop-by-hop headers
      if (!['transfer-encoding', 'connection'].includes(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    });
    responseHeaders.set('x-proxy', 'ozkafe-supabase-proxy');

    const responseBody = await response.arrayBuffer();

    return new Response(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown proxy error';
    console.error(`[SupabaseProxy] Failed to proxy ${request.method} ${joinedPath}: ${message}`);

    return NextResponse.json(
      {
        error: 'Proxy request failed',
        message,
        path: joinedPath,
      },
      { status: 502 }
    );
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, context.params);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, context.params);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, context.params);
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, context.params);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, context.params);
}

