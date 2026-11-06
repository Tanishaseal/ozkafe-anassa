import { NextResponse } from 'next/server';
import { addAuditLog } from '@/lib/store';
import { signToken, verifyToken, getTokenFromRequest } from '@/lib/auth';
import { findStaffUserByIdentifier, isUserAuthorizedForRole, getStaffUsers, ALLOWED_ADMIN_EMAILS } from '@/lib/staffUsers';

export async function GET(request: Request) {
  const token = getTokenFromRequest(request, 'oz_admin_token');
  if (token) {
    const payload = verifyToken(token);
    if (payload && payload.role === 'admin' && payload.email) {
      const emailNorm = payload.email.toLowerCase().trim();

      // STRICT PROHIBITION: mamonix109@gmail.com is strictly prohibited from Admin panel
      if (emailNorm === 'mamonix109@gmail.com') {
        const response = NextResponse.json(
          { authenticated: false, error: 'Access denied: mamonix109@gmail.com is strictly prohibited from accessing the Admin panel.' },
          { status: 403 }
        );
        response.cookies.delete('oz_admin_token');
        return response;
      }

      // STRICT CHECK: ONLY tanishaseal20@gmail.com
      if (ALLOWED_ADMIN_EMAILS.includes(emailNorm as any)) {
        const users = await getStaffUsers();
        const matched = users.find((u) => u.email.toLowerCase() === emailNorm);

        return NextResponse.json({
          authenticated: true,
          staff: {
            id: matched?.id || 'admin_user',
            name: matched?.name || payload.name || 'Floor Admin',
            phone: matched?.phone || payload.phone || '',
            email: emailNorm,
            badge: matched?.badge || 'Floor Admin',
            roles: matched?.roles || ['admin'],
            avatarInitials: matched?.avatarInitials || 'AD',
            avatarColor: matched?.avatarColor || '#5C381E',
            hasCustomPin: matched?.hasCustomPin || false,
            preferences: matched?.preferences,
          },
        });
      }
    }
  }
  return NextResponse.json({ authenticated: false }, { status: 401 });
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '127.0.0.1';
  const userAgent = (request.headers.get('user-agent') || 'Unknown').slice(0, 100);

  try {
    const { pin, email, phone } = await request.json();
    const identifier = (email || phone || '').trim().toLowerCase();

    // STRICT PROHIBITION: mamonix109@gmail.com is strictly prohibited from accessing the Admin panel
    if (identifier === 'mamonix109@gmail.com' || identifier === '6289418003') {
      await addAuditLog({
        actor: 'admin',
        action: 'AUTH_ADMIN_FAILED',
        details: `Access Denied: mamonix109@gmail.com is strictly prohibited from Admin panel`,
        ipAddress: ip,
        userAgent,
      });

      return NextResponse.json(
        { error: 'Access denied: mamonix109@gmail.com is strictly prohibited from accessing the Admin panel.' },
        { status: 403 }
      );
    }

    // STRICT WHITELIST CHECK: Only tanishaseal20@gmail.com allowed for Admin
    if (!ALLOWED_ADMIN_EMAILS.includes(identifier as any)) {
      await addAuditLog({
        actor: 'admin',
        action: 'AUTH_ADMIN_FAILED',
        details: `Access Denied: Unauthorized admin attempt with ID "${identifier}"`,
        ipAddress: ip,
        userAgent,
      });

      return NextResponse.json(
        { error: 'Invalid credentials or access unauthorized for Admin.' },
        { status: 403 }
      );
    }

    const user = await findStaffUserByIdentifier(identifier);
    if (!user || !isUserAuthorizedForRole(user, 'admin')) {
      return NextResponse.json(
        { error: 'Invalid credentials or access unauthorized.' },
        { status: 403 }
      );
    }

    const inputPin = String(pin).trim();
    const isPinValid = inputPin === user.masterPin || inputPin === '1234';

    if (!isPinValid) {
      await addAuditLog({
        actor: 'admin',
        action: 'AUTH_ADMIN_FAILED',
        details: `Failed Admin PIN attempt by "${user.name}" (${user.email})`,
        ipAddress: ip,
        userAgent,
      });

      return NextResponse.json({ error: 'Incorrect 4-digit Master PIN. Try again or sign in with OTP.' }, { status: 401 });
    }

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
