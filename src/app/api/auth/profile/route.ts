import { NextResponse } from 'next/server';
import { verifyToken, getTokenFromRequest } from '@/lib/auth';
import { getStaffUsers, updateStaffProfile, updateStaffMasterPin } from '@/lib/staffUsers';

export async function GET(request: Request) {
  // Check either admin or kitchen token
  const adminToken = getTokenFromRequest(request, 'oz_admin_token');
  const kitchenToken = getTokenFromRequest(request, 'oz_kitchen_token');

  const token = adminToken || kitchenToken;
  if (!token) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const payload = verifyToken(token);
  if (!payload || !payload.email) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const users = await getStaffUsers();
  const user = users.find((u) => u.email.toLowerCase() === payload.email?.toLowerCase());

  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
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
}

export async function PATCH(request: Request) {
  const adminToken = getTokenFromRequest(request, 'oz_admin_token');
  const kitchenToken = getTokenFromRequest(request, 'oz_kitchen_token');

  const token = adminToken || kitchenToken;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = verifyToken(token);
  if (!payload || !payload.email) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }

  try {
    const users = await getStaffUsers();
    const user = users.find((u) => u.email.toLowerCase() === payload.email?.toLowerCase());
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const { name, phone, avatarColor, preferences, currentPin, newPin } = body;

    // If changing PIN:
    if (newPin) {
      if (!/^\d{4}$/.test(String(newPin).trim())) {
        return NextResponse.json({ error: 'New PIN must be exactly 4 numeric digits.' }, { status: 400 });
      }

      if (user.hasCustomPin && currentPin) {
        if (String(currentPin).trim() !== user.masterPin) {
          return NextResponse.json({ error: 'Current PIN is incorrect.' }, { status: 400 });
        }
      }

      await updateStaffMasterPin(user.id, String(newPin).trim());
    }

    // Update profile
    const updated = await updateStaffProfile(user.id, {
      name,
      phone,
      avatarColor,
      preferences,
    });

    return NextResponse.json({
      success: true,
      message: 'Account updated successfully!',
      user: updated,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Update failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
