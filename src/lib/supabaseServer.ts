import { createClient } from '@supabase/supabase-js';
import { getProxyFetch } from './supabaseProxy';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseKey && 
  !supabaseUrl.includes('placeholder') &&
  !supabaseKey.includes('placeholder')
);

export const supabaseServer = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        // Use our resilient proxy fetch with retry, timeout, and diagnostics.
        // This ensures all Supabase REST calls survive transient network
        // failures and regional DNS blocks (e.g. Indian ISPs blocking *.supabase.co).
        fetch: getProxyFetch(),
      },
    })
  : null;
