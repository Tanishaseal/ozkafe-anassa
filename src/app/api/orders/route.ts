import { NextResponse } from 'next/server';
import { createOrder, getOrders, getOrderById, updateOrderStatus, validateTable, getCafeSettings, calculateDistanceMeters, addAuditLog } from '@/lib/store';
import { OrderStatus } from '@/lib/types';
import { verifyAuthHeaderOrCookie, getTableSessionFromRequest } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const table = searchParams.get('table');
    const sessionId = searchParams.get('session');
    const status = searchParams.get('status');
    const all = searchParams.get('all');

    // 1. Admin order ledger query: MUST have admin auth
    if (all === 'true') {
      if (!verifyAuthHeaderOrCookie(request, ['admin'])) {
        return NextResponse.json({ error: 'Unauthorized. Admin credentials required.' }, { status: 401 });
      }
      const orders = await getOrders({ limit: 100 });
      return NextResponse.json(orders);
    }

    // 2. Kitchen Display query (Active orders): MUST have kitchen or admin auth
    if (status === 'active') {
      if (!verifyAuthHeaderOrCookie(request, ['kitchen', 'admin'])) {
        return NextResponse.json({ error: 'Unauthorized. Kitchen staff access required.' }, { status: 401 });
      }
      const activeOrders = await getOrders({ status: 'active' });
      return NextResponse.json(activeOrders);
    }

    // 3. Customer tracker for single order
    if (id) {
      const order = await getOrderById(id);
      if (!order) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }

      // Check if caller is kitchen/admin or customer matching table
      const isStaff = verifyAuthHeaderOrCookie(request, ['kitchen', 'admin']);
      if (!isStaff) {
        // Return masked customer details for privacy
        return NextResponse.json({
          id: order.id,
          orderNumber: order.orderNumber,
          tableNumber: order.tableNumber,
          customerName: order.customerName,
          customerPhone: maskPhoneNumber(order.customerPhone),
          customerFlat: order.customerFlat,
          items: order.items,
          total: order.total,
          status: order.status,
          createdAt: order.createdAt,
        });
      }
      return NextResponse.json(order);
    }

    // 4. Table orders query (e.g. for customer re-scan state restoration)
    if (table) {
      const isStaff = verifyAuthHeaderOrCookie(request, ['kitchen', 'admin']);
      const tableSession = getTableSessionFromRequest(request, table);

      // If not staff, enforce session filter so user only sees their own session's orders
      const filterSession = !isStaff ? (sessionId || tableSession?.sessionId) : undefined;

      const tableOrders = await getOrders({
        tableNumber: table,
        sessionId: filterSession,
        status: 'active',
      });

      // Mask phone numbers if not staff
      const sanitized = tableOrders.map((o) => ({
        ...o,
        customerPhone: isStaff ? o.customerPhone : maskPhoneNumber(o.customerPhone),
      }));

      return NextResponse.json(sanitized);
    }

    // Default: Return empty if no valid query parameters
    return NextResponse.json([]);
  } catch (error) {
    console.error('API GET /api/orders error:', error);
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      tableNumber,
      tableKey,
      sessionId,
      customerName,
      customerPhone,
      customerFlat,
      customerLat,
      customerLng,
      items,
      subtotal,
      taxAmount,
      total,
      specialInstructions,
    } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Order must contain at least one item' }, { status: 400 });
    }

    const settings = await getCafeSettings();

    // 1. Store Status Check
    if (!settings.isOpen) {
      return NextResponse.json({
        error: settings.closedMessage || 'Store is currently closed for customer orders.',
        code: 'STORE_CLOSED',
      }, { status: 403 });
    }

    // 2. Customer Name & Phone Checks
    if (settings.requireCustomerName !== false && (!customerName || !customerName.trim())) {
      return NextResponse.json({ error: 'Customer Name is required' }, { status: 400 });
    }

    if (settings.requireCustomerPhone !== false) {
      const cleanPhone = (customerPhone || '').replace(/\D/g, '');
      if (cleanPhone.length !== 10) {
        return NextResponse.json({ error: 'A valid 10-digit mobile number is required' }, { status: 400 });
      }
    }

    const targetTable = tableNumber ?? 'Takeaway';
    const isTakeaway = targetTable === 'Takeaway' || targetTable === 0 || targetTable === '0';

    // 2b. Mandatory Flat Number Check for Takeaway & In-Flat Orders
    if (isTakeaway && (!customerFlat || !customerFlat.trim())) {
      return NextResponse.json({
        error: 'Flat Number is required for Takeaway & In-Flat orders (e.g. Tower 2 - 14B)',
        code: 'FLAT_NUMBER_REQUIRED',
      }, { status: 400 });
    }

    // 3. Minimum Order Subtotal Check
    if (settings.minOrderAmount && settings.minOrderAmount > 0 && Number(subtotal) < settings.minOrderAmount) {
      return NextResponse.json({
        error: `Minimum order amount is ₹${settings.minOrderAmount}. Current subtotal is ₹${subtotal}.`,
        code: 'MIN_ORDER_AMOUNT_NOT_MET',
      }, { status: 400 });
    }

    // 4. Maximum Items Limit Check
    const totalItemsCount = items.reduce((sum: number, it: { quantity?: number }) => sum + (Number(it.quantity) || 1), 0);
    if (settings.maxItemsPerOrder && totalItemsCount > settings.maxItemsPerOrder) {
      return NextResponse.json({
        error: `Maximum items per order is ${settings.maxItemsPerOrder}. You have ${totalItemsCount} items.`,
        code: 'MAX_ITEMS_EXCEEDED',
      }, { status: 400 });
    }

    // 5. Table QR Key Verification
    const isStrictQR = settings.tableKeyValidationStrict !== false;

    if (isStrictQR && !isTakeaway) {
      const verification = await validateTable(targetTable, tableKey);
      if (!verification.isVerified) {
        return NextResponse.json({
          error: 'Strict Table QR verification required. Please scan the QR code located on your table.',
          code: 'INVALID_TABLE_KEY',
        }, { status: 403 });
      }
    }

    // 6. Geofencing & Testing Bypass Check (Followed by both Dine-In and Takeaway)
    const allowTakeawaySkip = isTakeaway && (settings.allowTakeawayWithoutGeofence === true);
    const testBypassHeader = request.headers.get('x-geofence-bypass');
    const isBypassValid = Boolean(
      settings.geofenceTestBypassCode &&
      testBypassHeader &&
      testBypassHeader === settings.geofenceTestBypassCode
    );

    let distanceMeters: number | undefined = undefined;
    if (typeof customerLat === 'number' && typeof customerLng === 'number') {
      distanceMeters = calculateDistanceMeters(
        customerLat,
        customerLng,
        settings.cafeLatitude || 22.5448,
        settings.cafeLongitude || 88.4000
      );
    }

    if (settings.geofencingEnabled && !allowTakeawaySkip && !isBypassValid) {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '127.0.0.1';

      if (typeof customerLat !== 'number' || typeof customerLng !== 'number') {
        if (!settings.geofenceDevMode) {
          await addAuditLog({
            actor: 'customer',
            action: 'GEOFENCE_FAILED',
            details: `Order attempt blocked for Table ${targetTable}: Missing GPS coordinates`,
            ipAddress: ip,
          });

          return NextResponse.json({
            error: 'Physical location verification required. Please allow location access to confirm you are at Anassa Cafe & Bakehouse.',
            code: 'GEOFENCE_REQUIRED',
          }, { status: 403 });
        }
      } else {
        const maxRadius = settings.geofenceRadiusMeters || 150;
        if (distanceMeters !== undefined && distanceMeters > maxRadius) {
          if (!settings.geofenceDevMode) {
            await addAuditLog({
              actor: 'customer',
              action: 'GEOFENCE_FAILED',
              details: `Order attempt blocked for Table ${targetTable}: Distance ${distanceMeters}m exceeds limit of ${maxRadius}m`,
              ipAddress: ip,
            });

            return NextResponse.json({
              error: `You must be physically present at Anassa Cafe & Bakehouse to place table orders (Current distance: ${distanceMeters}m).`,
              distanceMeters,
              maxRadius,
              code: 'GEOFENCE_EXCEEDED',
            }, { status: 403 });
          }
        }
      }
    }

    // Generate or preserve session ID
    const effectiveSessionId = sessionId || `sess_${targetTable}_${Date.now()}`;

    const order = await createOrder({
      tableNumber: targetTable,
      tableKey,
      sessionId: effectiveSessionId,
      customerName,
      customerPhone,
      customerFlat,
      customerLat,
      customerLng,
      distanceMeters,
      items,
      subtotal: Number(subtotal) || Number(total),
      taxAmount: Number(taxAmount) || 0,
      total: Number(total),
      specialInstructions: specialInstructions || '',
    });

    return NextResponse.json({
      success: true,
      order,
      sessionId: effectiveSessionId,
      distanceMeters,
    });
  } catch (error) {
    console.error('API POST /api/orders error:', error);
    return NextResponse.json({ error: 'Failed to place order' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  // Guard: Advancing order status requires Kitchen Staff or Admin credentials
  if (!verifyAuthHeaderOrCookie(request, ['kitchen', 'admin'])) {
    return NextResponse.json({ error: 'Unauthorized. Staff access required to update order status.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json({ error: 'Order ID and status are required' }, { status: 400 });
    }

    const validStatuses: OrderStatus[] = ['received', 'preparing', 'ready', 'served', 'cancelled'];
    if (!validStatuses.includes(status as OrderStatus)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const updated = await updateOrderStatus(id, status as OrderStatus);
    if (!updated) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (status === 'cancelled') {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '127.0.0.1';
      await addAuditLog({
        actor: 'kitchen',
        action: 'ORDER_REJECTED',
        details: `Order #${updated.orderNumber} rejected / cancelled by kitchen staff`,
        ipAddress: ip,
      });
    }

    return NextResponse.json({ success: true, order: updated });
  } catch (error) {
    console.error('API PATCH /api/orders error:', error);
    return NextResponse.json({ error: 'Failed to update order status' }, { status: 500 });
  }
}

function maskPhoneNumber(phone: string): string {
  if (!phone || phone.length < 5) return '***';
  return phone.slice(0, 3) + '****' + phone.slice(-2);
}
