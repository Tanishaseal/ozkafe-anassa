import crypto from 'crypto';

// Secret key for HMAC token signing (falls back to persistent stable default if not in env)
const SESSION_SECRET = process.env.SESSION_SECRET || 'ozkafe-anassa-production-super-secret-key-2026-secure';

export interface TokenPayload {
  role: 'admin' | 'kitchen' | 'table';
  tableNumber?: number | string;
  sessionId?: string;
  exp: number; // Unix timestamp ms
}

/**
 * Generate a cryptographically signed HMAC-SHA256 token
 */
export function signToken(payload: TokenPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(data)
    .digest('base64url');
  return `${data}.${signature}`;
}

/**
 * Verify and decode an HMAC-SHA256 signed token
 */
export function verifyToken(token: string): TokenPayload | null {
  if (!token || !token.includes('.')) return null;

  const [data, signature] = token.split('.');
  if (!data || !signature) return null;

  const expectedSignature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(data)
    .digest('base64url');

  // Timing-safe comparison to prevent timing attacks
  try {
    const isSignatureValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );

    if (!isSignatureValid) return null;

    const payload: TokenPayload = JSON.parse(
      Buffer.from(data, 'base64url').toString('utf-8')
    );

    // Check expiration
    if (Date.now() > payload.exp) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Generate a tamper-proof Table QR Token for a specific table
 */
export function generateTableQRToken(tableNumber: number | string, secretKey: string): string {
  const payload = {
    table: String(tableNumber),
    keyHash: crypto.createHash('sha256').update(secretKey).digest('hex').substring(0, 16),
    ts: Date.now(),
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', secretKey + SESSION_SECRET)
    .update(data)
    .digest('base64url');
  return `${data}.${sig}`;
}

/**
 * Validate a Table QR Token against the table's registered secret key
 */
export function verifyTableQRToken(tableNumber: number | string, secretKey: string, token: string): boolean {
  if (!token || !token.includes('.')) return false;

  const [data, sig] = token.split('.');
  if (!data || !sig) return false;

  try {
    const expectedSig = crypto
      .createHmac('sha256', secretKey + SESSION_SECRET)
      .update(data)
      .digest('base64url');

    const isValid = crypto.timingSafeEqual(
      Buffer.from(sig),
      Buffer.from(expectedSig)
    );

    if (!isValid) return false;

    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf-8'));
    return String(parsed.table) === String(tableNumber);
  } catch {
    return false;
  }
}

/**
 * Helper to inspect cookie string or Next.js Request cookies for role
 */
export function verifyAuthHeaderOrCookie(request: Request, allowedRoles: ('admin' | 'kitchen')[]): boolean {
  // 1. Check Authorization Bearer header
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    if (payload && allowedRoles.includes(payload.role as 'admin' | 'kitchen')) {
      return true;
    }
  }

  // 2. Check Cookie header
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = parseCookies(cookieHeader);

  // Admin cookie grants both admin & kitchen
  if (cookies.oz_admin_token) {
    const payload = verifyToken(cookies.oz_admin_token);
    if (payload && payload.role === 'admin') return true;
  }

  // Kitchen cookie grants kitchen role
  if (allowedRoles.includes('kitchen') && cookies.oz_kitchen_token) {
    const payload = verifyToken(cookies.oz_kitchen_token);
    if (payload && (payload.role === 'kitchen' || payload.role === 'admin')) return true;
  }

  return false;
}

/**
 * Extract table session payload from request
 */
export function getTableSessionFromRequest(request: Request, tableNumber: number | string): TokenPayload | null {
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = parseCookies(cookieHeader);
  const cookieName = `oz_tbl_session_${tableNumber}`;

  const token = cookies[cookieName] || request.headers.get('x-table-session');
  if (!token) return null;

  const payload = verifyToken(token);
  if (payload && payload.role === 'table' && String(payload.tableNumber) === String(tableNumber)) {
    return payload;
  }
  return null;
}

function parseCookies(cookieString: string): Record<string, string> {
  const list: Record<string, string> = {};
  cookieString.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    if (parts.length >= 2) {
      const name = parts[0]?.trim();
      const val = parts.slice(1).join('=').trim();
      if (name) list[name] = decodeURIComponent(val);
    }
  });
  return list;
}
