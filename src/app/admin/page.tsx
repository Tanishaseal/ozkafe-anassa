'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { MenuItem, Category, Order, CafeSettings, AuditLog } from '@/lib/types';

const formatCurrency = (val: number): string => {
  if (val === undefined || val === null || isNaN(val)) return '0';
  return Number.isInteger(val) ? val.toString() : val.toFixed(2);
};

export default function AdminPage() {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  // Active tab: 'dashboard' | 'menu' | 'categories' | 'tables' | 'orders' | 'settings' | 'logs'
  const [activeTab, setActiveTab] = useState<'dashboard' | 'menu' | 'categories' | 'tables' | 'orders' | 'settings' | 'logs'>('dashboard');

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditActorFilter, setAuditActorFilter] = useState('all');
  const [auditActionFilter, setAuditActionFilter] = useState('all');
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // Data states
  const [stats, setStats] = useState<{
    todayRevenue: number;
    todayOrderCount: number;
    totalOrders: number;
    activeOrderCount: number;
    popularItems: { name: string; count: number; revenue: number }[];
  }>({
    todayRevenue: 0,
    todayOrderCount: 0,
    totalOrders: 0,
    activeOrderCount: 0,
    popularItems: [],
  });

  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
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
  const [dbStatus, setDbStatus] = useState<{ isConfigured: boolean; provider: string } | null>(null);

  // Filter & Search states
  const [menuSearch, setMenuSearch] = useState('');
  const [menuCatFilter, setMenuCatFilter] = useState('all');
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');

  // Modals
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [isNewItemModalOpen, setIsNewItemModalOpen] = useState(false);
  const [selectedReceiptOrder, setSelectedReceiptOrder] = useState<Order | null>(null);

  // New Item form state
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('Hot Coffee');
  const [formCategoryId, setFormCategoryId] = useState('hot-coffee');
  const [formSubheading, setFormSubheading] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formImg, setFormImg] = useState('/images/americano.png');
  const [formIsVeg] = useState(true);
  const [formSizes, setFormSizes] = useState('Regular');

  // Require PIN on every window access: clear legacy persistent auth tokens
  useEffect(() => {
    try {
      localStorage.removeItem('anassa_admin_authed');
      sessionStorage.removeItem('anassa_admin_authed');
    } catch {
      // silent
    }
  }, []);

  const handlePinSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setPinError('');

    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinInput }),
      });

      if (res.ok) {
        setIsAuthenticated(true);
        setPinInput('');
        fetchAdminData();
      } else {
        setPinError('Invalid Admin PIN. Please try again.');
        setPinInput('');
      }
    } catch {
      setPinError('Authentication error');
    }
  };

  const handleLogout = async () => {
    try {
      localStorage.removeItem('anassa_admin_authed');
      sessionStorage.removeItem('anassa_admin_authed');
    } catch {
      // silent
    }
    setIsAuthenticated(false);
    setPinInput('');
    await fetch('/api/admin/auth', { method: 'DELETE' });
  };

  const fetchAdminData = async () => {
    try {
      const [adminRes, menuRes, ordersRes] = await Promise.all([
        fetch('/api/admin'),
        fetch('/api/menu'),
        fetch('/api/orders?all=true'),
      ]);

      if (adminRes.status === 401) {
        setIsAuthenticated(false);
        localStorage.removeItem('anassa_admin_authed');
        return;
      }

      if (adminRes.ok) {
        const data = await adminRes.json();
        setStats(data.stats);
        if (data.settings) setSettings(data.settings);
        if (data.database) setDbStatus(data.database);
      }

      if (menuRes.ok) {
        const data = await menuRes.json();
        setCategories(data.categories || []);
        setMenuItems(data.items || []);
      }

      if (ordersRes.ok) {
        const data = await ordersRes.json();
        setOrders(data || []);
      }
    } catch (err) {
      console.error('Error fetching admin data:', err);
    }
  };

  // Toggle item stock
  const handleToggleStock = async (itemId: string, currentStock: boolean) => {
    const nextStock = !currentStock;
    // Optimistic update
    setMenuItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, isAvailable: nextStock } : it))
    );

    try {
      await fetch('/api/menu', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: itemId, isAvailable: nextStock }),
      });
    } catch (err) {
      console.error('Toggle stock error:', err);
      // Revert on error
      fetchAdminData();
    }
  };

  // Delete item
  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('Are you sure you want to delete this menu item?')) return;

    setMenuItems((prev) => prev.filter((it) => it.id !== itemId));
    try {
      await fetch(`/api/menu?id=${itemId}`, { method: 'DELETE' });
    } catch {
      fetchAdminData();
    }
  };

  // Save new item
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
          sizes: sizesArray.length > 0 ? sizesArray : ['Regular'],
        }),
      });

      if (res.ok) {
        setIsNewItemModalOpen(false);
        // Reset form
        setFormName('');
        setFormPrice('');
        setFormDesc('');
        setFormSubheading('');
        fetchAdminData();
      }
    } catch {
      alert('Failed to save item');
    }
  };

  // Save edit item
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
      }
    } catch {
      alert('Failed to update item');
    }
  };

  // Save Settings
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
        setSaveSuccessMsg('✓ All settings updated and synchronized across server and edge lambdas!');
        setTimeout(() => setSaveSuccessMsg(''), 4000);
      } else {
        alert('Failed to save settings');
      }
    } catch {
      alert('Network error while updating settings');
    }
  };

  // Reset Settings to Factory Defaults
  const handleResetSettings = async () => {
    if (!confirm('Are you sure you want to reset all cafe settings to original factory defaults? This cannot be undone.')) return;
    try {
      const res = await fetch('/api/admin', { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        if (data.settings) setSettings(data.settings);
        setSaveSuccessMsg('✓ All settings successfully restored to factory defaults!');
        setTimeout(() => setSaveSuccessMsg(''), 4000);
      }
    } catch {
      alert('Failed to reset settings');
    }
  };

  // Quick Preset: QA / Testing Mode
  const handleApplyQAPreset = () => {
    const qaConfig: CafeSettings = {
      ...settings,
      isOpen: true,
      geofencingEnabled: true,
      geofenceDevMode: true, // Calculate distance & log, but don't block
      tableKeyValidationStrict: false, // Allow direct table links without scanning
      minOrderAmount: 0,
      orderCooldownSeconds: 0,
      requireCustomerPhone: true,
    };
    setSettings(qaConfig);
    handleSaveSettings(undefined, qaConfig);
  };

  // Quick Preset: Production Maximum Lockdown
  const handleApplyProductionPreset = () => {
    const prodConfig: CafeSettings = {
      ...settings,
      isOpen: true,
      geofencingEnabled: true,
      geofenceDevMode: false,
      tableKeyValidationStrict: true,
      urlCleansingEnabled: true,
      sessionIsolationEnabled: true,
      geofenceRadiusMeters: 150,
      requireCustomerPhone: true,
      requireCustomerName: true,
      orderCooldownSeconds: 10,
    };
    setSettings(prodConfig);
    handleSaveSettings(undefined, prodConfig);
  };

  // Export Orders CSV
  const handleExportCSV = () => {
    if (orders.length === 0) {
      alert('No orders to export.');
      return;
    }

    const headers = ['Order #', 'Date', 'Time', 'Table', 'Customer Name', 'Phone', 'Flat', 'Items', 'Total', 'Status'];
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
    link.setAttribute('download', `OZKAFE_Orders_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const fetchAuditLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const res = await fetch('/api/audit-logs');
      if (res.ok) {
        const data = await res.json();
        if (data.logs) setAuditLogs(data.logs);
      }
    } catch (err) {
      console.warn('Failed to fetch audit logs:', err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const filteredAuditLogs = auditLogs.filter((log) => {
    const matchesActor = auditActorFilter === 'all' || log.actor === auditActorFilter;
    const matchesAction = auditActionFilter === 'all' || log.action.startsWith(auditActionFilter);
    return matchesActor && matchesAction;
  });

  // Filtered Menu
  const filteredMenuItems = menuItems.filter((it) => {
    const matchesSearch = it.name.toLowerCase().includes(menuSearch.toLowerCase()) ||
      (it.subheading && it.subheading.toLowerCase().includes(menuSearch.toLowerCase()));
    const matchesCat = menuCatFilter === 'all' || it.categoryId === menuCatFilter;
    return matchesSearch && matchesCat;
  });

  // Filtered Orders
  const filteredOrders = orders.filter((o) => {
    const matchesSearch =
      o.orderNumber.toLowerCase().includes(orderSearch.toLowerCase()) ||
      o.customerName.toLowerCase().includes(orderSearch.toLowerCase()) ||
      o.customerPhone.includes(orderSearch) ||
      (o.customerFlat && o.customerFlat.toLowerCase().includes(orderSearch.toLowerCase()));
    const matchesStatus = orderStatusFilter === 'all' || o.status === orderStatusFilter;
    return matchesSearch && matchesStatus;
  });

  // ── PIN AUTHENTICATION SCREEN ──
  if (!isAuthenticated) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F8F6F2',
        padding: 20,
      }}>
        <div className="pin-dialog-card">
          <Image
            src="/images/ozkafe_logo.jpeg"
            alt="OZKAFE"
            width={64}
            height={64}
            style={{ borderRadius: '50%', border: '2px solid #A66B33', margin: '0 auto 12px' }}
          />
          <h2 style={{ fontFamily: 'var(--font-display)', margin: 0, fontSize: '1.4rem' }}>
            OZKAFE Admin Center
          </h2>
          <p style={{ fontSize: 12, color: '#685E54', marginTop: 4 }}>
            Enter Master Staff PIN to configure menu, kitchen & cafe
          </p>

          <form onSubmit={handlePinSubmit} style={{ marginTop: 20 }}>
            <input
              type="password"
              maxLength={8}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="••••"
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '1.8rem',
                textAlign: 'center',
                letterSpacing: 10,
                borderRadius: 12,
                border: '1.5px solid #DCD2C5',
                outline: 'none',
                background: '#FAF8F5',
              }}
              autoFocus
            />

            {pinError && (
              <div style={{ color: '#DC2626', fontSize: 12, marginTop: 8, fontWeight: 600 }}>
                {pinError}
              </div>
            )}

            {/* Keypad */}
            <div className="pin-keypad">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  type="button"
                  className="pin-btn"
                  onClick={() => setPinInput((p) => p + num)}
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                className="pin-btn"
                style={{ fontSize: 13 }}
                onClick={() => setPinInput('')}
              >
                Clear
              </button>
              <button
                type="button"
                className="pin-btn"
                onClick={() => setPinInput((p) => p + '0')}
              >
                0
              </button>
              <button
                type="button"
                className="pin-btn"
                style={{ fontSize: 13 }}
                onClick={() => setPinInput((p) => p.slice(0, -1))}
              >
                ⌫
              </button>
            </div>

            <button
              type="submit"
              className="btn-solid"
              style={{ width: '100%', marginTop: 20 }}
            >
              UNLOCK CONTROL CENTER
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── MAIN ADMIN INTERFACE ──
  return (
    <div className="admin-wrapper">
      {/* ── SIDEBAR ── */}
      <aside className="admin-sidebar">
        <div className="admin-sidebar-header">
          <Image
            src="/images/ozkafe_logo.jpeg"
            alt="OZKAFE"
            width={38}
            height={38}
            style={{ borderRadius: '50%', border: '1.5px solid #A66B33' }}
          />
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15 }}>
              OZKAFE ADMIN
            </div>
            <div style={{ fontSize: 10, color: '#7C4A1E', fontWeight: 600, letterSpacing: 0.5 }}>
              Anassa · Control Center
            </div>
          </div>
        </div>

        <ul className="admin-nav-list">
          <li>
            <button
              className={`admin-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              📊 Executive Dashboard
            </button>
          </li>
          <li>
            <button
              className={`admin-nav-item ${activeTab === 'menu' ? 'active' : ''}`}
              onClick={() => setActiveTab('menu')}
            >
              🍽️ Menu Items ({menuItems.length})
            </button>
          </li>
          <li>
            <button
              className={`admin-nav-item ${activeTab === 'orders' ? 'active' : ''}`}
              onClick={() => setActiveTab('orders')}
            >
              📋 Orders & Financials
            </button>
          </li>
          <li>
            <Link
              href="/kitchen"
              target="_blank"
              className="admin-nav-item"
            >
              🔥 Kitchen Display (KDS) ↗
            </Link>
          </li>
          <li>
            <Link
              href="/qr"
              target="_blank"
              className="admin-nav-item"
            >
              📱 QR Code Suite ↗
            </Link>
          </li>
          <li>
            <button
              className={`admin-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              ⚙️ Cafe Configuration
            </button>
          </li>
          <li>
            <button
              className={`admin-nav-item ${activeTab === 'logs' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('logs');
                fetchAuditLogs();
              }}
            >
              🛡️ Audit Logs & Security
            </button>
          </li>
        </ul>

        <div className="admin-sidebar-footer">
          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              padding: '8px',
              fontSize: 12,
              fontWeight: 600,
              color: '#DC2626',
              background: '#FEE2E2',
              borderRadius: 8,
            }}
          >
            🔒 Lock Control Center
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main className="admin-main">
        <header className="admin-topbar">
          <h1 className="admin-topbar-title">
            {activeTab === 'dashboard' && 'Dashboard & Performance Metrics'}
            {activeTab === 'menu' && 'Menu & Live Stock Management'}
            {activeTab === 'orders' && 'Order Ledger & Financial Records'}
            {activeTab === 'settings' && 'Store Branding & System Settings'}
          </h1>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {dbStatus && (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '6px 12px',
                  borderRadius: 20,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: dbStatus.isConfigured ? '#DCFCE7' : '#FEF3C7',
                  color: dbStatus.isConfigured ? '#166534' : '#92400E',
                  border: `1px solid ${dbStatus.isConfigured ? '#86EFAC' : '#FCD34D'}`,
                }}
                title={dbStatus.isConfigured ? 'Connected to live Supabase PostgreSQL database' : 'Running in Local Memory Fallback (Configure SUPABASE_URL in Vercel to connect database)'}
              >
                <span>{dbStatus.isConfigured ? '🟢' : '🟡'}</span>
                <span>{dbStatus.isConfigured ? 'Supabase Live' : 'In-Memory Mode'}</span>
              </span>
            )}
            <Link
              href="/"
              target="_blank"
              className="btn-outline"
              style={{ height: 36, padding: '0 14px', fontSize: 12 }}
            >
              👁️ View Customer App ↗
            </Link>
            <button
              onClick={handleLogout}
              className="btn-outline"
              style={{
                height: 36,
                padding: '0 14px',
                fontSize: 12,
                color: '#DC2626',
                borderColor: '#FCA5A5',
                background: '#FEF2F2',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Lock admin session immediately"
            >
              🔒 Lock Admin
            </button>
          </div>
        </header>

        <div className="admin-body">
          {/* ════ TAB 1: DASHBOARD ════ */}
          {activeTab === 'dashboard' && (
            <div>
              <div className="admin-stats-grid">
                <div className="admin-stat-card">
                  <span className="admin-stat-label">Today's Revenue</span>
                  <span className="admin-stat-val">₹{formatCurrency(Number(stats.todayRevenue))}</span>
                  <span className="admin-stat-sub">From {stats.todayOrderCount} orders today</span>
                </div>

                <div className="admin-stat-card">
                  <span className="admin-stat-label">Active In Kitchen</span>
                  <span className="admin-stat-val" style={{ color: '#D97706' }}>
                    {stats.activeOrderCount}
                  </span>
                  <span className="admin-stat-sub">Orders currently being cooked</span>
                </div>

                <div className="admin-stat-card">
                  <span className="admin-stat-label">Total Lifetime Orders</span>
                  <span className="admin-stat-val">{stats.totalOrders}</span>
                  <span className="admin-stat-sub">Logged in database</span>
                </div>

                <div className="admin-stat-card">
                  <span className="admin-stat-label">Store Status</span>
                  <span className="admin-stat-val" style={{ color: settings.isOpen ? '#16A34A' : '#DC2626', fontSize: '1.4rem' }}>
                    {settings.isOpen ? '🟢 Open for Orders' : '🔴 Closed'}
                  </span>
                  <span className="admin-stat-sub">{settings.gstPercent}% GST Configured</span>
                </div>
              </div>

              {/* Popular Items */}
              <div className="admin-table-card">
                <div className="admin-table-toolbar">
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
                    🔥 Top Selling Dishes Today
                  </h3>
                </div>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Dish Name</th>
                      <th>Quantity Sold</th>
                      <th>Revenue Generated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.popularItems.length === 0 ? (
                      <tr>
                        <td colSpan={3} style={{ textAlign: 'center', color: '#888', padding: 24 }}>
                          No orders logged yet today
                        </td>
                      </tr>
                    ) : (
                      stats.popularItems.map((it, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 600 }}>{it.name}</td>
                          <td>{it.count} units</td>
                          <td style={{ fontWeight: 700, color: 'var(--brand-accent)' }}>₹{it.revenue}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ════ TAB 2: MENU MANAGEMENT ════ */}
          {activeTab === 'menu' && (
            <div>
              <div className="admin-table-card">
                <div className="admin-table-toolbar">
                  <div style={{ display: 'flex', gap: 10, flex: 1, flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      placeholder="Search by dish name or tag..."
                      className="admin-input"
                      style={{ maxWidth: 260 }}
                      value={menuSearch}
                      onChange={(e) => setMenuSearch(e.target.value)}
                    />
                    <select
                      className="admin-select"
                      style={{ maxWidth: 200 }}
                      value={menuCatFilter}
                      onChange={(e) => setMenuCatFilter(e.target.value)}
                    >
                      <option value="all">All Categories</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    className="btn-solid"
                    style={{ height: 38, padding: '0 16px', fontSize: 13 }}
                    onClick={() => setIsNewItemModalOpen(true)}
                  >
                    + Add New Dish
                  </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Image</th>
                        <th>Dish Name</th>
                        <th>Category</th>
                        <th>Price</th>
                        <th>Live Stock Switch</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMenuItems.map((item) => (
                        <tr key={item.id}>
                          <td style={{ width: 60 }}>
                            <Image
                              src={item.img}
                              alt={item.name}
                              width={48}
                              height={48}
                              style={{ borderRadius: 8, objectFit: 'cover' }}
                            />
                          </td>
                          <td>
                            <div style={{ fontWeight: 700 }}>{item.name}</div>
                            {item.subheading && (
                              <div style={{ fontSize: 11, color: '#7C4A1E', fontWeight: 600 }}>
                                {item.subheading}
                              </div>
                            )}
                            <div style={{ fontSize: 11.5, color: '#685E54', maxWidth: 300, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {item.desc}
                            </div>
                          </td>
                          <td>
                            <span style={{
                              fontSize: 11,
                              background: '#F4EFEA',
                              padding: '3px 8px',
                              borderRadius: 6,
                              fontWeight: 600
                            }}>
                              {item.category}
                            </span>
                          </td>
                          <td style={{ fontWeight: 700, color: 'var(--brand-accent)' }}>
                            ₹{item.price}
                          </td>
                          <td>
                            {/* iOS Style Live Stock Switch */}
                            <label className="stock-toggle-label">
                              <input
                                type="checkbox"
                                className="stock-checkbox"
                                checked={item.isAvailable}
                                onChange={() => handleToggleStock(item.id, item.isAvailable)}
                              />
                              <span className="stock-switch"></span>
                              <span className={`stock-status-text ${item.isAvailable ? 'stock-status-in' : 'stock-status-out'}`}>
                                {item.isAvailable ? 'In Stock' : 'Sold Out (86)'}
                              </span>
                            </label>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={() => setEditingItem(item)}
                                style={{
                                  padding: '5px 10px',
                                  fontSize: 12,
                                  background: '#FAF8F5',
                                  border: '1px solid #DCD2C5',
                                  borderRadius: 6,
                                  cursor: 'pointer'
                                }}
                              >
                                ✏️ Edit
                              </button>
                              <button
                                onClick={() => handleDeleteItem(item.id)}
                                style={{
                                  padding: '5px 10px',
                                  fontSize: 12,
                                  background: '#FEE2E2',
                                  border: '1px solid #FCA5A5',
                                  color: '#DC2626',
                                  borderRadius: 6,
                                  cursor: 'pointer'
                                }}
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ════ TAB 3: ORDERS & FINANCIALS ════ */}
          {activeTab === 'orders' && (
            <div>
              <div className="admin-table-card">
                <div className="admin-table-toolbar">
                  <div style={{ display: 'flex', gap: 10, flex: 1, flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      placeholder="Search by order #, name, phone, flat..."
                      className="admin-input"
                      style={{ maxWidth: 280 }}
                      value={orderSearch}
                      onChange={(e) => setOrderSearch(e.target.value)}
                    />
                    <select
                      className="admin-select"
                      style={{ maxWidth: 180 }}
                      value={orderStatusFilter}
                      onChange={(e) => setOrderStatusFilter(e.target.value)}
                    >
                      <option value="all">All Statuses</option>
                      <option value="received">Received</option>
                      <option value="preparing">Preparing</option>
                      <option value="ready">Ready</option>
                      <option value="served">Served / Archived</option>
                    </select>
                  </div>

                  <button
                    className="btn-outline"
                    style={{ height: 38, padding: '0 16px', fontSize: 13 }}
                    onClick={handleExportCSV}
                  >
                    📥 Export CSV Ledger
                  </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Order #</th>
                        <th>Time</th>
                        <th>Table</th>
                        <th>Customer</th>
                        <th>Flat</th>
                        <th>Items Count</th>
                        <th>Total Amount</th>
                        <th>Status</th>
                        <th>Slip</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.length === 0 ? (
                        <tr>
                          <td colSpan={9} style={{ textAlign: 'center', padding: 28, color: '#888' }}>
                            No orders match the filter
                          </td>
                        </tr>
                      ) : (
                        filteredOrders.map((ord) => (
                          <tr key={ord.id}>
                            <td style={{ fontWeight: 700 }}>{ord.orderNumber}</td>
                            <td style={{ fontSize: 12 }}>{new Date(ord.createdAt).toLocaleTimeString()}</td>
                            <td style={{ fontWeight: 600 }}>
                              {ord.tableNumber === 'Takeaway' ? 'Takeaway' : `Table ${ord.tableNumber}`}
                            </td>
                            <td>
                              <div>{ord.customerName}</div>
                              <div style={{ fontSize: 11, color: '#777' }}>{ord.customerPhone}</div>
                            </td>
                            <td>{ord.customerFlat || '—'}</td>
                            <td>{ord.items.length} items</td>
                            <td style={{ fontWeight: 700, color: 'var(--brand-accent)' }}>
                              ₹{formatCurrency(Number(ord.total))}
                            </td>
                            <td>
                              <span style={{
                                fontSize: 11,
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                padding: '3px 8px',
                                borderRadius: 6,
                                background: ord.status === 'served' ? '#F3F4F6' : ord.status === 'ready' ? '#DCFCE7' : ord.status === 'preparing' ? '#FEF3C7' : '#FEE2E2',
                                color: ord.status === 'served' ? '#4B5563' : ord.status === 'ready' ? '#166534' : ord.status === 'preparing' ? '#92400E' : '#991B1B'
                              }}>
                                {ord.status}
                              </span>
                            </td>
                            <td>
                              <button
                                onClick={() => setSelectedReceiptOrder(ord)}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: 11,
                                  background: '#FAF8F5',
                                  border: '1px solid #DCD2C5',
                                  borderRadius: 4,
                                  cursor: 'pointer'
                                }}
                              >
                                View 🧾
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ════ TAB 4: CAFE SETTINGS & LIVE CONFIGURATION ════ */}
          {activeTab === 'settings' && (
            <div style={{ maxWidth: 840 }}>
              {/* Header & Quick Action Presets */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
                <div>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', margin: '0 0 4px 0' }}>
                    Live Cafe Configuration & Feature Controls
                  </h2>
                  <p style={{ fontSize: 13, color: '#7C4A1E', margin: 0 }}>
                    Real-time operational controls synced immediately across serverless edge lambdas and customer menus.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={handleApplyQAPreset}
                    className="btn-outline"
                    title="Enable Simulation mode, open table links & 0 min order for frictionless testing"
                    style={{ fontSize: 12, padding: '6px 12px', background: '#FEF3C7', borderColor: '#F59E0B', color: '#92400E' }}
                  >
                    🧪 QA Testing Preset
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyProductionPreset}
                    className="btn-outline"
                    title="Activate strict physical geofence, strict table QR & high-security lockdown"
                    style={{ fontSize: 12, padding: '6px 12px', background: '#DCFCE7', borderColor: '#86EFAC', color: '#166534' }}
                  >
                    🛡️ Prod Lockdown Preset
                  </button>
                  <button
                    type="button"
                    onClick={handleResetSettings}
                    className="btn-outline"
                    style={{ fontSize: 12, padding: '6px 12px', color: '#DC2626', borderColor: '#FCA5A5' }}
                  >
                    🔄 Reset Factory
                  </button>
                </div>
              </div>

              {/* Success Toast */}
              {saveSuccessMsg && (
                <div style={{
                  background: '#DCFCE7',
                  color: '#166534',
                  border: '1px solid #86EFAC',
                  padding: '12px 16px',
                  borderRadius: 10,
                  marginBottom: 20,
                  fontWeight: 600,
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}>
                  <span>🎉</span> {saveSuccessMsg}
                </div>
              )}

              <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* ── CARD 1: STORE IDENTITY & STATUS ── */}
                <div className="admin-table-card" style={{ padding: 22 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid #F0EAE1', paddingBottom: 12 }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 16, fontFamily: 'var(--font-display)' }}>
                        🏪 Store Status & Branding
                      </h3>
                      <span style={{ fontSize: 12, color: '#7C4A1E' }}>
                        Controls ordering availability and receipt branding
                      </span>
                    </div>

                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: 'pointer',
                      padding: '6px 12px',
                      borderRadius: 8,
                      background: settings.isOpen ? '#DCFCE7' : '#FEE2E2',
                      color: settings.isOpen ? '#166534' : '#991B1B',
                      fontWeight: 700,
                      fontSize: 13,
                    }}>
                      <input
                        type="checkbox"
                        checked={settings.isOpen}
                        onChange={(e) => setSettings({ ...settings, isOpen: e.target.checked })}
                      />
                      <span>{settings.isOpen ? '🟢 Open for Orders' : '🔴 Closed'}</span>
                    </label>
                  </div>

                  {!settings.isOpen && (
                    <div className="admin-form-group" style={{ marginBottom: 16 }}>
                      <label style={{ color: '#991B1B', fontWeight: 600 }}>Custom Store Closed Notice (Shown to Customers)</label>
                      <input
                        type="text"
                        className="admin-input"
                        value={settings.closedMessage || ''}
                        onChange={(e) => setSettings({ ...settings, closedMessage: e.target.value })}
                        placeholder="e.g. We are closed for the night. Reopening tomorrow at 10 AM!"
                      />
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div className="admin-form-group" style={{ margin: 0 }}>
                      <label>Café Brand Name</label>
                      <input
                        type="text"
                        className="admin-input"
                        value={settings.cafeName}
                        onChange={(e) => setSettings({ ...settings, cafeName: e.target.value })}
                      />
                    </div>
                    <div className="admin-form-group" style={{ margin: 0 }}>
                      <label>Location Tagline</label>
                      <input
                        type="text"
                        className="admin-input"
                        value={settings.tagline}
                        onChange={(e) => setSettings({ ...settings, tagline: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="admin-form-group" style={{ marginTop: 14, marginBottom: 14 }}>
                    <label>Full Address</label>
                    <input
                      type="text"
                      className="admin-input"
                      value={settings.address}
                      onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                    <div className="admin-form-group" style={{ margin: 0 }}>
                      <label>Helpline / Phone</label>
                      <input
                        type="text"
                        className="admin-input"
                        value={settings.contactPhone || ''}
                        onChange={(e) => setSettings({ ...settings, contactPhone: e.target.value })}
                      />
                    </div>
                    <div className="admin-form-group" style={{ margin: 0 }}>
                      <label>GST Tax (%)</label>
                      <input
                        type="number"
                        className="admin-input"
                        value={settings.gstPercent}
                        onChange={(e) => setSettings({ ...settings, gstPercent: Number(e.target.value) })}
                      />
                    </div>
                    <div className="admin-form-group" style={{ margin: 0 }}>
                      <label>Currency Symbol</label>
                      <input
                        type="text"
                        className="admin-input"
                        value={settings.currencySymbol}
                        onChange={(e) => setSettings({ ...settings, currencySymbol: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* ── CARD 2: GEOFENCING & ANTI-PRANK SECURITY GUARD ── */}
                <div className="admin-table-card" style={{ padding: 22 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid #F0EAE1', paddingBottom: 12 }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 16, fontFamily: 'var(--font-display)' }}>
                        📍 Physical Geofence & Anti-Prank Security Guard
                      </h3>
                      <span style={{ fontSize: 12, color: '#7C4A1E' }}>
                        Blocks orders placed outside the cafe premises (e.g. remote URL sharing abuse)
                      </span>
                    </div>

                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: 'pointer',
                      padding: '6px 12px',
                      borderRadius: 8,
                      background: settings.geofencingEnabled ? '#DCFCE7' : '#F3F4F6',
                      color: settings.geofencingEnabled ? '#166534' : '#4B5563',
                      fontWeight: 700,
                      fontSize: 13,
                    }}>
                      <input
                        type="checkbox"
                        checked={settings.geofencingEnabled}
                        onChange={(e) => setSettings({ ...settings, geofencingEnabled: e.target.checked })}
                      />
                      <span>{settings.geofencingEnabled ? '🛡️ Guard Active' : 'Disabled'}</span>
                    </label>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                    <div className="admin-form-group" style={{ margin: 0 }}>
                      <label>Cafe Latitude</label>
                      <input
                        type="number"
                        step="0.0001"
                        className="admin-input"
                        value={settings.cafeLatitude}
                        onChange={(e) => setSettings({ ...settings, cafeLatitude: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="admin-form-group" style={{ margin: 0 }}>
                      <label>Cafe Longitude</label>
                      <input
                        type="number"
                        step="0.0001"
                        className="admin-input"
                        value={settings.cafeLongitude}
                        onChange={(e) => setSettings({ ...settings, cafeLongitude: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="admin-form-group" style={{ margin: 0 }}>
                      <label>Max Radius (Meters)</label>
                      <input
                        type="number"
                        className="admin-input"
                        value={settings.geofenceRadiusMeters}
                        onChange={(e) => setSettings({ ...settings, geofenceRadiusMeters: parseInt(e.target.value) || 150 })}
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => {
                        if ('geolocation' in navigator) {
                          navigator.geolocation.getCurrentPosition(
                            (pos) => {
                              setSettings({
                                ...settings,
                                cafeLatitude: parseFloat(pos.coords.latitude.toFixed(6)),
                                cafeLongitude: parseFloat(pos.coords.longitude.toFixed(6)),
                              });
                              alert(`📍 Set cafe coordinates to your current position: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
                            },
                            (err) => alert(`Unable to detect GPS position: ${err.message}`),
                            { enableHighAccuracy: true }
                          );
                        } else {
                          alert('Geolocation not supported by this browser.');
                        }
                      }}
                      style={{ fontSize: 12, padding: '5px 12px' }}
                    >
                      🎯 Calibrate with Current Device GPS
                    </button>

                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, cursor: 'pointer', maxWidth: 360 }}>
                      <input
                        type="checkbox"
                        checked={settings.allowTakeawayWithoutGeofence ?? false}
                        onChange={(e) => setSettings({ ...settings, allowTakeawayWithoutGeofence: e.target.checked })}
                        style={{ marginTop: 2 }}
                      />
                      <div>
                        <strong>Allow Remote Takeaway (Bypass Geofence)</strong>
                        <div style={{ fontSize: 10.5, color: '#7C4A1E' }}>
                          Default OFF: Takeaway & In-Flat orders enforce the Anassa geofence perimeter so nearby flat residents can order directly
                        </div>
                      </div>
                    </label>
                  </div>

                  {/* Testing & Developer Simulation Section */}
                  <div style={{
                    marginTop: 14,
                    padding: 12,
                    background: '#FDFBF7',
                    border: '1px dashed #D97706',
                    borderRadius: 8,
                  }}>
                    <strong style={{ fontSize: 12, color: '#B45309', display: 'block', marginBottom: 6 }}>
                      🧪 Testing & Remote Developer Controls
                    </strong>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={settings.geofenceDevMode ?? false}
                          onChange={(e) => setSettings({ ...settings, geofenceDevMode: e.target.checked })}
                        />
                        <span>Simulation Mode (Log distance, but don't reject)</span>
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: '#666', whiteSpace: 'nowrap' }}>Bypass Code:</span>
                        <input
                          type="text"
                          className="admin-input"
                          style={{ height: 28, fontSize: 11 }}
                          value={settings.geofenceTestBypassCode || ''}
                          onChange={(e) => setSettings({ ...settings, geofenceTestBypassCode: e.target.value })}
                          placeholder="e.g. ANASSA-DEV-PASS"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── CARD 3: TABLE QR & SESSION SECURITY ── */}
                <div className="admin-table-card" style={{ padding: 22 }}>
                  <div style={{ marginBottom: 14, borderBottom: '1px solid #F0EAE1', paddingBottom: 10 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontFamily: 'var(--font-display)' }}>
                      📱 Table QR & Session Security Guard
                    </h3>
                    <span style={{ fontSize: 12, color: '#7C4A1E' }}>
                      Manages cryptographic table session verification and URL address bar cleansing
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={settings.tableKeyValidationStrict ?? true}
                        onChange={(e) => setSettings({ ...settings, tableKeyValidationStrict: e.target.checked })}
                      />
                      <div>
                        <strong>Strict Table QR Key Validation</strong>
                        <div style={{ fontSize: 11, color: '#7C4A1E' }}>Requires scanned secret key. (Turn off for QA direct links)</div>
                      </div>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={settings.urlCleansingEnabled ?? true}
                        onChange={(e) => setSettings({ ...settings, urlCleansingEnabled: e.target.checked })}
                      />
                      <div>
                        <strong>Address Bar URL Cleansing</strong>
                        <div style={{ fontSize: 11, color: '#7C4A1E' }}>Scrubs &key=... from address bar after scan</div>
                      </div>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={settings.sessionIsolationEnabled ?? true}
                        onChange={(e) => setSettings({ ...settings, sessionIsolationEnabled: e.target.checked })}
                      />
                      <div>
                        <strong>Table Order Isolation</strong>
                        <div style={{ fontSize: 11, color: '#7C4A1E' }}>Customer only views their current session orders</div>
                      </div>
                    </label>

                    <div className="admin-form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: 12 }}>Session Inactivity Timeout (Minutes)</label>
                      <input
                        type="number"
                        className="admin-input"
                        value={settings.tableSessionTimeoutMinutes ?? 120}
                        onChange={(e) => setSettings({ ...settings, tableSessionTimeoutMinutes: parseInt(e.target.value) || 120 })}
                      />
                    </div>
                  </div>
                </div>

                {/* ── CARD 4: CUSTOMER ORDERING EXPERIENCE & CONTROLS ── */}
                <div className="admin-table-card" style={{ padding: 22 }}>
                  <div style={{ marginBottom: 14, borderBottom: '1px solid #F0EAE1', paddingBottom: 10 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontFamily: 'var(--font-display)' }}>
                      🛒 Customer Ordering Experience & Limits
                    </h3>
                    <span style={{ fontSize: 12, color: '#7C4A1E' }}>
                      Input validations, order thresholds, and spam prevention rules
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={settings.requireCustomerPhone ?? true}
                        onChange={(e) => setSettings({ ...settings, requireCustomerPhone: e.target.checked })}
                      />
                      <span>Mandatory Mobile Number</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={settings.requireCustomerName ?? true}
                        onChange={(e) => setSettings({ ...settings, requireCustomerName: e.target.checked })}
                      />
                      <span>Mandatory Customer Name</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={settings.allowCustomerFlatInput ?? true}
                        onChange={(e) => setSettings({ ...settings, allowCustomerFlatInput: e.target.checked })}
                      />
                      <span>Show Flat / Tower Field</span>
                    </label>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginTop: 14 }}>
                    <div className="admin-form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: 12 }}>Min Order Subtotal (₹)</label>
                      <input
                        type="number"
                        className="admin-input"
                        value={settings.minOrderAmount ?? 0}
                        onChange={(e) => setSettings({ ...settings, minOrderAmount: parseInt(e.target.value) || 0 })}
                        placeholder="0 for no minimum"
                      />
                    </div>
                    <div className="admin-form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: 12 }}>Max Items Per Order</label>
                      <input
                        type="number"
                        className="admin-input"
                        value={settings.maxItemsPerOrder ?? 25}
                        onChange={(e) => setSettings({ ...settings, maxItemsPerOrder: parseInt(e.target.value) || 25 })}
                      />
                    </div>
                    <div className="admin-form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: 12 }}>Double-Click Cooldown (Seconds)</label>
                      <input
                        type="number"
                        className="admin-input"
                        value={settings.orderCooldownSeconds ?? 10}
                        onChange={(e) => setSettings({ ...settings, orderCooldownSeconds: parseInt(e.target.value) || 10 })}
                      />
                    </div>
                  </div>
                </div>

                {/* ── CARD 5: KITCHEN DISPLAY (KDS) & PASSWORDS ── */}
                <div className="admin-table-card" style={{ padding: 22 }}>
                  <div style={{ marginBottom: 14, borderBottom: '1px solid #F0EAE1', paddingBottom: 10 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontFamily: 'var(--font-display)' }}>
                      🍳 Kitchen Display System & Security PINs
                    </h3>
                    <span style={{ fontSize: 12, color: '#7C4A1E' }}>
                      KDS order audio, card timer highlights, and access credentials
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div className="admin-form-group" style={{ margin: 0 }}>
                      <label>Master Admin PIN</label>
                      <input
                        type="text"
                        className="admin-input"
                        value={settings.adminPin}
                        onChange={(e) => setSettings({ ...settings, adminPin: e.target.value })}
                      />
                    </div>
                    <div className="admin-form-group" style={{ margin: 0 }}>
                      <label>Kitchen Staff PIN</label>
                      <input
                        type="text"
                        className="admin-input"
                        value={settings.kitchenPin || '1234'}
                        onChange={(e) => setSettings({ ...settings, kitchenPin: e.target.value })}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
                    <div className="admin-form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: 12 }}>KDS Warning Threshold (Minutes)</label>
                      <input
                        type="number"
                        className="admin-input"
                        value={settings.warningTimeMinutes ?? 10}
                        onChange={(e) => setSettings({ ...settings, warningTimeMinutes: parseInt(e.target.value) || 10 })}
                      />
                    </div>
                    <div className="admin-form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: 12 }}>KDS Danger / Urgent Threshold (Minutes)</label>
                      <input
                        type="number"
                        className="admin-input"
                        value={settings.dangerTimeMinutes ?? 15}
                        onChange={(e) => setSettings({ ...settings, dangerTimeMinutes: parseInt(e.target.value) || 15 })}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginTop: 14 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={settings.kitchenSoundEnabled}
                        onChange={(e) => setSettings({ ...settings, kitchenSoundEnabled: e.target.checked })}
                      />
                      <span>Order Arrival Chime Audio</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={settings.allowOrderCancellation ?? true}
                        onChange={(e) => setSettings({ ...settings, allowOrderCancellation: e.target.checked })}
                      />
                      <span>Allow 1-Tap Order Rejection</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={settings.autoAcceptOrders ?? false}
                        onChange={(e) => setSettings({ ...settings, autoAcceptOrders: e.target.checked })}
                      />
                      <span>Auto-Accept into Preparing</span>
                    </label>
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  className="btn-solid"
                  style={{ width: '100%', height: 46, fontSize: 15, fontWeight: 700 }}
                >
                  💾 Save All Configuration Changes
                </button>
              </form>
            </div>
          )}

          {/* ════ TAB: AUDIT LOGS & SECURITY ════ */}
          {activeTab === 'logs' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', margin: '0 0 4px 0' }}>
                    Security & Server Audit Trail
                  </h2>
                  <p style={{ fontSize: 13, color: '#7C4A1E', margin: 0 }}>
                    Chronological server-side log of staff logins, failed PIN attempts, database mutations, and live stock adjustments.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={fetchAuditLogs}
                    style={{ height: 38, padding: '0 14px', fontSize: 13 }}
                  >
                    🔄 Refresh Stream
                  </button>
                  <a
                    href="/api/audit-logs?export=csv"
                    className="btn-solid"
                    download
                    style={{ height: 38, padding: '0 16px', fontSize: 13, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    📥 Export CSV
                  </a>
                </div>
              </div>

              {/* Filters */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <select
                  className="admin-select"
                  value={auditActorFilter}
                  onChange={(e) => setAuditActorFilter(e.target.value)}
                  style={{ maxWidth: 220 }}
                >
                  <option value="all">All Actors (Admin, Kitchen, Customer)</option>
                  <option value="admin">Admin Only</option>
                  <option value="kitchen">Kitchen Staff Only</option>
                  <option value="customer">Customers Only</option>
                </select>

                <select
                  className="admin-select"
                  value={auditActionFilter}
                  onChange={(e) => setAuditActionFilter(e.target.value)}
                  style={{ maxWidth: 220 }}
                >
                  <option value="all">All Event Types</option>
                  <option value="AUTH">Authentication (Logins & Logouts)</option>
                  <option value="ORDER">Orders Lifecycle</option>
                  <option value="GEOFENCE">Geofence / Security Blocks</option>
                  <option value="STOCK">Stock Toggles (86ing)</option>
                  <option value="MENU">Menu Changes</option>
                </select>
              </div>

              {/* Audit Table */}
              <div className="admin-table-card">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Actor</th>
                      <th>Action</th>
                      <th>Event Details</th>
                      <th>Client IP</th>
                      <th>User Agent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoadingLogs ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '30px 0', color: '#7C4A1E' }}>
                          Loading audit trail...
                        </td>
                      </tr>
                    ) : filteredAuditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '30px 0', color: '#7C4A1E' }}>
                          No audit events recorded matching current filters.
                        </td>
                      </tr>
                    ) : (
                      filteredAuditLogs.map((log) => (
                        <tr key={log.id}>
                          <td style={{ fontSize: 12, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            <div style={{ fontSize: 10, color: '#888' }}>
                              {new Date(log.timestamp).toLocaleDateString()}
                            </div>
                          </td>
                          <td>
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              background:
                                log.actor === 'admin'
                                  ? 'rgba(166, 107, 51, 0.15)'
                                  : log.actor === 'kitchen'
                                  ? 'rgba(217, 119, 6, 0.15)'
                                  : 'rgba(22, 163, 74, 0.15)',
                              color:
                                log.actor === 'admin'
                                  ? '#7C4A1E'
                                  : log.actor === 'kitchen'
                                  ? '#B45309'
                                  : '#16A34A',
                            }}>
                              {log.actor}
                            </span>
                          </td>
                          <td>
                            <span style={{
                              fontSize: 11,
                              fontWeight: 600,
                              fontFamily: 'monospace',
                              color: log.action.includes('FAILED') ? '#DC2626' : 'var(--text-dark)'
                            }}>
                              {log.action}
                            </span>
                          </td>
                          <td style={{ fontSize: 13, fontWeight: 500 }}>
                            {log.details}
                          </td>
                          <td style={{ fontSize: 11, fontFamily: 'monospace', color: '#666' }}>
                            {log.ipAddress || '127.0.0.1'}
                          </td>
                          <td style={{ fontSize: 10, color: '#888', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {log.userAgent || 'Unknown'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── MODAL: ADD NEW ITEM ── */}
      {isNewItemModalOpen && (
        <div className="admin-modal-overlay" onClick={() => setIsNewItemModalOpen(false)}>
          <div className="admin-modal-box" onClick={(e) => e.stopPropagation()} style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontFamily: 'var(--font-display)' }}>Add New Menu Dish</h2>
              <button className="btn-close" onClick={() => setIsNewItemModalOpen(false)}>×</button>
            </div>

            <form onSubmit={handleSaveNewItem}>
              <div className="admin-form-group">
                <label>Dish Name *</label>
                <input
                  type="text"
                  className="admin-input"
                  required
                  placeholder="e.g. Signature Hazelnut Latte"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="admin-form-group">
                  <label>Category *</label>
                  <select
                    className="admin-select"
                    value={formCategoryId}
                    onChange={(e) => {
                      const selCat = categories.find((c) => c.id === e.target.value);
                      setFormCategoryId(e.target.value);
                      if (selCat) setFormCategory(selCat.title);
                    }}
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="admin-form-group">
                  <label>Price (₹) *</label>
                  <input
                    type="number"
                    className="admin-input"
                    required
                    placeholder="129"
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                  />
                </div>
              </div>

              <div className="admin-form-group">
                <label>Subheading Tag (e.g. WHITE COFFEES, APPETIZERS)</label>
                <input
                  type="text"
                  className="admin-input"
                  placeholder="WHITE COFFEES"
                  value={formSubheading}
                  onChange={(e) => setFormSubheading(e.target.value)}
                />
              </div>

              <div className="admin-form-group">
                <label>Description</label>
                <textarea
                  className="admin-textarea"
                  rows={2}
                  placeholder="Freshly prepared with artisan ingredients..."
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                />
              </div>

              <div className="admin-form-group">
                <label>Image Asset URL</label>
                <input
                  type="text"
                  className="admin-input"
                  placeholder="/images/cappuccino.png"
                  value={formImg}
                  onChange={(e) => setFormImg(e.target.value)}
                />
              </div>

              <div className="admin-form-group">
                <label>Available Sizes (comma separated)</label>
                <input
                  type="text"
                  className="admin-input"
                  placeholder="Regular, Large"
                  value={formSizes}
                  onChange={(e) => setFormSizes(e.target.value)}
                />
              </div>

              <button type="submit" className="btn-solid" style={{ width: '100%', marginTop: 12 }}>
                Save & Add to Menu
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: EDIT ITEM ── */}
      {editingItem && (
        <div className="admin-modal-overlay" onClick={() => setEditingItem(null)}>
          <div className="admin-modal-box" onClick={(e) => e.stopPropagation()} style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontFamily: 'var(--font-display)' }}>Edit Dish Details</h2>
              <button className="btn-close" onClick={() => setEditingItem(null)}>×</button>
            </div>

            <form onSubmit={handleSaveEditItem}>
              <div className="admin-form-group">
                <label>Dish Name</label>
                <input
                  type="text"
                  className="admin-input"
                  value={editingItem.name}
                  onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="admin-form-group">
                  <label>Price (₹)</label>
                  <input
                    type="number"
                    className="admin-input"
                    value={editingItem.price}
                    onChange={(e) => setEditingItem({ ...editingItem, price: Number(e.target.value) })}
                  />
                </div>
                <div className="admin-form-group">
                  <label>Subheading</label>
                  <input
                    type="text"
                    className="admin-input"
                    value={editingItem.subheading || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, subheading: e.target.value })}
                  />
                </div>
              </div>

              <div className="admin-form-group">
                <label>Description</label>
                <textarea
                  className="admin-textarea"
                  rows={2}
                  value={editingItem.desc}
                  onChange={(e) => setEditingItem({ ...editingItem, desc: e.target.value })}
                />
              </div>

              <div className="admin-form-group">
                <label>Image URL</label>
                <input
                  type="text"
                  className="admin-input"
                  value={editingItem.img}
                  onChange={(e) => setEditingItem({ ...editingItem, img: e.target.value })}
                />
              </div>

              <button type="submit" className="btn-solid" style={{ width: '100%', marginTop: 12 }}>
                Save Updates
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: ORDER RECEIPT ── */}
      {selectedReceiptOrder && (
        <div className="admin-modal-overlay" onClick={() => setSelectedReceiptOrder(null)}>
          <div className="admin-modal-box" onClick={(e) => e.stopPropagation()} style={{ padding: 24, maxWidth: 400 }}>
            <div style={{ textAlign: 'center', borderBottom: '1px dashed #000', paddingBottom: 10, marginBottom: 12 }}>
              <h2 style={{ fontSize: 18, margin: 0 }}>OZKAFE — ANASSA</h2>
              <div style={{ fontSize: 12 }}>OFFICIAL ORDER RECEIPT</div>
              <div style={{ fontSize: 14, fontWeight: 'bold', marginTop: 4 }}>
                {selectedReceiptOrder.orderNumber}
              </div>
              <div style={{ fontSize: 11 }}>
                {new Date(selectedReceiptOrder.createdAt).toLocaleString()}
              </div>
            </div>

            <div style={{ fontSize: 12, marginBottom: 10 }}>
              <div><strong>Table:</strong> {selectedReceiptOrder.tableNumber}</div>
              <div><strong>Guest:</strong> {selectedReceiptOrder.customerName} ({selectedReceiptOrder.customerPhone})</div>
              {selectedReceiptOrder.customerFlat && (
                <div><strong>Flat No:</strong> {selectedReceiptOrder.customerFlat}</div>
              )}
            </div>

            <table style={{ width: '100%', fontSize: 12, borderBottom: '1px dashed #000', paddingBottom: 8, marginBottom: 8 }}>
              <thead>
                <tr style={{ textAlign: 'left' }}>
                  <th>QTY</th>
                  <th>ITEM</th>
                  <th style={{ textAlign: 'right' }}>PRICE</th>
                </tr>
              </thead>
              <tbody>
                {selectedReceiptOrder.items.map((it, i) => (
                  <tr key={i}>
                    <td>{it.quantity}x</td>
                    <td>{it.name}</td>
                    <td style={{ textAlign: 'right' }}>₹{it.price * it.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
              <span>Subtotal:</span>
              <span>₹{formatCurrency(Number(selectedReceiptOrder.subtotal))}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
              <span>GST ({settings.gstPercent || 5}%):</span>
              <span>₹{formatCurrency(Number(selectedReceiptOrder.taxAmount))}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, borderTop: '1px solid #000', paddingTop: 6 }}>
              <span>Grand Total:</span>
              <span>₹{formatCurrency(Number(selectedReceiptOrder.total))}</span>
            </div>

            <button
              className="btn-solid"
              style={{ width: '100%', marginTop: 16 }}
              onClick={() => setSelectedReceiptOrder(null)}
            >
              Close Receipt
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
