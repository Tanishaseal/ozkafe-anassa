import { NextResponse } from 'next/server';
import { getCafeSettings, addAuditLog } from '@/lib/store';
import { signToken, verifyToken, getTokenFromRequest } from '@/lib/auth';

export async function GET(request: Request) {
  const token = getTokenFromRequest(request, 'oz_admin_token');
  if (token) {
    const payload = verifyToken(token);
    if (payload && payload.role === 'admin') {
      return NextResponse.json({
        authenticated: true,
        staff: {
          name: payload.name || 'Admin Manager',
          phone: payload.phone || '',
          email: payload.email || '',
        },
      });
    }
  }
  return NextResponse.json({ authenticated: false }, { status: 401 });
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '127.0.0.1';
  const userAgent = (request.headers.get('user-agent') || 'Unknown').slice(0, 100);

  try {
    const { pin, name, phone, email } = await request.json();
    const settings = await getCafeSettings();

    const expectedPin = settings.adminPin || '1234';

    if (pin === expectedPin) {
      const exp = Date.now() + 1000 * 60 * 60 * 12; // 12 hours
      const token = signToken({ 
        role: 'admin', 
        exp,
        name: name ? String(name).trim() : 'Admin Manager',
        phone: phone ? String(phone).trim() : '',
        email: email ? String(email).trim() : '',
      });

      await addAuditLog({
        actor: 'admin',
        action: 'AUTH_ADMIN_SUCCESS',
        details: `Admin staff "${name || 'Admin'}" (${phone || 'N/A'}, ${email || 'N/A'}) authenticated successfully with Master PIN`,
        ipAddress: ip,
        userAgent,
      });

      const response = NextResponse.json({
        success: true,
        message: 'Authenticated successfully',
        token,
        staff: {
          name: name || 'Admin Manager',
          phone: phone || '',
          email: email || '',
        },
      });

      response.cookies.set('oz_admin_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      });

      return response;
    }

    await addAuditLog({
      actor: 'admin',
      action: 'AUTH_ADMIN_FAILED',
      details: `Failed Admin PIN attempt by "${name || 'Unknown'}" (${phone || 'N/A'})`,
      ipAddress: ip,
      userAgent,
    });

    return NextResponse.json({ error: 'Invalid Admin PIN' }, { status: 401 });
  } catch (error) {
    console.error('API /api/admin/auth error:', error);
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '127.0.0.1';
  const userAgent = (request.headers.get('user-agent') || 'Unknown').slice(0, 100);

  await addAuditLog({
    actor: 'admin',
    action: 'AUTH_LOGOUT',
    details: 'Admin logged out',
    ipAddress: ip,
    userAgent,
  });

  const response = NextResponse.json({ success: true, message: 'Logged out' });
  response.cookies.delete('oz_admin_token');
  return response;
}
