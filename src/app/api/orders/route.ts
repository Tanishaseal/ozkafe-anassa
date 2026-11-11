import { NextResponse } from 'next/server';
import { createOrder, getOrders, getOrderById, updateOrderStatus, updateOrderDetails, deleteOrder, validateTable, getCafeSettings, calculateDistanceMeters, addAuditLog, getMenuItems, getAddons } from '@/lib/store';
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
    const history = searchParams.get('history');

    // 1. Admin order ledger query: MUST have admin auth
    if (all === 'true') {
      if (!verifyAuthHeaderOrCookie(request, ['admin'])) {
        return NextResponse.json({ error: 'Unauthorized. Admin credentials required.' }, { status: 401 });
      }
      const orders = await getOrders({ limit: 500 });
      return NextResponse.json(orders);
    }

    // 2. Kitchen Order History query (Strictly 15 days prior; rest kept hidden)
    if (history === 'true') {
      if (!verifyAuthHeaderOrCookie(request, ['kitchen', 'admin'])) {
        return NextResponse.json({ error: 'Unauthorized. Kitchen or Admin staff access required.' }, { status: 401 });
      }
      const fifteenDaysAgo = Date.now() - (15 * 24 * 60 * 60 * 1000);
      const allOrders = await getOrders({ limit: 1000 });
      // Filter orders from the past 15 days or custom recorded bills so kitchen staff can review past bills
      const historyOrders = allOrders.filter(
        (o) =>
          o.createdAt >= fifteenDaysAgo ||
          o.specialInstructions?.toLowerCase().includes('custom') ||
          o.specialInstructions?.toLowerCase().includes('manual')
      );
      return NextResponse.json(historyOrders);
    }

    // 3. Kitchen Display query (Active orders): MUST have kitchen or admin auth
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
      const knownIds = searchParams.get('knownIds')?.split(',').map((s) => s.trim()).filter(Boolean);
      const phone = searchParams.get('phone')?.trim();

      // If not staff, enforce session filter or knownIds or phone so user only sees their own session's orders
      const filterSession = !isStaff ? (sessionId || tableSession?.sessionId) : undefined;

      // Prevent data leakage: unauthenticated guest without a session, knownIds, or phone cannot see table orders
      if (!isStaff && !filterSession && (!knownIds || knownIds.length === 0) && !phone) {
        return NextResponse.json([]);
      }

      const tableOrders = await getOrders({
        tableNumber: table,
        sessionId: filterSession,
        knownIds: !isStaff ? knownIds : undefined,
        phone: !isStaff && phone ? phone : undefined,
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

    // ── KITCHEN / STAFF / ADMIN CUSTOM BILL (PREVIOUS ORDERS) ──
    if (body.action === 'kitchen_custom_order' || body.action === 'manual_order') {
      if (!verifyAuthHeaderOrCookie(request, ['kitchen', 'admin'])) {
        return NextResponse.json({ error: 'Unauthorized. Kitchen or Admin credentials required.' }, { status: 401 });
      }

      const {
        tableNumber,
        customerName,
        customerPhone,
        customerFlat,
        items,
        subtotal,
        taxAmount,
        total,
        specialInstructions,
        createdAt,
        status,
        isPaid,
        staffName,
      } = body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ error: 'Order must contain at least one dish / item' }, { status: 400 });
      }

      if (customerFlat && customerFlat.trim()) {
        const trimmedFlat = customerFlat.trim();
        const hasDigits = /\d/.test(trimmedFlat);
        const hasLetters = /[a-zA-Z]/.test(trimmedFlat);
        if (!hasDigits || !hasLetters) {
          return NextResponse.json({
            error: 'Invalid Flat Number: Flat number must contain both digits and letters (e.g. 14B or Tower 2 - 14B)',
            code: 'INVALID_FLAT_NUMBER',
          }, { status: 400 });
        }
      }

      const customCreatedAt = createdAt ? Number(createdAt) : Date.now();
      const order = await createOrder({
        tableNumber: tableNumber || 'Takeaway',
        customerName: customerName ? customerName.trim() : 'Counter Guest',
        customerPhone: customerPhone ? customerPhone.trim() : '9830000000',
        customerFlat: customerFlat ? customerFlat.trim() : undefined,
        items: items.map((it: any) => ({
          id: it.id,
          name: it.name,
          price: Number(it.price) || 0,
          quantity: Math.max(1, Number(it.quantity) || 1),
          selectedSize: it.selectedSize || 'Regular',
          category: it.category || 'General',
          isAddon: Boolean(it.isAddon),
        })),
        subtotal: Number(subtotal) || 0,
        taxAmount: Number(taxAmount) || 0,
        total: Number(total) || 0,
        specialInstructions: specialInstructions?.trim() || `Custom bill recorded from Kitchen by ${staffName || 'Staff'}`,
        createdAt: customCreatedAt,
        status: status || 'served',
        isPaid: Boolean(isPaid),
        settledBy: isPaid ? (staffName || 'Kitchen Staff') : undefined,
      });

      return NextResponse.json({ success: true, order });
    }

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

    // 2b. Mandatory & Strict Flat Number Validation (must contain both digits and letters, e.g. 14B)
    if (isTakeaway && (!customerFlat || !customerFlat.trim())) {
      return NextResponse.json({
        error: 'Flat Number is required for Takeaway & In-Flat orders (e.g. 14B or Tower 2 - 14B)',
        code: 'FLAT_NUMBER_REQUIRED',
      }, { status: 400 });
    }

    if (customerFlat && customerFlat.trim()) {
      const trimmedFlat = customerFlat.trim();
      const hasDigits = /\d/.test(trimmedFlat);
      const hasLetters = /[a-zA-Z]/.test(trimmedFlat);
      if (!hasDigits || !hasLetters) {
        return NextResponse.json({
          error: 'Invalid Flat Number: Flat number must contain both digits and letters (e.g. 14B or Tower 2 - 14B)',
          code: 'INVALID_FLAT_NUMBER',
        }, { status: 400 });
      }
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

    // ── IDEMPOTENCY & DUPLICATE ORDER SHIELD ──
    const idempotencyKey = body.idempotencyKey ? String(body.idempotencyKey).trim() : undefined;

    // Check for identical recent order placed within the last 60 seconds
    // to prevent duplicate orders from network retries, double-clicks, or "failed to fetch" re-submissions
    const recentCandidateOrders = await getOrders({
      tableNumber: targetTable,
      phone: cleanPhone,
      limit: 10,
    });

    const now = Date.now();
    const existingDuplicate = recentCandidateOrders.find((cand) => {
      // Must be recent (placed within last 60 seconds)
      if (now - cand.createdAt > 60_000) return false;
      // Must not be cancelled
      if (cand.status === 'cancelled') return false;
      // If idempotency key matches, instant match
      if (idempotencyKey && cand.idempotencyKey && cand.idempotencyKey === idempotencyKey) return true;
      // Same customer phone (last 10 digits)
      const candPhone = (cand.customerPhone || '').replace(/\D/g, '').slice(-10);
      if (candPhone && cleanPhone && candPhone !== cleanPhone.slice(-10)) return false;
      // Same total (within 0.10 rupees)
      if (Math.abs(cand.total - serverTotal) > 0.10) return false;
      // Same item count
      if (cand.items.length !== validatedItems.length) return false;
      // Same item IDs and quantities
      const candItemMap = new Map(cand.items.map((i) => [i.id, i.quantity]));
      const allItemsMatch = validatedItems.every((it) => candItemMap.get(it.id) === it.quantity);
      return allItemsMatch;
    });

    if (existingDuplicate) {
      console.log(`[POST /api/orders] Duplicate order suppressed: Order #${existingDuplicate.orderNumber} already exists for phone ${cleanPhone}`);
      return NextResponse.json({
        success: true,
        order: existingDuplicate,
        sessionId: existingDuplicate.sessionId || effectiveSessionId,
        distanceMeters,
        isDuplicateSuppressed: true,
      });
    }

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
      idempotencyKey,
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
  // Guard: Advancing order status, settling bill, or editing receipts requires Kitchen Staff or Admin credentials
  if (!verifyAuthHeaderOrCookie(request, ['kitchen', 'admin'])) {
    return NextResponse.json({ error: 'Unauthorized. Staff access required.' }, { status: 401 });
  }

  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '127.0.0.1';
    const userAgent = (request.headers.get('user-agent') || 'Unknown').slice(0, 100);
    const body = await request.json();
    const { id, status, action, updates, staffName } = body;

    if (!id) {
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
    }

    // ── 1. BILL SETTLEMENT (CUSTOMER PAID) ──
    if (action === 'settle_bill') {
      const order = await getOrderById(id);
      if (!order) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }

      const updated = await updateOrderDetails(
        id,
        {
          isPaid: true,
          paidAt: Date.now(),
          settledBy: staffName || 'Kitchen Staff',
        },
        'kitchen',
        staffName || 'Kitchen Staff'
      );

      return NextResponse.json({
        success: true,
        order: updated,
        message: `Order #${order.orderNumber} successfully marked as PAID & SETTLED`,
      });
    }

    // ── 2. RECEIPT EDITING BY KITCHEN / STAFF ──
    if (action === 'edit_receipt') {
      const order = await getOrderById(id);
      if (!order) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }
      if (!updates || typeof updates !== 'object') {
        return NextResponse.json({ error: 'Valid updates object is required' }, { status: 400 });
      }

      const updated = await updateOrderDetails(
        id,
        updates,
        'kitchen',
        staffName || 'Kitchen Staff'
      );

      return NextResponse.json({
        success: true,
        order: updated,
        message: `Receipt #${order.orderNumber} updated successfully by Kitchen`,
      });
    }

    // ── 3. ADVANCE ORDER STATUS ──
    if (status) {
      const validStatuses: OrderStatus[] = ['received', 'preparing', 'ready', 'served', 'cancelled'];
      if (!validStatuses.includes(status as OrderStatus)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }

      const updated = await updateOrderStatus(id, status as OrderStatus);
      if (!updated) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }

      await addAuditLog({
        actor: 'kitchen',
        action: 'ORDER_STATUS_CHANGED',
        details: `Order #${updated.orderNumber} moved to "${status.toUpperCase()}" by Kitchen Staff (${staffName || 'Staff'})`,
        ipAddress: ip,
        userAgent,
      });

      return NextResponse.json({ success: true, order: updated });
    }

    return NextResponse.json({ error: 'No valid action or status specified' }, { status: 400 });
  } catch (error) {
    console.error('API PATCH /api/orders error:', error);
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  // Guard: Only admin can delete orders
  if (!verifyAuthHeaderOrCookie(request, ['admin'])) {
    return NextResponse.json({ error: 'Unauthorized. Admin credentials required to delete orders.' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
    }

    const success = await deleteOrder(id);
    return NextResponse.json({ success, message: 'Order deleted successfully' });
  } catch (error) {
    console.error('API DELETE /api/orders error:', error);
    return NextResponse.json({ error: 'Failed to delete order' }, { status: 500 });
  }
}

function maskPhoneNumber(phone: string): string {
  if (!phone || phone.length < 5) return '***';
  return phone.slice(0, 3) + '****' + phone.slice(-2);
}
