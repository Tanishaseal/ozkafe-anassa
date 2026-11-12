import { NextResponse } from 'next/server';
import { 
  getCafeSettings, 
  updateCafeSettings, 
  resetCafeSettings, 
  getOrders, 
  purgeAllOrdersAndLogs, 
  syncMenuToDatabase,
  getInventory, 
  restockInventoryItem, 
  updateInventoryItem, 
  getStaffSchedule, 
  updateStaffStatus,
  createOrder,
  deleteOrder,
  updateOrderDetails
} from '@/lib/store';
import { verifyAuthHeaderOrCookie } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/supabaseServer';

export async function GET(request: Request) {
  // Guard: Admin auth required
  if (!verifyAuthHeaderOrCookie(request, ['admin'])) {
    return NextResponse.json({ error: 'Unauthorized. Admin credentials required.' }, { status: 401 });
  }

  try {
    const [settings, orders, inventory, staff] = await Promise.all([
      getCafeSettings(),
      getOrders({ limit: 500 }),
      getInventory(),
      getStaffSchedule(),
    ]);

    // Compute key analytics
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfToday = today.getTime();

    const todayOrders = orders.filter((o) => o.createdAt >= startOfToday && o.status !== 'cancelled' && !o.isDeleted);
    const todayRevenue = todayOrders.reduce((acc, o) => acc + (Number(o.total) || 0), 0);
    const activeOrders = orders.filter((o) => ['received', 'preparing', 'ready'].includes(o.status) && !o.isDeleted);

    // Item popularity calculation
    const itemSales: Record<string, { name: string; count: number; revenue: number }> = {};
    orders.forEach((o) => {
      if (o.status !== 'cancelled' && !o.isDeleted && Array.isArray(o.items)) {
        o.items.forEach((it) => {
          if (!it || !it.id) return;
          const qty = Number(it.quantity) || 1;
          const price = Number(it.price) || 0;
          if (!itemSales[it.id]) {
            itemSales[it.id] = { name: it.name || it.id, count: 0, revenue: 0 };
          }
          itemSales[it.id].count += qty;
          itemSales[it.id].revenue += price * qty;
        });
      }
    });

    const popularItems = Object.values(itemSales)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Unique customer count
    const customerPhones = new Set<string>();
    todayOrders.forEach(o => {
      if (o.customerPhone) customerPhones.add(o.customerPhone);
    });

    return NextResponse.json({
      success: true,
      stats: {
        todayRevenue,
        todayOrderCount: todayOrders.length,
        totalOrders: orders.length,
        activeOrderCount: activeOrders.length,
        todayCustomersCount: customerPhones.size,
        popularItems,
      },
      inventory,
      staff,
      database: {
        isConfigured: isSupabaseConfigured,
        provider: isSupabaseConfigured ? 'supabase' : 'fallback-memory',
      },
      settings,
    });
  } catch (error) {
    console.error('API GET /api/admin error:', error);
    return NextResponse.json({ error: 'Failed to fetch admin stats' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  // Guard: Admin auth required
  if (!verifyAuthHeaderOrCookie(request, ['admin'])) {
    return NextResponse.json({ error: 'Unauthorized. Admin credentials required.' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const body = await request.json().catch(() => ({}));

    // Action 1: Purge all orders and logs for live launch
    if (action === 'purge_database' || body.action === 'purge_database') {
      const result = await purgeAllOrdersAndLogs();
      return NextResponse.json({
        success: true,
        message: 'Database orders, sales ledger, and audit logs wiped cleanly for live launch.',
        cleared: result,
      });
    }

    // Action 1b: Synchronize 76 PDF menu items to database
    if (action === 'sync_menu' || body.action === 'sync_menu') {
      const result = await syncMenuToDatabase();
      return NextResponse.json({
        success: true,
        message: 'All 76 PDF menu dishes and categories synchronized with database.',
        synced: result,
      });
    }

    // Action 2: Restock inventory item
    if (action === 'restock_inventory' || body.action === 'restock_inventory') {
      const { id, amount } = body;
      if (!id || typeof amount !== 'number') {
        return NextResponse.json({ error: 'Invalid restock parameters' }, { status: 400 });
      }
      const updated = await restockInventoryItem(id, amount);
      return NextResponse.json({ success: true, item: updated });
    }

    // Action 3: Update inventory item details
    if (action === 'update_inventory' || body.action === 'update_inventory') {
      const { id, updates } = body;
      if (!id || !updates || typeof updates !== 'object') {
        return NextResponse.json({ error: 'Invalid inventory update parameters' }, { status: 400 });
      }
      const updated = await updateInventoryItem(id, updates);
      return NextResponse.json({ success: true, item: updated });
    }

    // Action 4: Update staff shift status
    if (action === 'update_staff' || body.action === 'update_staff') {
      const { id, status } = body;
      if (!id || !['on_duty', 'break', 'off_duty'].includes(status)) {
        return NextResponse.json({ error: 'Invalid staff update parameters' }, { status: 400 });
      }
      const updated = await updateStaffStatus(id, status);
      return NextResponse.json({ success: true, staff: updated });
    }

    // Action 5: Create a manual in-person counter order from Admin
    if (action === 'manual_order' || body.action === 'manual_order') {
      const { tableNumber, customerName, customerPhone, customerFlat, items, subtotal, taxAmount, total, specialInstructions, createdAt, status, isPaid, settledBy } = body;
      const order = await createOrder({
        tableNumber: tableNumber || 'Takeaway',
        customerName: customerName || 'Counter Walk-in',
        customerPhone: customerPhone || '9830000000',
        customerFlat: customerFlat || undefined,
        items: items || [],
        subtotal: Number(subtotal) || 0,
        taxAmount: Number(taxAmount) || 0,
        total: Number(total) || 0,
        specialInstructions: specialInstructions || 'Admin custom / counter order',
        createdAt: createdAt ? Number(createdAt) : undefined,
        status: status || 'served',
        isPaid: Boolean(isPaid),
        settledBy: isPaid ? (settledBy || 'Admin') : undefined,
      });
      return NextResponse.json({ success: true, order });
    }

    // Action 6: Delete specific order
    if (action === 'delete_order' || body.action === 'delete_order') {
      const orderId = body.orderId || searchParams.get('id');
      const permanent = body.permanent === true || searchParams.get('permanent') === 'true';
      if (!orderId) {
        return NextResponse.json({ error: 'Order ID is required to delete' }, { status: 400 });
      }
      const success = await deleteOrder(orderId, 'admin', permanent);
      return NextResponse.json({ success, message: permanent ? 'Order permanently purged' : 'Order successfully deleted by admin' });
    }

    // Action 7: Edit order receipt
    if (action === 'edit_order' || body.action === 'edit_order' || action === 'update_order') {
      const { orderId, updates } = body;
      if (!orderId || !updates) {
        return NextResponse.json({ error: 'Order ID and updates are required' }, { status: 400 });
      }
      const updated = await updateOrderDetails(orderId, updates);
      return NextResponse.json({ success: true, order: updated });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error('API POST /api/admin error:', error);
    return NextResponse.json({ error: 'Failed to process admin action' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  // Guard: Admin auth required
  if (!verifyAuthHeaderOrCookie(request, ['admin'])) {
    return NextResponse.json({ error: 'Unauthorized. Admin credentials required.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid settings body' }, { status: 400 });
    }
    if (body.adminPin !== undefined && !String(body.adminPin).trim()) {
      return NextResponse.json({ error: 'Master Admin PIN cannot be empty' }, { status: 400 });
    }
    if (body.gstPercent !== undefined) {
      const gst = Number(body.gstPercent);
      if (isNaN(gst) || gst < 0 || gst > 100) {
        return NextResponse.json({ error: 'GST percent must be between 0 and 100' }, { status: 400 });
      }
      body.gstPercent = gst;
    }
    if (body.geofenceRadiusMeters !== undefined) {
      const rad = Number(body.geofenceRadiusMeters);
      if (isNaN(rad) || rad < 10 || rad > 10000) {
        return NextResponse.json({ error: 'Geofence radius must be between 10 and 10000 meters' }, { status: 400 });
      }
      body.geofenceRadiusMeters = rad;
    }
    const updated = await updateCafeSettings(body);
    return NextResponse.json({ success: true, settings: updated });
  } catch (error) {
    console.error('API PATCH /api/admin error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  // Guard: Admin auth required
  if (!verifyAuthHeaderOrCookie(request, ['admin'])) {
    return NextResponse.json({ error: 'Unauthorized. Admin credentials required.' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const orderId = searchParams.get('orderId') || searchParams.get('id');

    if (action === 'delete_order' || (action !== 'purge_database' && orderId)) {
      if (orderId) {
        const permanent = searchParams.get('permanent') === 'true';
        const success = await deleteOrder(orderId, 'admin', permanent);
        return NextResponse.json({ success, message: permanent ? 'Order permanently purged' : 'Order deleted by admin' });
      }
    }

    if (action === 'purge_database') {
      const result = await purgeAllOrdersAndLogs();
      return NextResponse.json({ 
        success: true, 
        message: 'Database orders, sales ledger, and audit logs wiped cleanly for live launch.',
        cleared: result,
      });
    }

    const reset = await resetCafeSettings();
    return NextResponse.json({ success: true, settings: reset, message: 'Settings reset to defaults' });
  } catch (error) {
    console.error('API DELETE /api/admin error:', error);
    return NextResponse.json({ error: 'Failed to reset settings' }, { status: 500 });
  }
}
