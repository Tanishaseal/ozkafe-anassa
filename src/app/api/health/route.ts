import { NextResponse } from 'next/server';
import { supabaseServer, isSupabaseConfigured } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

export async function GET() {
  let supabaseConnected = false;
  let latencyMs: number | null = null;
  let supabaseError: string | null = null;

  if (isSupabaseConfigured && supabaseServer) {
    const start = Date.now();
    try {
      const { error } = await supabaseServer.from('tables').select('table_number').limit(1);
      latencyMs = Date.now() - start;
      if (error) {
        supabaseError = error.message;
      } else {
        supabaseConnected = true;
      }
    } catch (err: unknown) {
      supabaseError = err instanceof Error ? err.message : 'Unknown connection error';
    }
  }

  return NextResponse.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: {
      provider: isSupabaseConfigured ? 'supabase' : 'in-memory-fallback',
      isSupabaseConfigured,
      supabaseConnected,
      latencyMs: supabaseConnected ? latencyMs : null,
      error: supabaseError,
      message: isSupabaseConfigured
        ? supabaseConnected
          ? 'Connected to Supabase PostgreSQL database successfully!'
          : `Supabase credentials detected, but query returned: ${supabaseError}`
        : 'Running in zero-config in-memory fallback. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to your Vercel Environment Variables to connect Supabase.',
    },
  });
}
