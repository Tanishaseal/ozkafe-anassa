import { NextResponse } from 'next/server';
import { getCafeSettings, updateCafeSettings, resetCafeSettings, getOrders } from '@/lib/store';
import { verifyAuthHeaderOrCookie } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/supabaseServer';

export async function GET(request: Request) {
  // Guard: Admin auth required
  if (!verifyAuthHeaderOrCookie(request, ['admin'])) {
    return NextResponse.json({ error: 'Unauthorized. Admin credentials required.' }, { status: 401 });
  }

  try {
    const [settings, orders] = await Promise.all([
      getCafeSettings(),
      getOrders({ limit: 500 }),
    ]);

    // Compute key analytics
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfToday = today.getTime();

    const todayOrders = orders.filter((o) => o.createdAt >= startOfToday && o.status !== 'cancelled');
    const todayRevenue = todayOrders.reduce((acc, o) => acc + (Number(o.total) || 0), 0);
    const activeOrders = orders.filter((o) => ['received', 'preparing', 'ready'].includes(o.status));

    // Item popularity calculation
    const itemSales: Record<string, { name: string; count: number; revenue: number }> = {};
    orders.forEach((o) => {
      if (o.status !== 'cancelled') {
        o.items.forEach((it) => {
          if (!itemSales[it.id]) {
            itemSales[it.id] = { name: it.name, count: 0, revenue: 0 };
          }
          itemSales[it.id].count += it.quantity;
          itemSales[it.id].revenue += it.price * it.quantity;
        });
      }
    });

    const popularItems = Object.values(itemSales)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return NextResponse.json({
      success: true,
      stats: {
        todayRevenue,
        todayOrderCount: todayOrders.length,
        totalOrders: orders.length,
        activeOrderCount: activeOrders.length,
        popularItems,
      },
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

export async function PATCH(request: Request) {
  // Guard: Admin auth required
  if (!verifyAuthHeaderOrCookie(request, ['admin'])) {
    return NextResponse.json({ error: 'Unauthorized. Admin credentials required.' }, { status: 401 });
  }

  try {
    const body = await request.json();
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
    const reset = await resetCafeSettings();
    return NextResponse.json({ success: true, settings: reset, message: 'Settings reset to defaults' });
  } catch (error) {
    console.error('API DELETE /api/admin error:', error);
    return NextResponse.json({ error: 'Failed to reset settings' }, { status: 500 });
  }
}
