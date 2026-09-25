import { createClient } from '@supabase/supabase-js';

// Vercel automatically injects these from your Project Environment Variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Missing Supabase Environment Variables in Vercel!');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
