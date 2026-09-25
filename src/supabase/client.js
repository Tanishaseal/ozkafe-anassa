import { createClient } from '@supabase/supabase-js';

// Supabase project credentials
const SUPABASE_URL = 'https://cbgrwhdaxgttebybaibx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZ3J3aGRheGd0dGVieGJhaWJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzMDMwMzcsImV4cCI6MjEwNTg3OTAzN30.8a43DrP6Q2sYiie3pMuhDdiefjtwtVHty9k1hxZ7F8E';

// Create a single Supabase client instance for the whole app.
// Realtime is enabled by default but only used in production (Vercel),
// since Indian ISPs block WebSocket connections to Supabase locally.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: {
    params: {
      eventsPerSecond: 10, // Rate-limit inbound Realtime events
    },
  },
});

// Helper: detect if we're running in production (Vercel) or local dev.
// In production, Supabase Realtime (WebSocket) works.
// Locally in India, ISPs block it, so we fall back to polling.
export const IS_PRODUCTION = import.meta.env.PROD;
