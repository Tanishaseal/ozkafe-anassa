'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { MenuItem, Category, Order, CafeSettings, AuditLog, StaffShift, OrderStatus, StaffUser } from '@/lib/types';
import StaffAuthModal from '@/components/StaffAuthModal';
import AccountPanel from '@/components/AccountPanel';

// ── CURRENCY FORMATTER ──
const formatCurrency = (val: number): string => {
  if (val === undefined || val === null || isNaN(val)) return '0';
  return Number.isInteger(val) ? val.toLocaleString('en-IN') : val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// ── TIME ELAPSED HELPER ──
const getElapsedMinutes = (timestamp: number): number => {
  return Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
};

export default function AdminPage() {
  // ── AUTHENTICATION & THEME STATES ──
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<StaffUser | null>(null);
  const [isAccountPanelOpen, setIsAccountPanelOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // ── NAVIGATION & LAYOUT STATES ──
  // Sections: Dashboard (Home), Live Orders, Menu Management (with Food Inventories), Staff Schedule, Analytics + Settings, Tables, Logs
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'live-orders' | 'menu' | 'staff' | 'analytics' | 'settings' | 'tables' | 'logs'
  >('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // ── HEADER ACTION DROPDOWNS & MODALS ──
  const [globalSearch, setGlobalSearch] = useState('');
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [selectedReceiptOrder, setSelectedReceiptOrder] = useState<Order | null>(null);

  // Quick Add Modal States
  const [quickAddModalType, setQuickAddModalType] = useState<'item' | 'manual-order' | null>(null);

  // Database Wipe Modal States (Live Launch)
  const [isWipeModalOpen, setIsWipeModalOpen] = useState(false);
  const [wipePinConfirm, setWipePinConfirm] = useState('');
  const [isWiping, setIsWiping] = useState(false);

  // ── CAFE DATA STATES ──
  const [stats, setStats] = useState<{
    todayRevenue: number;
    todayOrderCount: number;
    totalOrders: number;
    activeOrderCount: number;
    todayCustomersCount: number;
    popularItems: { name: string; count: number; revenue: number }[];
  }>({
    todayRevenue: 0,
    todayOrderCount: 0,
    totalOrders: 0,
    activeOrderCount: 0,
    todayCustomersCount: 0,
    popularItems: [],
  });

  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [staff, setStaff] = useState<StaffShift[]>([]);
  const [tablesList, setTablesList] = useState<{ tableNumber: number; label: string; secretKey: string; isActive: boolean }[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [dbStatus, setDbStatus] = useState<{ isConfigured: boolean; provider: string } | null>(null);

  const [settings, setSettings] = useState<CafeSettings>({
    cafeName: 'OZKAFE',
    tagline: 'At Anassa · Kolkata',
    address: 'Beside JW Marriott, EM Bypass, Kolkata · 100% Pure Veg',
    contactPhone: '+91 98300 00000',
    currencySymbol: '₹',
    gstPercent: 5,
    isOpen: true,
    closedMessage: 'Our kitchen is currently closed. We reopen fresh tomorrow morning at 10:00 AM!',
    adminPin: '1234',
    kitchenPin: '1234',
    geofencingEnabled: false,
    cafeLatitude: 22.5448,
    cafeLongitude: 88.4000,
    geofenceRadiusMeters: 150,
    allowTakeawayWithoutGeofence: false,
    geofenceDevMode: false,
    geofenceTestBypassCode: 'ANASSA-DEV-PASS',
    tableKeyValidationStrict: true,
    tableSessionTimeoutMinutes: 120,
    urlCleansingEnabled: true,
    sessionIsolationEnabled: true,
    requireCustomerPhone: true,
    requireCustomerName: true,
    allowCustomerFlatInput: true,
    minOrderAmount: 0,
    maxItemsPerOrder: 25,
    orderCooldownSeconds: 10,
    kitchenSoundEnabled: true,
    autoAcceptOrders: false,
    warningTimeMinutes: 10,
    dangerTimeMinutes: 15,
    allowOrderCancellation: true,
  });

  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  // ── FILTER STATES ──
  const [menuSearch, setMenuSearch] = useState('');
  const [menuCatFilter, setMenuCatFilter] = useState('all');
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [orderMonthFilter, setOrderMonthFilter] = useState('all');
  const [auditActorFilter, setAuditActorFilter] = useState('all');

  // Edit Menu Item Form
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);

  // Edit Receipt / Order Form State
  const [editingReceiptOrder, setEditingReceiptOrder] = useState<Order | null>(null);
  const [editOrderNumber, setEditOrderNumber] = useState('');
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editCustomerPhone, setEditCustomerPhone] = useState('');
  const [editCustomerFlat, setEditCustomerFlat] = useState('');
  const [editTableNumber, setEditTableNumber] = useState('Takeaway');
  const [editDateTime, setEditDateTime] = useState('');
  const [editItems, setEditItems] = useState<{ id: string; name: string; price: number; quantity: number; selectedSize?: string }[]>([]);
  const [editNotes, setEditNotes] = useState('');
  const [editAddItemId, setEditAddItemId] = useState('');

  // New Menu Item Form
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('Hot Coffee');
  const [formCategoryId, setFormCategoryId] = useState('hot-coffee');
  const [formSubheading, setFormSubheading] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formImg, setFormImg] = useState('/images/americano.png');
  const [formIsVeg, setFormIsVeg] = useState(true);
  const [formSizes, setFormSizes] = useState('Regular');
  const [formStock, setFormStock] = useState(10);

  // Custom / Manual Order Form State
  const [manualTable, setManualTable] = useState('Takeaway');
  const [manualGuest, setManualGuest] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualFlat, setManualFlat] = useState('');
  const [manualSelectedItemId, setManualSelectedItemId] = useState('');
  const [manualQuantity, setManualQuantity] = useState(1);
  const [manualSelectedSize, setManualSelectedSize] = useState('Regular');
  const [manualDateTime, setManualDateTime] = useState('');
  const [manualInstructions, setManualInstructions] = useState('');

  const getNowLocalDateTimeString = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const openCustomOrderModal = () => {
    setIsQuickAddOpen(false);
    setManualDateTime(getNowLocalDateTimeString());
    setManualQuantity(1);
    setQuickAddModalType('manual-order');
  };

  // ── THEME INITIALIZATION ──
  useEffect(() => {
    const savedTheme = localStorage.getItem('ozkafe_admin_theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
    }
    const savedSidebar = localStorage.getItem('ozkafe_admin_sidebar_collapsed');
    if (savedSidebar === 'true') {
      setIsSidebarCollapsed(true);
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    localStorage.setItem('ozkafe_admin_theme', nextTheme);
  };

  const toggleSidebarCollapse = () => {
    const nextState = !isSidebarCollapsed;
    setIsSidebarCollapsed(nextState);
    localStorage.setItem('ozkafe_admin_sidebar_collapsed', String(nextState));
  };

  // ── DATA FETCHING ──
  const fetchAdminData = useCallback(async () => {
    try {
      const [adminRes, menuRes, ordersRes] = await Promise.all([
        fetch('/api/admin'),
        fetch('/api/menu'),
        fetch('/api/orders?all=true'),
      ]);

      if (adminRes.status === 401) {
        setIsAuthenticated(false);
        return;
      }

      if (adminRes.ok) {
        setIsAuthenticated(true);
        const adminData = await adminRes.json();
        if (adminData.stats) setStats(adminData.stats);
        if (adminData.settings) setSettings(adminData.settings);
        if (adminData.staff) setStaff(adminData.staff);
        if (adminData.database) setDbStatus(adminData.database);
      }

      if (menuRes.ok) {
        const menuData = await menuRes.json();
        if (menuData.categories) setCategories(menuData.categories);
        if (menuData.items) setMenuItems(menuData.items);
      }

      if (ordersRes.ok) {
        const ordersData = await ordersRes.json();
        if (Array.isArray(ordersData)) {
          setOrders(ordersData);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch admin data:', err);
    }
  }, []);

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch('/api/audit-logs');
      if (res.ok) {
        const data = await res.json();
        if (data.logs) setAuditLogs(data.logs);
      }
    } catch (err) {
      console.warn('Failed to fetch audit logs:', err);
    }
  };

  const fetchTables = async () => {
    try {
      const res = await fetch('/api/tables');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setTablesList(data);
      }
    } catch (err) {
      console.warn('Failed to fetch tables:', err);
    }
  };

  useEffect(() => {
    fetchAdminData();
    const interval = setInterval(fetchAdminData, 12000);
    return () => clearInterval(interval);
  }, [fetchAdminData]);

  useEffect(() => {
    if (activeTab === 'logs') fetchAuditLogs();
    if (activeTab === 'tables') fetchTables();
  }, [activeTab]);

  // Check persistent admin session on mount (do NOT lock on refresh!)
  useEffect(() => {
    fetch(`/api/admin/auth?_t=${Date.now()}`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated && data.staff) {
            setIsAuthenticated(true);
            setCurrentUser(data.staff);
            if (data.staff.preferences?.theme) {
              setTheme(data.staff.preferences.theme);
            }
          }
        }
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    if (!confirm('Lock Admin session and sign out?')) return;
    try {
      localStorage.removeItem('anassa_admin_session');
      await fetch('/api/admin/auth', { method: 'DELETE' });
    } finally {
      setIsAuthenticated(false);
      setCurrentUser(null);
      setIsAccountPanelOpen(false);
    }
  };

  // ── STOCK TOGGLES & MENU CRUD ──
  const handleToggleStock = async (itemId: string, currentAvailable: boolean) => {
    const nextAvailable = !currentAvailable;
    const currentItem = menuItems.find((i) => i.id === itemId);
    const nextStock = nextAvailable && (currentItem?.stock ?? 0) <= 0 ? 10 : (currentItem?.stock ?? 10);

    setMenuItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, isAvailable: nextAvailable, stock: nextStock } : it))
    );

    try {
      const res = await fetch('/api/menu', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: itemId, isAvailable: nextAvailable, stock: nextStock }),
      });
      if (res.status === 401) {
        setIsAuthenticated(false);
      }
    } catch {
      fetchAdminData();
    }
  };

  const handleAdjustStock = async (itemId: string, newStock: number) => {
    const finalStock = Math.max(0, Math.floor(newStock));
    const isAvailable = finalStock > 0;

    // Optimistically update item in state
    setMenuItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, stock: finalStock, isAvailable } : it))
    );

    try {
      const res = await fetch('/api/menu', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: itemId, stock: finalStock, isAvailable }),
      });
      if (!res.ok) {
        fetchAdminData();
      }
    } catch {
      fetchAdminData();
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('Are you sure you want to delete this menu dish?')) return;
    setMenuItems((prev) => prev.filter((it) => it.id !== itemId));
    try {
      await fetch(`/api/menu?id=${itemId}`, { method: 'DELETE' });
    } catch {
      fetchAdminData();
    }
  };

  const handleSaveNewItem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const sizesArray = formSizes.split(',').map((s) => s.trim()).filter(Boolean);
      const res = await fetch('/api/menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          category: formCategory,
          categoryId: formCategoryId,
          subheading: formSubheading,
          price: Number(formPrice),
          desc: formDesc,
          img: formImg,
          isVeg: formIsVeg,
          stock: formStock,
          sizes: sizesArray.length > 0 ? sizesArray : ['Regular'],
        }),
      });

      if (res.ok) {
        setQuickAddModalType(null);
        setFormName('');
        setFormPrice('');
        setFormDesc('');
        setFormSubheading('');
        setFormStock(10);
        fetchAdminData();
        setSaveSuccessMsg('✓ New menu item created and published live!');
        setTimeout(() => setSaveSuccessMsg(''), 4000);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to save menu dish');
      }
    } catch {
      alert('Network error while saving dish');
    }
  };

  const handleSaveEditItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    try {
      const res = await fetch('/api/menu', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingItem),
      });

      if (res.ok) {
        setEditingItem(null);
        fetchAdminData();
        setSaveSuccessMsg('✓ Menu dish updated successfully!');
        setTimeout(() => setSaveSuccessMsg(''), 4000);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to update dish');
      }
    } catch {
      alert('Network error while updating dish');
    }
  };

  // ── ORDER STATUS TRANSITIONS (KITCHEN & FLOOR) ──
  const handleUpdateOrderStatus = async (orderId: string, nextStatus: OrderStatus) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus, updatedAt: Date.now() } : o))
    );

    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orderId, status: nextStatus }),
      });
      if (res.ok) {
        fetchAdminData();
      }
    } catch {
      fetchAdminData();
    }
  };

  // ── STAFF SHIFT STATUS TOGGLE ──
  const handleStaffStatusToggle = async (staffId: string, newStatus: 'on_duty' | 'break' | 'off_duty') => {
    setStaff((prev) =>
      prev.map((s) => (s.id === staffId ? { ...s, status: newStatus } : s))
    );

    try {
      await fetch('/api/admin?action=update_staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: staffId, status: newStatus }),
      });
    } catch {
      fetchAdminData();
    }
  };

  // ── CUSTOM / MANUAL COUNTER ORDER CREATION ──
  const handleManualOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const item = menuItems.find((m) => m.id === manualSelectedItemId);
    if (!item) {
      alert('Please select a dish for the custom order');
      return;
    }

    try {
      const qty = Math.max(1, Number(manualQuantity) || 1);
      const subtotal = item.price * qty;
      const gstRate = settings.gstPercent !== undefined ? settings.gstPercent : 5;
      const taxAmount = Math.round((subtotal * gstRate) / 100);
      const total = subtotal + taxAmount;
      const customCreatedAt = manualDateTime ? new Date(manualDateTime).getTime() : Date.now();

      const res = await fetch('/api/admin?action=manual_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableNumber: manualTable,
          customerName: manualGuest.trim() || 'Counter Guest',
          customerPhone: manualPhone.trim() || '9830000000',
          customerFlat: manualFlat.trim() || undefined,
          items: [{ 
            id: item.id, 
            name: item.name, 
            price: item.price, 
            quantity: qty, 
            selectedSize: manualSelectedSize || item.sizes?.[0] || 'Regular',
            category: item.category 
          }],
          subtotal,
          taxAmount,
          total,
          specialInstructions: manualInstructions.trim() || 'Custom Order placed from Admin Console',
          createdAt: customCreatedAt,
        }),
      });

      if (res.ok) {
        setQuickAddModalType(null);
        setManualGuest('');
        setManualPhone('');
        setManualFlat('');
        setManualQuantity(1);
        setManualInstructions('');
        fetchAdminData();
        setSaveSuccessMsg('✓ Custom order created and dispatched successfully!');
        setTimeout(() => setSaveSuccessMsg(''), 4000);
      } else {
        alert('Failed to dispatch order. Please check connection.');
      }
    } catch {
      alert('Failed to create custom order');
    }
  };

  // ── EDIT RECEIPT / ORDER HANDLERS ──
  const handleOpenEditReceipt = (ord: Order) => {
    setEditingReceiptOrder(ord);
    setEditOrderNumber(ord.orderNumber);
    setEditCustomerName(ord.customerName || '');
    setEditCustomerPhone(ord.customerPhone || '');
    setEditCustomerFlat(ord.customerFlat || '');
    setEditTableNumber(String(ord.tableNumber));
    
    const d = new Date(ord.createdAt);
    const pad = (n: number) => String(n).padStart(2, '0');
    setEditDateTime(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
    
    setEditItems(ord.items.map(it => ({
      id: it.id,
      name: it.name,
      price: Number(it.price) || 0,
      quantity: Number(it.quantity) || 1,
      selectedSize: it.selectedSize || 'Regular',
    })));
    setEditNotes(ord.specialInstructions || '');
    setEditAddItemId('');
  };

  const handleUpdateItemQty = (index: number, delta: number) => {
    setEditItems((prev) => {
      const updated = [...prev];
      const newQty = Math.max(1, (updated[index].quantity || 1) + delta);
      updated[index] = { ...updated[index], quantity: newQty };
      return updated;
    });
  };

  const handleUpdateItemPrice = (index: number, newPrice: number) => {
    setEditItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], price: Math.max(0, newPrice) };
      return updated;
    });
  };

  const handleRemoveDishFromEditReceipt = (index: number) => {
    setEditItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddDishToEditReceipt = () => {
    if (!editAddItemId) return;
    const item = menuItems.find((m) => m.id === editAddItemId);
    if (!item) return;
    setEditItems((prev) => [
      ...prev,
      {
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: 1,
        selectedSize: item.sizes?.[0] || 'Regular',
      },
    ]);
    setEditAddItemId('');
  };

  const handleSaveEditReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReceiptOrder) return;
    if (editItems.length === 0) {
      alert('Order must contain at least one item');
      return;
    }

    try {
      const subtotal = editItems.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0);
      const gstRate = settings.gstPercent !== undefined ? settings.gstPercent : 5;
      const taxAmount = Math.round((subtotal * gstRate) / 100);
      const total = subtotal + taxAmount;
      const createdAt = editDateTime ? new Date(editDateTime).getTime() : editingReceiptOrder.createdAt;

      const updates: Partial<Order> = {
        orderNumber: editOrderNumber.trim() || editingReceiptOrder.orderNumber,
        tableNumber: editTableNumber,
        customerName: editCustomerName.trim() || 'Guest',
        customerPhone: editCustomerPhone.trim() || '',
        customerFlat: editCustomerFlat.trim() || undefined,
        items: editItems,
        subtotal,
        taxAmount,
        total,
        specialInstructions: editNotes.trim() || undefined,
        createdAt,
      };

      const res = await fetch('/api/admin?action=edit_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: editingReceiptOrder.id,
          updates,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        setEditingReceiptOrder(null);
        if (selectedReceiptOrder?.id === editingReceiptOrder.id) {
          setSelectedReceiptOrder(json.order || { ...editingReceiptOrder, ...updates });
        }
        fetchAdminData();
        setSaveSuccessMsg(`✓ Receipt for ${editOrderNumber} updated successfully!`);
        setTimeout(() => setSaveSuccessMsg(''), 4000);
      } else {
        alert('Failed to update receipt.');
      }
    } catch {
      alert('Error updating receipt.');
    }
  };

  const handleDeleteOrder = async (ord: Order) => {
    if (!confirm(`Are you sure you want to permanently delete order "${ord.orderNumber}" (₹${ord.total})? This action cannot be undone.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/admin?action=delete_order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: ord.id }),
      });
      if (res.ok) {
        if (selectedReceiptOrder?.id === ord.id) {
          setSelectedReceiptOrder(null);
        }
        fetchAdminData();
        setSaveSuccessMsg(`✓ Order ${ord.orderNumber} deleted successfully.`);
        setTimeout(() => setSaveSuccessMsg(''), 4000);
      } else {
        alert('Failed to delete order.');
      }
    } catch {
      alert('Error connecting to server to delete order.');
    }
  };

  // ── SETTINGS PERSISTENCE ──
  const handleSaveSettings = async (e?: React.FormEvent, customSettings?: CafeSettings) => {
    if (e) e.preventDefault();
    const payload = customSettings || settings;

    try {
      const res = await fetch('/api/admin', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.settings) setSettings(data.settings);
        setSaveSuccessMsg('✓ Settings updated and synced across edge nodes!');
        setTimeout(() => setSaveSuccessMsg(''), 4000);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to save settings');
      }
    } catch {
      alert('Network error while saving settings');
    }
  };

  // ── LIVE LAUNCH DATABASE PURGE (REQUESTED BY USER) ──
  const handlePurgeDatabase = async () => {
    if (wipePinConfirm !== (settings.adminPin || '1234')) {
      alert('Incorrect Admin Master PIN. Verification failed.');
      return;
    }

    setIsWiping(true);
    try {
      const res = await fetch('/api/admin?action=purge_database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (res.ok) {
        setIsWipeModalOpen(false);
        setWipePinConfirm('');
        setOrders([]);
        setStats({
          todayRevenue: 0,
          todayOrderCount: 0,
          totalOrders: 0,
          activeOrderCount: 0,
          todayCustomersCount: 0,
          popularItems: [],
        });
        fetchAdminData();
        setSaveSuccessMsg('✓ All orders, sales stats, and audit records wiped! Ready for Live Launch.');
        setTimeout(() => setSaveSuccessMsg(''), 6000);
      } else {
        alert('Failed to purge database');
      }
    } catch {
      alert('Network error while purging database');
    } finally {
      setIsWiping(false);
    }
  };

  // ── SYNC 76 PDF MENU ITEMS TO SUPABASE ──
  const [isSyncingMenu, setIsSyncingMenu] = useState(false);
  const handleSyncMenu = async () => {
    setIsSyncingMenu(true);
    try {
      const res = await fetch('/api/admin?action=sync_menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        await fetchAdminData();
        setSaveSuccessMsg('✓ All 76 PDF menu items & categories synchronized to database!');
        setTimeout(() => setSaveSuccessMsg(''), 5000);
      } else {
        alert('Failed to sync menu items to database');
      }
    } catch {
      alert('Network error while syncing menu to database');
    } finally {
      setIsSyncingMenu(false);
    }
  };

  // ── CSV EXPORT ──
  const handleExportCSV = () => {
    if (orders.length === 0) {
      alert('No orders in the database to export.');
      return;
    }

    const headers = ['Order Number', 'Date', 'Time', 'Table / Mode', 'Customer Name', 'Phone', 'Flat', 'Items', 'Total (INR)', 'Status'];
    const rows = orders.map((o) => {
      const d = new Date(o.createdAt);
      const itemsList = o.items.map((i) => `${i.name} (x${i.quantity})`).join('; ');
      return [
        o.orderNumber,
        d.toLocaleDateString(),
        d.toLocaleTimeString(),
        o.tableNumber,
        `"${o.customerName.replace(/"/g, '""')}"`,
        o.customerPhone,
        `"${(o.customerFlat || '').replace(/"/g, '""')}"`,
        `"${itemsList.replace(/"/g, '""')}"`,
        o.total,
        o.status,
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `OZKAFE_Ledger_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ── GPS CALIBRATION HELPER (FIXES SCREENSHOT 1) ──
  const handleCalibrateGPS = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your current browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = parseFloat(pos.coords.latitude.toFixed(6));
        const lng = parseFloat(pos.coords.longitude.toFixed(6));
        setSettings((prev) => ({
          ...prev,
          cafeLatitude: lat,
          cafeLongitude: lng,
        }));
        setSaveSuccessMsg(`✓ Geofence calibrated to current GPS: ${lat}, ${lng}`);
        setTimeout(() => setSaveSuccessMsg(''), 4000);
      },
      (err) => {
        alert(`Failed to calibrate GPS: ${err.message}. Please allow location access.`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // ── OPERATIONAL ALERTS CALCULATION ──
  const activeAlerts = useMemo(() => {
    const list: { id: string; type: 'warning' | 'danger' | 'info'; title: string; actionLabel?: string; onAction?: () => void }[] = [];

    // Low stock food/drink alerts (from Menu Management)
    menuItems.forEach((item) => {
      const stock = item.stock ?? 10;
      if (!item.isAvailable || stock === 0) {
        list.push({
          id: `menu-out-${item.id}`,
          type: 'danger',
          title: `Sold Out: ${item.name} (0 items left in kitchen)`,
          actionLabel: 'Manage Stock',
          onAction: () => setActiveTab('menu'),
        });
      } else if (stock <= 3) {
        list.push({
          id: `menu-low-${item.id}`,
          type: 'warning',
          title: `Low Stock: ${item.name} (${stock} items left in kitchen)`,
          actionLabel: 'Manage Stock',
          onAction: () => setActiveTab('menu'),
        });
      }
    });

    // Kitchen delayed orders alert (>15 mins)
    const delayed = orders.filter((o) => ['received', 'preparing'].includes(o.status) && getElapsedMinutes(o.createdAt) > 15);
    if (delayed.length > 0) {
      list.push({
        id: 'delayed-orders',
        type: 'danger',
        title: `${delayed.length} Active order(s) delayed >15m in kitchen (${delayed.map((d) => d.orderNumber).join(', ')})`,
        actionLabel: 'View Live Orders',
        onAction: () => setActiveTab('live-orders'),
      });
    }

    // Staff on break alert
    const staffOnBreak = staff.filter((s) => s.status === 'break');
    if (staffOnBreak.length > 0) {
      list.push({
        id: 'staff-break',
        type: 'info',
        title: `Staff Shift Notice: ${staffOnBreak.map((s) => s.name).join(', ')} currently on break`,
        actionLabel: 'Staff Schedule',
        onAction: () => setActiveTab('staff'),
      });
    }

    return list;
  }, [menuItems, orders, staff]);

  // ── FILTERED DATA LISTS ──
  const filteredMenuItems = useMemo(() => {
    return menuItems.filter((item) => {
      const matchCat = menuCatFilter === 'all' || item.categoryId === menuCatFilter;
      const matchSearch =
        !menuSearch ||
        item.name.toLowerCase().includes(menuSearch.toLowerCase()) ||
        item.desc.toLowerCase().includes(menuSearch.toLowerCase());
      const matchGlobal =
        !globalSearch ||
        item.name.toLowerCase().includes(globalSearch.toLowerCase()) ||
        item.category.toLowerCase().includes(globalSearch.toLowerCase());
      return matchCat && matchSearch && matchGlobal;
    });
  }, [menuItems, menuCatFilter, menuSearch, globalSearch]);

  // Helper to format a month key: "2026-11" -> "November 2026"
  const formatMonthKey = (monthKey: string) => {
    const [year, month] = monthKey.split('-').map(Number);
    const d = new Date(year, month - 1, 1);
    return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  };

  // Available unique months list from orders
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => {
      const d = new Date(o.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      set.add(key);
    });
    return Array.from(set).sort().reverse();
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const d = new Date(order.createdAt);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const matchMonth = orderMonthFilter === 'all' || monthKey === orderMonthFilter;
      const matchStatus = orderStatusFilter === 'all' || order.status === orderStatusFilter;
      const matchSearch =
        !orderSearch ||
        order.orderNumber.toLowerCase().includes(orderSearch.toLowerCase()) ||
        order.customerName.toLowerCase().includes(orderSearch.toLowerCase()) ||
        order.customerPhone.includes(orderSearch) ||
        (order.customerFlat && order.customerFlat.toLowerCase().includes(orderSearch.toLowerCase()));
      const matchGlobal =
        !globalSearch ||
        order.orderNumber.toLowerCase().includes(globalSearch.toLowerCase()) ||
        order.customerName.toLowerCase().includes(globalSearch.toLowerCase()) ||
        order.customerPhone.includes(globalSearch);
      return matchMonth && matchStatus && matchSearch && matchGlobal;
    });
  }, [orders, orderMonthFilter, orderStatusFilter, orderSearch, globalSearch]);

  // Group filtered orders by month for sectional view
  const ordersGroupedByMonth = useMemo(() => {
    const groups: { monthKey: string; monthLabel: string; orders: Order[]; totalRevenue: number }[] = [];
    const map = new Map<string, Order[]>();

    filteredOrders.forEach((o) => {
      const d = new Date(o.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    });

    // Sort months descending (latest first)
    const sortedKeys = Array.from(map.keys()).sort().reverse();
    sortedKeys.forEach((k) => {
      const ords = map.get(k)!;
      const rev = ords.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
      groups.push({
        monthKey: k,
        monthLabel: formatMonthKey(k),
        orders: ords,
        totalRevenue: rev,
      });
    });

    return groups;
  }, [filteredOrders]);

  const filteredStaff = useMemo(() => {
    return staff.filter((s) => {
      const matchGlobal =
        !globalSearch ||
        s.name.toLowerCase().includes(globalSearch.toLowerCase()) ||
        s.role.toLowerCase().includes(globalSearch.toLowerCase()) ||
        s.station.toLowerCase().includes(globalSearch.toLowerCase());
      return matchGlobal;
    });
  }, [staff, globalSearch]);

  // Kanban buckets
  const receivedOrders = useMemo(() => orders.filter((o) => o.status === 'received'), [orders]);
  const preparingOrders = useMemo(() => orders.filter((o) => o.status === 'preparing'), [orders]);
  const readyOrders = useMemo(() => orders.filter((o) => o.status === 'ready'), [orders]);

  // ── PIN AUTHENTICATION GATE ──
  if (!isAuthenticated) {
    return (
      <StaffAuthModal
        isOpen={!isAuthenticated}
        consoleType="admin"
        onAuthenticated={(user) => {
          setCurrentUser(user);
          setIsAuthenticated(true);
          if (user.preferences?.theme) setTheme(user.preferences.theme);
          fetchAdminData();
        }}
      />
    );
  }

  // ── MAIN ADMIN INTERFACE ──
  return (
    <div className={`admin-layout ${theme === 'dark' ? 'admin-theme-dark' : 'admin-theme-light'}`}>
      {/* ── MOBILE BACKDROP ── */}
      {isMobileSidebarOpen && (
        <div className="admin-sidebar-backdrop" onClick={() => setIsMobileSidebarOpen(false)} />
      )}

      {/* ── COLLAPSIBLE LEFT SIDEBAR ── */}
      <aside className={`admin-sidebar ${isSidebarCollapsed ? 'collapsed' : ''} ${isMobileSidebarOpen ? 'mobile-open' : ''}`}>
        {/* Brand Header */}
        <div className="admin-sidebar-header">
          <Link href="/admin" className="admin-brand">
            <div className="admin-brand-icon">OZ</div>
            <div className="admin-brand-text">
              <span className="admin-brand-title">OZKAFE</span>
              <span className="admin-brand-sub">Anassa · Floor</span>
            </div>
          </Link>

          <button
            onClick={toggleSidebarCollapse}
            className="admin-sidebar-collapse-btn"
            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {isSidebarCollapsed ? (
                <polyline points="9 18 15 12 9 6"></polyline>
              ) : (
                <polyline points="15 18 9 12 15 6"></polyline>
              )}
            </svg>
          </button>
        </div>

        {/* Navigation Sections */}
        <nav className="admin-sidebar-nav">
          <div className="admin-nav-category">Operations</div>

          {/* 1. Dashboard (Home) */}
          <button
            onClick={() => { setActiveTab('dashboard'); setIsMobileSidebarOpen(false); }}
            className={`admin-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            title="Dashboard Overview"
          >
            <div className="admin-nav-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="9"></rect>
                <rect x="14" y="3" width="7" height="5"></rect>
                <rect x="14" y="12" width="7" height="9"></rect>
                <rect x="3" y="16" width="7" height="5"></rect>
              </svg>
            </div>
            <span className="admin-nav-label">Dashboard</span>
          </button>

          {/* 2. Live Orders */}
          <button
            onClick={() => { setActiveTab('live-orders'); setIsMobileSidebarOpen(false); }}
            className={`admin-nav-item ${activeTab === 'live-orders' ? 'active' : ''}`}
            title="Live Orders & Kanban"
          >
            <div className="admin-nav-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            </div>
            <span className="admin-nav-label">Live Orders</span>
            {(receivedOrders.length + preparingOrders.length) > 0 && (
              <span className="admin-nav-badge">{receivedOrders.length + preparingOrders.length}</span>
            )}
          </button>

          {/* 3. Menu Management */}
          <button
            onClick={() => { setActiveTab('menu'); setIsMobileSidebarOpen(false); }}
            className={`admin-nav-item ${activeTab === 'menu' ? 'active' : ''}`}
            title="Menu Management"
          >
            <div className="admin-nav-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8h1a4 4 0 0 1 0 8h-1"></path>
                <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path>
                <line x1="6" y1="1" x2="6" y2="4"></line>
                <line x1="10" y1="1" x2="10" y2="4"></line>
                <line x1="14" y1="1" x2="14" y2="4"></line>
              </svg>
            </div>
            <span className="admin-nav-label">Menu Management</span>
            {menuItems.filter((i) => (i.stock ?? 10) <= 3 || !i.isAvailable).length > 0 && (
              <span className="admin-nav-badge matcha">
                {menuItems.filter((i) => (i.stock ?? 10) <= 3 || !i.isAvailable).length} low
              </span>
            )}
          </button>

          {/* 4. Staff Schedule */}
          <button
            onClick={() => { setActiveTab('staff'); setIsMobileSidebarOpen(false); }}
            className={`admin-nav-item ${activeTab === 'staff' ? 'active' : ''}`}
            title="Staff Shift Roster"
          >
            <div className="admin-nav-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
            </div>
            <span className="admin-nav-label">Staff Schedule</span>
          </button>

          {/* 6. Analytics */}
          <button
            onClick={() => { setActiveTab('analytics'); setIsMobileSidebarOpen(false); }}
            className={`admin-nav-item ${activeTab === 'analytics' ? 'active' : ''}`}
            title="Analytics & Financial Ledger"
          >
            <div className="admin-nav-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"></line>
                <line x1="12" y1="20" x2="12" y2="4"></line>
                <line x1="6" y1="20" x2="6" y2="14"></line>
              </svg>
            </div>
            <span className="admin-nav-label">Analytics</span>
          </button>

          <div className="admin-nav-category">Management</div>

          {/* 7. Settings */}
          <button
            onClick={() => { setActiveTab('settings'); setIsMobileSidebarOpen(false); }}
            className={`admin-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            title="Store Branding & Rules"
          >
            <div className="admin-nav-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </div>
            <span className="admin-nav-label">Settings</span>
          </button>

          {/* 8. Tables & QR */}
          <button
            onClick={() => { setActiveTab('tables'); setIsMobileSidebarOpen(false); }}
            className={`admin-nav-item ${activeTab === 'tables' ? 'active' : ''}`}
            title="Tables & QR Codes"
          >
            <div className="admin-nav-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
              </svg>
            </div>
            <span className="admin-nav-label">Tables & QR</span>
          </button>

          {/* 9. Security Audit Logs */}
          <button
            onClick={() => { setActiveTab('logs'); setIsMobileSidebarOpen(false); }}
            className={`admin-nav-item ${activeTab === 'logs' ? 'active' : ''}`}
            title="Security Audit Trail"
          >
            <div className="admin-nav-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
            </div>
            <span className="admin-nav-label">Audit Logs</span>
          </button>
        </nav>

        {/* Sidebar Footer */}
        <div className="admin-sidebar-footer">
          <div className="admin-status-pill">
            <span className={`admin-status-dot ${settings.isOpen ? '' : 'offline'}`} />
            {!isSidebarCollapsed && (
              <span>
                {settings.isOpen ? 'Kitchen Open · Live' : 'Kitchen Closed'}
                {dbStatus?.isConfigured && ' · Supabase'}
              </span>
            )}
          </div>
        </div>
      </aside>

      {/* ── MAIN CONTENT VIEWPORT ── */}
      <div className="admin-main">
        {/* ── TOP HEADER ── */}
        <header className="admin-header">
          {/* Left: Mobile Toggle & Page Title */}
          <div className="admin-header-left">
            <button
              onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
              className="admin-mobile-menu-btn"
              title="Open Navigation"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>

            <div className="admin-header-title-block">
              <h1 className="admin-header-title">
                {activeTab === 'dashboard' && <><span className="title-full">Dashboard Overview</span><span className="title-short">Dashboard</span></>}
                {activeTab === 'live-orders' && <><span className="title-full">Live Orders Feed & KDS</span><span className="title-short">Live Orders</span></>}
                {activeTab === 'menu' && <><span className="title-full">Menu & Stock Control</span><span className="title-short">Menu</span></>}
                {activeTab === 'staff' && <><span className="title-full">Floor & Kitchen Staff</span><span className="title-short">Staff</span></>}
                {activeTab === 'analytics' && <><span className="title-full">Financial Records & Analytics</span><span className="title-short">Analytics</span></>}
                {activeTab === 'settings' && <><span className="title-full">Store Configuration & Geofence</span><span className="title-short">Settings</span></>}
                {activeTab === 'tables' && <><span className="title-full">Table Sessions & QR Keys</span><span className="title-short">Tables</span></>}
                {activeTab === 'logs' && <><span className="title-full">Security Audit Trail</span><span className="title-short">Audit Logs</span></>}
              </h1>
              <span className="admin-header-breadcrumb">
                OZKAFE Floor Console · Anassa EM Bypass
              </span>
            </div>
          </div>

          {/* Center: Global Search Bar */}
          <div className="admin-header-search">
            <span className="admin-search-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </span>
            <input
              type="text"
              placeholder="Search dishes, orders, stock..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              className="admin-search-input"
            />
          </div>

          {/* Right Action Controls */}
          <div className="admin-header-actions">
            {/* Light / Dark Mode Toggle */}
            <button
              onClick={toggleTheme}
              className="admin-icon-btn"
              title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            >
              {theme === 'light' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5"></circle>
                  <line x1="12" y1="1" x2="12" y2="3"></line>
                  <line x1="12" y1="21" x2="12" y2="23"></line>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                  <line x1="1" y1="12" x2="3" y2="12"></line>
                  <line x1="21" y1="12" x2="23" y2="12"></line>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                </svg>
              )}
            </button>

            {/* Notification Bell */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                className="admin-icon-btn"
                title="Operational Alerts"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>
                {activeAlerts.length > 0 && <span className="admin-notification-pulse" />}
              </button>

              {/* Notification Popover (Fixed on mobile to prevent clipping) */}
              {isNotificationsOpen && (
                <>
                  <div className="admin-popover-backdrop" onClick={() => setIsNotificationsOpen(false)} />
                  <div className="admin-notification-popover">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <strong style={{ fontSize: 13, color: 'var(--adm-text-main)' }}>Floor Alerts ({activeAlerts.length})</strong>
                      <button onClick={() => setIsNotificationsOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--adm-text-muted)' }}>✕</button>
                    </div>
                    {activeAlerts.length === 0 ? (
                      <div style={{ fontSize: 12, color: 'var(--adm-text-muted)', padding: '12px 0', textAlign: 'center' }}>
                        All systems operating smoothly. No urgent alerts.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
                        {activeAlerts.map((alt) => (
                          <div key={alt.id} style={{ fontSize: 12, padding: 8, borderRadius: 8, background: 'var(--adm-surface-dim)' }}>
                            <div style={{ fontWeight: 600, color: 'var(--adm-text-main)', marginBottom: 4 }}>{alt.title}</div>
                            {alt.actionLabel && (
                              <button
                                onClick={() => {
                                  setIsNotificationsOpen(false);
                                  alt.onAction?.();
                                }}
                                style={{
                                  padding: '4px 10px',
                                  fontSize: 11,
                                  fontWeight: 700,
                                  borderRadius: 6,
                                  background: 'var(--adm-coffee)',
                                  color: '#fff',
                                  border: 'none',
                                  cursor: 'pointer',
                                }}
                              >
                                {alt.actionLabel}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Quick Add Dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setIsQuickAddOpen(!isQuickAddOpen)}
                className="admin-quick-add-btn"
                title="Quick Add Menu Item or Manual Order"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <span className="quick-add-text">Quick Add</span>
              </button>

              {isQuickAddOpen && (
                <>
                  <div className="admin-popover-backdrop" onClick={() => setIsQuickAddOpen(false)} />
                  <div className="admin-quickadd-popover">
                    <button
                      onClick={() => {
                        setIsQuickAddOpen(false);
                        setQuickAddModalType('item');
                      }}
                      className="admin-nav-item"
                      style={{ padding: '8px 12px', fontSize: 12.5 }}
                    >
                      + New Menu Dish
                    </button>
                    <button
                      onClick={openCustomOrderModal}
                      className="admin-nav-item"
                      style={{ padding: '8px 12px', fontSize: 12.5 }}
                    >
                      + Custom / Counter Order
                    </button>
                  </div>
                </>
              )}
            </div>
            {/* View Customer App */}
            <Link
              href="/"
              target="_blank"
              className="admin-customer-link"
              title="Open customer digital menu in new tab"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              <span>Customer App</span>
            </Link>

            {/* Admin Profile & Account Drawer Button */}
            <div
              className="admin-profile-chip"
              onClick={() => setIsAccountPanelOpen(true)}
              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
              title="Click to view & customize account"
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: currentUser?.avatarColor || '#5C381E',
                  color: '#FFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: 11,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                }}
              >
                {currentUser?.avatarInitials || 'AD'}
              </div>
              <div className="admin-profile-info">
                <span className="admin-profile-name">{currentUser?.name || 'Manager'}</span>
                <span className="admin-profile-role">{currentUser?.badge || 'Anassa Floor'}</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsAccountPanelOpen(true);
                }}
                className="admin-lock-btn"
                title="Account Settings & Lock"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
              </button>
            </div>
          </div>
        </header>

        {/* ── SAVE FEEDBACK TOAST ── */}
        {saveSuccessMsg && (
          <div
            style={{
              background: 'var(--adm-matcha)',
              color: '#FFFFFF',
              padding: '10px 20px',
              textAlign: 'center',
              fontWeight: 700,
              fontSize: 13,
              boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)',
              position: 'relative',
              zIndex: 30,
            }}
          >
            {saveSuccessMsg}
          </div>
        )}

        {/* ── SCROLLABLE BODY VIEW ── */}
        <div className="admin-body">
          {/* ══════════════════════════════════════════
              TAB 1: MAIN DASHBOARD (OVERVIEW SCREEN)
              ══════════════════════════════════════════ */}
          {activeTab === 'dashboard' && (
            <div>
              {/* 1. TOP METRIC CARDS (4 Cards with Subtle Trend Indicators) */}
              <div className="admin-metrics-grid">
                {/* Metric 1: Today's Sales */}
                <div className="admin-metric-card">
                  <div className="admin-metric-top">
                    <span className="admin-metric-label">Today&apos;s Sales</span>
                    <div className="admin-metric-icon-wrap">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="1" x2="12" y2="23"></line>
                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                      </svg>
                    </div>
                  </div>
                  <div className="admin-metric-value">
                    ₹{formatCurrency(stats.todayRevenue)}
                  </div>
                  <div className="admin-metric-bottom">
                    <span className="admin-trend-badge">
                      ↑ +5.4%
                    </span>
                    <span className="admin-metric-subtext">vs yesterday</span>
                  </div>
                </div>

                {/* Metric 2: Active Orders */}
                <div className="admin-metric-card">
                  <div className="admin-metric-top">
                    <span className="admin-metric-label">Active Orders</span>
                    <div className="admin-metric-icon-wrap terracotta">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                      </svg>
                    </div>
                  </div>
                  <div className="admin-metric-value">
                    {stats.activeOrderCount}
                  </div>
                  <div className="admin-metric-bottom">
                    <span className="admin-metric-subtext">
                      {preparingOrders.length} preparing · {readyOrders.length} ready
                    </span>
                  </div>
                </div>

                {/* Metric 3: Total Customers */}
                <div className="admin-metric-card">
                  <div className="admin-metric-top">
                    <span className="admin-metric-label">Total Customers</span>
                    <div className="admin-metric-icon-wrap matcha">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                      </svg>
                    </div>
                  </div>
                  <div className="admin-metric-value">
                    {stats.todayCustomersCount || stats.todayOrderCount}
                  </div>
                  <div className="admin-metric-bottom">
                    <span className="admin-trend-badge">
                      ↑ +8%
                    </span>
                    <span className="admin-metric-subtext">unique guests today</span>
                  </div>
                </div>

                {/* Metric 4: Top Selling Item */}
                <div className="admin-metric-card">
                  <div className="admin-metric-top">
                    <span className="admin-metric-label">Top Selling Item</span>
                    <div className="admin-metric-icon-wrap amber">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                      </svg>
                    </div>
                  </div>
                  <div className="admin-metric-value" style={{ fontSize: '1.35rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {stats.popularItems[0]?.name || (stats.todayOrderCount === 0 ? 'Ready for launch' : 'Classic Americano')}
                  </div>
                  <div className="admin-metric-bottom">
                    <span className="admin-metric-subtext">
                      {stats.popularItems[0]?.count ? `${stats.popularItems[0].count} orders served` : '0 live orders'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. OPERATIONAL ALERTS SECTION */}
              {activeAlerts.length > 0 && (
                <div className="admin-alerts-container">
                  {activeAlerts.slice(0, 3).map((alt) => (
                    <div key={alt.id} className={`admin-alert-banner ${alt.type}`}>
                      <div className="admin-alert-left">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"></circle>
                          <line x1="12" y1="8" x2="12" y2="12"></line>
                          <line x1="12" y1="16" x2="12.01" y2="16"></line>
                        </svg>
                        <span>{alt.title}</span>
                      </div>
                      {alt.actionLabel && (
                        <button onClick={alt.onAction} className="admin-alert-action-btn">
                          {alt.actionLabel}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 3. LIVE ORDER FEED: KANBAN BOARD */}
              <div className="admin-section-header">
                <h2 className="admin-section-title">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                    <line x1="8" y1="21" x2="16" y2="21"></line>
                    <line x1="12" y1="17" x2="12" y2="21"></line>
                  </svg>
                  <span>Live Floor Orders Feed</span>
                </h2>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => setActiveTab('live-orders')}
                    className="admin-alert-action-btn"
                  >
                    View All Orders ({orders.length}) →
                  </button>
                </div>
              </div>

              <div className="admin-kanban-grid">
                {/* Column 1: Incoming / Received */}
                <div className="admin-kanban-column">
                  <div className="admin-column-header">
                    <span className="admin-column-title">
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--adm-amber)', display: 'inline-block' }} />
                      Incoming
                    </span>
                    <span className="admin-column-pill">{receivedOrders.length}</span>
                  </div>

                  <div className="admin-order-cards-list">
                    {receivedOrders.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--adm-text-muted)', fontSize: 13 }}>
                        No incoming orders
                      </div>
                    ) : (
                      receivedOrders.map((ord) => {
                        const elapsed = getElapsedMinutes(ord.createdAt);
                        const isDelayed = elapsed >= (settings.dangerTimeMinutes || 15);
                        const isWarning = elapsed >= (settings.warningTimeMinutes || 10);
                        return (
                          <div key={ord.id} className="admin-order-card">
                            <div className="admin-order-top">
                              <span className="admin-order-num">{ord.orderNumber}</span>
                              <span className="admin-order-table-badge">Table {ord.tableNumber}</span>
                              <span className={`admin-order-timer ${isDelayed ? 'danger' : isWarning ? 'warning' : ''}`}>
                                ⏱ {elapsed}m
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--adm-text-muted)', margin: '4px 0 6px 0' }}>
                              <span>📅 {new Date(ord.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                              <span>•</span>
                              <span>⏰ {new Date(ord.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>

                            <div className="admin-order-customer">
                              <strong>{ord.customerName}</strong> ({ord.customerPhone})
                              {ord.customerFlat && ` · Flat ${ord.customerFlat}`}
                            </div>

                            <div className="admin-order-items-preview">
                              {ord.items.map((it, idx) => (
                                <div key={idx} className="admin-order-item-row">
                                  <span>{it.quantity}x {it.name} ({it.selectedSize || 'Regular'})</span>
                                  <strong>₹{it.price * it.quantity}</strong>
                                </div>
                              ))}
                            </div>

                            <div className="admin-order-card-actions">
                              <button
                                onClick={() => handleUpdateOrderStatus(ord.id, 'preparing')}
                                className="admin-btn-action accept"
                                title="Accept order into preparing"
                              >
                                Accept & Prepare
                              </button>
                              <button
                                onClick={() => setSelectedReceiptOrder(ord)}
                                className="admin-btn-action receipt"
                                title="Print thermal receipt"
                              >
                                🖨
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Column 2: In Kitchen / Preparing */}
                <div className="admin-kanban-column">
                  <div className="admin-column-header">
                    <span className="admin-column-title">
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--adm-terracotta)', display: 'inline-block' }} />
                      Preparing
                    </span>
                    <span className="admin-column-pill">{preparingOrders.length}</span>
                  </div>

                  <div className="admin-order-cards-list">
                    {preparingOrders.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--adm-text-muted)', fontSize: 13 }}>
                        No orders currently preparing
                      </div>
                    ) : (
                      preparingOrders.map((ord) => {
                        const elapsed = getElapsedMinutes(ord.createdAt);
                        const isDelayed = elapsed >= (settings.dangerTimeMinutes || 15);
                        const isWarning = elapsed >= (settings.warningTimeMinutes || 10);
                        return (
                          <div key={ord.id} className="admin-order-card">
                            <div className="admin-order-top">
                              <span className="admin-order-num">{ord.orderNumber}</span>
                              <span className="admin-order-table-badge">Table {ord.tableNumber}</span>
                              <span className={`admin-order-timer ${isDelayed ? 'danger' : isWarning ? 'warning' : ''}`}>
                                ⏱ {elapsed}m
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--adm-text-muted)', margin: '4px 0 6px 0' }}>
                              <span>📅 {new Date(ord.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                              <span>•</span>
                              <span>⏰ {new Date(ord.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>

                            <div className="admin-order-customer">
                              <strong>{ord.customerName}</strong> ({ord.customerPhone})
                            </div>

                            <div className="admin-order-items-preview">
                              {ord.items.map((it, idx) => (
                                <div key={idx} className="admin-order-item-row">
                                  <span>{it.quantity}x {it.name}</span>
                                  <strong>₹{it.price * it.quantity}</strong>
                                </div>
                              ))}
                            </div>

                            <div className="admin-order-card-actions">
                              <button
                                onClick={() => handleUpdateOrderStatus(ord.id, 'ready')}
                                className="admin-btn-action ready"
                                title="Mark ready for pickup / table service"
                              >
                                Mark Ready
                              </button>
                              <button
                                onClick={() => setSelectedReceiptOrder(ord)}
                                className="admin-btn-action receipt"
                                title="Print thermal receipt"
                              >
                                🖨
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Column 3: Ready for Floor Pickup / Dine-In */}
                <div className="admin-kanban-column">
                  <div className="admin-column-header">
                    <span className="admin-column-title">
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--adm-matcha)', display: 'inline-block' }} />
                      Ready to Serve
                    </span>
                    <span className="admin-column-pill">{readyOrders.length}</span>
                  </div>

                  <div className="admin-order-cards-list">
                    {readyOrders.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--adm-text-muted)', fontSize: 13 }}>
                        No orders waiting for pickup
                      </div>
                    ) : (
                      readyOrders.map((ord) => {
                        return (
                          <div key={ord.id} className="admin-order-card">
                            <div className="admin-order-top">
                              <span className="admin-order-num">{ord.orderNumber}</span>
                              <span className="admin-order-table-badge">Table {ord.tableNumber}</span>
                              <span className="admin-status-badge green">Ready</span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--adm-text-muted)', margin: '4px 0 6px 0' }}>
                              <span>📅 {new Date(ord.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                              <span>•</span>
                              <span>⏰ {new Date(ord.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>

                            <div className="admin-order-customer">
                              <strong>{ord.customerName}</strong> ({ord.customerPhone})
                              {ord.customerFlat && ` · Flat ${ord.customerFlat}`}
                            </div>

                            <div className="admin-order-items-preview">
                              {ord.items.map((it, idx) => (
                                <div key={idx} className="admin-order-item-row">
                                  <span>{it.quantity}x {it.name}</span>
                                  <strong>₹{it.price * it.quantity}</strong>
                                </div>
                              ))}
                            </div>

                            <div className="admin-order-card-actions">
                              <button
                                onClick={() => handleUpdateOrderStatus(ord.id, 'served')}
                                className="admin-btn-action complete"
                                title="Mark served and close order"
                              >
                                Complete / Served
                              </button>
                              <button
                                onClick={() => setSelectedReceiptOrder(ord)}
                                className="admin-btn-action receipt"
                                title="Print thermal receipt"
                              >
                                🖨
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════
              TAB 2: DEDICATED LIVE ORDERS & LEDGER
              ══════════════════════════════════════════ */}
          {activeTab === 'live-orders' && (
            <div>
              <div className="admin-card">
                <div className="admin-table-toolbar">
                  <div className="admin-table-filters" style={{ flexWrap: 'wrap', gap: 8 }}>
                    <input
                      type="text"
                      placeholder="Search order #, customer phone, flat..."
                      value={orderSearch}
                      onChange={(e) => setOrderSearch(e.target.value)}
                      className="admin-form-input"
                      style={{ minWidth: 220 }}
                    />

                    {/* Monthly Filter */}
                    <select
                      value={orderMonthFilter}
                      onChange={(e) => setOrderMonthFilter(e.target.value)}
                      className="admin-form-select"
                      style={{ fontWeight: 600 }}
                    >
                      <option value="all">📅 All Months ({orders.length} orders)</option>
                      {availableMonths.map((mKey) => {
                        const count = orders.filter((o) => {
                          const d = new Date(o.createdAt);
                          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === mKey;
                        }).length;
                        return (
                          <option key={mKey} value={mKey}>
                            {formatMonthKey(mKey)} ({count})
                          </option>
                        );
                      })}
                    </select>

                    <select
                      value={orderStatusFilter}
                      onChange={(e) => setOrderStatusFilter(e.target.value)}
                      className="admin-form-select"
                    >
                      <option value="all">All Statuses</option>
                      <option value="received">Received</option>
                      <option value="preparing">Preparing</option>
                      <option value="ready">Ready</option>
                      <option value="served">Served</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>

                  <div className="admin-table-actions">
                    <button
                      onClick={openCustomOrderModal}
                      className="admin-btn-primary admin-btn-prominent"
                      title="Create a custom or manual counter order with custom date and time"
                    >
                      + Custom Order
                    </button>
                    <div className="admin-table-actions-row">
                      <button onClick={handleExportCSV} className="admin-btn-gps-calibrate">
                        📥 Export CSV
                      </button>
                      <button
                        onClick={() => setIsWipeModalOpen(true)}
                        className="admin-wipe-btn"
                        style={{ height: 40, fontSize: 13, padding: '0 12px', justifyContent: 'center' }}
                        title="Clear all test orders and sales history to start afresh"
                      >
                        🗑 Clear All Data
                      </button>
                    </div>
                  </div>
                </div>

                {/* Quick Month Filter Pills if multiple months exist */}
                {availableMonths.length > 1 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '0 18px 12px', borderBottom: '1px solid var(--adm-border)' }}>
                    <button
                      onClick={() => setOrderMonthFilter('all')}
                      className={`admin-alert-action-btn`}
                      style={{
                        height: 30,
                        padding: '0 12px',
                        fontSize: 12,
                        fontWeight: 700,
                        borderRadius: 20,
                        background: orderMonthFilter === 'all' ? 'var(--adm-terracotta, #8E402A)' : 'transparent',
                        color: orderMonthFilter === 'all' ? '#fff' : 'var(--adm-text-main)',
                        borderColor: orderMonthFilter === 'all' ? 'var(--adm-terracotta)' : 'var(--adm-border)',
                      }}
                    >
                      All Months ({orders.length})
                    </button>
                    {availableMonths.map((mKey) => {
                      const count = orders.filter((o) => {
                        const d = new Date(o.createdAt);
                        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === mKey;
                      }).length;
                      const isActive = orderMonthFilter === mKey;
                      return (
                        <button
                          key={mKey}
                          onClick={() => setOrderMonthFilter(mKey)}
                          className={`admin-alert-action-btn`}
                          style={{
                            height: 30,
                            padding: '0 12px',
                            fontSize: 12,
                            fontWeight: 700,
                            borderRadius: 20,
                            background: isActive ? 'var(--adm-terracotta, #8E402A)' : 'transparent',
                            color: isActive ? '#fff' : 'var(--adm-text-main)',
                            borderColor: isActive ? 'var(--adm-terracotta)' : 'var(--adm-border)',
                          }}
                        >
                          {formatMonthKey(mKey)} ({count})
                        </button>
                      );
                    })}
                  </div>
                )}

                {filteredOrders.length === 0 ? (
                  <div className="admin-empty-card">
                    <div className="admin-empty-icon">📋</div>
                    <h3 className="admin-empty-title">No Orders in Live Feed</h3>
                    <p className="admin-empty-desc">
                      Customer dining and takeaway orders will appear here automatically in real time as guests place them.
                    </p>
                    <button
                      onClick={openCustomOrderModal}
                      className="admin-btn-primary"
                      style={{ padding: '0 24px', height: 42, fontSize: 13.5 }}
                    >
                      + Create Custom / Counter Order
                    </button>
                  </div>
                ) : (
                  <div className="admin-table-container">
                    {ordersGroupedByMonth.map((group) => (
                      <div key={group.monthKey} style={{ marginBottom: 24 }}>
                        {/* Monthly Section Header */}
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '10px 16px',
                            background: 'var(--adm-bg-surface-2, #F8F5EE)',
                            borderTop: '1px solid var(--adm-border)',
                            borderBottom: '1px solid var(--adm-border)',
                            fontWeight: 700,
                            fontSize: 13,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 15 }}>🗓️</span>
                            <span style={{ color: 'var(--adm-text-main, #292524)', fontWeight: 800 }}>{group.monthLabel}</span>
                            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--adm-text-muted)' }}>
                              ({group.orders.length} order{group.orders.length === 1 ? '' : 's'})
                            </span>
                          </div>
                          <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--adm-terracotta, #8E402A)' }}>
                            Monthly Sales: ₹{group.totalRevenue.toFixed(2)}
                          </div>
                        </div>

                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Order #</th>
                              <th>Date</th>
                              <th>Time</th>
                              <th>Table</th>
                              <th>Customer</th>
                              <th>Items Summary</th>
                              <th>Total</th>
                              <th>Status</th>
                              <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.orders.map((ord) => (
                              <tr key={ord.id}>
                                <td><strong style={{ letterSpacing: '0.02em', color: 'var(--adm-terracotta)' }}>{ord.orderNumber}</strong></td>
                                <td style={{ fontSize: 12.5, fontWeight: 600, color: '#1C1917', whiteSpace: 'nowrap' }}>
                                  {new Date(ord.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </td>
                                <td style={{ fontSize: 12, color: '#57534E', whiteSpace: 'nowrap' }}>
                                  {new Date(ord.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                </td>
                                <td>
                                  <span className="admin-order-table-badge">
                                    {ord.tableNumber === 0 || ord.tableNumber === 'Takeaway' || ord.tableNumber === '0' ? 'Takeaway' : `Table ${ord.tableNumber}`}
                                  </span>
                                </td>
                                <td>
                                  <div><strong>{ord.customerName}</strong></div>
                                  <div style={{ fontSize: 11, color: 'var(--adm-text-muted)' }}>
                                    {ord.customerPhone} {ord.customerFlat && `· Flat ${ord.customerFlat}`}
                                  </div>
                                </td>
                                <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {ord.items.map((it) => `${it.quantity}x ${it.name}`).join(', ')}
                                </td>
                                <td><strong>₹{ord.total}</strong></td>
                                <td>
                                  <span className={`admin-status-badge ${
                                    ord.status === 'served' ? 'green' :
                                    ord.status === 'preparing' ? 'amber' :
                                    ord.status === 'ready' ? 'green' :
                                    ord.status === 'cancelled' ? 'red' : 'amber'
                                  }`}>
                                    {ord.status.toUpperCase()}
                                  </span>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                                    {ord.status === 'received' && (
                                      <button
                                        onClick={() => handleUpdateOrderStatus(ord.id, 'preparing')}
                                        className="admin-btn-action accept"
                                        style={{ height: 30, padding: '0 8px', fontSize: 11 }}
                                      >
                                        Accept
                                      </button>
                                    )}
                                    {ord.status === 'preparing' && (
                                      <button
                                        onClick={() => handleUpdateOrderStatus(ord.id, 'ready')}
                                        className="admin-btn-action ready"
                                        style={{ height: 30, padding: '0 8px', fontSize: 11 }}
                                      >
                                        Ready
                                      </button>
                                    )}
                                    {ord.status === 'ready' && (
                                      <button
                                        onClick={() => handleUpdateOrderStatus(ord.id, 'served')}
                                        className="admin-btn-action complete"
                                        style={{ height: 30, padding: '0 8px', fontSize: 11 }}
                                      >
                                        Served
                                      </button>
                                    )}
                                    <button
                                      onClick={() => setSelectedReceiptOrder(ord)}
                                      className="admin-alert-action-btn"
                                      title="View / Print Receipt"
                                      style={{ height: 30, padding: '0 8px', fontSize: 11.5, fontWeight: 600 }}
                                    >
                                      Receipt
                                    </button>
                                    <button
                                      onClick={() => handleOpenEditReceipt(ord)}
                                      className="admin-alert-action-btn"
                                      title="Edit Order and Receipt"
                                      style={{ height: 30, padding: '0 8px', fontSize: 11.5, fontWeight: 600, color: 'var(--adm-terracotta)' }}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => handleDeleteOrder(ord)}
                                      className="admin-wipe-btn"
                                      title="Delete Order Permanently"
                                      style={{ height: 30, padding: '0 8px', fontSize: 11.5, fontWeight: 600 }}
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════
              TAB 3: MENU & STOCK MANAGEMENT
              ══════════════════════════════════════════ */}
          {activeTab === 'menu' && (
            <div>
              <div className="admin-card">
                <div className="admin-table-toolbar">
                  <div className="admin-table-filters">
                    <input
                      type="text"
                      placeholder="Search menu dishes..."
                      value={menuSearch}
                      onChange={(e) => setMenuSearch(e.target.value)}
                      className="admin-form-input"
                    />
                    <select
                      value={menuCatFilter}
                      onChange={(e) => setMenuCatFilter(e.target.value)}
                      className="admin-form-select"
                    >
                      <option value="all">All Categories ({menuItems.length})</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.emoji} {c.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="admin-table-actions">
                    <button onClick={() => setQuickAddModalType('item')} className="admin-btn-primary admin-btn-prominent">
                      + Add New Dish
                    </button>
                    <div className="admin-table-actions-row">
                      <button
                        onClick={handleSyncMenu}
                        disabled={isSyncingMenu}
                        className="admin-btn-gps-calibrate"
                        title="Sync all 76 PDF dishes and categories to Supabase database"
                      >
                        {isSyncingMenu ? 'Syncing...' : '🔄 Sync PDF Menu (76 Items)'}
                      </button>
                    </div>
                  </div>
                </div>

                {filteredMenuItems.length === 0 ? (
                  <div className="admin-empty-card">
                    <div className="admin-empty-icon">🔍</div>
                    <h3 className="admin-empty-title">No Dishes Match Your Search</h3>
                    <p className="admin-empty-desc">
                      Try clearing the search query or selecting another category to view dishes.
                    </p>
                  </div>
                ) : (
                  <div className="admin-table-container">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Dish / Drink</th>
                          <th>Category</th>
                          <th>Price</th>
                          <th>Stock Left (Food Inventory)</th>
                          <th>Availability</th>
                          <th>Sizes</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredMenuItems.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <Image
                                  src={item.img || '/images/americano.png'}
                                  alt={item.name}
                                  width={44}
                                  height={44}
                                  style={{ borderRadius: 10, objectFit: 'cover' }}
                                />
                                <div>
                                  <div style={{ fontWeight: 700, color: 'var(--adm-text-main)' }}>{item.name}</div>
                                  <div style={{ fontSize: 11, color: 'var(--adm-text-muted)' }}>{item.subheading || item.desc}</div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--adm-text-secondary)' }}>
                                {item.category}
                              </span>
                            </td>
                            <td><strong>₹{item.price}</strong></td>
                            <td>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--adm-bg-surface, #FDFBF7)', padding: '4px 8px', borderRadius: 8, border: '1px solid var(--adm-border, #E6DEC9)' }}>
                                <button
                                  type="button"
                                  onClick={() => handleAdjustStock(item.id, Math.max(0, (item.stock ?? 10) - 1))}
                                  title="Decrease stock by 1"
                                  style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: 6,
                                    border: '1px solid var(--adm-border, #E6DEC9)',
                                    background: '#fff',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                    fontSize: 16,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'var(--adm-text-main, #2C1810)',
                                  }}
                                >
                                  −
                                </button>
                                <div style={{ minWidth: 64, textAlign: 'center' }}>
                                  <span
                                    style={{
                                      display: 'block',
                                      fontWeight: 800,
                                      fontSize: 13.5,
                                      color: (item.stock ?? 10) === 0 ? 'var(--adm-terracotta, #DC2626)' : (item.stock ?? 10) <= 3 ? '#D97706' : 'var(--adm-matcha, #16A34A)',
                                    }}
                                  >
                                    {(item.stock ?? 10)} left
                                  </span>
                                  {(item.stock ?? 10) === 0 && (
                                    <span style={{ fontSize: 9.5, color: 'var(--adm-terracotta, #DC2626)', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
                                      Sold Out
                                    </span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleAdjustStock(item.id, (item.stock ?? 10) + 1)}
                                  title="Increase stock by 1"
                                  style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: 6,
                                    border: '1px solid var(--adm-border, #E6DEC9)',
                                    background: '#fff',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                    fontSize: 16,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'var(--adm-text-main, #2C1810)',
                                  }}
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td>
                              <label className="admin-switch">
                                <input
                                  type="checkbox"
                                  checked={item.isAvailable && (item.stock ?? 10) > 0}
                                  onChange={() => handleToggleStock(item.id, item.isAvailable && (item.stock ?? 10) > 0)}
                                />
                                <span className="admin-slider"></span>
                              </label>
                              <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, color: (item.isAvailable && (item.stock ?? 10) > 0) ? 'var(--adm-matcha)' : 'var(--adm-terracotta)' }}>
                                {(item.isAvailable && (item.stock ?? 10) > 0) ? 'IN STOCK' : 'OUT (86ed)'}
                              </span>
                            </td>
                            <td style={{ fontSize: 12 }}>{item.sizes.join(', ')}</td>
                            <td>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                  onClick={() => setEditingItem(item)}
                                  className="admin-alert-action-btn"
                                  style={{ padding: '6px 12px' }}
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteItem(item.id)}
                                  style={{
                                    background: 'none',
                                    border: '1px solid #FCA5A5',
                                    color: '#DC2626',
                                    borderRadius: 8,
                                    padding: '6px 10px',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    fontSize: 12,
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════
              TAB 4: STAFF SCHEDULE & ROSTER
              ══════════════════════════════════════════ */}
          {activeTab === 'staff' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Floor & Kitchen Duty Roster</h3>
                  <p style={{ fontSize: 12, color: 'var(--adm-text-muted)', margin: '4px 0 0' }}>
                    Real-time attendance & station assignments for Anassa cafe operations
                  </p>
                </div>
              </div>

              <div className="admin-staff-grid">
                {filteredStaff.map((person) => (
                  <div key={person.id} className="admin-staff-card">
                    <div className="admin-staff-header">
                      <div className="admin-staff-avatar" style={{ background: person.avatarColor }}>
                        {person.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="admin-staff-details">
                        <span className="admin-staff-name">{person.name}</span>
                        <span className="admin-staff-role">{person.role}</span>
                      </div>
                    </div>

                    <div className="admin-staff-info-row">
                      <span>Shift</span>
                      <strong>{person.shift}</strong>
                    </div>

                    <div className="admin-staff-info-row">
                      <span>Station</span>
                      <strong>{person.station}</strong>
                    </div>

                    <div className="admin-staff-info-row">
                      <span>Contact</span>
                      <strong>{person.phone}</strong>
                    </div>

                    <div className="admin-staff-actions">
                      <button
                        onClick={() => handleStaffStatusToggle(person.id, 'on_duty')}
                        className={`admin-staff-btn ${person.status === 'on_duty' ? 'active' : ''}`}
                      >
                        ● On Duty
                      </button>
                      <button
                        onClick={() => handleStaffStatusToggle(person.id, 'break')}
                        className={`admin-staff-btn ${person.status === 'break' ? 'active' : ''}`}
                      >
                        ☕ Break
                      </button>
                      <button
                        onClick={() => handleStaffStatusToggle(person.id, 'off_duty')}
                        className={`admin-staff-btn ${person.status === 'off_duty' ? 'active' : ''}`}
                      >
                        Off Duty
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════
              TAB 6: ANALYTICS & FINANCIAL RECORD
              ══════════════════════════════════════════ */}
          {activeTab === 'analytics' && (
            <div>
              <div className="admin-metrics-grid">
                <div className="admin-metric-card">
                  <span className="admin-metric-label">Total Revenue</span>
                  <div className="admin-metric-value">₹{formatCurrency(stats.todayRevenue)}</div>
                  <span className="admin-metric-subtext">Today&apos;s realized earnings</span>
                </div>
                <div className="admin-metric-card">
                  <span className="admin-metric-label">Total Orders</span>
                  <div className="admin-metric-value">{stats.todayOrderCount}</div>
                  <span className="admin-metric-subtext">Orders placed today</span>
                </div>
                <div className="admin-metric-card">
                  <span className="admin-metric-label">Avg Basket Size</span>
                  <div className="admin-metric-value">
                    ₹{stats.todayOrderCount > 0 ? Math.round(stats.todayRevenue / stats.todayOrderCount) : 0}
                  </div>
                  <span className="admin-metric-subtext">Per order average</span>
                </div>
                <div className="admin-metric-card">
                  <span className="admin-metric-label">GST Tax Collected</span>
                  <div className="admin-metric-value">
                    ₹{formatCurrency(Math.round((stats.todayRevenue * (settings.gstPercent || 5)) / 105))}
                  </div>
                  <span className="admin-metric-subtext">At {settings.gstPercent}% statutory tax</span>
                </div>
              </div>

              {/* Popular Items Breakdown */}
              <div className="admin-card">
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 16px' }}>Top Selling Dishes & Drinks</h3>
                <div className="admin-table-container">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Dish Name</th>
                        <th>Units Sold</th>
                        <th>Revenue Generated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.popularItems.length === 0 ? (
                        <tr>
                          <td colSpan={3} style={{ textAlign: 'center', padding: 24, color: 'var(--adm-text-muted)' }}>
                            No sales data recorded yet. Ready for launch.
                          </td>
                        </tr>
                      ) : (
                        stats.popularItems.map((p, idx) => (
                          <tr key={idx}>
                            <td><strong>{p.name}</strong></td>
                            <td>{p.count} units</td>
                            <td><strong>₹{formatCurrency(p.revenue)}</strong></td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════
              TAB 7: SETTINGS SCREEN (FIXES SCREENSHOTS 1 & 2)
              ══════════════════════════════════════════ */}
          {activeTab === 'settings' && (
            <div className="admin-settings-section">
              {/* Card 1: Cafe Identity */}
              <div className="admin-settings-card">
                <div className="admin-settings-card-header">
                  <div>
                    <h3 className="admin-settings-card-title">
                      ☕ Store Identity & Currency
                    </h3>
                    <p className="admin-settings-card-desc">
                      Brand headers, receipts, and tax calculations
                    </p>
                  </div>
                </div>

                <div className="admin-form-grid-2">
                  <div className="admin-form-group">
                    <label className="admin-form-label">Cafe Name</label>
                    <input
                      type="text"
                      value={settings.cafeName}
                      onChange={(e) => setSettings({ ...settings, cafeName: e.target.value })}
                      className="admin-form-input"
                    />
                  </div>
                  <div className="admin-form-group">
                    <label className="admin-form-label">Tagline</label>
                    <input
                      type="text"
                      value={settings.tagline}
                      onChange={(e) => setSettings({ ...settings, tagline: e.target.value })}
                      className="admin-form-input"
                    />
                  </div>
                  <div className="admin-form-group">
                    <label className="admin-form-label">Contact Phone</label>
                    <input
                      type="text"
                      value={settings.contactPhone || ''}
                      onChange={(e) => setSettings({ ...settings, contactPhone: e.target.value })}
                      className="admin-form-input"
                    />
                  </div>
                  <div className="admin-form-group">
                    <label className="admin-form-label">GST Tax (%)</label>
                    <input
                      type="number"
                      value={settings.gstPercent}
                      onChange={(e) => setSettings({ ...settings, gstPercent: parseFloat(e.target.value) || 0 })}
                      className="admin-form-input"
                    />
                  </div>
                </div>
              </div>

              {/* Card 2: Geofence Security Guard (Fixes Screenshot 1) */}
              <div className="admin-settings-card">
                <div className="admin-settings-card-header">
                  <div>
                    <h3 className="admin-settings-card-title">
                      📍 Physical Geofence & Anti-Prank Security Guard
                    </h3>
                    <p className="admin-settings-card-desc">
                      Restricts orders to guests physically located on cafe premises
                    </p>
                  </div>
                  <label className="admin-switch">
                    <input
                      type="checkbox"
                      checked={settings.geofencingEnabled}
                      onChange={(e) => setSettings({ ...settings, geofencingEnabled: e.target.checked })}
                    />
                    <span className="admin-slider"></span>
                  </label>
                </div>

                <div className="admin-form-grid-3" style={{ marginBottom: 18 }}>
                  <div className="admin-form-group">
                    <label className="admin-form-label">Cafe Latitude</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={settings.cafeLatitude}
                      onChange={(e) => setSettings({ ...settings, cafeLatitude: parseFloat(e.target.value) || 0 })}
                      className="admin-form-input"
                    />
                  </div>
                  <div className="admin-form-group">
                    <label className="admin-form-label">Cafe Longitude</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={settings.cafeLongitude}
                      onChange={(e) => setSettings({ ...settings, cafeLongitude: parseFloat(e.target.value) || 0 })}
                      className="admin-form-input"
                    />
                  </div>
                  <div className="admin-form-group">
                    <label className="admin-form-label">Max Radius (Meters)</label>
                    <input
                      type="number"
                      value={settings.geofenceRadiusMeters}
                      onChange={(e) => setSettings({ ...settings, geofenceRadiusMeters: parseInt(e.target.value) || 150 })}
                      className="admin-form-input"
                    />
                  </div>
                </div>

                {/* Calibrate GPS Button - Fixed Geometry */}
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button onClick={handleCalibrateGPS} className="admin-btn-gps-calibrate">
                    🎯 Calibrate with Current Device GPS
                  </button>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={settings.allowTakeawayWithoutGeofence ?? false}
                      onChange={(e) => setSettings({ ...settings, allowTakeawayWithoutGeofence: e.target.checked })}
                    />
                    <span>Allow Takeaway / Flat Delivery outside perimeter</span>
                  </label>
                </div>
              </div>

              {/* Card 3: Security Guard & QR Controls */}
              <div className="admin-settings-card">
                <div className="admin-settings-card-header">
                  <div>
                    <h3 className="admin-settings-card-title">
                      📱 Table QR & Session Security Guard
                    </h3>
                    <p className="admin-settings-card-desc">
                      Cryptographic table verification and address bar scrubbing
                    </p>
                  </div>
                </div>

                <div className="admin-form-grid-2">
                  <div className="admin-toggle-card" onClick={() => setSettings({ ...settings, tableKeyValidationStrict: !settings.tableKeyValidationStrict })}>
                    <div className="admin-toggle-label-wrap">
                      <span className="admin-toggle-title">Strict Table QR Key Validation</span>
                      <span className="admin-toggle-subtitle">Requires scanned QR secret key</span>
                    </div>
                    <label className="admin-switch">
                      <input
                        type="checkbox"
                        checked={settings.tableKeyValidationStrict ?? true}
                        onChange={() => {}}
                      />
                      <span className="admin-slider"></span>
                    </label>
                  </div>

                  <div className="admin-toggle-card" onClick={() => setSettings({ ...settings, urlCleansingEnabled: !settings.urlCleansingEnabled })}>
                    <div className="admin-toggle-label-wrap">
                      <span className="admin-toggle-title">Address Bar URL Cleansing</span>
                      <span className="admin-toggle-subtitle">Scrubs secret keys from URL after scan</span>
                    </div>
                    <label className="admin-switch">
                      <input
                        type="checkbox"
                        checked={settings.urlCleansingEnabled ?? true}
                        onChange={() => {}}
                      />
                      <span className="admin-slider"></span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Card 4: PIN Security */}
              <div className="admin-settings-card">
                <div className="admin-settings-card-header">
                  <div>
                    <h3 className="admin-settings-card-title">
                      🔐 Master Access Credentials
                    </h3>
                    <p className="admin-settings-card-desc">
                      Access PINs for Master Admin Console and Kitchen KDS
                    </p>
                  </div>
                </div>

                <div className="admin-form-grid-2">
                  <div className="admin-form-group">
                    <label className="admin-form-label">Master Admin PIN</label>
                    <input
                      type="password"
                      value={settings.adminPin}
                      onChange={(e) => setSettings({ ...settings, adminPin: e.target.value })}
                      className="admin-form-input"
                    />
                  </div>
                  <div className="admin-form-group">
                    <label className="admin-form-label">Kitchen Display (KDS) PIN</label>
                    <input
                      type="password"
                      value={settings.kitchenPin || '1234'}
                      onChange={(e) => setSettings({ ...settings, kitchenPin: e.target.value })}
                      className="admin-form-input"
                    />
                  </div>
                </div>
              </div>

              {/* Sticky Save Bar (Fixes Giant Terracotta Button in Screenshot 2) */}
              <div className="admin-sticky-save-bar">
                <span style={{ fontSize: 13, color: 'var(--adm-text-secondary)', fontWeight: 600 }}>
                  Make sure to save changes after modifying operational rules.
                </span>
                <button onClick={(e) => handleSaveSettings(e)} className="admin-save-primary-btn">
                  💾 Save All Configuration Changes
                </button>
              </div>

              {/* Card 5: Production Live Launch Wipe (Requested by User) */}
              <div className="admin-wipe-card">
                <h3 className="admin-wipe-title">
                  ⚠️ Production Live Launch: Purge Test Data
                </h3>
                <p className="admin-wipe-desc">
                  Wipes all test customer orders, sales ledger history, popular item sold counts, and audit logs from the database so OZKAFE can be handed over live cleanly from scratch. Menu items, categories, and settings will remain preserved.
                </p>
                <button onClick={() => setIsWipeModalOpen(true)} className="admin-wipe-btn">
                  🗑 Clean Wipe Database for Live Launch
                </button>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════
              TAB 8: TABLES & QR CODE GENERATION
              ══════════════════════════════════════════ */}
          {activeTab === 'tables' && (
            <div>
              <div className="admin-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Active Tables & Permanent QR Keys</h3>
                    <p style={{ fontSize: 12, color: 'var(--adm-text-muted)', margin: '4px 0 0' }}>
                      Cryptographic dining table QR codes for physical table stands
                    </p>
                  </div>
                </div>

                <div className="admin-table-container">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Table #</th>
                        <th>Label</th>
                        <th>Secret Key</th>
                        <th>Status</th>
                        <th>Direct Guest Link</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tablesList.map((tbl) => (
                        <tr key={tbl.tableNumber}>
                          <td><strong>Table {tbl.tableNumber}</strong></td>
                          <td>{tbl.label}</td>
                          <td><code>{tbl.secretKey}</code></td>
                          <td>
                            <span className={`admin-status-badge ${tbl.isActive ? 'green' : 'red'}`}>
                              {tbl.isActive ? 'ACTIVE' : 'DISABLED'}
                            </span>
                          </td>
                          <td>
                            <Link
                              href={`/?table=${tbl.tableNumber}&key=${tbl.secretKey}`}
                              target="_blank"
                              className="admin-alert-action-btn"
                              style={{ display: 'inline-block' }}
                            >
                              Test Scan Link ↗
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════
              TAB 9: SECURITY AUDIT TRAIL
              ══════════════════════════════════════════ */}
          {activeTab === 'logs' && (
            <div>
              <div className="admin-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <select
                      value={auditActorFilter}
                      onChange={(e) => setAuditActorFilter(e.target.value)}
                      className="admin-form-select"
                      style={{ maxWidth: 180 }}
                    >
                      <option value="all">All Actors</option>
                      <option value="customer">Customer</option>
                      <option value="kitchen">Kitchen</option>
                      <option value="admin">Admin</option>
                      <option value="system">System</option>
                    </select>
                  </div>

                  <button onClick={fetchAuditLogs} className="admin-alert-action-btn">
                    🔄 Refresh Logs
                  </button>
                </div>

                <div className="admin-table-container">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>Actor</th>
                        <th>Action</th>
                        <th>Details</th>
                        <th>IP Address</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs
                        .filter((log) => auditActorFilter === 'all' || log.actor === auditActorFilter)
                        .slice(0, 50)
                        .map((log) => (
                          <tr key={log.id}>
                            <td style={{ fontSize: 12 }}>{new Date(log.timestamp).toLocaleString()}</td>
                            <td>
                              <span className="admin-status-badge green">
                                {log.actor.toUpperCase()}
                              </span>
                            </td>
                            <td><strong>{log.action}</strong></td>
                            <td style={{ maxWidth: 320 }}>{log.details}</td>
                            <td style={{ fontSize: 12 }}><code>{log.ipAddress || '127.0.0.1'}</code></td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════
          MODAL: QUICK ADD NEW DISH
          ══════════════════════════════════════════ */}
      {quickAddModalType === 'item' && (
        <div className="admin-modal-overlay" onClick={() => setQuickAddModalType(null)}>
          <div className="admin-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">+ Add New Menu Dish</h3>
              <button onClick={() => setQuickAddModalType(null)} className="admin-modal-close-btn">✕</button>
            </div>
            <form onSubmit={handleSaveNewItem}>
              <div className="admin-modal-body">
                <div className="admin-form-group">
                  <label className="admin-form-label">Dish Name</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g., Iced Spanish Latte"
                    className="admin-form-input"
                  />
                </div>
                <div className="admin-form-grid-2">
                  <div className="admin-form-group">
                    <label className="admin-form-label">Category</label>
                    <select
                      value={formCategoryId}
                      onChange={(e) => {
                        setFormCategoryId(e.target.value);
                        const c = categories.find((cat) => cat.id === e.target.value);
                        if (c) setFormCategory(c.title);
                      }}
                      className="admin-form-select"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.title}</option>
                      ))}
                    </select>
                  </div>
                  <div className="admin-form-group">
                    <label className="admin-form-label">Price (₹)</label>
                    <input
                      type="number"
                      required
                      value={formPrice}
                      onChange={(e) => setFormPrice(e.target.value)}
                      placeholder="180"
                      className="admin-form-input"
                    />
                  </div>
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Subheading</label>
                  <input
                    type="text"
                    value={formSubheading}
                    onChange={(e) => setFormSubheading(e.target.value)}
                    placeholder="e.g., SIGNATURE BLEND"
                    className="admin-form-input"
                  />
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Description</label>
                  <textarea
                    rows={2}
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    placeholder="Rich espresso sweetened with condensed milk and chilled over ice."
                    className="admin-form-textarea"
                  />
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Available Sizes (Comma Separated)</label>
                  <input
                    type="text"
                    value={formSizes}
                    onChange={(e) => setFormSizes(e.target.value)}
                    placeholder="Regular, Large"
                    className="admin-form-input"
                  />
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Initial Stock Quantity (Items Left in Kitchen)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formStock}
                    onChange={(e) => setFormStock(Math.max(0, parseInt(e.target.value) || 0))}
                    placeholder="10"
                    className="admin-form-input"
                  />
                  <span style={{ fontSize: 11, color: 'var(--adm-text-muted)', marginTop: 4, display: 'block' }}>
                    Default is 10 portions. Automatically decreases whenever an order is placed.
                  </span>
                </div>
              </div>
              <div className="admin-modal-footer">
                <button type="button" onClick={() => setQuickAddModalType(null)} className="admin-alert-action-btn">
                  Cancel
                </button>
                <button type="submit" className="admin-btn-primary">
                  Publish Dish Live
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          MODAL: EDIT EXISTING DISH
          ══════════════════════════════════════════ */}
      {editingItem && (
        <div className="admin-modal-overlay" onClick={() => setEditingItem(null)}>
          <div className="admin-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">Edit Dish: {editingItem.name}</h3>
              <button onClick={() => setEditingItem(null)} className="admin-modal-close-btn">✕</button>
            </div>
            <form onSubmit={handleSaveEditItem}>
              <div className="admin-modal-body">
                <div className="admin-form-group">
                  <label className="admin-form-label">Dish Name</label>
                  <input
                    type="text"
                    required
                    value={editingItem.name}
                    onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                    className="admin-form-input"
                  />
                </div>
                <div className="admin-form-grid-2">
                  <div className="admin-form-group">
                    <label className="admin-form-label">Price (₹)</label>
                    <input
                      type="number"
                      required
                      value={editingItem.price}
                      onChange={(e) => setEditingItem({ ...editingItem, price: parseFloat(e.target.value) || 0 })}
                      className="admin-form-input"
                    />
                  </div>
                  <div className="admin-form-group">
                    <label className="admin-form-label">Subheading</label>
                    <input
                      type="text"
                      value={editingItem.subheading || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, subheading: e.target.value })}
                      className="admin-form-input"
                    />
                  </div>
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Description</label>
                  <textarea
                    rows={3}
                    value={editingItem.desc}
                    onChange={(e) => setEditingItem({ ...editingItem, desc: e.target.value })}
                    className="admin-form-textarea"
                  />
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Food Items Left in Stock</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={editingItem.stock ?? 10}
                    onChange={(e) => {
                      const val = Math.max(0, parseInt(e.target.value) || 0);
                      setEditingItem({
                        ...editingItem,
                        stock: val,
                        isAvailable: val > 0 ? editingItem.isAvailable : false,
                      });
                    }}
                    className="admin-form-input"
                  />
                  <span style={{ fontSize: 11, color: 'var(--adm-text-muted)', marginTop: 4, display: 'block' }}>
                    Default is 10 portions. Automatically decreases whenever an order is placed.
                  </span>
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Live Availability</label>
                  <label className="admin-switch">
                    <input
                      type="checkbox"
                      checked={editingItem.isAvailable && (editingItem.stock ?? 10) > 0}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setEditingItem({
                          ...editingItem,
                          isAvailable: checked,
                          stock: checked && (editingItem.stock ?? 0) <= 0 ? 10 : (editingItem.stock ?? 10),
                        });
                      }}
                    />
                    <span className="admin-slider"></span>
                  </label>
                </div>
              </div>
              <div className="admin-modal-footer">
                <button type="button" onClick={() => setEditingItem(null)} className="admin-alert-action-btn">
                  Cancel
                </button>
                <button type="submit" className="admin-btn-primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          MODAL: CUSTOM / MANUAL COUNTER ORDER
          ══════════════════════════════════════════ */}
      {quickAddModalType === 'manual-order' && (
        <div className="admin-modal-overlay" onClick={() => setQuickAddModalType(null)}>
          <div className="admin-modal-box" style={{ maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <h3 className="admin-modal-title">+ Custom / Manual Counter Order</h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--adm-text-muted)' }}>
                  Create custom walk-in, phone, or scheduled orders with custom date & time.
                </p>
              </div>
              <button onClick={() => setQuickAddModalType(null)} className="admin-modal-close-btn">✕</button>
            </div>
            <form onSubmit={handleManualOrderSubmit}>
              <div className="admin-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* 1. Custom Date & Time Picker */}
                <div style={{ background: 'var(--adm-bg-surface-2, #F8F5EE)', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--adm-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label className="admin-form-label" style={{ margin: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>📅</span> Order Date & Time
                    </label>
                    <button
                      type="button"
                      onClick={() => setManualDateTime(getNowLocalDateTimeString())}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--adm-terracotta, #8E402A)',
                        fontSize: 11.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: '2px 4px',
                        textDecoration: 'underline'
                      }}
                    >
                      Set to Current (Now)
                    </button>
                  </div>
                  <input
                    type="datetime-local"
                    value={manualDateTime}
                    onChange={(e) => setManualDateTime(e.target.value)}
                    required
                    className="admin-form-input"
                    style={{ fontWeight: 600, fontSize: 13.5 }}
                  />
                  <div style={{ fontSize: 11, color: 'var(--adm-text-muted)', marginTop: 4 }}>
                    Orders can be timestamped for right now, backdated, or scheduled for a specific date and time.
                  </div>
                </div>

                {/* 2. Table & Customer Name */}
                <div className="admin-form-grid-2">
                  <div className="admin-form-group">
                    <label className="admin-form-label">Table / Order Type</label>
                    <select
                      value={manualTable}
                      onChange={(e) => setManualTable(e.target.value)}
                      className="admin-form-select"
                    >
                      <option value="Takeaway">Takeaway & In-Flat</option>
                      <option value="1">Table 1</option>
                      <option value="2">Table 2</option>
                      <option value="3">Table 3</option>
                      <option value="4">Table 4</option>
                      <option value="5">Table 5</option>
                      <option value="6">Table 6</option>
                      <option value="7">Table 7</option>
                      <option value="8">Table 8</option>
                      <option value="9">Table 9</option>
                      <option value="10">Table 10</option>
                    </select>
                  </div>
                  <div className="admin-form-group">
                    <label className="admin-form-label">Customer Name</label>
                    <input
                      type="text"
                      value={manualGuest}
                      onChange={(e) => setManualGuest(e.target.value)}
                      placeholder="e.g. Rahul Sen"
                      className="admin-form-input"
                    />
                  </div>
                </div>

                {/* 3. Phone & Flat */}
                <div className="admin-form-grid-2">
                  <div className="admin-form-group">
                    <label className="admin-form-label">Phone Number (Optional)</label>
                    <input
                      type="tel"
                      value={manualPhone}
                      onChange={(e) => setManualPhone(e.target.value)}
                      placeholder="e.g. 9830012345"
                      className="admin-form-input"
                    />
                  </div>
                  <div className="admin-form-group">
                    <label className="admin-form-label">Flat / Residence (Optional)</label>
                    <input
                      type="text"
                      value={manualFlat}
                      onChange={(e) => setManualFlat(e.target.value)}
                      placeholder="e.g. F69, Tower 2"
                      className="admin-form-input"
                    />
                  </div>
                </div>

                {/* 4. Dish Selection */}
                <div className="admin-form-group">
                  <label className="admin-form-label">Select Dish / Beverage</label>
                  <select
                    value={manualSelectedItemId}
                    onChange={(e) => {
                      setManualSelectedItemId(e.target.value);
                      const it = menuItems.find((m) => m.id === e.target.value);
                      if (it && it.sizes && it.sizes.length > 0) {
                        setManualSelectedSize(it.sizes[0]);
                      } else {
                        setManualSelectedSize('Regular');
                      }
                    }}
                    required
                    className="admin-form-select"
                  >
                    <option value="">-- Choose a dish / beverage --</option>
                    {menuItems.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} — ₹{m.price} ({m.stock !== undefined ? `${m.stock} left` : '10 left'}) · {m.category}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 5. Quantity & Size */}
                <div className="admin-form-grid-2">
                  <div className="admin-form-group">
                    <label className="admin-form-label">Quantity</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => setManualQuantity((q) => Math.max(1, q - 1))}
                        className="admin-alert-action-btn"
                        style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="1"
                        max="99"
                        value={manualQuantity}
                        onChange={(e) => setManualQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                        className="admin-form-input"
                        style={{ textAlign: 'center', fontWeight: 700 }}
                      />
                      <button
                        type="button"
                        onClick={() => setManualQuantity((q) => q + 1)}
                        className="admin-alert-action-btn"
                        style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="admin-form-group">
                    <label className="admin-form-label">Portion / Size</label>
                    {(() => {
                      const sel = menuItems.find((m) => m.id === manualSelectedItemId);
                      if (sel && sel.sizes && sel.sizes.length > 1) {
                        return (
                          <select
                            value={manualSelectedSize}
                            onChange={(e) => setManualSelectedSize(e.target.value)}
                            className="admin-form-select"
                          >
                            {sel.sizes.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        );
                      }
                      return (
                        <input
                          type="text"
                          value={manualSelectedSize}
                          onChange={(e) => setManualSelectedSize(e.target.value)}
                          placeholder="Regular"
                          className="admin-form-input"
                        />
                      );
                    })()}
                  </div>
                </div>

                {/* 6. Special Instructions */}
                <div className="admin-form-group">
                  <label className="admin-form-label">Special Instructions / Notes (Optional)</label>
                  <input
                    type="text"
                    value={manualInstructions}
                    onChange={(e) => setManualInstructions(e.target.value)}
                    placeholder="e.g. Less spicy, extra sauce, oat milk, VIP guest"
                    className="admin-form-input"
                  />
                </div>

                {/* 7. Live Pricing Preview */}
                {(() => {
                  const sel = menuItems.find((m) => m.id === manualSelectedItemId);
                  if (!sel) return null;
                  const qty = manualQuantity || 1;
                  const sub = sel.price * qty;
                  const gst = Math.round((sub * (settings.gstPercent || 5)) / 100);
                  const tot = sub + gst;
                  return (
                    <div style={{ background: 'var(--adm-bg-surface-2, #F8F5EE)', padding: 12, borderRadius: 8, fontSize: 12.5, border: '1px solid var(--adm-border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span>Subtotal ({qty}x ₹{sel.price}):</span>
                        <strong>₹{sub.toFixed(2)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: 'var(--adm-text-muted)' }}>
                        <span>GST ({settings.gstPercent || 5}%):</span>
                        <span>₹{gst.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid var(--adm-border)', fontWeight: 800, fontSize: 14 }}>
                        <span>Total Payable:</span>
                        <span style={{ color: 'var(--adm-terracotta)' }}>₹{tot.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div className="admin-modal-footer">
                <button type="button" onClick={() => setQuickAddModalType(null)} className="admin-alert-action-btn">
                  Cancel
                </button>
                <button type="submit" className="admin-btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>✓</span> Dispatch to Kitchen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          MODAL: DATABASE CLEAN WIPE CONFIRM (LIVE LAUNCH)
          ══════════════════════════════════════════ */}
      {isWipeModalOpen && (
        <div className="admin-modal-overlay" onClick={() => setIsWipeModalOpen(false)}>
          <div className="admin-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header" style={{ borderBottomColor: '#FCA5A5' }}>
              <h3 className="admin-modal-title" style={{ color: '#DC2626' }}>
                ⚠️ Purge All Test Data for Live Launch?
              </h3>
              <button onClick={() => setIsWipeModalOpen(false)} className="admin-modal-close-btn">✕</button>
            </div>
            <div className="admin-modal-body">
              <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--adm-text-secondary)', margin: 0 }}>
                This action will delete all existing test customer orders, sales revenue, and audit trails.
                Your menu items, categories, and settings will remain completely intact.
              </p>
              <div className="admin-form-group">
                <label className="admin-form-label">Enter Master Admin PIN to Confirm</label>
                <input
                  type="password"
                  value={wipePinConfirm}
                  onChange={(e) => setWipePinConfirm(e.target.value)}
                  placeholder="Master PIN"
                  className="admin-form-input"
                />
              </div>
            </div>
            <div className="admin-modal-footer">
              <button type="button" onClick={() => setIsWipeModalOpen(false)} className="admin-alert-action-btn">
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePurgeDatabase}
                disabled={isWiping}
                className="admin-wipe-btn"
              >
                {isWiping ? 'Wiping...' : 'Confirm Clean Wipe & Make Live'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          MODAL: PRINTABLE RECEIPT
          ══════════════════════════════════════════ */}
      {selectedReceiptOrder && (() => {
        const orderSubtotal = selectedReceiptOrder.subtotal && selectedReceiptOrder.subtotal > 0
          ? selectedReceiptOrder.subtotal
          : selectedReceiptOrder.items.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0);

        const gstPercent = settings.gstPercent ?? 5;
        const gstRate = gstPercent / 100;
        const orderTax = selectedReceiptOrder.taxAmount !== undefined && selectedReceiptOrder.taxAmount > 0
          ? selectedReceiptOrder.taxAmount
          : Number((orderSubtotal * gstRate).toFixed(2));

        const halfRate = (gstPercent / 2).toFixed(1);
        const cgst = Number((orderTax / 2).toFixed(2));
        const sgst = Number((orderTax - cgst).toFixed(2));

        const orderTotal = selectedReceiptOrder.total && selectedReceiptOrder.total > 0
          ? selectedReceiptOrder.total
          : Number((orderSubtotal + orderTax).toFixed(2));

        const totalQty = selectedReceiptOrder.items.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0);

        return (
          <div className="admin-modal-overlay" onClick={() => setSelectedReceiptOrder(null)}>
            <div className="admin-modal-box" style={{ maxWidth: 410, padding: 0, overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
              <div className="admin-modal-header" style={{ padding: '14px 18px', borderBottom: '1px solid var(--adm-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>🧾</span>
                  <h3 className="admin-modal-title" style={{ fontSize: 15, fontWeight: 700 }}>Tax Invoice & Thermal Receipt</h3>
                </div>
                <button onClick={() => setSelectedReceiptOrder(null)} className="admin-modal-close-btn">✕</button>
              </div>

              <div className="admin-modal-body" style={{ maxHeight: '78vh', overflowY: 'auto', padding: '16px 18px', background: '#FAFAF9' }}>
                {/* ── PRINTABLE THERMAL RECEIPT TICKET ── */}
                <div
                  id="thermal-receipt"
                  className="thermal-receipt-ticket"
                  style={{
                    background: '#FFFFFF',
                    border: '1px solid #E5E5E5',
                    borderRadius: 10,
                    padding: '24px 18px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    fontFamily: 'var(--font-mono), "Courier New", Courier, monospace',
                    fontSize: 12,
                    color: '#1C1917',
                    lineHeight: 1.5,
                  }}
                >
                  {/* STORE & ORDER ID */}
                  <div style={{ textAlign: 'center', paddingBottom: 12, borderBottom: '1.5px dashed #78716C' }}>
                    <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: '0.05em', color: '#1C1917' }}>
                      OZKAFE · ANASSA
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, marginTop: 6, color: '#1C1917' }}>
                      Order ID: {selectedReceiptOrder.orderNumber}
                    </div>
                    <div style={{ fontSize: 11, color: '#78716C', marginTop: 2 }}>
                      {new Date(selectedReceiptOrder.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}, {new Date(selectedReceiptOrder.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                  </div>

                  {/* ITEMS ORDERED */}
                  <div style={{ padding: '12px 0', borderBottom: '1.5px dashed #78716C' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 36px 60px 65px', fontWeight: 800, fontSize: 11, borderBottom: '1px solid #D6D3D1', paddingBottom: 5, marginBottom: 8, color: '#44403C' }}>
                      <span>ITEM</span>
                      <span style={{ textAlign: 'center' }}>QTY</span>
                      <span style={{ textAlign: 'right' }}>RATE</span>
                      <span style={{ textAlign: 'right' }}>AMOUNT</span>
                    </div>

                    {selectedReceiptOrder.items.map((it, idx) => {
                      const itemRate = Number(it.price) || 0;
                      const itemQty = Number(it.quantity) || 1;
                      const itemAmt = itemRate * itemQty;
                      return (
                        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 36px 60px 65px', fontSize: 11.5, marginBottom: 6 }}>
                          <span style={{ fontWeight: 600, paddingRight: 4 }}>
                            {it.name}
                            {it.selectedSize && it.selectedSize !== 'Regular' ? ` (${it.selectedSize})` : ''}
                          </span>
                          <span style={{ textAlign: 'center', fontWeight: 700 }}>{itemQty}</span>
                          <span style={{ textAlign: 'right', color: '#57534E' }}>₹{itemRate.toFixed(2)}</span>
                          <span style={{ textAlign: 'right', fontWeight: 700 }}>₹{itemAmt.toFixed(2)}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* PRICES, GST & TOTAL */}
                  <div style={{ padding: '12px 0', fontSize: 11.5 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ color: '#57534E' }}>Item Subtotal:</span>
                      <span style={{ fontWeight: 700 }}>₹{orderSubtotal.toFixed(2)}</span>
                    </div>

                    <div style={{ background: '#F5F5F4', padding: '8px 10px', borderRadius: 6, margin: '6px 0', border: '1px solid #E7E5E4' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#44403C', marginBottom: 3 }}>
                        <span>CGST ({halfRate}%):</span>
                        <span>₹{cgst.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#44403C', marginBottom: 4 }}>
                        <span>SGST ({halfRate}%):</span>
                        <span>₹{sgst.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 700, color: '#1C1917', borderTop: '1px dashed #D6D3D1', paddingTop: 4 }}>
                        <span>Total GST ({gstPercent}%):</span>
                        <span>₹{orderTax.toFixed(2)}</span>
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderTop: '2px solid #1C1917',
                        borderBottom: '2px solid #1C1917',
                        padding: '10px 0',
                        marginTop: 10,
                      }}
                    >
                      <span style={{ fontWeight: 900, fontSize: 15, letterSpacing: '0.04em' }}>TOTAL</span>
                      <span style={{ fontWeight: 900, fontSize: 18, color: '#1C1917' }}>₹{orderTotal.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* THANK YOU MSG */}
                  <div style={{ textAlign: 'center', borderTop: '1.5px dashed #78716C', paddingTop: 14, marginTop: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#1C1917' }}>
                      Thank You For Visiting OZKAFE ANASSA!
                    </div>
                  </div>
                </div>
              </div>

              <div className="admin-modal-footer" style={{ padding: '12px 18px', borderTop: '1px solid var(--adm-border)', background: '#fff', display: 'flex', gap: 10 }}>
                <button
                  onClick={() => handleOpenEditReceipt(selectedReceiptOrder)}
                  className="admin-alert-action-btn"
                  style={{ height: 44, padding: '0 16px', fontSize: 13.5, fontWeight: 700, gap: 6, display: 'flex', alignItems: 'center' }}
                >
                  <span>✏️</span>
                  <span>Edit Receipt</span>
                </button>
                <button
                  onClick={() => window.print()}
                  className="admin-btn-primary"
                  style={{ flex: 1, height: 44, fontSize: 14, fontWeight: 700, justifyContent: 'center', gap: 8 }}
                >
                  <span>🖨</span>
                  <span>Print Thermal Receipt</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══════════════════════════════════════════
          MODAL: EDIT ORDER & RECEIPT
          ══════════════════════════════════════════ */}
      {editingReceiptOrder && (
        <div className="admin-modal-overlay" onClick={() => setEditingReceiptOrder(null)}>
          <div className="admin-modal-box" style={{ maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <h3 className="admin-modal-title">✏️ Edit Order & Receipt</h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--adm-text-muted)' }}>
                  Correct billing items, quantities, rates, customer details, or date & time.
                </p>
              </div>
              <button onClick={() => setEditingReceiptOrder(null)} className="admin-modal-close-btn">✕</button>
            </div>

            <form onSubmit={handleSaveEditReceipt}>
              <div className="admin-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* 1. Order ID & Table */}
                <div className="admin-form-grid-2">
                  <div className="admin-form-group">
                    <label className="admin-form-label">Order Number / ID</label>
                    <input
                      type="text"
                      value={editOrderNumber}
                      onChange={(e) => setEditOrderNumber(e.target.value)}
                      required
                      className="admin-form-input"
                      style={{ fontWeight: 700 }}
                    />
                  </div>
                  <div className="admin-form-group">
                    <label className="admin-form-label">Table / Order Type</label>
                    <select
                      value={editTableNumber}
                      onChange={(e) => setEditTableNumber(e.target.value)}
                      className="admin-form-select"
                    >
                      <option value="Takeaway">Takeaway & In-Flat</option>
                      <option value="1">Table 1</option>
                      <option value="2">Table 2</option>
                      <option value="3">Table 3</option>
                      <option value="4">Table 4</option>
                      <option value="5">Table 5</option>
                      <option value="6">Table 6</option>
                      <option value="7">Table 7</option>
                      <option value="8">Table 8</option>
                      <option value="9">Table 9</option>
                      <option value="10">Table 10</option>
                    </select>
                  </div>
                </div>

                {/* 2. Customer Name & Phone */}
                <div className="admin-form-grid-2">
                  <div className="admin-form-group">
                    <label className="admin-form-label">Customer Name</label>
                    <input
                      type="text"
                      value={editCustomerName}
                      onChange={(e) => setEditCustomerName(e.target.value)}
                      className="admin-form-input"
                    />
                  </div>
                  <div className="admin-form-group">
                    <label className="admin-form-label">Phone Number</label>
                    <input
                      type="tel"
                      value={editCustomerPhone}
                      onChange={(e) => setEditCustomerPhone(e.target.value)}
                      className="admin-form-input"
                    />
                  </div>
                </div>

                {/* 3. Date & Time */}
                <div className="admin-form-group">
                  <label className="admin-form-label">Order Date & Time</label>
                  <input
                    type="datetime-local"
                    value={editDateTime}
                    onChange={(e) => setEditDateTime(e.target.value)}
                    required
                    className="admin-form-input"
                    style={{ fontWeight: 600 }}
                  />
                </div>

                {/* 4. Editable Ordered Items List */}
                <div className="admin-form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label className="admin-form-label" style={{ margin: 0, fontWeight: 700 }}>
                      Receipt Items ({editItems.length})
                    </label>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--adm-bg-surface-2, #F8F5EE)', padding: 12, borderRadius: 8, border: '1px solid var(--adm-border)' }}>
                    {editItems.map((item, idx) => (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 80px 32px', gap: 8, alignItems: 'center' }}>
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => {
                            const updated = [...editItems];
                            updated[idx].name = e.target.value;
                            setEditItems(updated);
                          }}
                          className="admin-form-input"
                          style={{ fontSize: 12 }}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <button
                            type="button"
                            onClick={() => handleUpdateItemQty(idx, -1)}
                            className="admin-alert-action-btn"
                            style={{ width: 26, height: 26, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            -
                          </button>
                          <span style={{ fontWeight: 700, minWidth: 20, textAlign: 'center', fontSize: 13 }}>
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateItemQty(idx, 1)}
                            className="admin-alert-action-btn"
                            style={{ width: 26, height: 26, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            +
                          </button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <span style={{ fontSize: 11, marginRight: 2 }}>₹</span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={item.price}
                            onChange={(e) => handleUpdateItemPrice(idx, parseFloat(e.target.value) || 0)}
                            className="admin-form-input"
                            style={{ fontSize: 12, padding: '4px 6px', textAlign: 'right' }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveDishFromEditReceipt(idx)}
                          title="Remove item"
                          style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', fontSize: 16, padding: 0 }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}

                    {/* Add Item Row */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 6, paddingTop: 8, borderTop: '1px dashed var(--adm-border)' }}>
                      <select
                        value={editAddItemId}
                        onChange={(e) => setEditAddItemId(e.target.value)}
                        className="admin-form-select"
                        style={{ fontSize: 12 }}
                      >
                        <option value="">-- Add another dish to receipt --</option>
                        {menuItems.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} (₹{m.price})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleAddDishToEditReceipt}
                        className="admin-alert-action-btn"
                        style={{ whiteSpace: 'nowrap', fontWeight: 700 }}
                      >
                        + Add
                      </button>
                    </div>
                  </div>
                </div>

                {/* 5. Live Pricing Breakdown Preview */}
                {(() => {
                  const sub = editItems.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0);
                  const gst = Math.round((sub * (settings.gstPercent || 5)) / 100);
                  const tot = sub + gst;
                  return (
                    <div style={{ background: '#fff', border: '1px solid var(--adm-border)', borderRadius: 8, padding: 12, fontSize: 12.5 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span>Item Subtotal:</span>
                        <strong>₹{sub.toFixed(2)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: 'var(--adm-text-muted)' }}>
                        <span>GST ({settings.gstPercent || 5}%):</span>
                        <span>₹{gst.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid var(--adm-border)', fontWeight: 800, fontSize: 14 }}>
                        <span>Recalculated Total:</span>
                        <span style={{ color: 'var(--adm-terracotta)' }}>₹{tot.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })()}

                {/* 6. Special Notes */}
                <div className="admin-form-group">
                  <label className="admin-form-label">Notes / Instructions</label>
                  <input
                    type="text"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    className="admin-form-input"
                    placeholder="e.g. Corrected portion quantity"
                  />
                </div>
              </div>

              <div className="admin-modal-footer">
                <button type="button" onClick={() => setEditingReceiptOrder(null)} className="admin-alert-action-btn">
                  Cancel
                </button>
                <button type="submit" className="admin-btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>✓</span> Save & Update Receipt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── CUSTOMIZABLE STAFF ACCOUNT DRAWER ── */}
      <AccountPanel
        isOpen={isAccountPanelOpen}
        onClose={() => setIsAccountPanelOpen(false)}
        user={currentUser}
        currentConsole="admin"
        onUpdateUser={(updated) => {
          setCurrentUser(updated);
          if (updated.preferences?.theme) setTheme(updated.preferences.theme);
        }}
        onLogout={handleLogout}
      />
    </div>
  );
}
