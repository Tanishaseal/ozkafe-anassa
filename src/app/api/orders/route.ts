import { NextResponse } from 'next/server';
import { createOrder, getOrders, getOrderById, updateOrderStatus, validateTable, getCafeSettings, calculateDistanceMeters, addAuditLog, getMenuItems, getAddons } from '@/lib/store';
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

      // Prevent data leakage: unauthenticated guest without a session cannot see any table orders
      if (!isStaff && !filterSession) {
        return NextResponse.json([]);
      }

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

    let cleanPhone = (customerPhone || '').replace(/\D/g, '');
    if (cleanPhone.length === 12 && cleanPhone.startsWith('91')) {
      cleanPhone = cleanPhone.slice(2);
    }
    if (cleanPhone.length === 11 && cleanPhone.startsWith('0')) {
      cleanPhone = cleanPhone.slice(1);
    }

    if (settings.requireCustomerPhone !== false) {
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

    // 3. Server-side Menu Validation & Anti-Tampering Price Calculation
    const [menuItems, availableAddons] = await Promise.all([
      getMenuItems(),
      getAddons(),
    ]);

    const validatedItems: { id: string; name: string; price: number; quantity: number; selectedSize?: string; category?: string; isAddon?: boolean }[] = [];
    let serverSubtotal = 0;

    for (const it of items) {
      if (!it || typeof it !== 'object' || !it.id) {
        return NextResponse.json({ error: 'Invalid item data in order' }, { status: 400 });
      }
      const rawQty = Number(it.quantity);
      if (!Number.isInteger(rawQty) || rawQty < 1 || rawQty > 50) {
        return NextResponse.json({ error: `Invalid quantity for item "${it.name || it.id}"` }, { status: 400 });
      }

      const regularItem = menuItems.find((m) => m.id === it.id);
      const addonItem = !regularItem ? availableAddons.find((a) => a.id === it.id || `addon_${a.id}` === it.id) : null;

      if (!regularItem && !addonItem) {
        return NextResponse.json({ error: `Dish "${it.name || it.id}" is not on our current menu` }, { status: 400 });
      }

      if (regularItem) {
        if (!regularItem.isAvailable || (typeof regularItem.stock === 'number' && regularItem.stock <= 0)) {
          return NextResponse.json({
            error: `"${regularItem.name}" is currently sold out and cannot be ordered.`,
            code: 'ITEM_SOLD_OUT',
          }, { status: 400 });
        }
        if (typeof regularItem.stock === 'number' && regularItem.stock < rawQty) {
          return NextResponse.json({
            error: `Only ${regularItem.stock} portion(s) left of "${regularItem.name}". Please reduce quantity.`,
            code: 'INSUFFICIENT_STOCK',
          }, { status: 400 });
        }
        const unitPrice = Number(regularItem.price);
        serverSubtotal += unitPrice * rawQty;
        validatedItems.push({
          id: regularItem.id,
          name: regularItem.name,
          price: unitPrice,
          quantity: rawQty,
          selectedSize: it.selectedSize || 'Regular',
          category: regularItem.category,
          isAddon: false,
        });
      } else if (addonItem) {
        const unitPrice = Number(addonItem.price);
        serverSubtotal += unitPrice * rawQty;
        validatedItems.push({
          id: addonItem.id,
          name: addonItem.name,
          price: unitPrice,
          quantity: rawQty,
          category: 'Add-on',
          isAddon: true,
        });
      }
    }

    const gstRate = (settings.gstPercent ?? 5) / 100;
    const serverTax = Number((serverSubtotal * gstRate).toFixed(2));
    const serverTotal = Number((serverSubtotal + serverTax).toFixed(2));

    // 4. Minimum Order Subtotal Check
    if (settings.minOrderAmount && settings.minOrderAmount > 0 && serverSubtotal < settings.minOrderAmount) {
      return NextResponse.json({
        error: `Minimum order amount is ₹${settings.minOrderAmount}. Current subtotal is ₹${serverSubtotal}.`,
        code: 'MIN_ORDER_AMOUNT_NOT_MET',
      }, { status: 400 });
    }

    // 5. Maximum Items Limit Check
    const totalItemsCount = validatedItems.reduce((sum, it) => sum + it.quantity, 0);
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

    // Spam prevention cooldown check
    const cooldownSec = settings.orderCooldownSeconds ?? 10;
    if (cooldownSec > 0) {
      const recentOrders = await getOrders({ sessionId: effectiveSessionId, limit: 1 });
      if (recentOrders.length > 0) {
        const elapsedSec = (Date.now() - recentOrders[0].createdAt) / 1000;
        if (elapsedSec < cooldownSec) {
          const waitTime = Math.ceil(cooldownSec - elapsedSec);
          return NextResponse.json({
            error: `Please wait ${waitTime} second${waitTime > 1 ? 's' : ''} before placing another order.`,
            code: 'ORDER_COOLDOWN',
          }, { status: 429 });
        }
      }
    }

    const order = await createOrder({
      tableNumber: targetTable,
      tableKey,
      sessionId: effectiveSessionId,
      customerName,
      customerPhone: cleanPhone,
      customerFlat,
      customerLat,
      customerLng,
      distanceMeters,
      items: validatedItems,
      subtotal: serverSubtotal,
      taxAmount: serverTax,
      total: serverTotal,
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
