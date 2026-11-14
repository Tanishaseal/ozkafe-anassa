import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getTables, validateTable, ensureTablesCount, getCafeSettings } from '@/lib/store';
import { verifyAuthHeaderOrCookie, signToken, verifyToken, getTokenFromRequest } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tableNumber = searchParams.get('table');
    const key = searchParams.get('key') || undefined;

    // Table validation & session token issuance
    if (tableNumber) {
      const result = await validateTable(tableNumber, key);
      
      const settings = await getCafeSettings();
      if (result.valid) {
        // Reuse existing session if already established by client to prevent dropping active customer orders!

        const existingToken = getTokenFromRequest(request, `oz_tbl_session_${tableNumber}`);
        let existingSessionFromToken: string | undefined;
        if (existingToken) {
          const payload = verifyToken(existingToken);
          if (payload && payload.role === 'table' && String(payload.tableNumber) === String(tableNumber) && payload.sessionId) {
            existingSessionFromToken = payload.sessionId;
          }
        }

        if (settings.tableKeyValidationStrict !== false && !result.isVerified && !existingSessionFromToken) return NextResponse.json({ ...result, valid: false }, { status: 403 });
        const lifetime = Math.max(1, settings.tableSessionTimeoutMinutes || 120) * 60;
        const exp = Date.now() + 1000 * lifetime; // 24-hour dining session
        const sessionId = existingSessionFromToken || randomUUID();
        const sessionToken = signToken({
          role: 'table',
          tableNumber,
          sessionId,
          exp,
        });

        const response = NextResponse.json({
          ...result,
          isVerified: true,
          tableNumber,
          sessionToken,
          sessionId,
        });

        // Set table session cookie
        response.cookies.set(`oz_tbl_session_${tableNumber}`, sessionToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: lifetime,
          path: '/',
        });

        return response;
      }

      return NextResponse.json({
        ...result,
        tableNumber,
      });
    }

    // List tables
    const isAdmin = verifyAuthHeaderOrCookie(request, ['admin']);
    const tables = await getTables(isAdmin); // Secrets only returned if admin
    return NextResponse.json(tables);
  } catch (error) {
    console.error('API GET /api/tables error:', error);
    return NextResponse.json({ error: 'Failed to fetch tables' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  // Guard: Admin auth required to configure tables
  if (!verifyAuthHeaderOrCookie(request, ['admin'])) {
    return NextResponse.json({ error: 'Unauthorized. Admin credentials required.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const rawCount = parseInt(body?.numTables);
    const count = isNaN(rawCount) ? 12 : Math.min(Math.max(1, rawCount), 100);

    const tables = await ensureTablesCount(count);
    return NextResponse.json({ success: true, tables });
  } catch (error) {
    console.error('API POST /api/tables error:', error);
    return NextResponse.json({ error: 'Failed to configure tables' }, { status: 500 });
  }
}
