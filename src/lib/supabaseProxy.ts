/**
 * Supabase Proxy – Resilient fetch wrapper for bypassing regional blocks.
 *
 * Problem:  *.supabase.co endpoints are blocked/unreliable from Indian ISPs
 *           and when Vercel serverless functions execute in Indian edge regions.
 *
 * Solution: This module provides:
 *   1. A custom fetch wrapper with automatic retry + exponential back-off
 *   2. Request timeout handling (prevents hanging connections)
 *   3. Detailed diagnostics logging for connection failures
 *
 * The Supabase JS client accepts a `global.fetch` option which we leverage
 * to inject this resilient fetch into every database call transparently.
 */

type FetchFn = typeof globalThis.fetch;

/** Configuration for the proxy fetch wrapper */
interface ProxyFetchConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number;
  /** Base delay in ms for exponential back-off (default: 500) */
  baseDelayMs: number;
  /** Request timeout in ms (default: 15000) */
  timeoutMs: number;
  /** Whether to log diagnostics (default: true in development) */
  verbose: boolean;
}

const DEFAULT_CONFIG: ProxyFetchConfig = {
  maxRetries: 3,
  baseDelayMs: 500,
  timeoutMs: 15000,
  verbose: process.env.NODE_ENV === 'development',
};

/** Simple structured logger for proxy diagnostics */
function proxyLog(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) {
  const prefix = `[SupabaseProxy][${level.toUpperCase()}]`;
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  if (level === 'error') {
    console.error(`${prefix} ${message}${metaStr}`);
  } else if (level === 'warn') {
    console.warn(`${prefix} ${message}${metaStr}`);
  } else if (DEFAULT_CONFIG.verbose) {
    console.log(`${prefix} ${message}${metaStr}`);
  }
}

/** Sleep helper for back-off delays */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Check if an error is a retriable network/connection error */
function isRetriableError(error: unknown): boolean {
  if (error instanceof TypeError) {
    // Network errors from fetch: "fetch failed", "Failed to fetch", etc.
    return true;
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    // Timeout — retriable
    return true;
  }
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const retriablePatterns = [
    'fetch failed',
    'failed to fetch',
    'network',
    'econnrefused',
    'econnreset',
    'etimedout',
    'enotfound',
    'socket hang up',
    'dns',
    'abort',
    'timeout',
    'connection',
    'unable to connect',
    'getaddrinfo',
  ];
  return retriablePatterns.some((pattern) => msg.includes(pattern));
}

/** Check if an HTTP status code is retriable */
function isRetriableStatus(status: number): boolean {
  // 408 Request Timeout, 429 Too Many Requests, 502/503/504 server errors
  return [408, 429, 502, 503, 504].includes(status);
}

/**
 * Creates a resilient fetch function that wraps the native fetch with:
 *  - Automatic retry with exponential back-off
 *  - Request timeouts via AbortController
 *  - Detailed error diagnostics
 */
export function createProxyFetch(config: Partial<ProxyFetchConfig> = {}): FetchFn {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const proxyFetch: FetchFn = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const method = init?.method || (input instanceof Request ? input.method : 'GET');

    // Extract a short label for logging (e.g., "/rest/v1/orders" from the full Supabase URL)
    let shortPath = url;
    try {
      const parsed = new URL(url);
      shortPath = parsed.pathname + (parsed.search ? '?' + parsed.search.slice(0, 60) : '');
    } catch {
      // URL parsing failed — use raw
    }

    let lastError: unknown = null;

    for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
      // Back-off delay for retries (skip for first attempt)
      if (attempt > 0) {
        const delay = cfg.baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 200;
        proxyLog('warn', `Retry ${attempt}/${cfg.maxRetries} after ${Math.round(delay)}ms`, {
          method,
          path: shortPath,
        });
        await sleep(delay);
      }

      // Create a timeout controller
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), cfg.timeoutMs);

      // Merge abort signals — respect both our timeout and any caller-provided signal
      const mergedSignal = init?.signal
        ? anySignal([init.signal, controller.signal])
        : controller.signal;

      try {
        const response = await globalThis.fetch(input, {
          ...init,
          signal: mergedSignal,
        });

        clearTimeout(timeoutId);

        // If the response status is retriable, keep trying
        if (isRetriableStatus(response.status) && attempt < cfg.maxRetries) {
          proxyLog('warn', `Retriable HTTP ${response.status}`, {
            method,
            path: shortPath,
            attempt,
          });
          lastError = new Error(`HTTP ${response.status}`);
          continue;
        }

        // Success (or non-retriable error) — return as-is
        proxyLog('info', `${method} ${shortPath} → ${response.status}`, { attempt });
        return response;
      } catch (error) {
        clearTimeout(timeoutId);
        lastError = error;

        if (!isRetriableError(error) || attempt >= cfg.maxRetries) {
          // Non-retriable or exhausted retries — throw
          proxyLog('error', `Request failed after ${attempt + 1} attempt(s)`, {
            method,
            path: shortPath,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }

        proxyLog('warn', `Retriable error on attempt ${attempt + 1}`, {
          method,
          path: shortPath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Should not reach here, but safety net
    throw lastError || new Error('Proxy fetch failed: unknown error');
  };

  return proxyFetch;
}

/**
 * Combine multiple AbortSignals into one that aborts when ANY of them abort.
 * (Polyfill for AbortSignal.any() which isn't available in all runtimes)
 */
function anySignal(signals: AbortSignal[]): AbortSignal {
  // Use native AbortSignal.any if available (Node 20+)
  if ('any' in AbortSignal && typeof (AbortSignal as unknown as { any: (s: AbortSignal[]) => AbortSignal }).any === 'function') {
    return (AbortSignal as unknown as { any: (s: AbortSignal[]) => AbortSignal }).any(signals);
  }

  // Polyfill
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

/** Singleton resilient fetch instance */
let _proxyFetch: FetchFn | null = null;

/**
 * Returns the singleton proxy fetch instance.
 * Call this to get the fetch function to pass to the Supabase client.
 */
export function getProxyFetch(): FetchFn {
  if (!_proxyFetch) {
    _proxyFetch = createProxyFetch();
  }
  return _proxyFetch;
}

/**
 * Diagnostic: Test connectivity to the Supabase endpoint.
 * Returns a structured result suitable for the /api/health endpoint.
 */
export async function testSupabaseConnectivity(supabaseUrl: string): Promise<{
  reachable: boolean;
  latencyMs: number;
  error?: string;
  region?: string;
}> {
  if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
    return { reachable: false, latencyMs: -1, error: 'Supabase URL not configured' };
  }

  const start = Date.now();
  try {
    // Hit the Supabase REST health endpoint (no auth needed for a simple ping)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await globalThis.fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      },
    });

    clearTimeout(timeout);
    const latencyMs = Date.now() - start;

    return {
      reachable: res.status < 500,
      latencyMs,
      region: process.env.VERCEL_REGION || process.env.AWS_REGION || 'unknown',
    };
  } catch (error) {
    const latencyMs = Date.now() - start;
    return {
      reachable: false,
      latencyMs,
      error: error instanceof Error ? error.message : String(error),
      region: process.env.VERCEL_REGION || process.env.AWS_REGION || 'unknown',
    };
  }
}

