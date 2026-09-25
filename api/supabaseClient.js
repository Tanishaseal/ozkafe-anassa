import { createClient } from '@supabase/supabase-js';

// Force the correct URL (bypassing the typo'd one saved in Vercel Environment Variables)
const SUPABASE_URL = 'https://cbgrwhdaxgttebxbaibx.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZ3J3aGRheGd0dGVieGJhaWJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzMDMwMzcsImV4cCI6MjEwNTg3OTAzN30.8a43DrP6Q2sYiie3pMuhDdiefjtwtVHty9k1hxZ7F8E';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
