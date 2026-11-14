import { Category, MenuAddon, MenuItem, Order, OrderStatus, TableSession, CafeSettings, AuditLog, AuditAction, InventoryItem, StaffShift } from './types';
import { initialCategories, initialMenuItems, initialAddons, initialSettings, initialInventory, initialStaff } from './initialData';
import { supabaseServer, isSupabaseConfigured, assertStorageConfigured } from './supabaseServer';
import { fetchWithCache, invalidateCache } from './cache';
import fs from 'fs';
import { randomUUID } from 'crypto';
import path from 'path';

// Local storage backup file path (persists in-memory state across restarts/workers)
const STORE_BACKUP_FILE = process.env.ANASSA_STORE_FILE || path.join(process.cwd(), '.anassa_store.json');

// In-memory persistent caches for ultra-fast response and zero-config local testing
const globalStore = globalThis as unknown as {
  __anassa_local_write?: Promise<unknown>;
  __anassa_counter?: number;
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
  if (isSupabaseConfigured || process.env.VERCEL) return;
  try {
    const payload = {
      counter: globalStore.__anassa_counter,
      items: globalStore.__anassa_items,
      settings: globalStore.__anassa_settings,
      tables: globalStore.__anassa_tables,
      inventory: globalStore.__anassa_inventory,
      staff: globalStore.__anassa_staff,
      orders: globalStore.__anassa_orders || [],
      auditLogs: globalStore.__anassa_audit_logs || [],
      updatedAt: Date.now(),
    };
    fs.writeFileSync(/* turbopackIgnore: true */ STORE_BACKUP_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  } catch {
    // Non-fatal if environment is read-only
  }
}

export function loadStoreFromDisk() {
  if (isSupabaseConfigured || process.env.VERCEL) return;
  try {
    // Runtime-created local data is not a deployment asset. Without this
    // annotation, the configurable path causes Turbopack to bundle the project.
    // Vercel and Supabase installations return above and never read this file.
    if (fs.existsSync(/* turbopackIgnore: true */ STORE_BACKUP_FILE)) {
      const raw = fs.readFileSync(/* turbopackIgnore: true */ STORE_BACKUP_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (data.counter) globalStore.__anassa_counter = data.counter;
      if (data.items) globalStore.__anassa_items = data.items;
      if (data.settings) globalStore.__anassa_settings = data.settings;
      if (data.tables) globalStore.__anassa_tables = data.tables;
      if (data.inventory) globalStore.__anassa_inventory = data.inventory;
      if (data.staff) globalStore.__anassa_staff = data.staff;
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
  assertStorageConfigured();
  return fetchWithCache('categories_all', async () => {
    if (isSupabaseConfigured && supabaseServer) {
      try {
        const { data, error } = await supabaseServer
          .from('categories')
          .select('*')
          .order('sort_order', { ascending: true }).throwOnError();
        if (!error && data) {
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
        }
      } catch (err) {
        console.warn('Supabase getCategories failed:', err);

      throw err;
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
  assertStorageConfigured();
  return fetchWithCache('stock_map', async () => {
    if (isSupabaseConfigured && supabaseServer) {
      try {
        const { data, error } = await supabaseServer
          .from('cafe_settings')
          .select('value')
          .eq('key', 'menu_stock_inventory')
          .maybeSingle().throwOnError();
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
  assertStorageConfigured();
  if (isSupabaseConfigured) return;
  globalStockStore.__anassa_stock_map = { ...stockMap };
  invalidateCache('stock');
  saveStoreToDisk();
  invalidateCache('menu');
  if (isSupabaseConfigured && supabaseServer) {
    try {
      await supabaseServer.from('cafe_settings').upsert({
        key: 'menu_stock_inventory',
        value: stockMap,
        updated_at: new Date().toISOString(),
      }).throwOnError();
    } catch (e) {
      console.warn('Supabase saveStockMap error:', e);

      throw e;
    }
  }
}

// ──────────────────────────────────────────
// MENU ITEMS
// ──────────────────────────────────────────
export async function getMenuItems(categoryId?: string): Promise<MenuItem[]> {
  assertStorageConfigured();
  const cacheKey = categoryId ? `menu_items_${categoryId}` : 'menu_items_all';
  return fetchWithCache(cacheKey, async () => {
    const stockMap = isSupabaseConfigured ? {} : await getStockMap();

    if (isSupabaseConfigured && supabaseServer) {
      try {
        let query = supabaseServer.from('menu_items').select('*').order('sort_order', { ascending: true });
        if (categoryId) {
          query = query.eq('category_id', categoryId);
        }
        const { data, error } = await query.throwOnError();
        if (!error && data) {
          const mapped = data.map((i) => {
            let itemStock: number;
            if (typeof i.stock === 'number') {
              itemStock = i.stock;
            } else {
              itemStock = 10;
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

          globalStore.__anassa_items = categoryId ? globalStore.__anassa_items : mapped;
          return mapped;
        }
      } catch (err) {
        console.warn('Supabase getMenuItems failed:', err);

      throw err;
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
  const item = (await getMenuItems()).find(i => i.id === itemId);
  if (!item) return false;
  return Boolean(await updateMenuItem(itemId, { isAvailable, stock: isAvailable ? Math.max(1, item.stock || 10) : 0 }));
}

export async function updateMenuItemStock(id: string, newStock: number): Promise<MenuItem | null> {
  return updateMenuItem(id, { stock: newStock });
}

export async function decrementMenuItemStock(id: string, quantity: number): Promise<void> {
  assertStorageConfigured();
  const stockMap = await getStockMap();
  const item = globalStore.__anassa_items?.find((i) => i.id === id);
  const currentStock = typeof stockMap[id] === 'number'
    ? stockMap[id]
    : (typeof item?.stock === 'number' ? item.stock : 10);

  const newStock = Math.max(0, currentStock - quantity);

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
        .eq('id', id).throwOnError();

      if (error && newStock === 0) {
        await supabaseServer.from('menu_items').update({ is_available: false }).eq('id', id).throwOnError();
      }
    } catch (e) {
      console.warn('Supabase decrementMenuItemStock error:', e);
      if (newStock === 0) {
        try {
          await supabaseServer.from('menu_items').update({ is_available: false }).eq('id', id).throwOnError();
        } catch {
          // ignore
        }
      }

      throw e;
    }
  }
}

export async function addMenuItem(newItem: Omit<MenuItem, 'id'>): Promise<MenuItem> {
  assertStorageConfigured();
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
      }).throwOnError();
    } catch (err) {
      console.warn('Supabase addMenuItem error:', err);

      throw err;
    }
  }

  globalStore.__anassa_items?.unshift(created);
  invalidateCache('menu');
  invalidateCache('stock');
  saveStoreToDisk();
  addAuditLog({
    actor: 'admin',
    action: 'MENU_ITEM_ADDED',
    details: `Added new dish "${created.name}" (₹${created.price}, Stock: ${created.stock}) in ${created.category}`,
  });
  saveStoreToDisk();
  return created;
}

export async function updateMenuItem(id: string, updates: Partial<MenuItem>): Promise<MenuItem | null> {
  assertStorageConfigured();
  const currentItem = (await getMenuItems()).find(i => i.id === id);
  if (!currentItem) return null;
  if (updates.stock !== undefined) {
    updates.stock = Math.max(0, Math.floor(updates.stock));
    if (updates.stock === 0) {
      updates.isAvailable = false;
    } else if (updates.stock > 0 && updates.isAvailable === undefined) {
      updates.isAvailable = true;
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

      const { error: upErr } = await supabaseServer.from('menu_items').update(dbUpdates).eq('id', id).throwOnError();
      if (upErr) throw upErr;
    } catch (err) {
      console.warn('Supabase updateMenuItem error:', err);

      throw err;
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
  saveStoreToDisk();

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
  assertStorageConfigured();
  const currentItem = (await getMenuItems()).find(i => i.id === id);
  if (!currentItem) return false;
  invalidateCache('menu');
  invalidateCache('stock');
  saveStoreToDisk();
  const stockMap = await getStockMap();
  if (stockMap[id] !== undefined) {
    delete stockMap[id];
    await saveStockMap(stockMap);
  }

  if (isSupabaseConfigured && supabaseServer) {
    try {
      await supabaseServer.from('menu_items').delete().eq('id', id).throwOnError();
    } catch (err) {
      console.warn('Supabase deleteMenuItem error:', err);

      throw err;
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
    saveStoreToDisk();
    return true;
  }
  return true;
}

// ──────────────────────────────────────────
// ADD-ONS
// ──────────────────────────────────────────
export async function getAddons(): Promise<MenuAddon[]> {
  assertStorageConfigured();
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
  // Reads must not renumber receipts or write to the database.
  return [...orders].sort((a, b) => b.createdAt - a.createdAt);
}

async function createOrderUnlocked(data: {
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
  assertStorageConfigured();
  if (data.idempotencyKey && !supabaseServer) {
    const duplicate = globalStore.__anassa_orders?.find(o => o.idempotencyKey === data.idempotencyKey);
    if (duplicate) return duplicate;
  }
  if (!Array.isArray(data.items) || !data.items.length) throw new Error('Order requires items');
  for (const it of data.items) {
    if (!Number.isFinite(it.price) || it.price < 0 || !Number.isInteger((it as { quantity?: number }).quantity || 1) || ((it as { quantity?: number }).quantity || 1) < 1) throw new Error('Invalid order item');
  }
  for (const amount of [data.subtotal, data.taxAmount, data.total]) if (!Number.isFinite(amount) || amount < 0) throw new Error('Invalid order amount');
  if (!supabaseServer && data.sessionId) {
    const required = new Map<string, number>();
    for (const it of data.items) if (!(it as { isAddon?: boolean }).isAddon) required.set(it.id, (required.get(it.id) || 0) + ((it as { quantity?: number }).quantity || 1));
    const menu = await getMenuItems();
    for (const [id, qty] of required) { const item = menu.find(i => i.id === id); if (!item?.isAvailable || (item.stock ?? 10) < qty) throw new Error('Insufficient stock'); }
  }
  const now = data.createdAt ? Number(data.createdAt) : Date.now();

  // Calculate next sequential oz-anassa order number (starts strictly from oz-anassa-1)
  let maxSeq = globalStore.__anassa_counter || 0;
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

  const nextSeq = maxSeq + 1;
  globalStore.__anassa_counter = nextSeq;
  const orderNumber = `oz-anassa-${nextSeq}`;
  const orderId = randomUUID();

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
      const instructionsForDb = orderInstructionsWithMetadata(newOrder);

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

      const { data: saved, error } = await supabaseServer.rpc('place_order', {
        payload: { ...fullInsertPayload, idempotency_key: newOrder.idempotencyKey || null },
      }).throwOnError();
      if (error) throw error;
      invalidateCache('orders');
      invalidateCache('menu');
      const confirmed = mapOrderRow(saved);
      broadcastOrder(confirmed);
      await addAuditLog({ actor: 'customer', action: 'ORDER_CREATED', details: 'Order #' + confirmed.orderNumber + ' saved' });
      return confirmed;
    } catch (err) {
      console.warn('Supabase createOrder failed:', err);

      throw err;
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
  status?: OrderStatus | 'active' | 'customer';
  tableNumber?: number | string;
  sessionId?: string;
  knownIds?: string[];
  phone?: string;
  limit?: number;
}): Promise<Order[]> {
  assertStorageConfigured();
  const filterKey = filter ? JSON.stringify(filter) : 'all';
  const cacheKey = `orders_${filterKey}`;

  return fetchWithCache(
    cacheKey,
    async () => {


      if (isSupabaseConfigured && supabaseServer) {
        try {
          let query = supabaseServer.from('orders').select('*').order('created_at', { ascending: false });
          if (filter?.status === 'active') {
            query = query.in('status', ['received', 'preparing', 'ready', 'served']);
          } else if (filter?.status && filter.status !== 'customer') {
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
          const { data, error } = await query.throwOnError();
          if (!error && data) {
            const recentServedCutoff = Date.now() - 45 * 60 * 1000;
            const rawOrders: Order[] = data.map(mapOrderRow);

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

            return normalizeAndSyncOrders(filtered).filter(o => filter?.status !== 'customer' || ['received', 'preparing', 'ready'].includes(o.status) || !o.isPaid && o.status === 'served' || Date.now() - o.updatedAt < 86400000);
          }
        } catch (err) {
          console.warn('Supabase getOrders failed:', err);

      throw err;
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
      } else if (filter?.status && filter.status !== 'customer') {
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
      }
      if (filter?.tableNumber !== undefined) {
        list = list.filter((o) => isSameTable(o.tableNumber, filter.tableNumber));
      }
      if (filter?.limit) {
        list = list.slice(0, filter.limit);
      }
      return list.filter(o => filter?.status !== 'customer' || ['received', 'preparing', 'ready'].includes(o.status) || !o.isPaid && o.status === 'served' || Date.now() - o.updatedAt < 86400000);
    },
    0,
    ['orders']
  );
}

export async function getOrderById(orderId: string): Promise<Order | null> {
  assertStorageConfigured();
  if (supabaseServer) {
    const { data, error } = await supabaseServer.from('orders').select('*').eq('id', orderId).maybeSingle().throwOnError();
    if (error) throw error;
    return data ? mapOrderRow(data) : null;
  }
  return globalStore.__anassa_orders?.find(o => o.id === orderId) || null;
}

export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order | null> {
  assertStorageConfigured();
  return updateOrderDetails(orderId, { status }, 'kitchen');
}

export async function deleteOrder(orderId: string, actor: 'admin' | 'kitchen' = 'admin', permanent = false): Promise<boolean> {
  assertStorageConfigured();
  const order = await getOrderById(orderId);
  if (!order) return false;
  if (!permanent) {
    const updated = await updateOrderDetails(orderId, { status: 'cancelled', isDeleted: true, deletedBy: actor, deletedAt: Date.now() }, actor);
    return updated !== null;
  }
  if (supabaseServer) {
    const { data, error } = await supabaseServer.from('orders').delete().eq('id', orderId).select('id').throwOnError();
    if (error) throw error;
    if (!data?.length) return false;
  }
  globalStore.__anassa_orders = (globalStore.__anassa_orders || []).filter(o => o.id !== orderId);
  saveStoreToDisk();
  invalidateCache('orders');
  broadcastOrder({ ...order, status: 'cancelled', isDeleted: true });
  await addAuditLog({ actor, action: 'ORDER_PURGED', details: 'Order #' + order.orderNumber + ' permanently deleted' });
  return true;
}

function orderInstructionsWithMetadata(order: Order): string {
  const notes = (order.specialInstructions || '').replace(/\[(?:SETTLED|DELETED_BY_)[^\]]*\]/g, '').trim();
  const markers = [notes];
  if (order.isPaid) markers.push('[SETTLED:' + (order.paidAt || order.updatedAt) + ':' + (order.settledBy || 'Staff').replace(/[\[\]:]/g, '') + ']');
  if (order.isDeleted) markers.push('[DELETED_BY_' + (order.deletedBy || 'admin').toUpperCase() + ']');
  return markers.filter(Boolean).join(' ');
}

export async function updateOrderDetails(orderId: string, updates: Partial<Order>, actor: 'admin' | 'kitchen' = 'admin', staffName?: string): Promise<Order | null> {
  assertStorageConfigured();
  const current = await getOrderById(orderId);
  if (!current) return null;
  const columns: Record<string, string> = { orderNumber: 'order_number', tableNumber: 'table_number', customerName: 'customer_name', customerPhone: 'customer_phone', customerFlat: 'customer_flat', items: 'items', subtotal: 'subtotal', taxAmount: 'tax_amount', total: 'total', specialInstructions: 'special_instructions', status: 'status', isPaid: 'is_paid', paidAt: 'paid_at', settledBy: 'settled_by', createdAt: 'created_at', isDeleted: 'is_deleted', deletedBy: 'deleted_by', deletedAt: 'deleted_at' };
  const safeUpdates = Object.fromEntries(Object.entries(updates).filter(([k]) => k in columns)) as Partial<Order>;
  if (safeUpdates.status && !['received', 'preparing', 'ready', 'served', 'cancelled'].includes(safeUpdates.status)) throw new Error('Invalid order status');
  for (const key of ['subtotal', 'taxAmount', 'total'] as const) {
    if (safeUpdates[key] !== undefined && (!Number.isFinite(safeUpdates[key]) || safeUpdates[key]! < 0)) throw new Error('Invalid receipt amount');
  }
  if (safeUpdates.items && (!Array.isArray(safeUpdates.items) || !safeUpdates.items.length || safeUpdates.items.some(i => !Number.isInteger(i.quantity) || i.quantity < 1 || !Number.isFinite(i.price) || i.price < 0))) throw new Error('Invalid receipt items');
  if (safeUpdates.isPaid && current.isPaid) {
    safeUpdates.paidAt = current.paidAt;
    safeUpdates.settledBy = current.settledBy;
  }
  let updated: Order = { ...current, ...safeUpdates, updatedAt: Date.now() };
  if (supabaseServer) {
    const dbUpdates: Record<string, unknown> = { updated_at: new Date(updated.updatedAt).toISOString() };
    for (const [key, value] of Object.entries(safeUpdates)) {
      dbUpdates[columns[key]] = ['createdAt', 'paidAt', 'deletedAt'].includes(key) ? (value ? new Date(Number(value)).toISOString() : null) : key === 'tableNumber' ? String(value) : value;
    }
    // Receipt edits must not erase persisted legacy payment/deletion markers.
    if ('specialInstructions' in safeUpdates) dbUpdates.special_instructions = orderInstructionsWithMetadata(updated);
    let { data, error } = await supabaseServer.from('orders').update(dbUpdates).eq('id', orderId).select().maybeSingle();
    // Older installations store these flags in special_instructions. Only retry
    // a missing-column rejection (the original UPDATE did not execute), never
    // a timeout or authorization failure with an uncertain outcome.
    const metadataColumns = ['is_deleted', 'deleted_by', 'deleted_at', 'is_paid', 'paid_at', 'settled_by'];
    if (error && ['42703', 'PGRST204'].includes(error.code)
      && metadataColumns.some(column => column in dbUpdates && error!.message.includes(column))) {
      for (const column of metadataColumns) delete dbUpdates[column];
      dbUpdates.special_instructions = orderInstructionsWithMetadata(updated);
      ({ data, error } = await supabaseServer.from('orders').update(dbUpdates).eq('id', orderId).select().maybeSingle());
    }
    if (error) throw error;
    if (!data) return null;
    updated = mapOrderRow(data);
  }
  globalStore.__anassa_orders = [updated, ...(globalStore.__anassa_orders || []).filter(o => o.id !== orderId)];
  saveStoreToDisk();
  invalidateCache('orders');
  broadcastOrder(updated);
  await addAuditLog({ actor, action: updates.isDeleted ? 'ORDER_DELETED' : updates.isPaid ? 'BILL_SETTLED' : updates.status ? 'ORDER_STATUS_CHANGED' : 'RECEIPT_EDITED', details: 'Order #' + updated.orderNumber + ' updated by ' + (staffName || actor) });
  return updated;
}

// ──────────────────────────────────────────
// TABLES & QR VALIDATION
// ──────────────────────────────────────────
export async function getTables(includeSecrets: boolean = false): Promise<TableSession[]> {
  assertStorageConfigured();
  const cacheKey = includeSecrets ? 'tables_with_secrets' : 'tables_public';
  return fetchWithCache(
    cacheKey,
    async () => {
      if (isSupabaseConfigured && supabaseServer) {
        try {
          const { data, error } = await supabaseServer
            .from('tables')
            .select('*')
            .order('table_number', { ascending: true }).throwOnError();
          if (!error && data) {
            const loaded: TableSession[] = data.map((t) => ({
              tableNumber: t.table_number,
              label: t.label,
              secretKey: t.secret_key,
              isActive: t.is_active ?? true,
            }));
            globalStore.__anassa_tables = loaded;
          }
        } catch (err) {
          console.warn('Supabase getTables failed:', err);

      throw err;
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
  assertStorageConfigured();
  const tNum = parseInt(String(tableNumber));
  const tables = await getTables(true);
  return tables.find((t) => t.tableNumber === tNum) || null;
}

export async function validateTable(tableNumber: number | string, key?: string): Promise<{ valid: boolean; isVerified: boolean; label: string }> {
  assertStorageConfigured();
  const tNum = parseInt(String(tableNumber));
  if (tNum === 0 || String(tableNumber).toLowerCase() === 'takeaway') {
    return { valid: true, isVerified: true, label: 'Takeaway Counter' };
  }

  const tables = await getTables(true);
  const table = tables.find((t) => t.tableNumber === tNum);
  if (!table || !table.isActive) {
    return { valid: false, isVerified: false, label: `Table ${tableNumber}` };
  }

  const isKeyMatch = Boolean(key && table.secretKey && table.secretKey === key);
  return { valid: true, isVerified: isKeyMatch, label: table.label };
}

export async function ensureTablesCount(numTables: number): Promise<TableSession[]> {
  assertStorageConfigured();
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
      ).throwOnError();
      await supabaseServer.from('tables').delete().gt('table_number', safeCount).throwOnError();
    } catch (err) {
      console.warn('Supabase ensureTablesCount upsert error:', err);

      throw err;
    }
  }

  addAuditLog({
    actor: 'admin',
    action: 'TABLES_CONFIGURED',
    details: `Configured table capacity to ${numTables} tables`,
  });
  invalidateCache('tables');
  saveStoreToDisk();
  return updatedTables;
}

// ──────────────────────────────────────────
// CAFE SETTINGS
// ──────────────────────────────────────────
export async function getCafeSettings(): Promise<CafeSettings> {
  assertStorageConfigured();
  return fetchWithCache(
    'cafe_settings_main',
    async () => {
      if (isSupabaseConfigured && supabaseServer) {
        try {
          const { data, error } = await supabaseServer
            .from('cafe_settings')
            .select('value')
            .eq('key', 'main_config')
            .maybeSingle().throwOnError();

          if (!error && data?.value) {
            const loaded: CafeSettings = {
              ...initialSettings,
              ...data.value,
            };
            globalStore.__anassa_settings = loaded;
            return loaded;
          }
        } catch (err) {
          console.warn('Supabase getCafeSettings failed:', err);

      throw err;
    }
      }
      return globalStore.__anassa_settings || initialSettings;
    },
    30,
    ['settings']
  );
}

export async function updateCafeSettings(updates: Partial<CafeSettings>): Promise<CafeSettings> {
  assertStorageConfigured();
  let merged = { ...await getCafeSettings(), ...updates };
  if (supabaseServer) {
    const { data, error } = await supabaseServer.rpc('patch_cafe_config', { config_key: 'main_config', defaults: initialSettings, patch: updates });
    if (error) throw error;
    merged = data;
  }
  globalStore.__anassa_settings = merged;
  invalidateCache('settings'); saveStoreToDisk();
  await addAuditLog({ actor: 'admin', action: 'SETTINGS_UPDATED', details: 'Updated settings: ' + Object.keys(updates).join(', ') });
  return merged;
}

export async function resetCafeSettings(): Promise<CafeSettings> {
  assertStorageConfigured();
  invalidateCache('settings');
  globalStore.__anassa_settings = { ...initialSettings };

  if (isSupabaseConfigured && supabaseServer) {
    try {
      await supabaseServer.from('cafe_settings').upsert({
        key: 'main_config',
        value: initialSettings,
        updated_at: new Date().toISOString(),
      }).throwOnError();
    } catch (err) {
      console.warn('Supabase resetCafeSettings error:', err);

      throw err;
    }
  }

  addAuditLog({
    actor: 'admin',
    action: 'SETTINGS_RESET',
    details: 'All cafe settings reset to factory defaults',
  });

  saveStoreToDisk();
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
  assertStorageConfigured();
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
      }).throwOnError();
    } catch (err) {
      console.warn('Supabase addAuditLog failed:', err);
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
  assertStorageConfigured();
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

      const { data, error } = await query.throwOnError();
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
      console.warn('Supabase getAuditLogs failed:', err);

      throw err;
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
  assertStorageConfigured();
  const ordersCount = globalStore.__anassa_orders?.length || 0;
  const logsCount = globalStore.__anassa_audit_logs?.length || 0;

  if (isSupabaseConfigured && supabaseServer) {
    try {
      // 1. Delete all orders from Supabase using multiple delete filters for total reliability
      await supabaseServer.from('orders').delete().neq('id', '').throwOnError();

      // 2. Delete all audit logs from Supabase
      await supabaseServer.from('audit_logs').delete().neq('id', '').throwOnError();
    } catch (err) {
      console.warn('Supabase purgeAllOrdersAndLogs error:', err);

      throw err;
    }
  }

  globalStore.__anassa_orders = [];
  globalStore.__anassa_audit_logs = [];
  globalStore.__anassa_inventory = [...initialInventory];
  globalStore.__anassa_staff = [...initialStaff];
  invalidateCache('orders');
  invalidateCache('audit');

  saveStoreToDisk();
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
  assertStorageConfigured();
  globalStore.__anassa_categories = [...initialCategories];
  globalStore.__anassa_items = [...initialMenuItems];
  globalStore.__anassa_addons = [...initialAddons];

  const catCount = initialCategories.length;
  const itemCount = initialMenuItems.length;

  if (isSupabaseConfigured && supabaseServer) {
    try {
      // Upsert categories
      await supabaseServer.from('categories').upsert(initialCategories.map(cat => ({
          id: cat.id,
          title: cat.title,
          subtitle: cat.subtitle,
          emoji: cat.emoji,
          hero_label: cat.heroLabel,
          icon_svg: cat.iconSvg,
          sort_order: cat.sortOrder,
          is_active: true,
        }))).throwOnError();

      // Upsert menu items
      await supabaseServer.from('menu_items').upsert(initialMenuItems.map(it => ({
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
        }))).throwOnError();

      addAuditLog({
        actor: 'admin',
        action: 'MENU_ITEM_UPDATED',
        details: `Synchronized ${itemCount} PDF menu dishes and ${catCount} categories with database.`,
      });
    } catch (err) {
      console.warn('Supabase syncMenuToDatabase error:', err);

      throw err;
    }
  }

  invalidateCache('menu'); invalidateCache('stock'); saveStoreToDisk();
  return { success: true, categoriesCount: catCount, itemsCount: itemCount };
}

// ──────────────────────────────────────────
// INVENTORY MANAGEMENT
// ──────────────────────────────────────────
export async function getInventory(): Promise<InventoryItem[]> {
  assertStorageConfigured();
  if (supabaseServer) {
    const { data, error } = await supabaseServer.from('cafe_settings').select('key,value').like('key', 'inventory:%');
    if (error) throw error;
    return initialInventory.map(i => data?.find(row => row.key === 'inventory:' + i.id)?.value || i);
  }
  return globalStore.__anassa_inventory || initialInventory;
}

export async function restockInventoryItem(id: string, amount: number): Promise<InventoryItem | null> {
  assertStorageConfigured();
  const items = structuredClone(await getInventory());
  const item = items.find((i) => i.id === id);
  if (!item) return null;

  item.currentStock = Math.max(0, Number((item.currentStock + amount).toFixed(2)));
  item.lastRestocked = Date.now();
  item.status = item.currentStock <= 0 
    ? 'out_of_stock' 
    : item.currentStock <= item.minThreshold 
      ? 'low_stock' 
      : 'in_stock';

  await persistConfigEntry('inventory:' + id, item);
  globalStore.__anassa_inventory = items; saveStoreToDisk();
  addAuditLog({
    actor: 'admin',
    action: 'STOCK_TOGGLED',
    details: `Restocked ${item.name}: +${amount} ${item.unit} (Current: ${item.currentStock} ${item.unit})`,
  });

  return item;
}

export async function updateInventoryItem(id: string, updates: Partial<InventoryItem>): Promise<InventoryItem | null> {
  assertStorageConfigured();
  const items = structuredClone(await getInventory());
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

  await persistConfigEntry('inventory:' + id, updated);
  items[index] = updated;
  globalStore.__anassa_inventory = items; saveStoreToDisk();
  return updated;
}

// ──────────────────────────────────────────
// STAFF SCHEDULE & SHIFTS
// ──────────────────────────────────────────
export async function getStaffSchedule(): Promise<StaffShift[]> {
  assertStorageConfigured();
  if (supabaseServer) {
    const { data, error } = await supabaseServer.from('cafe_settings').select('key,value').like('key', 'shift:%');
    if (error) throw error;
    return initialStaff.map(i => data?.find(row => row.key === 'shift:' + i.id)?.value || i);
  }
  return globalStore.__anassa_staff || initialStaff;
}

export async function updateStaffStatus(id: string, status: 'on_duty' | 'break' | 'off_duty'): Promise<StaffShift | null> {
  assertStorageConfigured();
  const roster = structuredClone(await getStaffSchedule());
  const staff = roster.find((s) => s.id === id);
  if (!staff) return null;

  staff.status = status;
  await persistConfigEntry('shift:' + id, staff);
  globalStore.__anassa_staff = roster; saveStoreToDisk();
  addAuditLog({
    actor: 'admin',
    action: 'SETTINGS_UPDATED',
    details: `Staff status updated: ${staff.name} is now ${status.replace('_', ' ').toUpperCase()} (${staff.station})`,
  });

  return staff;
}



// A single database-to-domain mapping is used for reads and mutation responses.
interface OrderRow {
  id: string; order_number: string; table_number: string; table_key?: string; session_id?: string; idempotency_key?: string;
  customer_name: string; customer_phone: string; customer_flat?: string; items: Order['items'];
  subtotal: number | string; tax_amount: number | string; total: number | string; special_instructions?: string;
  status: OrderStatus; is_paid?: boolean; paid_at?: string; settled_by?: string; is_deleted?: boolean; deleted_by?: string; deleted_at?: string;
  customer_lat?: string | number; customer_lng?: string | number; distance_meters?: string | number; created_at: string; updated_at: string;
}
function mapOrderRow(row: OrderRow): Order {
  const instructions = row.special_instructions || '';
  const settled = instructions.match(/\[SETTLED:(\d+):([^\]]+)\]/);
  const deleted = instructions.match(/\[DELETED_BY_([^\]]+)\]/);
  return {
    id: row.id, orderNumber: row.order_number, tableNumber: row.table_number,
    tableKey: row.table_key, sessionId: row.session_id, idempotencyKey: row.idempotency_key,
    customerName: row.customer_name, customerPhone: row.customer_phone, customerFlat: row.customer_flat,
    items: row.items || [], subtotal: Number(row.subtotal ?? row.total), taxAmount: Number(row.tax_amount ?? 0), total: Number(row.total),
    specialInstructions: instructions.replace(/\[(?:SETTLED|DELETED_BY_)[^\]]*\]/g, '').trim(),
    status: row.status, isPaid: Boolean(row.is_paid || settled),
    paidAt: row.paid_at ? Date.parse(row.paid_at) : settled ? Number(settled[1]) : undefined,
    settledBy: row.settled_by || settled?.[2], isDeleted: Boolean(row.is_deleted || deleted),
    deletedBy: row.deleted_by || deleted?.[1]?.toLowerCase(), deletedAt: row.deleted_at ? Date.parse(row.deleted_at) : deleted ? Date.parse(row.updated_at) : undefined,
    customerLat: row.customer_lat == null ? undefined : Number(row.customer_lat), customerLng: row.customer_lng == null ? undefined : Number(row.customer_lng),
    distanceMeters: row.distance_meters == null ? undefined : Number(row.distance_meters),
    createdAt: Date.parse(row.created_at), updatedAt: Date.parse(row.updated_at),
  };
}

export async function createOrder(data: Parameters<typeof createOrderUnlocked>[0]): Promise<Order> {
  if (supabaseServer) return createOrderUnlocked(data);
  const write = (globalStore.__anassa_local_write || Promise.resolve()).then(() => createOrderUnlocked(data));
  globalStore.__anassa_local_write = write.catch(() => {});
  return write;
}

async function persistConfigEntry(key: string, value: InventoryItem | StaffShift): Promise<void> {
  if (supabaseServer) { const { error } = await supabaseServer.from('cafe_settings').upsert({ key, value, updated_at: new Date().toISOString() }); if (error) throw error; }
}
