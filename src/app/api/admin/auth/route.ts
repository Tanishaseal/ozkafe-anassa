import { NextResponse } from 'next/server';
import { getCafeSettings, addAuditLog } from '@/lib/store';
import { signToken } from '@/lib/auth';

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '127.0.0.1';
  const userAgent = (request.headers.get('user-agent') || 'Unknown').slice(0, 100);

  try {
    const { pin } = await request.json();
    const settings = await getCafeSettings();

    const expectedPin = settings.adminPin || '1234';

    if (pin === expectedPin) {
      const exp = Date.now() + 1000 * 60 * 60 * 12; // 12 hours
      const token = signToken({ role: 'admin', exp });

      await addAuditLog({
        actor: 'admin',
        action: 'AUTH_ADMIN_SUCCESS',
        details: 'Admin authenticated successfully with Master PIN',
        ipAddress: ip,
        userAgent,
      });

      const response = NextResponse.json({
        success: true,
        message: 'Authenticated successfully',
        token,
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
      details: 'Failed Admin PIN attempt',
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
