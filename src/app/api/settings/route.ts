import { NextResponse } from 'next/server';
import { getCafeSettings, updateCafeSettings } from '@/lib/store';
import { verifyAuthHeaderOrCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const full = await getCafeSettings();

    // Sanitize sensitive credentials from public response
    const sanitized = {
      cafeName: full.cafeName,
      tagline: full.tagline,
      address: full.address,
      contactPhone: full.contactPhone,
      currencySymbol: full.currencySymbol,
      gstPercent: full.gstPercent,
      isOpen: full.isOpen,
      closedMessage: full.closedMessage,
      geofencingEnabled: full.geofencingEnabled,
      cafeLatitude: full.cafeLatitude,
      cafeLongitude: full.cafeLongitude,
      geofenceRadiusMeters: full.geofenceRadiusMeters,
      allowTakeawayWithoutGeofence: full.allowTakeawayWithoutGeofence ?? false,
      geofenceDevMode: full.geofenceDevMode ?? false,
      tableKeyValidationStrict: full.tableKeyValidationStrict ?? true,
      tableSessionTimeoutMinutes: full.tableSessionTimeoutMinutes ?? 120,
      urlCleansingEnabled: full.urlCleansingEnabled ?? true,
      sessionIsolationEnabled: full.sessionIsolationEnabled ?? true,
      requireCustomerPhone: full.requireCustomerPhone ?? true,
      requireCustomerName: full.requireCustomerName ?? true,
      allowCustomerFlatInput: full.allowCustomerFlatInput ?? true,
      minOrderAmount: full.minOrderAmount ?? 0,
      maxItemsPerOrder: full.maxItemsPerOrder ?? 25,
      orderCooldownSeconds: full.orderCooldownSeconds ?? 10,
      kitchenSoundEnabled: full.kitchenSoundEnabled ?? true,
      warningTimeMinutes: full.warningTimeMinutes ?? 10,
      dangerTimeMinutes: full.dangerTimeMinutes ?? 15,
      allowOrderCancellation: full.allowOrderCancellation ?? true,
    };

    return NextResponse.json({ success: true, settings: sanitized });
  } catch (error) {
    console.error('API GET /api/settings error:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!verifyAuthHeaderOrCookie(request, ['admin'])) {
    return NextResponse.json({ error: 'Unauthorized. Admin credentials required.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const updated = await updateCafeSettings(body);
    return NextResponse.json({ success: true, settings: updated });
  } catch (error) {
    console.error('API PATCH /api/settings error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}

