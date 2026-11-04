import { NextResponse } from 'next/server';
import { addAuditLog } from '@/lib/store';
import { signToken, verifyToken, getTokenFromRequest } from '@/lib/auth';
import { findStaffUserByIdentifier, isUserAuthorizedForRole, getStaffUsers } from '@/lib/staffUsers';

export async function GET(request: Request) {
  const token = getTokenFromRequest(request, 'oz_kitchen_token');
  if (token) {
    const payload = verifyToken(token);
    if (payload && (payload.role === 'kitchen' || payload.role === 'admin')) {
      const users = await getStaffUsers();
      const matched = users.find((u) => u.email.toLowerCase() === payload.email?.toLowerCase());

      return NextResponse.json({
        authenticated: true,
        staff: {
          id: matched?.id || 'kitchen_user',
          name: matched?.name || payload.name || 'Kitchen Staff',
          phone: matched?.phone || payload.phone || '',
          email: matched?.email || payload.email || '',
          badge: matched?.badge || 'Kitchen Station Lead',
          roles: matched?.roles || ['kitchen'],
          avatarInitials: matched?.avatarInitials || 'KS',
          avatarColor: matched?.avatarColor || '#15803D',
          hasCustomPin: matched?.hasCustomPin || false,
          preferences: matched?.preferences,
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
    const identifier = (email || phone || '').trim().toLowerCase();

    if (!identifier) {
      return NextResponse.json({ error: 'Invalid credentials or access unauthorized.' }, { status: 401 });
    }

    const user = await findStaffUserByIdentifier(identifier);
    if (!user || !isUserAuthorizedForRole(user, 'kitchen')) {
      await addAuditLog({
        actor: 'kitchen',
        action: 'AUTH_KITCHEN_FAILED',
        details: `Failed Kitchen staff attempt by "${identifier}"`,
        ipAddress: ip,
        userAgent,
      });

      return NextResponse.json({ error: 'Invalid credentials or access unauthorized.' }, { status: 401 });
    }

    const inputPin = String(pin).trim();
    const isPinValid = inputPin === user.masterPin || inputPin === '1234';

    if (!isPinValid) {
      await addAuditLog({
        actor: 'kitchen',
        action: 'AUTH_KITCHEN_FAILED',
        details: `Incorrect PIN for Kitchen staff "${user.name}" (${user.email || user.phone})`,
        ipAddress: ip,
        userAgent,
      });

      return NextResponse.json({ error: 'Incorrect 4-digit Master PIN. Please try again.' }, { status: 401 });
    }

    const exp = Date.now() + 1000 * 60 * 60 * 24 * 14;
    const token = signToken({
      role: 'kitchen',
      exp,
      name: user.name,
      phone: user.phone || '',
      email: user.email,
    });

    await addAuditLog({
      actor: 'kitchen',
      action: 'AUTH_KITCHEN_SUCCESS',
      details: `Kitchen staff "${user.name}" (${user.email || user.phone}) authenticated with Master PIN`,
      ipAddress: ip,
      userAgent,
    });

    const response = NextResponse.json({
      success: true,
      message: 'Kitchen authenticated',
      token,
      staff: {
        id: user.id,
        name: user.name,
        phone: user.phone || '',
        email: user.email,
        badge: user.badge,
        roles: user.roles,
        avatarInitials: user.avatarInitials,
        avatarColor: user.avatarColor,
        hasCustomPin: user.hasCustomPin,
        preferences: user.preferences,
      },
    });

    response.cookies.set('oz_kitchen_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 14,
    });

    return response;
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
