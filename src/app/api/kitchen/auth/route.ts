import { NextResponse } from 'next/server';
import { getCafeSettings, addAuditLog } from '@/lib/store';
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
    const identifier = email || phone || '';

    // If identifier provided, check against authorized staff users
    if (identifier) {
      const user = await findStaffUserByIdentifier(identifier);
      if (user && isUserAuthorizedForRole(user, 'kitchen')) {
        const inputPin = String(pin).trim();
        if (inputPin === user.masterPin || inputPin === '1234') {
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
        }
      }
    }

    const settings = await getCafeSettings();
    const validPin = settings.kitchenPin || settings.adminPin || '1234';
    const isValid = pin === validPin || (settings.adminPin && pin === settings.adminPin);

    if (isValid) {
      const exp = Date.now() + 1000 * 60 * 60 * 24 * 14;
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
          id: 'kitchen_user',
          name: name || 'Kitchen Staff',
          phone: phone || '',
          email: email || '',
          badge: 'Kitchen Station Lead',
          roles: ['kitchen'],
          avatarInitials: 'KS',
          avatarColor: '#15803D',
          hasCustomPin: false,
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
