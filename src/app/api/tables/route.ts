import { NextResponse } from 'next/server';
import { getTables, validateTable, ensureTablesCount, getTableByNumber } from '@/lib/store';
import { verifyAuthHeaderOrCookie, signToken } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tableNumber = searchParams.get('table');
    const key = searchParams.get('key') || undefined;

    // Table validation & session token issuance
    if (tableNumber) {
      const result = await validateTable(tableNumber, key);
      
      // If table is valid and verified, issue a cryptographically signed Table Session Token
      let sessionToken = '';
      const response = NextResponse.json({
        ...result,
        tableNumber,
      });

      if (result.valid) {
        const exp = Date.now() + 1000 * 60 * 60 * 12; // 12-hour dining session
        const sessionId = `sess_${tableNumber}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        sessionToken = signToken({
          role: 'table',
          tableNumber,
          sessionId,
          exp,
        });

        // Set table session cookie
        response.cookies.set(`oz_tbl_session_${tableNumber}`, sessionToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 12,
          path: '/',
        });

        return NextResponse.json({
          ...result,
          tableNumber,
          sessionToken,
          sessionId,
        }, {
          headers: response.headers,
        });
      }

      return response;
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
    const count = parseInt(body.numTables) || 12;

    const tables = await ensureTablesCount(count);
    return NextResponse.json({ success: true, tables });
  } catch (error) {
    console.error('API POST /api/tables error:', error);
    return NextResponse.json({ error: 'Failed to configure tables' }, { status: 500 });
  }
}
