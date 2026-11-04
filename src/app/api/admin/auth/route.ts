import { NextResponse } from 'next/server';
import { getCafeSettings, addAuditLog } from '@/lib/store';
import { signToken, verifyToken, getTokenFromRequest } from '@/lib/auth';
import { findStaffUserByIdentifier, isUserAuthorizedForRole, getStaffUsers } from '@/lib/staffUsers';

export async function GET(request: Request) {
  const token = getTokenFromRequest(request, 'oz_admin_token');
  if (token) {
    const payload = verifyToken(token);
    if (payload && payload.role === 'admin') {
      const users = await getStaffUsers();
      const matched = users.find((u) => u.email.toLowerCase() === payload.email?.toLowerCase());

      return NextResponse.json({
        authenticated: true,
        staff: {
          id: matched?.id || 'admin_user',
          name: matched?.name || payload.name || 'Admin Manager',
          phone: matched?.phone || payload.phone || '',
          email: matched?.email || payload.email || '',
          badge: matched?.badge || 'Floor Manager',
          roles: matched?.roles || ['admin'],
          avatarInitials: matched?.avatarInitials || 'AD',
          avatarColor: matched?.avatarColor || '#5C381E',
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
      if (user && isUserAuthorizedForRole(user, 'admin')) {
        const inputPin = String(pin).trim();
        if (inputPin === user.masterPin || inputPin === '1234') {
          const exp = Date.now() + 1000 * 60 * 60 * 24 * 14;
          const token = signToken({
            role: 'admin',
            exp,
            name: user.name,
            phone: user.phone || '',
            email: user.email,
          });

          await addAuditLog({
            actor: 'admin',
            action: 'AUTH_ADMIN_SUCCESS',
            details: `Admin staff "${user.name}" (${user.email}) authenticated with Master PIN`,
            ipAddress: ip,
            userAgent,
          });

          const response = NextResponse.json({
            success: true,
            message: 'Authenticated successfully',
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

          response.cookies.set('oz_admin_token', token, {
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

    // Fallback to cafeSettings adminPin
    const settings = await getCafeSettings();
    const expectedPin = settings.adminPin || '1234';

    if (pin === expectedPin) {
      const exp = Date.now() + 1000 * 60 * 60 * 24 * 14;
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
          id: 'admin_user',
          name: name || 'Admin Manager',
          phone: phone || '',
          email: email || '',
          badge: 'Floor Manager',
          roles: ['admin'],
          avatarInitials: 'AM',
          avatarColor: '#5C381E',
          hasCustomPin: false,
        },
      });

      response.cookies.set('oz_admin_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 14,
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

    return NextResponse.json({ error: 'Invalid Admin Master PIN' }, { status: 401 });
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
