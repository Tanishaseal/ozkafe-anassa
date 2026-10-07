import { NextResponse } from 'next/server';
import { getCafeSettings, addAuditLog } from '@/lib/store';
import { signToken } from '@/lib/auth';

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '127.0.0.1';
  const userAgent = (request.headers.get('user-agent') || 'Unknown').slice(0, 100);

  try {
    const { pin } = await request.json();
    const settings = await getCafeSettings();

    // Staff / Kitchen PIN can match admin PIN or default '1234'
    const validPin = settings.adminPin || '1234';

    if (pin === validPin) {
      const exp = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 days
      const token = signToken({ role: 'kitchen', exp });

      await addAuditLog({
        actor: 'kitchen',
        action: 'AUTH_KITCHEN_SUCCESS',
        details: 'Kitchen staff authenticated successfully',
        ipAddress: ip,
        userAgent,
      });

      const response = NextResponse.json({
        success: true,
        message: 'Kitchen authenticated',
        token,
      });
      response.cookies.set('oz_kitchen_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7,
        path: '/',
      });
      return response;
    }

    await addAuditLog({
      actor: 'kitchen',
      action: 'AUTH_KITCHEN_FAILED',
      details: 'Failed Kitchen staff PIN attempt',
      ipAddress: ip,
      userAgent,
    });

    return NextResponse.json({ error: 'Invalid Kitchen Staff PIN' }, { status: 401 });
  } catch (error) {
    console.error('Kitchen auth error:', error);
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '127.0.0.1';
  const userAgent = (request.headers.get('user-agent') || 'Unknown').slice(0, 100);

  await addAuditLog({
    actor: 'kitchen',
    action: 'AUTH_LOGOUT',
    details: 'Kitchen staff logged out',
    ipAddress: ip,
    userAgent,
  });

  const response = NextResponse.json({ success: true, message: 'Kitchen logged out' });
  response.cookies.delete('oz_kitchen_token');
  return response;
}
