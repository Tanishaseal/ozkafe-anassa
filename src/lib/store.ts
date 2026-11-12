import { Category, MenuAddon, MenuItem, Order, OrderStatus, TableSession, CafeSettings, AuditLog, AuditAction, InventoryItem, StaffShift } from './types';
import { initialCategories, initialMenuItems, initialAddons, initialSettings, initialInventory, initialStaff } from './initialData';
import { supabaseServer, isSupabaseConfigured } from './supabaseServer';
import { fetchWithCache, invalidateCache } from './cache';
import fs from 'fs';
import path from 'path';

// Local storage backup file path (persists in-memory state across restarts/workers)
const STORE_BACKUP_FILE = path.join(process.cwd(), '.anassa_store.json');

// In-memory persistent caches for ultra-fast response and zero-config local testing
const globalStore = globalThis as unknown as {
  __anassa_categories?: Category[];
  __anassa_items?: MenuItem[];
  __anassa_addons?: MenuAddon[];
  __anassa_orders?: Order[];
  __anassa_tables?: TableSession[];
  __anassa_settings?: CafeSettings;
  __anassa_audit_logs?: AuditLog[];
  __anassa_inventory?: InventoryItem[];
  __anassa_staff?: StaffShift[];
  __anassa_subscribers?: Set<(order: Order) => void>;
};

if (!globalStore.__anassa_categories) {
  globalStore.__anassa_categories = [...initialCategories];
}
if (!globalStore.__anassa_items) {
  globalStore.__anassa_items = [...initialMenuItems];
}
if (!globalStore.__anassa_addons || globalStore.__anassa_addons.length > 3) {
  globalStore.__anassa_addons = [...initialAddons];
}
if (!globalStore.__anassa_orders) {
  globalStore.__anassa_orders = [];
}
if (!globalStore.__anassa_audit_logs) {
  globalStore.__anassa_audit_logs = [];
}
if (!globalStore.__anassa_inventory) {
  globalStore.__anassa_inventory = [...initialInventory];
}
if (!globalStore.__anassa_staff) {
  globalStore.__anassa_staff = [...initialStaff];
}
if (!globalStore.__anassa_settings) {
  globalStore.__anassa_settings = { ...initialSettings };
}
if (!globalStore.__anassa_subscribers) {
  globalStore.__anassa_subscribers = new Set();
}
if (!globalStore.__anassa_tables) {
  // Pre-seed default tables: Table 0 (Static Takeaway & In-Flat Delivery) + Table 1 (Table 1 Dine-In)
  const defaultTables: TableSession[] = [
    { tableNumber: 0, label: 'Takeaway & In-Flat Delivery', secretKey: 'takeaway-permanent-key-anassa', isActive: true },
    { tableNumber: 1, label: 'Table 1', secretKey: 'oz-anassa-tbl-1-master', isActive: true },
  ];
  globalStore.__anassa_tables = defaultTables;
}

// Persist and load store to/from disk so orders NEVER vanish across restarts or worker reloads
export function saveStoreToDisk() {
  try {
    const payload = {
      orders: globalStore.__anassa_orders || [],
      auditLogs: globalStore.__anassa_audit_logs || [],
      updatedAt: Date.now(),
    };
    fs.writeFileSync(STORE_BACKUP_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  } catch {
    // Non-fatal if environment is read-only
  }
}

export function loadStoreFromDisk() {
  try {
    if (fs.existsSync(STORE_BACKUP_FILE)) {
      const raw = fs.readFileSync(STORE_BACKUP_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.orders) && data.orders.length > 0) {
        if (!globalStore.__anassa_orders || globalStore.__anassa_orders.length === 0) {
          globalStore.__anassa_orders = data.orders;
        } else {
          const map = new Map(globalStore.__anassa_orders.map((o) => [o.id, o]));
          for (const ord of data.orders) {
            if (!map.has(ord.id)) {
              globalStore.__anassa_orders.push(ord);
            }
          }
        }
      }
      if (data && Array.isArray(data.auditLogs) && (!globalStore.__anassa_audit_logs || globalStore.__anassa_audit_logs.length === 0)) {
        globalStore.__anassa_audit_logs = data.auditLogs;
      }
    }
  } catch {
    // Non-fatal
  }
}

// Initial hydration from disk
loadStoreFromDisk();

/**
 * Universal table comparator that equates 'Takeaway', '0', and 0
 */
export function isSameTable(a: string | number | undefined | null, b: string | number | undefined | null): boolean {
  if (a === undefined || a === null || b === undefined || b === null) return false;
  const strA = String(a).toLowerCase().trim();
  const strB = String(b).toLowerCase().trim();
  if (strA === strB) return true;
  const isTakeawayA = strA === '0' || strA === 'takeaway' || strA.includes('takeaway');
  const isTakeawayB = strB === '0' || strB === 'takeaway' || strB.includes('takeaway');
  return isTakeawayA && isTakeawayB;
}

// Event listener for Server-Sent Events (SSE)
export function subscribeToOrders(listener: (order: Order) => void): () => void {
  globalStore.__anassa_subscribers?.add(listener);
  return () => {
    globalStore.__anassa_subscribers?.delete(listener);
  };
}

export function broadcastOrder(order: Order) {
  globalStore.__anassa_subscribers?.forEach((cb) => {
    try {
      cb(order);
    } catch {
      // ignore closed connections
    }
  });
}

// ──────────────────────────────────────────
// CATEGORIES
// ──────────────────────────────────────────
export async function getCategories(): Promise<Category[]> {
  return fetchWithCache('categories_all', async () => {
    if (isSupabaseConfigured && supabaseServer) {
      try {
        const { data, error } = await supabaseServer
          .from('categories')
          .select('*')
          .order('sort_order', { ascending: true });
        if (!error && data && data.length >= initialCategories.length) {
          // Count items per category
          const items = await getMenuItems();
          const counts: Record<string, number> = {};
          items.forEach((it) => {
            counts[it.categoryId] = (counts[it.categoryId] || 0) + 1;
          });

          return data.map((c) => ({
            id: c.id,
            title: c.title,
            subtitle: c.subtitle,
            emoji: c.emoji,
            heroLabel: c.hero_label || '',
            iconSvg: c.icon_svg,
            sortOrder: c.sort_order,
            itemsCount: counts[c.id] || 0,
          }));
        } else {
          // Auto-sync categories if Supabase table has fewer categories
          syncMenuToDatabase().catch((e) => console.warn('Auto-sync categories error:', e));
        }
      } catch (err) {
        console.warn('Supabase getCategories error, falling back to memory store:', err);
      }
    }

    // Count items per category
    const items = await getMenuItems();
    const counts: Record<string, number> = {};
    items.forEach((it) => {
      counts[it.categoryId] = (counts[it.categoryId] || 0) + 1;
    });

    return (globalStore.__anassa_categories || initialCategories).map((cat) => ({
      ...cat,
      itemsCount: counts[cat.id] || 0,
    }));
  }, 30, ['categories', 'menu']);
}

const categoryOrderMap: Record<string, number> = {
  'hot-coffee': 1,
  'iced-caffeine': 2,
  'cold-brew': 3,
  'premium-tea': 4,
  'shakes-spritzers': 5,
  'sandwiches-appetizers': 6,
  'combo-meals': 7,
  'bakery-desserts': 8,
};

// ──────────────────────────────────────────
// STOCK TRACKING PERSISTENCE
// ──────────────────────────────────────────
const globalStockStore = globalThis as unknown as {
  __anassa_stock_map?: Record<string, number>;
};

if (!globalStockStore.__anassa_stock_map) {
  globalStockStore.__anassa_stock_map = {};
}

export async function getStockMap(): Promise<Record<string, number>> {
  return fetchWithCache('stock_map', async () => {
    if (isSupabaseConfigured && supabaseServer) {
      try {
        const { data, error } = await supabaseServer
          .from('cafe_settings')
          .select('value')
          .eq('key', 'menu_stock_inventory')
          .single();
        if (!error && data?.value && typeof data.value === 'object') {
          globalStockStore.__anassa_stock_map = {
            ...globalStockStore.__anassa_stock_map,
            ...(data.value as Record<string, number>),
          };
          return globalStockStore.__anassa_stock_map;
        }
      } catch {
        // fallback to memory
      }
    }
    return globalStockStore.__anassa_stock_map || {};
  }, 10, ['stock', 'menu']);
}

export async function saveStockMap(stockMap: Record<string, number>): Promise<void> {
  globalStockStore.__anassa_stock_map = { ...stockMap };
  invalidateCache('stock');
  invalidateCache('menu');
  if (isSupabaseConfigured && supabaseServer) {
    try {
      await supabaseServer.from('cafe_settings').upsert({
        key: 'menu_stock_inventory',
        value: stockMap,
        updated_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Supabase saveStockMap error:', e);
    }
  }
}

// ──────────────────────────────────────────
// MENU ITEMS
// ──────────────────────────────────────────
export async function getMenuItems(categoryId?: string): Promise<MenuItem[]> {
  const cacheKey = categoryId ? `menu_items_${categoryId}` : 'menu_items_all';
  return fetchWithCache(cacheKey, async () => {
    const stockMap = await getStockMap();

    if (isSupabaseConfigured && supabaseServer) {
      try {
        let query = supabaseServer.from('menu_items').select('*').order('sort_order', { ascending: true });
        if (categoryId) {
          query = query.eq('category_id', categoryId);
        }
        const { data, error } = await query;
        if (!error && data && data.length >= (categoryId ? 1 : initialMenuItems.length)) {
          const mapped = data.map((i) => {
            let itemStock: number;
            if (typeof stockMap[i.id] === 'number') {
              itemStock = stockMap[i.id];
            } else if (typeof i.stock === 'number') {
              itemStock = i.stock;
            } else {
              itemStock = 10;
            }

            // Consistency & self-healing guard: If item is available, stock must be positive (>= 1)
            if (i.is_available && itemStock <= 0) {
              itemStock = typeof i.stock === 'number' && i.stock > 0 ? i.stock : 10;
              stockMap[i.id] = itemStock;
            } else if (!i.is_available && itemStock > 0) {
              itemStock = 0;
              stockMap[i.id] = 0;
            }

            const isAvail = (i.is_available ?? true) && itemStock > 0;

            return {
              id: i.id,
              name: i.name,
              subheading: i.subheading,
              desc: i.desc || '',
              price: Number(i.price),
              img: i.name.toLowerCase().includes('hot chocolate') ? '/images/hot_chocolate.png' : (i.image_url || '/images/americano.png'),
              category: i.category_name,
              categoryId: i.category_id,
              isVeg: i.is_veg ?? true,
              isAvailable: isAvail,
              stock: itemStock,
              sizes: Array.isArray(i.sizes) ? i.sizes : ['Regular'],
              sizePriceMultiplier: i.size_price_multiplier || null,
              sortOrder: i.sort_order,
            };
          });

          // Sort items by category order first so newly added dishes are grouped inside their category
          mapped.sort((a, b) => {
            const catA = categoryOrderMap[a.categoryId] ?? 99;
            const catB = categoryOrderMap[b.categoryId] ?? 99;
            if (catA !== catB) return catA - catB;
            return (a.sortOrder || 0) - (b.sortOrder || 0);
          });

          return mapped;
        } else if (!categoryId && (!data || data.length < initialMenuItems.length)) {
          // Auto-sync full 76 PDF items to Supabase if Supabase has fewer items
          syncMenuToDatabase().catch((e) => console.warn('Auto-sync menu items error:', e));
        }
      } catch (err) {
        console.warn('Supabase getMenuItems error, falling back to memory store:', err);
      }
    }

    const items = (globalStore.__anassa_items || initialMenuItems).map((it) => {
      let s = typeof stockMap[it.id] === 'number'
        ? stockMap[it.id]
        : (typeof it.stock === 'number' ? it.stock : 10);
      if (it.isAvailable && s <= 0) {
        s = typeof it.stock === 'number' && it.stock > 0 ? it.stock : 10;
        stockMap[it.id] = s;
      } else if (!it.isAvailable && s > 0) {
        s = 0;
        stockMap[it.id] = 0;
      }
      return {
        ...it,
        stock: s,
        isAvailable: s > 0 && it.isAvailable,
      };
    });
    items.sort((a, b) => {
      const catA = categoryOrderMap[a.categoryId] ?? 99;
      const catB = categoryOrderMap[b.categoryId] ?? 99;
      if (catA !== catB) return catA - catB;
      return (a.sortOrder || 0) - (b.sortOrder || 0);
    });

    if (categoryId) {
      return items.filter((it) => it.categoryId === categoryId);
    }
    return items;
  }, 20, ['menu']);
}

export async function toggleItemAvailability(itemId: string, isAvailable: boolean): Promise<boolean> {
  invalidateCache('menu');
  invalidateCache('stock');
  const stockMap = await getStockMap();
  const item = globalStore.__anassa_items?.find((i) => i.id === itemId);
  let currentStock = typeof stockMap[itemId] === 'number' ? stockMap[itemId] : (item?.stock ?? 10);

  if (isAvailable && currentStock <= 0) {
    currentStock = 10;
    stockMap[itemId] = 10;
    await saveStockMap(stockMap);
  } else if (!isAvailable) {
    currentStock = 0;
    stockMap[itemId] = 0;
    await saveStockMap(stockMap);
  }

  if (isSupabaseConfigured && supabaseServer) {
    try {
      const dbPayload: Record<string, unknown> = { is_available: isAvailable, stock: currentStock };
      const { error } = await supabaseServer.from('menu_items').update(dbPayload).eq('id', itemId);
      if (error) {
        await supabaseServer.from('menu_items').update({ is_available: isAvailable }).eq('id', itemId);
      }
    } catch (err) {
      console.warn('Supabase toggleItemAvailability error:', err);
    }
  }

  if (item) {
    item.isAvailable = isAvailable;
    item.stock = currentStock;
    addAuditLog({
      actor: 'admin',
      action: 'STOCK_TOGGLED',
      details: `Item "${item.name}" marked ${isAvailable ? `IN STOCK (${currentStock} left)` : 'OUT OF STOCK (86ed)'}`,
    });
  }
  return true;
}

export async function updateMenuItemStock(id: string, newStock: number): Promise<MenuItem | null> {
  const finalStock = Math.max(0, Math.floor(newStock));
  const isAvailable = finalStock > 0;

  const stockMap = await getStockMap();
  stockMap[id] = finalStock;
  await saveStockMap(stockMap);

  if (isSupabaseConfigured && supabaseServer) {
    try {
      const { error } = await supabaseServer
        .from('menu_items')
        .update({ stock: finalStock, is_available: isAvailable })
        .eq('id', id);
      if (error) {
        await supabaseServer.from('menu_items').update({ is_available: isAvailable }).eq('id', id);
      }
    } catch (err) {
      console.warn('Supabase updateMenuItemStock error:', err);
    }
  }

  let item = globalStore.__anassa_items?.find((i) => i.id === id);
  if (item) {
    item.stock = finalStock;
    item.isAvailable = isAvailable;
    addAuditLog({
      actor: 'admin',
      action: 'STOCK_TOGGLED',
      details: `Stock for "${item.name}" updated to ${finalStock} items (${isAvailable ? 'In Stock' : 'Out of Stock'})`,
    });
    return item;
  } else {
    const base = initialMenuItems.find((i) => i.id === id);
    if (base) {
      item = { ...base, stock: finalStock, isAvailable };
      if (globalStore.__anassa_items) globalStore.__anassa_items.push(item);
      return item;
    }
  }
  return null;
}

export async function decrementMenuItemStock(id: string, quantity: number): Promise<void> {
  const stockMap = await getStockMap();
  const item = globalStore.__anassa_items?.find((i) => i.id === id);
  const currentStock = typeof stockMap[id] === 'number'
    ? stockMap[id]
    : (typeof item?.stock === 'number' ? item.stock : 10);

  const newStock = Math.max(0, currentStock - quantity);
  const isAvailable = newStock > 0;

  stockMap[id] = newStock;
  await saveStockMap(stockMap);

  if (item) {
    item.stock = newStock;
    if (newStock === 0) {
      item.isAvailable = false;
    }
  }

  if (isSupabaseConfigured && supabaseServer) {
    try {
      const { error } = await supabaseServer
        .from('menu_items')
        .update({
          stock: newStock,
          ...(newStock === 0 ? { is_available: false } : {}),
        })
        .eq('id', id);

      if (error && newStock === 0) {
        await supabaseServer.from('menu_items').update({ is_available: false }).eq('id', id);
      }
    } catch (e) {
      console.warn('Supabase decrementMenuItemStock error:', e);
      if (newStock === 0) {
        try {
          await supabaseServer.from('menu_items').update({ is_available: false }).eq('id', id);
        } catch {
          // ignore
        }
      }
    }
  }
}

export async function addMenuItem(newItem: Omit<MenuItem, 'id'>): Promise<MenuItem> {
  const id = `item-${Date.now()}`;
  const initialStock = typeof newItem.stock === 'number' ? newItem.stock : 10;
  const created: MenuItem = {
    ...newItem,
    id,
    stock: initialStock,
    sortOrder: (globalStore.__anassa_items?.length || 0) + 1,
  };

  const stockMap = await getStockMap();
  stockMap[id] = initialStock;
  await saveStockMap(stockMap);

  if (isSupabaseConfigured && supabaseServer) {
    try {
      await supabaseServer.from('menu_items').insert({
        id: created.id,
        category_id: created.categoryId,
        category_name: created.category,
        name: created.name,
        subheading: created.subheading,
        desc: created.desc,
        price: created.price,
        image_url: created.img,
        is_veg: created.isVeg,
        is_available: created.isAvailable,
        stock: created.stock,
        sizes: created.sizes,
        sort_order: created.sortOrder,
      });
    } catch (err) {
      console.warn('Supabase addMenuItem error:', err);
    }
  }

  globalStore.__anassa_items?.unshift(created);
  invalidateCache('menu');
  invalidateCache('stock');
  addAuditLog({
    actor: 'admin',
    action: 'MENU_ITEM_ADDED',
    details: `Added new dish "${created.name}" (₹${created.price}, Stock: ${created.stock}) in ${created.category}`,
  });
  return created;
}

export async function updateMenuItem(id: string, updates: Partial<MenuItem>): Promise<MenuItem | null> {
  if (updates.stock !== undefined) {
    updates.stock = Math.max(0, Math.floor(updates.stock));
    if (updates.stock === 0 && updates.isAvailable === undefined) {
      updates.isAvailable = false;
    }
  }
  if (updates.isAvailable !== undefined) {
    if (!updates.isAvailable) {
      updates.stock = 0;
    } else if (updates.stock === undefined || updates.stock <= 0) {
      updates.stock = 10;
    }
  }

  // 1. Sync inventory stockMap
  const stockMap = await getStockMap();
  let stockChanged = false;
  if (updates.stock !== undefined) {
    stockMap[id] = updates.stock;
    stockChanged = true;
  } else if (updates.isAvailable !== undefined) {
    stockMap[id] = updates.isAvailable ? 10 : 0;
    stockChanged = true;
  }

  if (stockChanged) {
    await saveStockMap(stockMap);
  }

  // 2. Sync to Supabase menu_items table
  if (isSupabaseConfigured && supabaseServer) {
    try {
      const dbUpdates: Record<string, unknown> = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.price !== undefined) dbUpdates.price = updates.price;
      if (updates.desc !== undefined) dbUpdates.desc = updates.desc;
      if (updates.subheading !== undefined) dbUpdates.subheading = updates.subheading;
      if (updates.categoryId !== undefined) dbUpdates.category_id = updates.categoryId;
      if (updates.category !== undefined) dbUpdates.category_name = updates.category;
      if (updates.img !== undefined) dbUpdates.image_url = updates.img;
      if (updates.isVeg !== undefined) dbUpdates.is_veg = updates.isVeg;
      if (updates.isAvailable !== undefined) dbUpdates.is_available = updates.isAvailable;
      if (updates.stock !== undefined) dbUpdates.stock = updates.stock;
      if (updates.sizes !== undefined) dbUpdates.sizes = updates.sizes;
      
      const { error: upErr } = await supabaseServer.from('menu_items').update(dbUpdates).eq('id', id);
      if (upErr && dbUpdates.stock !== undefined) {
        delete dbUpdates.stock;
        await supabaseServer.from('menu_items').update(dbUpdates).eq('id', id);
      }
    } catch (err) {
      console.warn('Supabase updateMenuItem error:', err);
    }
  }

  // 3. Update memory store
  let item: MenuItem | null = null;
  const itemIndex = globalStore.__anassa_items?.findIndex((i) => i.id === id);
  if (itemIndex !== undefined && itemIndex >= 0 && globalStore.__anassa_items) {
    globalStore.__anassa_items[itemIndex] = {
      ...globalStore.__anassa_items[itemIndex],
      ...updates,
      ...(updates.stock !== undefined ? { stock: updates.stock } : {}),
      ...(updates.isAvailable !== undefined ? { isAvailable: updates.isAvailable } : {}),
    };
    item = globalStore.__anassa_items[itemIndex];
  } else {
    const base = initialMenuItems.find((i) => i.id === id);
    if (base) {
      const merged: MenuItem = {
        ...base,
        ...updates,
        ...(updates.stock !== undefined ? { stock: updates.stock } : {}),
        ...(updates.isAvailable !== undefined ? { isAvailable: updates.isAvailable } : {}),
      };
      if (globalStore.__anassa_items) globalStore.__anassa_items.push(merged);
      item = merged;
    } else {
      item = {
        id,
        name: updates.name || 'Dish',
        price: updates.price || 0,
        category: updates.category || 'General',
        categoryId: updates.categoryId || 'general',
        desc: updates.desc || '',
        subheading: updates.subheading || '',
        img: updates.img || '/images/americano.png',
        isVeg: updates.isVeg ?? true,
        isAvailable: updates.isAvailable ?? true,
        stock: updates.stock ?? 10,
        sizes: updates.sizes || ['Regular'],
        ...updates,
      } as MenuItem;
      if (globalStore.__anassa_items) globalStore.__anassa_items.push(item);
    }
  }

  invalidateCache('menu');
  invalidateCache('stock');

  if (item) {
    addAuditLog({
      actor: 'admin',
      action: 'MENU_ITEM_UPDATED',
      details: `Updated dish "${item.name}" (Price: ₹${item.price}, Stock: ${item.stock ?? 10}, ${item.isAvailable ? 'In Stock' : 'Out of Stock'})`,
    });
  }

  return item;
}

export async function deleteMenuItem(id: string): Promise<boolean> {
  invalidateCache('menu');
  invalidateCache('stock');
  const stockMap = await getStockMap();
  if (stockMap[id] !== undefined) {
    delete stockMap[id];
    await saveStockMap(stockMap);
  }

  if (isSupabaseConfigured && supabaseServer) {
    try {
      await supabaseServer.from('menu_items').delete().eq('id', id);
    } catch (err) {
      console.warn('Supabase deleteMenuItem error:', err);
    }
  }

  if (globalStore.__anassa_items) {
    const deletedItem = globalStore.__anassa_items.find((i) => i.id === id);
    if (!deletedItem) {
      return false;
    }
    globalStore.__anassa_items = globalStore.__anassa_items.filter((i) => i.id !== id);
    addAuditLog({
      actor: 'admin',
      action: 'MENU_ITEM_DELETED',
      details: `Deleted dish "${deletedItem.name}"`,
    });
    return true;
  }
  return true;
}

// ──────────────────────────────────────────
// ADD-ONS
// ──────────────────────────────────────────
export async function getAddons(): Promise<MenuAddon[]> {
  const current = globalStore.__anassa_addons || initialAddons;
  return current.filter(
    (a) =>
      a.id !== 'ad-4' &&
      a.id !== 'ad-5' &&
      a.name !== 'Extra Cold Brew Flavour Shot' &&
      a.name !== 'Plant Oat Milk Swap'
  );
}

// ──────────────────────────────────────────
// ORDERS
// ──────────────────────────────────────────
export function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Normalizes all order numbers to the sequential format starting from 'oz-anassa-1'.
 * Migrates any legacy '#OZ-XXXX' or missing order numbers chronologically (oldest to newest).
 */
export function normalizeAndSyncOrders(orders: Order[]): Order[] {
  if (!orders || orders.length === 0) return [];

  // Sort oldest first (chronological order)
  const sorted = [...orders].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  
  let currentSeq = 1;
  const updatesToDb: { id: string; orderNumber: string }[] = [];

  for (const ord of sorted) {
    const raw = (ord.orderNumber || '').trim();
    const match = raw.match(/^(?:oz-?anassa|ozanassa)[-_]?(\d+)$/i);

    if (match) {
      const num = parseInt(match[1], 10);
      const normalized = `oz-anassa-${num}`;
      if (ord.orderNumber !== normalized) {
        ord.orderNumber = normalized;
        updatesToDb.push({ id: ord.id, orderNumber: normalized });
      }
      if (num >= currentSeq) {
        currentSeq = num + 1;
      }
    } else {
      // Legacy '#OZ-XXXX', undefined, or non-sequential format -> assign oz-anassa-N
      const normalized = `oz-anassa-${currentSeq}`;
      ord.orderNumber = normalized;
      updatesToDb.push({ id: ord.id, orderNumber: normalized });
      currentSeq++;
    }
  }

  // Update in-memory store if cached
  if (globalStore.__anassa_orders && globalStore.__anassa_orders.length > 0) {
    const map = new Map(sorted.map((o) => [o.id, o.orderNumber]));
    for (const memOrder of globalStore.__anassa_orders) {
      if (map.has(memOrder.id)) {
        memOrder.orderNumber = map.get(memOrder.id)!;
      }
    }
  }

  // Asynchronously persist normalized numbers to Supabase in background
  if (updatesToDb.length > 0 && isSupabaseConfigured && supabaseServer) {
    (async () => {
      try {
        for (const item of updatesToDb) {
          await supabaseServer
            .from('orders')
            .update({ order_number: item.orderNumber })
            .eq('id', item.id);
        }
      } catch (err) {
        console.warn('Background sync of normalized order numbers failed:', err);
      }
    })();
  }

  // Maintain newest-first sort order
  return sorted.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function createOrder(data: {
  tableNumber: number | string;
  tableKey?: string;
  sessionId?: string;
  customerName: string;
  customerPhone: string;
  customerFlat?: string;
  idempotencyKey?: string;
  items: MenuItem[] | { id: string; name: string; price: number; quantity: number; selectedSize?: string; category?: string; isAddon?: boolean }[];
  subtotal: number;
  taxAmount: number;
  total: number;
  specialInstructions?: string;
  customerLat?: number;
  customerLng?: number;
  distanceMeters?: number;
  createdAt?: number;
  status?: OrderStatus;
  isPaid?: boolean;
  settledBy?: string;
}): Promise<Order> {
  const now = data.createdAt ? Number(data.createdAt) : Date.now();
  
  // Calculate next sequential oz-anassa order number (starts strictly from oz-anassa-1)
  let maxSeq = 0;
  const existingOrders = globalStore.__anassa_orders || [];
  for (const o of existingOrders) {
    if (o.orderNumber) {
      const match = o.orderNumber.match(/^(?:oz-?anassa|ozanassa)[-_]?(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxSeq) maxSeq = num;
      }
    }
  }

  if (isSupabaseConfigured && supabaseServer) {
    try {
      const { data: dbOrders } = await supabaseServer
        .from('orders')
        .select('order_number')
        .order('created_at', { ascending: false })
        .limit(500);
      if (dbOrders) {
        for (const o of dbOrders) {
          if (o.order_number) {
            const match = o.order_number.match(/^(?:oz-?anassa|ozanassa)[-_]?(\d+)$/i);
            if (match) {
              const num = parseInt(match[1], 10);
              if (num > maxSeq) maxSeq = num;
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  const nextSeq = maxSeq + 1;
  const orderNumber = `oz-anassa-${nextSeq}`;
  const orderId = `oz-anassa-${now}-${nextSeq}`;

  const newOrder: Order = {
    id: orderId,
    orderNumber,
    tableNumber: data.tableNumber,
    tableKey: data.tableKey,
    sessionId: data.sessionId,
    customerName: data.customerName,
    customerPhone: data.customerPhone,
    customerFlat: data.customerFlat,
    idempotencyKey: data.idempotencyKey,
    items: data.items.map((it) => ({
      id: it.id,
      name: it.name,
      price: it.price,
      quantity: (it as { quantity?: number }).quantity || 1,
      selectedSize: (it as { selectedSize?: string }).selectedSize || 'Regular',
      category: (it as { category?: string }).category,
      isAddon: (it as { isAddon?: boolean }).isAddon,
    })),
    subtotal: data.subtotal,
    taxAmount: data.taxAmount,
    total: data.total,
    specialInstructions: data.specialInstructions,
    status: data.status || 'received',
    isPaid: Boolean(data.isPaid),
    paidAt: data.isPaid ? now : undefined,
    settledBy: data.settledBy,
    customerLat: data.customerLat,
    customerLng: data.customerLng,
    distanceMeters: data.distanceMeters,
    createdAt: now,
    updatedAt: now,
  };

  if (isSupabaseConfigured && supabaseServer) {
    try {
      let instructionsForDb = newOrder.specialInstructions || '';
      if (newOrder.isPaid && !instructionsForDb.includes('[SETTLED')) {
        const tag = `[SETTLED:${now}:${newOrder.settledBy || 'Staff'}]`;
        instructionsForDb = instructionsForDb ? `${instructionsForDb} ${tag}` : tag;
      }

      const baseInsertPayload = {
        id: newOrder.id,
        order_number: newOrder.orderNumber,
        table_number: String(newOrder.tableNumber),
        table_key: newOrder.tableKey,
        session_id: newOrder.sessionId,
        customer_name: newOrder.customerName,
        customer_phone: newOrder.customerPhone,
        customer_flat: newOrder.customerFlat,
        items: newOrder.items,
        subtotal: newOrder.subtotal,
        tax_amount: newOrder.taxAmount,
        total: newOrder.total,
        special_instructions: instructionsForDb || null,
        status: newOrder.status,
        customer_lat: newOrder.customerLat,
        customer_lng: newOrder.customerLng,
        distance_meters: newOrder.distanceMeters,
        created_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
      };

      const fullInsertPayload = {
        ...baseInsertPayload,
        is_paid: newOrder.isPaid,
        paid_at: newOrder.paidAt ? new Date(newOrder.paidAt).toISOString() : null,
        settled_by: newOrder.settledBy || null,
      };

      const { error: insertErr } = await supabaseServer.from('orders').insert(fullInsertPayload);
      if (insertErr) {
        console.warn('Supabase insert with paid columns failed, falling back to base schema:', insertErr.message);
        const { error: baseErr } = await supabaseServer.from('orders').insert(baseInsertPayload);
        if (baseErr) {
          console.warn('Supabase base insert failed, falling back to minimal core payload:', baseErr.message);
          const minimalPayload = {
            id: newOrder.id,
            order_number: newOrder.orderNumber,
            table_number: String(newOrder.tableNumber),
            customer_name: newOrder.customerName,
            customer_phone: newOrder.customerPhone,
            items: newOrder.items,
            subtotal: newOrder.subtotal,
            tax_amount: newOrder.taxAmount,
            total: newOrder.total,
            status: newOrder.status,
            created_at: new Date(now).toISOString(),
            updated_at: new Date(now).toISOString(),
          };
          const { error: minErr } = await supabaseServer.from('orders').insert(minimalPayload);
          if (minErr) {
            console.error('Supabase minimal insert error:', minErr.message);
          }
        }
      }
    } catch (err) {
      console.warn('Supabase createOrder error, saved in memory store:', err);
    }
  }

  // Automatically decrement stock for ordered food/drink items (default is 10, decreases with each order)
  for (const it of newOrder.items) {
    if (!it.isAddon && it.id) {
      await decrementMenuItemStock(it.id, it.quantity || 1);
    }
  }

  globalStore.__anassa_orders?.unshift(newOrder);
  saveStoreToDisk();
  invalidateCache('orders');
  invalidateCache('menu');
  invalidateCache('stock');
  broadcastOrder(newOrder);
  addAuditLog({
    actor: 'customer',
    action: 'ORDER_CREATED',
    details: `Order #${newOrder.orderNumber} placed for Table ${newOrder.tableNumber} (₹${newOrder.total}, ${newOrder.items.length} items)`,
  });
  return newOrder;
}

export async function getOrders(filter?: {
  status?: OrderStatus | 'active';
  tableNumber?: number | string;
  sessionId?: string;
  knownIds?: string[];
  phone?: string;
  limit?: number;
}): Promise<Order[]> {
  const filterKey = filter ? JSON.stringify(filter) : 'all';
  const cacheKey = `orders_${filterKey}`;

  return fetchWithCache(
    cacheKey,
    async () => {
      loadStoreFromDisk();

      if (isSupabaseConfigured && supabaseServer) {
        try {
          let query = supabaseServer.from('orders').select('*').order('created_at', { ascending: false });
          if (filter?.status === 'active') {
            query = query.in('status', ['received', 'preparing', 'ready', 'served']);
          } else if (filter?.status) {
            query = query.eq('status', filter.status);
          }
          if (filter?.tableNumber !== undefined) {
            const tblStr = String(filter.tableNumber);
            const isTakeaway = tblStr === '0' || tblStr.toLowerCase() === 'takeaway';
            if (isTakeaway) {
              query = query.in('table_number', ['0', 'Takeaway', 'takeaway']);
            } else {
              query = query.eq('table_number', tblStr);
            }
          }
          if (filter?.sessionId && !filter?.phone && (!filter?.knownIds || filter.knownIds.length === 0)) {
            query = query.eq('session_id', filter.sessionId);
          }
          if (filter?.limit) {
            query = query.limit(filter.limit);
          }
          const { data, error } = await query;
          if (!error && data) {
            const recentServedCutoff = Date.now() - 45 * 60 * 1000;
            const rawOrders: Order[] = data.map((o) => {
              const rawInstructions = o.special_instructions || '';
              const settledMatch = rawInstructions.match(/\[SETTLED:(\d+):([^\]]+)\]/);
              const isPaid = Boolean(o.is_paid ?? (settledMatch !== null));
              const paidAt = o.paid_at
                ? new Date(o.paid_at).getTime()
                : (settledMatch ? Number(settledMatch[1]) : (o as any).paidAt);
              const settledBy = o.settled_by || (settledMatch ? settledMatch[2] : (o as any).settledBy);
              const cleanInstructions = rawInstructions
                .replace(/\[SETTLED:[^\]]+\]/g, '')
                .replace(/\[DELETED_BY_[^\]]+\]/g, '')
                .trim();

              const isDeletedMatch = rawInstructions.match(/\[DELETED_BY_([^\]]+)\]/);
              const isDeleted = Boolean((o as any).is_deleted || isDeletedMatch !== null || (o.status === 'cancelled' && (o as any).deletedBy));
              const deletedBy = (o as any).deleted_by || (isDeletedMatch ? isDeletedMatch[1].toLowerCase() : (o as any).deletedBy);

              return {
                id: o.id,
                orderNumber: o.order_number || '',
                tableNumber: isNaN(Number(o.table_number)) ? o.table_number : Number(o.table_number),
                tableKey: o.table_key,
                sessionId: o.session_id,
                customerName: o.customer_name,
                customerPhone: o.customer_phone,
                customerFlat: o.customer_flat,
                items: o.items || [],
                subtotal: Number(o.subtotal || o.total),
                taxAmount: Number(o.tax_amount || 0),
                total: Number(o.total),
                specialInstructions: cleanInstructions || undefined,
                status: o.status as OrderStatus,
                isPaid,
                paidAt,
                settledBy,
                isDeleted,
                deletedBy,
                customerLat: o.customer_lat ? Number(o.customer_lat) : undefined,
                customerLng: o.customer_lng ? Number(o.customer_lng) : undefined,
                distanceMeters: o.distance_meters ? Number(o.distance_meters) : undefined,
                createdAt: o.created_at ? new Date(o.created_at).getTime() : Date.now(),
                updatedAt: o.updated_at ? new Date(o.updated_at).getTime() : Date.now(),
              };
            });

            let filtered = rawOrders;
            if (filter?.status === 'active') {
              filtered = filtered.filter((o) => {
                if (o.isDeleted || o.status === 'cancelled') return false;
                if (o.status === 'received' || o.status === 'preparing' || o.status === 'ready') return true;
                if (o.status === 'served' && !o.isPaid) return true;
                if (filter.tableNumber !== undefined && o.status === 'served' && (o.updatedAt || o.createdAt) >= recentServedCutoff) {
                  return true;
                }
                return false;
              });
            }

            if (filter?.sessionId || (filter?.knownIds && filter.knownIds.length > 0) || filter?.phone) {
              const fPhone = filter.phone ? filter.phone.replace(/\D/g, '').slice(-10) : '';
              filtered = filtered.filter((o) => {
                if (filter.knownIds && filter.knownIds.includes(o.id)) return true;
                if (fPhone && o.customerPhone && (o.customerPhone.replace(/\D/g, '').slice(-10) === fPhone)) return true;
                if (filter.sessionId && o.sessionId === filter.sessionId) return true;
                return false;
              });
            }

            return normalizeAndSyncOrders(filtered);
          }
        } catch (err) {
          console.warn('Supabase getOrders error, falling back to memory store:', err);
        }
      }

      let list = normalizeAndSyncOrders(globalStore.__anassa_orders || []);
      if (filter?.status === 'active') {
        const recentServedCutoff = Date.now() - 45 * 60 * 1000;
        list = list.filter((o) => {
          if (o.isDeleted || o.status === 'cancelled') return false;
          if (o.status === 'received' || o.status === 'preparing' || o.status === 'ready') return true;
          if (o.status === 'served' && !o.isPaid) return true;
          if (filter.tableNumber !== undefined && o.status === 'served' && (o.updatedAt || o.createdAt) >= recentServedCutoff) {
            return true;
          }
          return false;
        });
      } else if (filter?.status) {
        list = list.filter((o) => o.status === filter.status);
      }
      if (filter?.sessionId || (filter?.knownIds && filter.knownIds.length > 0) || filter?.phone) {
        const fPhone = filter.phone ? filter.phone.replace(/\D/g, '').slice(-10) : '';
        list = list.filter((o) => {
          if (filter.knownIds && filter.knownIds.includes(o.id)) return true;
          if (fPhone && o.customerPhone && (o.customerPhone.replace(/\D/g, '').slice(-10) === fPhone)) return true;
          if (filter.sessionId && o.sessionId === filter.sessionId) return true;
          return false;
        });
      } else if (filter?.tableNumber !== undefined) {
        list = list.filter((o) => isSameTable(o.tableNumber, filter.tableNumber));
      }
      if (filter?.limit) {
        list = list.slice(0, filter.limit);
      }
      return list;
    },
    2.5,
    ['orders']
  );
}

export async function getOrderById(orderId: string): Promise<Order | null> {
  return fetchWithCache(
    `order_by_id_${orderId}`,
    async () => {
      if (isSupabaseConfigured && supabaseServer) {
        try {
          const { data, error } = await supabaseServer.from('orders').select('*').eq('id', orderId).single();
          if (!error && data) {
            const rawNumber = (data.order_number || '').trim();
            const match = rawNumber.match(/^(?:oz-?anassa|ozanassa)[-_]?(\d+)$/i);
            const orderNumber = match ? `oz-anassa-${match[1]}` : (rawNumber || 'oz-anassa-1');

            const rawInstructions = data.special_instructions || '';
            const settledMatch = rawInstructions.match(/\[SETTLED:(\d+):([^\]]+)\]/);
            const isPaid = Boolean(data.is_paid ?? (settledMatch !== null));
            const paidAt = data.paid_at
              ? new Date(data.paid_at).getTime()
              : (settledMatch ? Number(settledMatch[1]) : (data as any).paidAt);
            const settledBy = data.settled_by || (settledMatch ? settledMatch[2] : (data as any).settledBy);
            const cleanInstructions = rawInstructions.replace(/\[SETTLED:[^\]]+\]/g, '').trim();

            return {
              id: data.id,
              orderNumber,
              tableNumber: isNaN(Number(data.table_number)) ? data.table_number : Number(data.table_number),
              tableKey: data.table_key,
              sessionId: data.session_id,
              customerName: data.customer_name,
              customerPhone: data.customer_phone,
              customerFlat: data.customer_flat,
              items: data.items || [],
              subtotal: Number(data.subtotal || data.total),
              taxAmount: Number(data.tax_amount || 0),
              total: Number(data.total),
              specialInstructions: cleanInstructions || undefined,
              status: data.status as OrderStatus,
              isPaid,
              paidAt,
              settledBy,
              customerLat: data.customer_lat ? Number(data.customer_lat) : undefined,
              customerLng: data.customer_lng ? Number(data.customer_lng) : undefined,
              distanceMeters: data.distance_meters ? Number(data.distance_meters) : undefined,
              createdAt: data.created_at ? new Date(data.created_at).getTime() : Date.now(),
              updatedAt: data.updated_at ? new Date(data.updated_at).getTime() : Date.now(),
            };
          }
        } catch (err) {
          console.warn('Supabase getOrderById error:', err);
        }
      }

      const all = globalStore.__anassa_orders || [];
      return all.find((o) => o.id === orderId) || null;
    },
    2.5,
    ['orders']
  );
}

export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order | null> {
  const now = Date.now();

  if (isSupabaseConfigured && supabaseServer) {
    try {
      const { data, error } = await supabaseServer
        .from('orders')
        .update({
          status,
          updated_at: new Date(now).toISOString(),
        })
        .eq('id', orderId)
        .select()
        .single();

      if (!error && data) {
        const rawNumber = (data.order_number || '').trim();
        const match = rawNumber.match(/^(?:oz-?anassa|ozanassa)[-_]?(\d+)$/i);
        const orderNumber = match ? `oz-anassa-${match[1]}` : (rawNumber || 'oz-anassa-1');

        const updatedOrder: Order = {
          id: data.id,
          orderNumber,
          tableNumber: isNaN(Number(data.table_number)) ? data.table_number : Number(data.table_number),
          tableKey: data.table_key,
          sessionId: data.session_id,
          customerName: data.customer_name,
          customerPhone: data.customer_phone,
          customerFlat: data.customer_flat,
          items: data.items || [],
          subtotal: Number(data.subtotal || data.total),
          taxAmount: Number(data.tax_amount || 0),
          total: Number(data.total),
          specialInstructions: data.special_instructions,
          status: data.status as OrderStatus,
          customerLat: data.customer_lat ? Number(data.customer_lat) : undefined,
          customerLng: data.customer_lng ? Number(data.customer_lng) : undefined,
          distanceMeters: data.distance_meters ? Number(data.distance_meters) : undefined,
          createdAt: data.created_at ? new Date(data.created_at).getTime() : now,
          updatedAt: now,
        };

        const inMem = globalStore.__anassa_orders?.find((o) => o.id === orderId);
        if (inMem) {
          inMem.status = status;
          inMem.updatedAt = now;
        }

        broadcastOrder(updatedOrder);
        invalidateCache('orders');
        addAuditLog({
          actor: 'kitchen',
          action: status === 'cancelled' ? 'ORDER_REJECTED' : 'ORDER_STATUS_CHANGED',
          details: status === 'cancelled'
            ? `Order #${updatedOrder.orderNumber} (Table ${updatedOrder.tableNumber}) rejected / cancelled by kitchen staff`
            : `Order #${updatedOrder.orderNumber} (Table ${updatedOrder.tableNumber}) status changed to "${status}"`,
        });
        saveStoreToDisk();
        return updatedOrder;
      }
    } catch (err) {
      console.warn('Supabase updateOrderStatus error:', err);
    }
  }

  const order = globalStore.__anassa_orders?.find((o) => o.id === orderId);
  if (order) {
    order.status = status;
    order.updatedAt = now;
    invalidateCache('orders');
    broadcastOrder(order);
    saveStoreToDisk();
    addAuditLog({
      actor: 'kitchen',
      action: status === 'cancelled' ? 'ORDER_REJECTED' : 'ORDER_STATUS_CHANGED',
      details: status === 'cancelled'
        ? `Order #${order.orderNumber} (Table ${order.tableNumber}) rejected / cancelled by kitchen staff`
        : `Order #${order.orderNumber} (Table ${order.tableNumber}) status changed to "${status}"`,
    });
    return order;
  }
  return null;
}

export async function deleteOrder(
  orderId: string,
  actor: 'admin' | 'kitchen' = 'admin',
  permanent: boolean = false
): Promise<boolean> {
  loadStoreFromDisk();
  const existing = globalStore.__anassa_orders || [];
  const idx = existing.findIndex((o) => o.id === orderId);

  if (permanent) {
    if (isSupabaseConfigured && supabaseServer) {
      try {
        await supabaseServer.from('orders').delete().eq('id', orderId);
      } catch (err) {
        console.warn('Supabase deleteOrder permanent error:', err);
      }
    }
    if (idx !== -1) {
      const deleted = existing.splice(idx, 1)[0];
      saveStoreToDisk();
      invalidateCache('orders');
      broadcastOrder({ ...deleted, status: 'cancelled', isDeleted: true });
      addAuditLog({
        actor: actor as any,
        action: 'ORDER_PURGED',
        details: `Order #${deleted.orderNumber} permanently purged by ${actor}`,
      });
      return true;
    }
    return true;
  }

  // Standard deletion: mark order cancelled & deleted by admin so it is purged from active boards everywhere
  // while remaining verifiable in audit history and explicitly informing the customer tracker
  if (idx !== -1) {
    const target = existing[idx];
    target.status = 'cancelled';
    target.isDeleted = true;
    target.deletedBy = actor;
    target.deletedAt = Date.now();
    target.deletionReason = `Deleted by ${actor === 'admin' ? 'Admin' : 'Kitchen'}`;
    target.updatedAt = Date.now();

    if (isSupabaseConfigured && supabaseServer) {
      try {
        await supabaseServer
          .from('orders')
          .update({
            status: 'cancelled',
            special_instructions: `${target.specialInstructions || ''} [DELETED_BY_${actor.toUpperCase()}]`.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', orderId);
      } catch (err) {
        console.warn('Supabase deleteOrder soft-delete error:', err);
      }
    }

    saveStoreToDisk();
    invalidateCache('orders');
    broadcastOrder(target);
    addAuditLog({
      actor: actor as any,
      action: 'ORDER_DELETED',
      details: `Order #${target.orderNumber} (₹${target.total}) deleted by ${actor}`,
    });
    return true;
  }
  return true;
}

export async function updateOrderDetails(
  orderId: string,
  updates: Partial<Order>,
  actor: 'admin' | 'kitchen' = 'admin',
  staffName?: string
): Promise<Order | null> {
  const now = Date.now();
  if (!globalStore.__anassa_orders) globalStore.__anassa_orders = [];
  let existing = globalStore.__anassa_orders;
  let idx = existing.findIndex((o) => o.id === orderId);

  // If order is not in memory store, fetch from database or load into memory first!
  let currentOrder: Order | null = idx !== -1 ? existing[idx] : null;
  if (!currentOrder) {
    currentOrder = await getOrderById(orderId);
    if (currentOrder) {
      existing.unshift(currentOrder);
      idx = 0;
    }
  }

  // Handle instructions & settlement tag
  let newInstructions = updates.specialInstructions !== undefined ? updates.specialInstructions : currentOrder?.specialInstructions;
  let rawInstructionsForDb = newInstructions || '';

  if (updates.isPaid === true) {
    const sName = updates.settledBy || staffName || (actor === 'kitchen' ? 'Kitchen Staff' : 'Admin');
    const pTime = updates.paidAt || now;
    const tag = `[SETTLED:${pTime}:${sName}]`;
    if (!rawInstructionsForDb.includes('[SETTLED')) {
      rawInstructionsForDb = rawInstructionsForDb ? `${rawInstructionsForDb} ${tag}` : tag;
    }
  } else if (updates.isPaid === false) {
    rawInstructionsForDb = rawInstructionsForDb.replace(/\[SETTLED:[^\]]+\]/g, '').trim();
  }

  if (isSupabaseConfigured && supabaseServer) {
    try {
      const baseUpdates: Record<string, unknown> = {
        updated_at: new Date(now).toISOString(),
      };
      if (updates.orderNumber !== undefined) baseUpdates.order_number = updates.orderNumber;
      if (updates.tableNumber !== undefined) baseUpdates.table_number = String(updates.tableNumber);
      if (updates.customerName !== undefined) baseUpdates.customer_name = updates.customerName;
      if (updates.customerPhone !== undefined) baseUpdates.customer_phone = updates.customerPhone;
      if (updates.customerFlat !== undefined) baseUpdates.customer_flat = updates.customerFlat;
      if (updates.items !== undefined) baseUpdates.items = updates.items;
      if (updates.subtotal !== undefined) baseUpdates.subtotal = updates.subtotal;
      if (updates.taxAmount !== undefined) baseUpdates.tax_amount = updates.taxAmount;
      if (updates.total !== undefined) baseUpdates.total = updates.total;
      if (updates.status !== undefined) baseUpdates.status = updates.status;
      if (updates.createdAt !== undefined) baseUpdates.created_at = new Date(updates.createdAt).toISOString();
      if (rawInstructionsForDb !== undefined) baseUpdates.special_instructions = rawInstructionsForDb || null;

      // Try updating with dedicated paid columns first
      const fullUpdates = {
        ...baseUpdates,
        ...(updates.isPaid !== undefined ? { is_paid: updates.isPaid } : {}),
        ...(updates.paidAt !== undefined ? { paid_at: updates.paidAt ? new Date(updates.paidAt).toISOString() : null } : {}),
        ...(updates.settledBy !== undefined ? { settled_by: updates.settledBy } : {}),
      };

      const { error: fullErr } = await supabaseServer.from('orders').update(fullUpdates).eq('id', orderId);
      if (fullErr) {
        // If Postgres fails (e.g. column is_paid does not exist), fall back to baseUpdates which is guaranteed to succeed!
        const { error: baseErr } = await supabaseServer.from('orders').update(baseUpdates).eq('id', orderId);
        if (baseErr) {
          console.warn('Supabase base update error:', baseErr.message);
        }
      }
    } catch (err) {
      console.warn('Supabase updateOrderDetails error:', err);
    }
  }

  if (currentOrder && idx !== -1) {
    const cleanInstructions = rawInstructionsForDb.replace(/\[SETTLED:[^\]]+\]/g, '').trim();
    existing[idx] = {
      ...existing[idx],
      ...updates,
      specialInstructions: cleanInstructions || undefined,
      isPaid: updates.isPaid !== undefined ? updates.isPaid : existing[idx].isPaid,
      paidAt: updates.paidAt !== undefined ? updates.paidAt : existing[idx].paidAt,
      settledBy: updates.settledBy !== undefined ? updates.settledBy : existing[idx].settledBy,
      updatedAt: now,
    };
    invalidateCache('orders');
    broadcastOrder(existing[idx]);

    const isSettlement = updates.isPaid === true && (updates.paidAt || true);
    const actorLabel = actor === 'kitchen' ? `Kitchen Staff (${staffName || 'Mamoni'})` : `Admin (${staffName || 'Floor Manager'})`;

    if (isSettlement) {
      addAuditLog({
        actor,
        action: 'BILL_SETTLED',
        details: `Bill for Order #${existing[idx].orderNumber} (₹${existing[idx].total}) marked SETTLED/PAID by ${actorLabel}`,
      });
    } else {
      addAuditLog({
        actor,
        action: 'RECEIPT_EDITED',
        details: `Receipt/Order #${existing[idx].orderNumber} edited by ${actorLabel} (Total: ₹${existing[idx].total})`,
      });
    }
    saveStoreToDisk();
    return existing[idx];
  }
  return null;
}

// ──────────────────────────────────────────
// TABLES & QR VALIDATION
// ──────────────────────────────────────────
export async function getTables(includeSecrets: boolean = false): Promise<TableSession[]> {
  const cacheKey = includeSecrets ? 'tables_with_secrets' : 'tables_public';
  return fetchWithCache(
    cacheKey,
    async () => {
      if (isSupabaseConfigured && supabaseServer) {
        try {
          const { data, error } = await supabaseServer
            .from('tables')
            .select('*')
            .order('table_number', { ascending: true });
          if (!error && data && data.length > 0) {
            const loaded: TableSession[] = data.map((t) => ({
              tableNumber: t.table_number,
              label: t.label,
              secretKey: t.secret_key,
              isActive: t.is_active ?? true,
            }));
            globalStore.__anassa_tables = loaded;
          }
        } catch (err) {
          console.warn('Supabase getTables error, falling back to memory store:', err);
        }
      }

      const tables = globalStore.__anassa_tables || [];
      if (includeSecrets) {
        return tables;
      }
      // Strip secretKey for public security
      return tables.map((t) => ({
        tableNumber: t.tableNumber,
        label: t.label,
        secretKey: '', // Masked for public
        isActive: t.isActive,
      }));
    },
    30,
    ['tables']
  );
}

export async function getTableByNumber(tableNumber: number | string): Promise<TableSession | null> {
  const tNum = parseInt(String(tableNumber));
  const tables = await getTables(true);
  return tables.find((t) => t.tableNumber === tNum) || null;
}

export async function validateTable(tableNumber: number | string, key?: string): Promise<{ valid: boolean; isVerified: boolean; label: string }> {
  const tNum = parseInt(String(tableNumber));
  if (isNaN(tNum) || tNum === 0 || String(tableNumber).toLowerCase() === 'takeaway') {
    return { valid: true, isVerified: true, label: 'Takeaway Counter' };
  }

  const tables = await getTables(true);
  const table = tables.find((t) => t.tableNumber === tNum);
  if (!table) {
    return { valid: false, isVerified: false, label: `Table ${tableNumber}` };
  }

  const isKeyMatch = Boolean(key && table.secretKey && table.secretKey === key);
  return { valid: true, isVerified: isKeyMatch, label: table.label };
}

export async function ensureTablesCount(numTables: number): Promise<TableSession[]> {
  const safeCount = Math.min(Math.max(1, Math.floor(numTables) || 12), 100);
  const current = (await getTables(true)) || [];
  const takeaway = current.find((t) => t.tableNumber === 0) || {
    tableNumber: 0,
    label: 'Takeaway & In-Flat Delivery',
    secretKey: 'takeaway-permanent-key-anassa',
    isActive: true,
  };

  const updatedTables: TableSession[] = [takeaway];
  for (let i = 1; i <= safeCount; i++) {
    const existing = current.find((t) => t.tableNumber === i);
    if (existing) {
      updatedTables.push(existing);
    } else {
      updatedTables.push({
        tableNumber: i,
        label: `Table ${i}`,
        secretKey: i === 1 ? 'oz-anassa-tbl-1-master' : `oz-anassa-tbl-${i}-${Math.random().toString(36).substring(2, 9)}`,
        isActive: true,
      });
    }
  }
  updatedTables.sort((a, b) => a.tableNumber - b.tableNumber);
  globalStore.__anassa_tables = updatedTables;

  if (isSupabaseConfigured && supabaseServer) {
    try {
      await supabaseServer.from('tables').upsert(
        updatedTables.map((t) => ({
          table_number: t.tableNumber,
          label: t.label,
          secret_key: t.secretKey,
          is_active: t.isActive,
        }))
      );
    } catch (err) {
      console.warn('Supabase ensureTablesCount upsert error:', err);
    }
  }

  addAuditLog({
    actor: 'admin',
    action: 'TABLES_CONFIGURED',
    details: `Configured table capacity to ${numTables} tables`,
  });
  invalidateCache('tables');
  return updatedTables;
}

// ──────────────────────────────────────────
// CAFE SETTINGS
// ──────────────────────────────────────────
export async function getCafeSettings(): Promise<CafeSettings> {
  return fetchWithCache(
    'cafe_settings_main',
    async () => {
      if (isSupabaseConfigured && supabaseServer) {
        try {
          const { data, error } = await supabaseServer
            .from('cafe_settings')
            .select('value')
            .eq('key', 'main_config')
            .single();

          if (!error && data?.value) {
            const loaded: CafeSettings = {
              ...initialSettings,
              ...data.value,
            };
            globalStore.__anassa_settings = loaded;
            return loaded;
          }
        } catch (err) {
          console.warn('Supabase getCafeSettings error, falling back to memory store:', err);
        }
      }
      return globalStore.__anassa_settings || initialSettings;
    },
    30,
    ['settings']
  );
}

export async function updateCafeSettings(updates: Partial<CafeSettings>): Promise<CafeSettings> {
  const current = globalStore.__anassa_settings || initialSettings;
  const merged: CafeSettings = {
    ...current,
    ...updates,
  };
  globalStore.__anassa_settings = merged;
  invalidateCache('settings');

  if (isSupabaseConfigured && supabaseServer) {
    try {
      await supabaseServer.from('cafe_settings').upsert({
        key: 'main_config',
        value: merged,
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('Supabase updateCafeSettings error, kept in memory store:', err);
    }
  }

  addAuditLog({
    actor: 'admin',
    action: 'SETTINGS_UPDATED',
    details: `Cafe settings updated (${Object.keys(updates).join(', ')})`,
  });

  return merged;
}

export async function resetCafeSettings(): Promise<CafeSettings> {
  globalStore.__anassa_settings = { ...initialSettings };

  if (isSupabaseConfigured && supabaseServer) {
    try {
      await supabaseServer.from('cafe_settings').upsert({
        key: 'main_config',
        value: initialSettings,
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('Supabase resetCafeSettings error:', err);
    }
  }

  addAuditLog({
    actor: 'admin',
    action: 'SETTINGS_RESET',
    details: 'All cafe settings reset to factory defaults',
  });

  return globalStore.__anassa_settings || initialSettings;
}

// ──────────────────────────────────────────
// AUDIT LOGS (SERVER-SIDE AUDITING)
// ──────────────────────────────────────────
export async function addAuditLog(entry: {
  actor: 'customer' | 'kitchen' | 'admin' | 'system';
  action: AuditAction;
  details: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<AuditLog> {
  const now = Date.now();
  const log: AuditLog = {
    id: `log-${now}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: now,
    actor: entry.actor,
    action: entry.action,
    details: entry.details,
    ipAddress: entry.ipAddress || '127.0.0.1',
    userAgent: entry.userAgent || 'Server Process',
  };

  if (isSupabaseConfigured && supabaseServer) {
    try {
      await supabaseServer.from('audit_logs').insert({
        id: log.id,
        actor: log.actor,
        action: log.action,
        details: { text: log.details },
        ip_address: log.ipAddress,
        user_agent: log.userAgent,
        created_at: new Date(now).toISOString(),
      });
    } catch (err) {
      console.warn('Supabase addAuditLog error, kept in memory store:', err);
    }
  }

  globalStore.__anassa_audit_logs?.unshift(log);
  // Cap at 500 records to prevent memory growth
  if ((globalStore.__anassa_audit_logs?.length || 0) > 500) {
    globalStore.__anassa_audit_logs = globalStore.__anassa_audit_logs?.slice(0, 500);
  }
  return log;
}

export async function getAuditLogs(options?: {
  limit?: number;
  action?: string;
  actor?: string;
}): Promise<AuditLog[]> {
  const limit = options?.limit || 50;

  if (isSupabaseConfigured && supabaseServer) {
    try {
      let query = supabaseServer
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (options?.action) query = query.eq('action', options.action);
      if (options?.actor) query = query.eq('actor', options.actor);

      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        return data.map((d) => ({
          id: d.id,
          timestamp: new Date(d.created_at).getTime(),
          actor: d.actor,
          action: d.action,
          details: typeof d.details === 'object' && d.details?.text ? d.details.text : (typeof d.details === 'string' ? d.details : JSON.stringify(d.details)),
          ipAddress: d.ip_address,
          userAgent: d.user_agent,
        }));
      }
    } catch (err) {
      console.warn('Supabase getAuditLogs error, falling back to memory store:', err);
    }
  }

  let logs = globalStore.__anassa_audit_logs || [];
  if (options?.action) {
    logs = logs.filter((l) => l.action === options.action);
  }
  if (options?.actor) {
    logs = logs.filter((l) => l.actor === options.actor);
  }
  return logs.slice(0, limit);
}

// ──────────────────────────────────────────
// DATABASE PURGE (PRODUCTION LIVE LAUNCH)
// ──────────────────────────────────────────
export async function purgeAllOrdersAndLogs(): Promise<{ success: boolean; ordersCleared: number; logsCleared: number }> {
  const ordersCount = globalStore.__anassa_orders?.length || 0;
  const logsCount = globalStore.__anassa_audit_logs?.length || 0;

  if (isSupabaseConfigured && supabaseServer) {
    try {
      // 1. Delete all orders from Supabase using multiple delete filters for total reliability
      await supabaseServer.from('orders').delete().neq('id', '');
      await supabaseServer.from('orders').delete().not('id', 'is', null);
      await supabaseServer.from('orders').delete().gt('created_at', '1970-01-01T00:00:00Z');

      // 2. Delete all audit logs from Supabase
      await supabaseServer.from('audit_logs').delete().neq('id', '');
      await supabaseServer.from('audit_logs').delete().not('id', 'is', null);
      await supabaseServer.from('audit_logs').delete().gt('created_at', '1970-01-01T00:00:00Z');
    } catch (err) {
      console.warn('Supabase purgeAllOrdersAndLogs error:', err);
    }
  }

  globalStore.__anassa_orders = [];
  globalStore.__anassa_audit_logs = [];
  globalStore.__anassa_inventory = [...initialInventory];
  globalStore.__anassa_staff = [...initialStaff];
  invalidateCache('orders');
  invalidateCache('audit');

  // Log clean start audit entry
  addAuditLog({
    actor: 'admin',
    action: 'SETTINGS_RESET',
    details: 'Database orders and sales ledger cleared cleanly for fresh live production launch',
  });

  return { success: true, ordersCleared: ordersCount, logsCleared: logsCount };
}

// ──────────────────────────────────────────
// SYNC MENU ITEMS & CATEGORIES TO DATABASE
// ──────────────────────────────────────────
export async function syncMenuToDatabase(): Promise<{ success: boolean; categoriesCount: number; itemsCount: number }> {
  globalStore.__anassa_categories = [...initialCategories];
  globalStore.__anassa_items = [...initialMenuItems];
  globalStore.__anassa_addons = [...initialAddons];

  const catCount = initialCategories.length;
  const itemCount = initialMenuItems.length;

  if (isSupabaseConfigured && supabaseServer) {
    try {
      // Upsert categories
      for (const cat of initialCategories) {
        await supabaseServer.from('categories').upsert({
          id: cat.id,
          title: cat.title,
          subtitle: cat.subtitle,
          emoji: cat.emoji,
          hero_label: cat.heroLabel,
          icon_svg: cat.iconSvg,
          sort_order: cat.sortOrder,
          is_active: true,
        });
      }

      // Upsert menu items
      for (const it of initialMenuItems) {
        await supabaseServer.from('menu_items').upsert({
          id: it.id,
          category_id: it.categoryId,
          category_name: it.category,
          name: it.name,
          subheading: it.subheading || '',
          desc: it.desc || '',
          price: it.price,
          image_url: it.img,
          is_veg: it.isVeg,
          is_available: it.isAvailable,
          stock: it.stock ?? 10,
          sizes: it.sizes,
          size_price_multiplier: it.sizePriceMultiplier || null,
          sort_order: it.sortOrder,
        });
      }

      addAuditLog({
        actor: 'admin',
        action: 'MENU_ITEM_UPDATED',
        details: `Synchronized ${itemCount} PDF menu dishes and ${catCount} categories with database.`,
      });
    } catch (err) {
      console.warn('Supabase syncMenuToDatabase error:', err);
    }
  }

  return { success: true, categoriesCount: catCount, itemsCount: itemCount };
}

// ──────────────────────────────────────────
// INVENTORY MANAGEMENT
// ──────────────────────────────────────────
export async function getInventory(): Promise<InventoryItem[]> {
  return globalStore.__anassa_inventory || initialInventory;
}

export async function restockInventoryItem(id: string, amount: number): Promise<InventoryItem | null> {
  const items = globalStore.__anassa_inventory || [];
  const item = items.find((i) => i.id === id);
  if (!item) return null;

  item.currentStock = Math.max(0, Number((item.currentStock + amount).toFixed(2)));
  item.lastRestocked = Date.now();
  item.status = item.currentStock <= 0 
    ? 'out_of_stock' 
    : item.currentStock <= item.minThreshold 
      ? 'low_stock' 
      : 'in_stock';

  addAuditLog({
    actor: 'admin',
    action: 'STOCK_TOGGLED',
    details: `Restocked ${item.name}: +${amount} ${item.unit} (Current: ${item.currentStock} ${item.unit})`,
  });

  return item;
}

export async function updateInventoryItem(id: string, updates: Partial<InventoryItem>): Promise<InventoryItem | null> {
  const items = globalStore.__anassa_inventory || [];
  const index = items.findIndex((i) => i.id === id);
  if (index === -1) return null;

  const current = items[index];
  const updated: InventoryItem = {
    ...current,
    ...updates,
  };

  if (updated.currentStock <= 0) {
    updated.status = 'out_of_stock';
  } else if (updated.currentStock <= updated.minThreshold) {
    updated.status = 'low_stock';
  } else {
    updated.status = 'in_stock';
  }

  items[index] = updated;
  return updated;
}

// ──────────────────────────────────────────
// STAFF SCHEDULE & SHIFTS
// ──────────────────────────────────────────
export async function getStaffSchedule(): Promise<StaffShift[]> {
  if (!globalStore.__anassa_staff || globalStore.__anassa_staff.some((s) => s.name === 'Rahul Sharma' || s.name === 'Vikram Ghosh')) {
    globalStore.__anassa_staff = [...initialStaff];
  }
  return globalStore.__anassa_staff;
}

export async function updateStaffStatus(id: string, status: 'on_duty' | 'break' | 'off_duty'): Promise<StaffShift | null> {
  const roster = globalStore.__anassa_staff || [];
  const staff = roster.find((s) => s.id === id);
  if (!staff) return null;

  staff.status = status;
  addAuditLog({
    actor: 'admin',
    action: 'SETTINGS_UPDATED',
    details: `Staff status updated: ${staff.name} is now ${status.replace('_', ' ').toUpperCase()} (${staff.station})`,
  });

  return staff;
}


