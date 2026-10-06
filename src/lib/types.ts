export type OrderStatus = 'received' | 'preparing' | 'ready' | 'served' | 'cancelled';

export interface MenuItem {
  id: string;
  name: string;
  subheading?: string;
  desc: string;
  price: number;
  img: string;
  category: string;
  categoryId: string;
  isVeg: boolean;
  isAvailable: boolean;
  sizes: string[];
  sizePriceMultiplier?: Record<string, number> | null;
  sortOrder?: number;
}

export interface Category {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  heroLabel: string;
  iconSvg?: string;
  sortOrder: number;
  itemsCount?: number;
}

export interface MenuAddon {
  id: string;
  name: string;
  price: number;
  icon: string;
  tag: string;
  isAvailable: boolean;
}

export interface CartItem {
  id: string;
  cartKey: string;
  name: string;
  price: number;
  quantity: number;
  selectedSize?: string;
  category: string;
  isAddon?: boolean;
  icon?: string;
}

export interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  selectedSize?: string;
  category?: string;
  isAddon?: boolean;
}

export interface Order {
  id: string;
  orderNumber: string;
  tableNumber: number | string;
  tableKey?: string;
  sessionId?: string; // Cryptographic session ID for customer isolation
  customerName: string;
  customerPhone: string;
  customerFlat?: string;
  items: OrderItem[];
  subtotal: number;
  taxAmount: number;
  total: number;
  specialInstructions?: string;
  status: OrderStatus;
  customerLat?: number;
  customerLng?: number;
  distanceMeters?: number;
  createdAt: number; // Unix timestamp ms
  updatedAt: number;
}

export interface TableSession {
  tableNumber: number;
  label: string;
  secretKey: string;
  isActive: boolean;
}

export interface CafeSettings {
  // ── 1. Store Identity & Status ──
  cafeName: string;
  tagline: string;
  address: string;
  contactPhone?: string;
  currencySymbol: string;
  gstPercent: number;
  isOpen: boolean;
  closedMessage?: string;
  adminPin: string;
  kitchenPin?: string;

  // ── 2. Geofencing & Anti-Prank Security Guard ──
  geofencingEnabled: boolean;
  cafeLatitude: number;
  cafeLongitude: number;
  geofenceRadiusMeters: number;
  allowTakeawayWithoutGeofence?: boolean;
  geofenceDevMode?: boolean; // When true: log distance & audit, but don't reject (testing)
  geofenceTestBypassCode?: string; // Secret code for bypass during QA / remote testing

  // ── 3. Table QR & Session Security ──
  tableKeyValidationStrict?: boolean; // When true: require valid QR key for table orders
  tableSessionTimeoutMinutes?: number; // Inactivity timeout in minutes (default 120)
  urlCleansingEnabled?: boolean; // Scrub ?key=... from address bar immediately
  sessionIsolationEnabled?: boolean; // Customer only sees their session orders

  // ── 4. Customer Ordering Experience ──
  requireCustomerPhone?: boolean; // Default true
  requireCustomerName?: boolean; // Default true
  allowCustomerFlatInput?: boolean; // Default true (for Anassa apartments)
  minOrderAmount?: number; // Minimum subtotal (default 0)
  maxItemsPerOrder?: number; // Max items limit (default 25)
  orderCooldownSeconds?: number; // Prevent spam/accidental clicks (default 10)

  // ── 5. Kitchen Display & KDS Timing ──
  kitchenSoundEnabled: boolean;
  autoAcceptOrders?: boolean; // Auto move 'received' -> 'preparing'
  warningTimeMinutes?: number; // KDS yellow highlight threshold (default 10)
  dangerTimeMinutes?: number; // KDS red highlight threshold (default 15)
  allowOrderCancellation?: boolean; // Kitchen reject button enabled (default true)
}

export type AuditAction = 
  | 'AUTH_ADMIN_SUCCESS'
  | 'AUTH_ADMIN_FAILED'
  | 'AUTH_KITCHEN_SUCCESS'
  | 'AUTH_KITCHEN_FAILED'
  | 'AUTH_LOGOUT'
  | 'ORDER_CREATED'
  | 'ORDER_STATUS_CHANGED'
  | 'ORDER_REJECTED'
  | 'GEOFENCE_FAILED'
  | 'STOCK_TOGGLED'
  | 'MENU_ITEM_ADDED'
  | 'MENU_ITEM_UPDATED'
  | 'MENU_ITEM_DELETED'
  | 'TABLES_CONFIGURED'
  | 'SETTINGS_UPDATED'
  | 'SETTINGS_RESET';

export interface AuditLog {
  id: string;
  timestamp: number; // Unix ms
  actor: 'customer' | 'kitchen' | 'admin' | 'system';
  action: AuditAction;
  details: string;
  ipAddress?: string;
  userAgent?: string;
}
