import { NextResponse } from 'next/server';
import { getCafeSettings, addAuditLog } from '@/lib/store';
import { signToken, verifyToken, getTokenFromRequest } from '@/lib/auth';

export async function GET(request: Request) {
  const token = getTokenFromRequest(request, 'oz_kitchen_token');
  if (token) {
    const payload = verifyToken(token);
    if (payload && (payload.role === 'kitchen' || payload.role === 'admin')) {
      return NextResponse.json({
        authenticated: true,
        staff: {
          name: payload.name || 'Kitchen Staff',
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

    // Staff / Kitchen PIN can match kitchenPin, adminPin or default '1234'
    const validPin = settings.kitchenPin || settings.adminPin || '1234';
    const isValid = pin === validPin || (settings.adminPin && pin === settings.adminPin);

    if (isValid) {
      const exp = Date.now() + 1000 * 60 * 60 * 12; // 12 hours
      const token = signToken({ 
        role: 'kitchen', 
        exp,
        name: name ? String(name).trim() : 'Kitchen Staff',
        phone: phone ? String(phone).trim() : '',
        email: email ? String(email).trim() : '',
      });

      await addAuditLog({
        actor: 'kitchen',
        action: 'AUTH_KITCHEN_SUCCESS',
        details: `Kitchen staff "${name || 'Staff'}" (${phone || 'N/A'}, ${email || 'N/A'}) authenticated successfully`,
        ipAddress: ip,
        userAgent,
      });

      const response = NextResponse.json({
        success: true,
        message: 'Kitchen authenticated',
        token,
        staff: {
          name: name || 'Kitchen Staff',
          phone: phone || '',
          email: email || '',
        },
      });
      response.cookies.set('oz_kitchen_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      });
      return response;
    }

    await addAuditLog({
      actor: 'kitchen',
      action: 'AUTH_KITCHEN_FAILED',
      details: `Failed Kitchen staff PIN attempt by "${name || 'Unknown'}" (${phone || 'N/A'})`,
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
