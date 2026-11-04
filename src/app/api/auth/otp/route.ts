import { NextResponse } from 'next/server';
import {
  findStaffUserByIdentifier,
  isUserAuthorizedForRole,
  generateAndSendOtp,
  verifyStaffOtp,
  updateStaffMasterPin,
  getStaffUsers,
} from '@/lib/staffUsers';
import { signToken } from '@/lib/auth';
import { addAuditLog } from '@/lib/store';

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '127.0.0.1';
  const userAgent = (request.headers.get('user-agent') || 'Unknown').slice(0, 100);

  try {
    const body = await request.json();
    const { action } = body;

    // ──────────────────────────────────────────
    // 1. ACTION: REQUEST OTP
    // ──────────────────────────────────────────
    if (action === 'request_otp') {
      const { identifier, consoleType } = body; // consoleType: 'admin' | 'kitchen'
      if (!identifier || !identifier.trim()) {
        return NextResponse.json({ error: 'Please enter a valid Email ID or Mobile Number.' }, { status: 400 });
      }

      const role = consoleType === 'kitchen' ? 'kitchen' : 'admin';
      const user = await findStaffUserByIdentifier(identifier);

      if (!user) {
        await addAuditLog({
          actor: role,
          action: role === 'admin' ? 'AUTH_ADMIN_FAILED' : 'AUTH_KITCHEN_FAILED',
          details: `Unauthorized login attempt with identifier "${identifier}" on ${role.toUpperCase()} console`,
          ipAddress: ip,
          userAgent,
        });

        return NextResponse.json(
          {
            error:
              role === 'admin'
                ? 'Access Denied: Only authorized Management IDs (sonmarinventure@gmail.com, tanishaseal20@gmail.com) are allowed to enter Floor Admin.'
                : 'Access Denied: Only authorized Kitchen IDs (mamonix109@gmail.com, 6289418003, or tanishaseal20@gmail.com) are allowed to enter Kitchen KDS.',
          },
          { status: 403 }
        );
      }

      if (!isUserAuthorizedForRole(user, role)) {
        return NextResponse.json(
          {
            error: `Access Denied: Your ID (${user.email}) does not have permission for the ${role.toUpperCase()} console.`,
          },
          { status: 403 }
        );
      }

      const otpResult = await generateAndSendOtp(user, identifier, role);
      return NextResponse.json({
        success: true,
        userId: user.id,
        name: user.name,
        badge: user.badge,
        destinationType: otpResult.destinationType,
        destinationMasked: otpResult.destinationMasked,
        previewOtp: otpResult.previewOtp,
        message: otpResult.message,
        hasCustomPin: user.hasCustomPin,
      });
    }

    // ──────────────────────────────────────────
    // 2. ACTION: VERIFY OTP
    // ──────────────────────────────────────────
    if (action === 'verify_otp') {
      const { userId, otp, consoleType } = body;
      if (!userId || !otp) {
        return NextResponse.json({ error: 'Missing User ID or OTP code.' }, { status: 400 });
      }

      const role = consoleType === 'kitchen' ? 'kitchen' : 'admin';
      const users = await getStaffUsers();
      const user = users.find((u) => u.id === userId);

      if (!user || !isUserAuthorizedForRole(user, role)) {
        return NextResponse.json({ error: 'Invalid user or unauthorized role.' }, { status: 403 });
      }

      const verification = verifyStaffOtp(user.id, otp);
      if (!verification.valid) {
        await addAuditLog({
          actor: role,
          action: role === 'admin' ? 'AUTH_ADMIN_FAILED' : 'AUTH_KITCHEN_FAILED',
          details: `Failed OTP attempt for ${user.name} (${user.email})`,
          ipAddress: ip,
          userAgent,
        });
        return NextResponse.json({ error: verification.reason || 'Invalid OTP code.' }, { status: 400 });
      }

      // Generate secure session token (14 days validity for seamless experience)
      const exp = Date.now() + 1000 * 60 * 60 * 24 * 14;
      const token = signToken({
        role,
        exp,
        name: user.name,
        email: user.email,
        phone: user.phone || '',
      });

      await addAuditLog({
        actor: role,
        action: role === 'admin' ? 'AUTH_ADMIN_SUCCESS' : 'AUTH_KITCHEN_SUCCESS',
        details: `Staff "${user.name}" (${user.email}) authenticated successfully via Security OTP on ${role.toUpperCase()}`,
        ipAddress: ip,
        userAgent,
      });

      const cookieName = role === 'kitchen' ? 'oz_kitchen_token' : 'oz_admin_token';
      const response = NextResponse.json({
        success: true,
        message: 'Security verification successful!',
        token,
        requiresPinSetup: !user.hasCustomPin,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          roles: user.roles,
          badge: user.badge,
          hasCustomPin: user.hasCustomPin,
          avatarInitials: user.avatarInitials,
          avatarColor: user.avatarColor,
          preferences: user.preferences,
        },
      });

      response.cookies.set(cookieName, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 14,
      });

      return response;
    }

    // ──────────────────────────────────────────
    // 3. ACTION: LOGIN WITH 4-DIGIT MASTER PIN
    // ──────────────────────────────────────────
    if (action === 'login_with_pin') {
      const { identifier, pin, consoleType } = body;
      if (!identifier || !pin) {
        return NextResponse.json({ error: 'Please enter both your ID and 4-digit Master PIN.' }, { status: 400 });
      }

      const role = consoleType === 'kitchen' ? 'kitchen' : 'admin';
      const user = await findStaffUserByIdentifier(identifier);

      if (!user || !isUserAuthorizedForRole(user, role)) {
        await addAuditLog({
          actor: role,
          action: role === 'admin' ? 'AUTH_ADMIN_FAILED' : 'AUTH_KITCHEN_FAILED',
          details: `Unauthorized PIN attempt with identifier "${identifier}" on ${role.toUpperCase()}`,
          ipAddress: ip,
          userAgent,
        });

        return NextResponse.json(
          {
            error:
              role === 'admin'
                ? 'Access Denied: Unrecognized ID. Only sonmarinventure@gmail.com and tanishaseal20@gmail.com are permitted.'
                : 'Access Denied: Unrecognized ID. Only mamonix109@gmail.com, 6289418003, or tanishaseal20@gmail.com are permitted.',
          },
          { status: 403 }
        );
      }

      const inputPin = String(pin).trim();
      // Allow user's customized masterPin, or initial '1234'
      const isPinValid = inputPin === user.masterPin || inputPin === '1234';

      if (!isPinValid) {
        await addAuditLog({
          actor: role,
          action: role === 'admin' ? 'AUTH_ADMIN_FAILED' : 'AUTH_KITCHEN_FAILED',
          details: `Incorrect PIN entered for ${user.name} (${user.email})`,
          ipAddress: ip,
          userAgent,
        });
        return NextResponse.json(
          { error: 'Incorrect 4-digit Master PIN. Try again or sign in with OTP.' },
          { status: 401 }
        );
      }

      // Generate session token (14 days)
      const exp = Date.now() + 1000 * 60 * 60 * 24 * 14;
      const token = signToken({
        role,
        exp,
        name: user.name,
        email: user.email,
        phone: user.phone || '',
      });

      await addAuditLog({
        actor: role,
        action: role === 'admin' ? 'AUTH_ADMIN_SUCCESS' : 'AUTH_KITCHEN_SUCCESS',
        details: `Staff "${user.name}" (${user.email}) unlocked console with 4-digit Master PIN`,
        ipAddress: ip,
        userAgent,
      });

      const cookieName = role === 'kitchen' ? 'oz_kitchen_token' : 'oz_admin_token';
      const response = NextResponse.json({
        success: true,
        message: 'Master PIN accepted!',
        token,
        requiresPinSetup: !user.hasCustomPin,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          roles: user.roles,
          badge: user.badge,
          hasCustomPin: user.hasCustomPin,
          avatarInitials: user.avatarInitials,
          avatarColor: user.avatarColor,
          preferences: user.preferences,
        },
      });

      response.cookies.set(cookieName, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 14,
      });

      return response;
    }

    // ──────────────────────────────────────────
    // 4. ACTION: SET 4-DIGIT MASTER PIN
    // ──────────────────────────────────────────
    if (action === 'set_master_pin') {
      const { userId, newPin } = body;
      if (!userId || !newPin) {
        return NextResponse.json({ error: 'Missing User ID or new PIN.' }, { status: 400 });
      }

      if (!/^\d{4}$/.test(String(newPin).trim())) {
        return NextResponse.json({ error: 'PIN must be exactly 4 numeric digits.' }, { status: 400 });
      }

      const success = await updateStaffMasterPin(userId, String(newPin).trim());
      if (!success) {
        return NextResponse.json({ error: 'User not found.' }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        message: 'Your 4-digit Master PIN has been saved successfully! You can now use this PIN for instant 1-step logins.',
      });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Authentication request failed';
    console.error('API /api/auth/otp error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
