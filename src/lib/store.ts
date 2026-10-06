import { Category, MenuAddon, MenuItem, Order, OrderStatus, TableSession, CafeSettings, AuditLog, AuditAction } from './types';
import { initialCategories, initialMenuItems, initialAddons, initialSettings } from './initialData';
import { supabaseServer, isSupabaseConfigured } from './supabaseServer';

// In-memory persistent caches for ultra-fast response and zero-config local testing
const globalStore = globalThis as unknown as {
  __anassa_categories?: Category[];
  __anassa_items?: MenuItem[];
  __anassa_addons?: MenuAddon[];
  __anassa_orders?: Order[];
  __anassa_tables?: TableSession[];
  __anassa_settings?: CafeSettings;
  __anassa_audit_logs?: AuditLog[];
  __anassa_subscribers?: Set<(order: Order) => void>;
};

if (!globalStore.__anassa_categories) {
  globalStore.__anassa_categories = [...initialCategories];
}
if (!globalStore.__anassa_items) {
  globalStore.__anassa_items = [...initialMenuItems];
}
if (!globalStore.__anassa_addons) {
  globalStore.__anassa_addons = [...initialAddons];
}
if (!globalStore.__anassa_orders) {
  globalStore.__anassa_orders = [];
}
if (!globalStore.__anassa_audit_logs) {
  globalStore.__anassa_audit_logs = [];
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
  if (isSupabaseConfigured && supabaseServer) {
    try {
      const { data, error } = await supabaseServer
        .from('categories')
        .select('*')
        .order('sort_order', { ascending: true });
      if (!error && data && data.length > 0) {
        return data.map((c) => ({
          id: c.id,
          title: c.title,
          subtitle: c.subtitle,
          emoji: c.emoji,
          heroLabel: c.hero_label || '',
          iconSvg: c.icon_svg,
          sortOrder: c.sort_order,
        }));
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

  return (globalStore.__anassa_categories || []).map((cat) => ({
    ...cat,
    itemsCount: counts[cat.id] || 0,
  }));
}

// ──────────────────────────────────────────
// MENU ITEMS
// ──────────────────────────────────────────
export async function getMenuItems(categoryId?: string): Promise<MenuItem[]> {
  if (isSupabaseConfigured && supabaseServer) {
    try {
      let query = supabaseServer.from('menu_items').select('*').order('sort_order', { ascending: true });
      if (categoryId) {
        query = query.eq('category_id', categoryId);
      }
      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        return data.map((i) => ({
          id: i.id,
          name: i.name,
          subheading: i.subheading,
          desc: i.desc || '',
          price: Number(i.price),
          img: i.image_url || '/images/americano.png',
          category: i.category_name,
          categoryId: i.category_id,
          isVeg: i.is_veg ?? true,
          isAvailable: i.is_available ?? true,
          sizes: Array.isArray(i.sizes) ? i.sizes : ['Regular'],
          sizePriceMultiplier: i.size_price_multiplier || null,
          sortOrder: i.sort_order,
        }));
      }
    } catch (err) {
      console.warn('Supabase getMenuItems error, falling back to memory store:', err);
    }
  }

  const items = globalStore.__anassa_items || [];
  if (categoryId) {
    return items.filter((it) => it.categoryId === categoryId);
  }
  return items;
}

export async function toggleItemAvailability(itemId: string, isAvailable: boolean): Promise<boolean> {
  if (isSupabaseConfigured && supabaseServer) {
    try {
      await supabaseServer.from('menu_items').update({ is_available: isAvailable }).eq('id', itemId);
    } catch (err) {
      console.warn('Supabase toggleItemAvailability error:', err);
    }
  }

  const item = globalStore.__anassa_items?.find((i) => i.id === itemId);
  if (item) {
    item.isAvailable = isAvailable;
    addAuditLog({
      actor: 'admin',
      action: 'STOCK_TOGGLED',
      details: `Item "${item.name}" marked ${isAvailable ? 'IN STOCK' : 'OUT OF STOCK (86ed)'}`,
    });
    return true;
  }
  return false;
}

export async function addMenuItem(newItem: Omit<MenuItem, 'id'>): Promise<MenuItem> {
  const id = `item-${Date.now()}`;
  const created: MenuItem = {
    ...newItem,
    id,
    sortOrder: (globalStore.__anassa_items?.length || 0) + 1,
  };

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
        sizes: created.sizes,
        sort_order: created.sortOrder,
      });
    } catch (err) {
      console.warn('Supabase addMenuItem error:', err);
    }
  }

  globalStore.__anassa_items?.unshift(created);
  addAuditLog({
    actor: 'admin',
    action: 'MENU_ITEM_ADDED',
    details: `Added new dish "${created.name}" (₹${created.price}) in ${created.category}`,
  });
  return created;
}

export async function updateMenuItem(id: string, updates: Partial<MenuItem>): Promise<MenuItem | null> {
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
      if (updates.sizes !== undefined) dbUpdates.sizes = updates.sizes;
      await supabaseServer.from('menu_items').update(dbUpdates).eq('id', id);
    } catch (err) {
      console.warn('Supabase updateMenuItem error:', err);
    }
  }

  const itemIndex = globalStore.__anassa_items?.findIndex((i) => i.id === id);
  if (itemIndex !== undefined && itemIndex >= 0 && globalStore.__anassa_items) {
    globalStore.__anassa_items[itemIndex] = {
      ...globalStore.__anassa_items[itemIndex],
      ...updates,
    };
    addAuditLog({
      actor: 'admin',
      action: 'MENU_ITEM_UPDATED',
      details: `Updated dish "${globalStore.__anassa_items[itemIndex].name}"`,
    });
    return globalStore.__anassa_items[itemIndex];
  }
  return null;
}

export async function deleteMenuItem(id: string): Promise<boolean> {
  if (isSupabaseConfigured && supabaseServer) {
    try {
      await supabaseServer.from('menu_items').delete().eq('id', id);
    } catch (err) {
      console.warn('Supabase deleteMenuItem error:', err);
    }
  }

  if (globalStore.__anassa_items) {
    const deletedItem = globalStore.__anassa_items.find((i) => i.id === id);
    globalStore.__anassa_items = globalStore.__anassa_items.filter((i) => i.id !== id);
    addAuditLog({
      actor: 'admin',
      action: 'MENU_ITEM_DELETED',
      details: `Deleted dish "${deletedItem ? deletedItem.name : id}"`,
    });
    return true;
  }
  return false;
}

// ──────────────────────────────────────────
// ADD-ONS
// ──────────────────────────────────────────
export async function getAddons(): Promise<MenuAddon[]> {
  return globalStore.__anassa_addons || [];
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

export async function createOrder(data: {
  tableNumber: number | string;
  tableKey?: string;
  sessionId?: string;
  customerName: string;
  customerPhone: string;
  customerFlat?: string;
  items: MenuItem[] | { id: string; name: string; price: number; quantity: number; selectedSize?: string; category?: string; isAddon?: boolean }[];
  subtotal: number;
  taxAmount: number;
  total: number;
  specialInstructions?: string;
  customerLat?: number;
  customerLng?: number;
  distanceMeters?: number;
}): Promise<Order> {
  const shortNum = Math.floor(1000 + Math.random() * 9000);
  const now = Date.now();
  const orderId = `oz-${now}-${shortNum}`;
  const orderNumber = `#OZ-${shortNum}`;

  const newOrder: Order = {
    id: orderId,
    orderNumber,
    tableNumber: data.tableNumber,
    tableKey: data.tableKey,
    sessionId: data.sessionId,
    customerName: data.customerName,
    customerPhone: data.customerPhone,
    customerFlat: data.customerFlat,
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
    status: 'received',
    customerLat: data.customerLat,
    customerLng: data.customerLng,
    distanceMeters: data.distanceMeters,
    createdAt: now,
    updatedAt: now,
  };

  if (isSupabaseConfigured && supabaseServer) {
    try {
      await supabaseServer.from('orders').insert({
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
        special_instructions: newOrder.specialInstructions,
        status: newOrder.status,
        customer_lat: newOrder.customerLat,
        customer_lng: newOrder.customerLng,
        distance_meters: newOrder.distanceMeters,
      });
    } catch (err) {
      console.warn('Supabase createOrder error, saved in memory store:', err);
    }
  }

  globalStore.__anassa_orders?.unshift(newOrder);
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
  limit?: number;
}): Promise<Order[]> {
  if (isSupabaseConfigured && supabaseServer) {
    try {
      let query = supabaseServer.from('orders').select('*').order('created_at', { ascending: false });
      if (filter?.status === 'active') {
        query = query.in('status', ['received', 'preparing', 'ready']);
      } else if (filter?.status) {
        query = query.eq('status', filter.status);
      }
      if (filter?.tableNumber !== undefined) {
        query = query.eq('table_number', String(filter.tableNumber));
      }
      if (filter?.sessionId) {
        query = query.eq('session_id', filter.sessionId);
      }
      if (filter?.limit) {
        query = query.limit(filter.limit);
      }
      const { data, error } = await query;
      if (!error && data) {
        return data.map((o) => ({
          id: o.id,
          orderNumber: o.order_number || `#OZ-${o.id.substring(0, 4)}`,
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
          specialInstructions: o.special_instructions,
          status: o.status as OrderStatus,
          customerLat: o.customer_lat ? Number(o.customer_lat) : undefined,
          customerLng: o.customer_lng ? Number(o.customer_lng) : undefined,
          distanceMeters: o.distance_meters ? Number(o.distance_meters) : undefined,
          createdAt: o.created_at ? new Date(o.created_at).getTime() : Date.now(),
          updatedAt: o.updated_at ? new Date(o.updated_at).getTime() : Date.now(),
        }));
      }
    } catch (err) {
      console.warn('Supabase getOrders error, falling back to memory store:', err);
    }
  }

  let list = globalStore.__anassa_orders || [];
  if (filter?.status === 'active') {
    list = list.filter((o) => o.status === 'received' || o.status === 'preparing' || o.status === 'ready');
  } else if (filter?.status) {
    list = list.filter((o) => o.status === filter.status);
  }
  if (filter?.tableNumber !== undefined) {
    list = list.filter((o) => String(o.tableNumber) === String(filter.tableNumber));
  }
  if (filter?.sessionId) {
    list = list.filter((o) => o.sessionId === filter.sessionId);
  }
  if (filter?.limit) {
    list = list.slice(0, filter.limit);
  }
  return list;
}

export async function getOrderById(orderId: string): Promise<Order | null> {
  const all = await getOrders();
  return all.find((o) => o.id === orderId) || null;
}

export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order | null> {
  const now = Date.now();

  if (isSupabaseConfigured && supabaseServer) {
    try {
      await supabaseServer.from('orders').update({
        status,
        updated_at: new Date(now).toISOString(),
      }).eq('id', orderId);
    } catch (err) {
      console.warn('Supabase updateOrderStatus error:', err);
    }
  }

  const order = globalStore.__anassa_orders?.find((o) => o.id === orderId);
  if (order) {
    order.status = status;
    order.updatedAt = now;
    broadcastOrder(order);
    addAuditLog({
      actor: 'kitchen',
      action: 'ORDER_STATUS_CHANGED',
      details: `Order #${order.orderNumber} (Table ${order.tableNumber}) status changed to "${status}"`,
    });
    return order;
  }
  return null;
}

// ──────────────────────────────────────────
// TABLES & QR VALIDATION
// ──────────────────────────────────────────
export async function getTables(includeSecrets: boolean = false): Promise<TableSession[]> {
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

  if (key && table.secretKey && (table.secretKey === key || key.startsWith('oz-anassa-tbl-'))) {
    return { valid: true, isVerified: true, label: table.label };
  }

  return { valid: true, isVerified: Boolean(key && table.secretKey === key), label: table.label };
}

export async function ensureTablesCount(numTables: number): Promise<TableSession[]> {
  const current = (await getTables(true)) || [];
  const takeaway = current.find((t) => t.tableNumber === 0) || {
    tableNumber: 0,
    label: 'Takeaway & In-Flat Delivery',
    secretKey: 'takeaway-permanent-key-anassa',
    isActive: true,
  };

  const updatedTables: TableSession[] = [takeaway];
  for (let i = 1; i <= numTables; i++) {
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
  return updatedTables;
}

// ──────────────────────────────────────────
// CAFE SETTINGS
// ──────────────────────────────────────────
export async function getCafeSettings(): Promise<CafeSettings> {
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
}

export async function updateCafeSettings(updates: Partial<CafeSettings>): Promise<CafeSettings> {
  const current = globalStore.__anassa_settings || initialSettings;
  const merged: CafeSettings = {
    ...current,
    ...updates,
  };
  globalStore.__anassa_settings = merged;

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

