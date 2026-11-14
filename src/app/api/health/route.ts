import { NextResponse } from 'next/server';
import { supabaseServer, isSupabaseConfigured } from '@/lib/supabaseServer';
import { testSupabaseConnectivity } from '@/lib/supabaseProxy';

export const dynamic = 'force-dynamic';

export async function GET() {
  let supabaseConnected = false;
  let latencyMs: number | null = null;
  let supabaseError: string | null = null;

  if (isSupabaseConfigured && supabaseServer) {
    const start = Date.now();
    try {
      // Connectivity alone is insufficient: an unmigrated database rejects
      // ordering, stock, settlement and deletion writes despite accepting reads.
      const checks = await Promise.all([
        supabaseServer.from('tables').select('table_number').limit(0),
        supabaseServer.from('orders').select('idempotency_key,is_deleted,deleted_by,deleted_at,is_paid,paid_at,settled_by').limit(0),
        supabaseServer.from('menu_items').select('stock').limit(0),
        supabaseServer.from('order_counter').select('value').limit(0),
      ]);
      const error = checks.find(result => result.error)?.error;
      latencyMs = Date.now() - start;
      if (error) {
        supabaseError = error.message + ' Check that supabase/migrations/20261113_workflow.sql has been applied.';
      } else {
        supabaseConnected = true;
      }
    } catch (err: unknown) {
      supabaseError = err instanceof Error ? err.message : 'Unknown connection error';
    }
  }

  // Proxy diagnostics — raw connectivity test
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const connectivity = await testSupabaseConnectivity(supabaseUrl);

  return NextResponse.json({
    status: isSupabaseConfigured ? (supabaseConnected ? 'healthy' : 'unhealthy') : (process.env.VERCEL ? 'unhealthy' : 'development'),
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
    proxy: {
      enabled: true,
      mode: 'custom-fetch-with-retry',
      retries: 1,
      timeoutMs: 4000,
      vercelRegion: process.env.VERCEL_REGION || 'local',
      rewritesConfigured: Boolean(supabaseUrl && !supabaseUrl.includes('placeholder')),
      directConnectivity: connectivity,
    },
  }, { status: (isSupabaseConfigured && !supabaseConnected) || (process.env.VERCEL && !isSupabaseConfigured) ? 503 : 200 });
}
