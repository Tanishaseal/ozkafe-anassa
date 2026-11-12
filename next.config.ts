import type { NextConfig } from "next";

/**
 * OZKAFE ANASSA — Next.js Configuration
 *
 * Includes Supabase proxy rewrites to bypass Indian ISP DNS blocks.
 * Requests to /_supabase/* are rewritten at the edge to the actual
 * Supabase project endpoint. This is a backup path — the primary
 * proxy mechanism is the custom fetch wrapper in supabaseProxy.ts
 * which adds retry/timeout logic to the Supabase JS client.
 */

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },

  // Edge-level rewrites: proxy Supabase REST/Auth/Storage through our domain
  // so that even if direct connections to *.supabase.co are blocked,
  // requests can be routed through the Vercel deployment itself.
  rewrites() {
    if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
      return [];
    }

    // Strip trailing slash from the Supabase URL
    const baseUrl = supabaseUrl.replace(/\/+$/, '');

    return [
      // REST API proxy
      {
        source: '/_supabase/rest/:path*',
        destination: `${baseUrl}/rest/:path*`,
      },
      // Auth API proxy
      {
        source: '/_supabase/auth/:path*',
        destination: `${baseUrl}/auth/:path*`,
      },
      // Storage API proxy
      {
        source: '/_supabase/storage/:path*',
        destination: `${baseUrl}/storage/:path*`,
      },
      // Functions (Edge Functions) proxy
      {
        source: '/_supabase/functions/:path*',
        destination: `${baseUrl}/functions/:path*`,
      },
    ];
  },
};

export default nextConfig;
