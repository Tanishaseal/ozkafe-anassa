import { NextResponse } from 'next/server';
import { getCategories, getMenuItems, getAddons, getCafeSettings, addMenuItem, updateMenuItem, deleteMenuItem, toggleItemAvailability } from '@/lib/store';
import { verifyAuthHeaderOrCookie } from '@/lib/auth';
import { checkRateLimit, getClientIdentifier, rateLimitProfiles } from '@/lib/rateLimit';

export async function GET(request: Request) {
  try {
    const clientKey = getClientIdentifier(request, 'menu_get');
    const rate = checkRateLimit(clientKey, rateLimitProfiles.menuPolling.maxRequests, rateLimitProfiles.menuPolling.windowMs);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many menu requests. Please wait a moment.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rate.resetInMs / 1000)) } }
      );
    }

    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('category') || undefined;

    const [categories, items, addons, settings] = await Promise.all([
      getCategories(),
      getMenuItems(categoryId),
      getAddons(),
      getCafeSettings(),
    ]);

    return NextResponse.json({
      success: true,
      categories,
      items,
      addons,
      settings: {
        cafeName: settings.cafeName,
        tagline: settings.tagline,
        address: settings.address,
        gstPercent: settings.gstPercent,
        currencySymbol: settings.currencySymbol,
        isOpen: settings.isOpen,
        // Sensitive adminPin is intentionally NOT exposed to public
      },
    });
  } catch (error) {
    console.error('API /api/menu error:', error);
    return NextResponse.json({ error: 'Failed to load menu data' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  // Guard: Admin auth required
  if (!verifyAuthHeaderOrCookie(request, ['admin'])) {
    return NextResponse.json({ error: 'Unauthorized. Admin credentials required.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, category, categoryId, price, desc, subheading, img, isVeg, sizes, stock } = body;

    const numPrice = Number(price);
    if (!name || !String(name).trim() || !categoryId || isNaN(numPrice) || numPrice < 0) {
      return NextResponse.json({ error: 'Valid Name, non-negative Price and Category are required' }, { status: 400 });
    }

    const stockVal = stock !== undefined && !isNaN(Number(stock))
      ? Math.max(0, Math.floor(Number(stock)))
      : 10;

    const created = await addMenuItem({
      name: String(name).trim(),
      category: category || 'Hot Coffee',
      categoryId,
      price: numPrice,
      desc: desc || '',
      subheading: subheading || '',
      img: img || '/images/americano.png',
      isVeg: isVeg ?? true,
      isAvailable: stockVal > 0,
      stock: stockVal,
      sizes: Array.isArray(sizes) && sizes.length > 0 ? sizes : ['Regular'],
    });

    return NextResponse.json({ success: true, item: created });
  } catch (error) {
    console.error('API POST /api/menu error:', error);
    return NextResponse.json({ error: 'Failed to add item' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  // Guard: Admin auth required
  if (!verifyAuthHeaderOrCookie(request, ['admin'])) {
    return NextResponse.json({ error: 'Unauthorized. Admin credentials required.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, isAvailable, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Item ID is required' }, { status: 400 });
    }

    if (updates.price !== undefined) {
      const p = Number(updates.price);
      if (isNaN(p) || p < 0) {
        return NextResponse.json({ error: 'Price must be a valid non-negative number' }, { status: 400 });
      }
      updates.price = p;
    }

    if (updates.stock !== undefined) {
      const s = Number(updates.stock);
      if (isNaN(s) || s < 0) {
        return NextResponse.json({ error: 'Stock must be a valid non-negative number' }, { status: 400 });
      }
      updates.stock = Math.max(0, Math.floor(s));
    }

    if (typeof isAvailable === 'boolean') {
      updates.isAvailable = isAvailable;
    }

    if (typeof isAvailable === 'boolean' && Object.keys(updates).length === 1) {
      const ok = await toggleItemAvailability(id, isAvailable);
      return NextResponse.json({ success: ok, isAvailable });
    }

    const updated = await updateMenuItem(id, updates);
    if (!updated) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, item: updated });
  } catch (error) {
    console.error('API PATCH /api/menu error:', error);
    return NextResponse.json({ error: 'Failed to update item' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  // Guard: Admin auth required
  if (!verifyAuthHeaderOrCookie(request, ['admin'])) {
    return NextResponse.json({ error: 'Unauthorized. Admin credentials required.' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Item ID is required' }, { status: 400 });
    }

    const ok = await deleteMenuItem(id);
    if (!ok) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: 'Item deleted' });
  } catch (error) {
    console.error('API DELETE /api/menu error:', error);
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 });
  }
}
