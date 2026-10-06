import { NextResponse } from 'next/server';
import { getCategories, getMenuItems, getAddons, getCafeSettings, addMenuItem, updateMenuItem, deleteMenuItem, toggleItemAvailability } from '@/lib/store';
import { verifyAuthHeaderOrCookie } from '@/lib/auth';

export async function GET(request: Request) {
  try {
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
    const { name, category, categoryId, price, desc, subheading, img, isVeg, sizes } = body;

    if (!name || !price || !categoryId) {
      return NextResponse.json({ error: 'Name, Price and Category are required' }, { status: 400 });
    }

    const created = await addMenuItem({
      name,
      category: category || 'Hot Coffee',
      categoryId,
      price: Number(price),
      desc: desc || '',
      subheading: subheading || '',
      img: img || '/images/americano.png',
      isVeg: isVeg ?? true,
      isAvailable: true,
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

    if (typeof isAvailable === 'boolean' && Object.keys(updates).length === 0) {
      const ok = await toggleItemAvailability(id, isAvailable);
      return NextResponse.json({ success: ok, isAvailable });
    }

    const updated = await updateMenuItem(id, updates);
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
    return NextResponse.json({ success: ok });
  } catch (error) {
    console.error('API DELETE /api/menu error:', error);
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 });
  }
}
