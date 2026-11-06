'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { Order, OrderStatus, StaffUser, MenuItem } from '@/lib/types';
import StaffAuthModal from '@/components/StaffAuthModal';
import AccountPanel from '@/components/AccountPanel';

export default function KitchenDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<StaffUser | null>(null);
  const [isAccountPanelOpen, setIsAccountPanelOpen] = useState(false);
  const [staffName, setStaffName] = useState('');

  // Top Section Mode: 'board' (Live KDS), 'settlement' (Bill Settlement), 'history' (15-Day Order History)
  const [kitchenViewMode, setKitchenViewMode] = useState<'board' | 'settlement' | 'history'>('board');

  const [orders, setOrders] = useState<Order[]>([]);
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState('all');

  // Bill Settlement State
  const [settleSearch, setSettleSearch] = useState('');
  const [settleFilter, setSettleFilter] = useState<'all' | 'unsettled' | 'settled'>('unsettled');
  const [isSettlingId, setIsSettlingId] = useState<string | null>(null);

  // Receipt Editing State for Kitchen Staff
  const [availableMenuItems, setAvailableMenuItems] = useState<MenuItem[]>([]);
  const [editingReceiptOrder, setEditingReceiptOrder] = useState<Order | null>(null);
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editCustomerPhone, setEditCustomerPhone] = useState('');
  const [editCustomerFlat, setEditCustomerFlat] = useState('');
  const [editTableNumber, setEditTableNumber] = useState('Takeaway');
  const [editItems, setEditItems] = useState<{ id: string; name: string; price: number; quantity: number; selectedSize?: string }[]>([]);
  const [editNotes, setEditNotes] = useState('');
  const [editAddItemId, setEditAddItemId] = useState('');
  const [isSavingReceipt, setIsSavingReceipt] = useState(false);

  const [recentServed, setRecentServed] = useState<Order[]>([]);
  const [isRecentServedOpen, setIsRecentServedOpen] = useState(false);
  const [clock, setClock] = useState('00:00:00');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [printOrder, setPrintOrder] = useState<Order | null>(null);
  const [activeMobileTab, setActiveMobileTab] = useState<'received' | 'preparing' | 'ready'>('received');
  const previousOrderIdsRef = useRef<Set<string>>(new Set());

  // Dynamic KDS Configuration
  const [kitchenSettings, setKitchenSettings] = useState<{
    warningTimeMinutes: number;
    dangerTimeMinutes: number;
    allowOrderCancellation: boolean;
  }>({
    warningTimeMinutes: 10,
    dangerTimeMinutes: 15,
    allowOrderCancellation: true,
  });

  const fetchKitchenSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          setKitchenSettings({
            warningTimeMinutes: data.settings.warningTimeMinutes ?? 10,
            dangerTimeMinutes: data.settings.dangerTimeMinutes ?? 15,
            allowOrderCancellation: data.settings.allowOrderCancellation ?? true,
          });
          if (data.settings.kitchenSoundEnabled !== undefined) {
            setSoundEnabled(data.settings.kitchenSoundEnabled);
          }
        }
      }
    } catch {
      // silent
    }
  };

  // Check persistent kitchen session on mount (do NOT lock on refresh!)
  useEffect(() => {
    fetchKitchenSettings();

    // Verify session with server
    fetch(`/api/kitchen/auth?_t=${Date.now()}`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated && data.staff) {
            setIsAuthenticated(true);
            setCurrentUser(data.staff);
            setStaffName(data.staff.name);
            fetchOrders();
          }
        }
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    if (!confirm('Lock Kitchen Display and sign out?')) return;
    localStorage.removeItem('anassa_kitchen_session');
    setIsAuthenticated(false);
    setCurrentUser(null);
    setIsAccountPanelOpen(false);
    await fetch('/api/kitchen/auth', { method: 'DELETE' });
  };

  // Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setClock(
        now.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch active orders
  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders?status=active&_t=${Date.now()}`);
      if (res.status === 401) {
        setIsAuthenticated(false);
        return;
      }
      if (res.ok) {
        const data: Order[] = await res.json();
        
        // Detect newly arrived orders
        const currentIds = new Set(data.map((o) => o.id));
        let hasNew = false;
        data.forEach((o) => {
          if (o.status === 'received' && !previousOrderIdsRef.current.has(o.id)) {
            hasNew = true;
          }
        });

        if (hasNew && previousOrderIdsRef.current.size > 0 && soundEnabled) {
          playChime();
        }

        previousOrderIdsRef.current = currentIds;
        setOrders(data);
      }
    } catch (err) {
      console.warn('KDS fetch error:', err);
    }
  }, [soundEnabled]);

  // Fetch 15-day kitchen order history
  const fetchHistoryOrders = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/orders?history=true&_t=${Date.now()}`);
      if (res.ok) {
        const data: Order[] = await res.json();
        setHistoryOrders(data);
      }
    } catch (err) {
      console.warn('KDS history fetch error:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  // Fetch available menu items for receipt editing
  const fetchMenuItems = useCallback(async () => {
    try {
      const res = await fetch('/api/menu');
      if (res.ok) {
        const data = await res.json();
        if (data.items) setAvailableMenuItems(data.items);
      }
    } catch {
      // silent
    }
  }, []);

  // Combined list for bill settlement and history
  const allCombinedOrders = useMemo(() => {
    const map = new Map<string, Order>();
    orders.forEach((o) => map.set(o.id, o));
    historyOrders.forEach((o) => map.set(o.id, o));
    recentServed.forEach((o) => map.set(o.id, o));
    return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
  }, [orders, historyOrders, recentServed]);

  const unsettledOrdersCount = useMemo(() => {
    return allCombinedOrders.filter((o) => !o.isPaid && o.status !== 'cancelled').length;
  }, [allCombinedOrders]);

  // Settlement filter
  const filteredSettlementOrders = useMemo(() => {
    return allCombinedOrders.filter((o) => {
      if (o.status === 'cancelled') return false;
      if (settleFilter === 'unsettled' && o.isPaid) return false;
      if (settleFilter === 'settled' && !o.isPaid) return false;

      if (settleSearch.trim()) {
        const q = settleSearch.toLowerCase().trim();
        const num = (o.orderNumber || '').toLowerCase();
        const name = (o.customerName || '').toLowerCase();
        const phone = (o.customerPhone || '').toLowerCase();
        const flat = (o.customerFlat || '').toLowerCase();
        return num.includes(q) || name.includes(q) || phone.includes(q) || flat.includes(q);
      }
      return true;
    });
  }, [allCombinedOrders, settleFilter, settleSearch]);

  // 15-day history filter (strictly orders from the last 15 days; older kept hidden)
  const filteredHistoryOrders = useMemo(() => {
    const fifteenDaysAgo = Date.now() - 15 * 24 * 60 * 60 * 1000;
    return allCombinedOrders.filter((o) => {
      if (o.createdAt < fifteenDaysAgo) return false;

      if (historyStatusFilter !== 'all' && o.status !== historyStatusFilter) return false;

      if (historySearch.trim()) {
        const q = historySearch.toLowerCase().trim();
        const num = (o.orderNumber || '').toLowerCase();
        const name = (o.customerName || '').toLowerCase();
        const phone = (o.customerPhone || '').toLowerCase();
        const flat = (o.customerFlat || '').toLowerCase();
        return num.includes(q) || name.includes(q) || phone.includes(q) || flat.includes(q);
      }
      return true;
    });
  }, [allCombinedOrders, historyStatusFilter, historySearch]);

  // Settle bill action
  const handleSettleBill = async (orderId: string) => {
    setIsSettlingId(orderId);
    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: orderId,
          action: 'settle_bill',
          staffName: currentUser?.name || staffName || 'Kitchen Staff',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const updated = data.order || { id: orderId, isPaid: true, paidAt: Date.now(), settledBy: currentUser?.name || staffName };

        setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...updated } : o)));
        setHistoryOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...updated } : o)));
        setRecentServed((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...updated } : o)));
        if (printOrder?.id === orderId) {
          setPrintOrder((prev) => (prev ? { ...prev, ...updated } : null));
        }
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to settle bill');
      }
    } catch {
      alert('Network error while settling bill');
    } finally {
      setIsSettlingId(null);
    }
  };

  // Open receipt editor
  const handleOpenEditReceipt = (order: Order) => {
    setEditingReceiptOrder(order);
    setEditCustomerName(order.customerName || '');
    setEditCustomerPhone(order.customerPhone || '');
    setEditCustomerFlat(order.customerFlat || '');
    setEditTableNumber(String(order.tableNumber ?? 'Takeaway'));
    setEditItems(
      (order.items || []).map((it) => ({
        id: it.id,
        name: it.name,
        price: Number(it.price) || 0,
        quantity: Number(it.quantity) || 1,
        selectedSize: it.selectedSize || 'Regular',
      }))
    );
    setEditNotes(order.specialInstructions || '');
    setEditAddItemId('');
  };

  const handleItemQtyChange = (index: number, delta: number) => {
    setEditItems((prev) => {
      const copy = [...prev];
      const newQty = Math.max(1, (copy[index].quantity || 1) + delta);
      copy[index] = { ...copy[index], quantity: newQty };
      return copy;
    });
  };

  const handleUpdateItemPrice = (index: number, newPrice: number) => {
    setEditItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], price: Math.max(0, newPrice) };
      return copy;
    });
  };

  const handleRemoveItem = (index: number) => {
    setEditItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddItem = () => {
    if (!editAddItemId) return;
    const dish = availableMenuItems.find((m) => m.id === editAddItemId);
    if (!dish) return;
    setEditItems((prev) => [
      ...prev,
      {
        id: dish.id,
        name: dish.name,
        price: dish.price,
        quantity: 1,
        selectedSize: dish.sizes?.[0] || 'Regular',
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

    setIsSavingReceipt(true);
    try {
      const subtotal = editItems.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0);
      const gstRate = 5;
      const taxAmount = Number(((subtotal * gstRate) / 100).toFixed(2));
      const total = Number((subtotal + taxAmount).toFixed(2));

      const updates: Partial<Order> = {
        customerName: editCustomerName.trim() || 'Guest',
        customerPhone: editCustomerPhone.trim(),
        customerFlat: editCustomerFlat.trim() || undefined,
        tableNumber: editTableNumber,
        items: editItems,
        subtotal,
        taxAmount,
        total,
        specialInstructions: editNotes.trim() || undefined,
      };

      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingReceiptOrder.id,
          action: 'edit_receipt',
          updates,
          staffName: currentUser?.name || staffName || 'Kitchen Staff',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const updated = data.order || { ...editingReceiptOrder, ...updates };

        setOrders((prev) => prev.map((o) => (o.id === editingReceiptOrder.id ? updated : o)));
        setHistoryOrders((prev) => prev.map((o) => (o.id === editingReceiptOrder.id ? updated : o)));
        setRecentServed((prev) => prev.map((o) => (o.id === editingReceiptOrder.id ? updated : o)));

        if (printOrder?.id === editingReceiptOrder.id) {
          setPrintOrder(updated);
        }
        setEditingReceiptOrder(null);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to update receipt');
      }
    } catch {
      alert('Network error while updating receipt');
    } finally {
      setIsSavingReceipt(false);
    }
  };

  // Sound chime
  const playChime = () => {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch {
      // AudioContext unavailable or blocked
    }
  };

  // Initial fetch and Realtime SSE + Smart Polling Fallback
  useEffect(() => {
    if (!isAuthenticated) return;

    fetchOrders();
    fetchHistoryOrders();
    fetchMenuItems();

    // 1. Server-Sent Events (SSE) Stream
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/orders/stream');
      eventSource.addEventListener('order', () => {
        fetchOrders();
        fetchHistoryOrders();
      });
    } catch (err) {
      console.warn('SSE connection failed, using smart poll:', err);
    }

    // 2. Fallback Polling every 4 seconds
    const interval = setInterval(() => {
      fetchOrders();
    }, 4000);

    return () => {
      clearInterval(interval);
      if (eventSource) eventSource.close();
    };
  }, [isAuthenticated, fetchOrders, fetchHistoryOrders, fetchMenuItems]);

  // Advance Order Status (Instant Optimistic UI Updates + Receipt on Served!)
  const handleUpdateStatus = async (orderId: string, nextStatus: OrderStatus) => {
    const previousOrders = [...orders];
    const targetOrder = orders.find((o) => o.id === orderId);

    // Instant optimistic update: remove immediately when served/cancelled
    if (nextStatus === 'served' || nextStatus === 'cancelled') {
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      if (nextStatus === 'served' && targetOrder) {
        const servedOrder: Order = { ...targetOrder, status: 'served', updatedAt: Date.now() };
        setRecentServed((prev) => [servedOrder, ...prev.filter((o) => o.id !== orderId).slice(0, 19)]);
        // Open the final bill receipt modal at the end!
        setPrintOrder(servedOrder);
      }
    } else {
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus, updatedAt: Date.now() } : o))
      );
    }

    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orderId, status: nextStatus }),
      });
      if (res.status === 401) {
        setIsAuthenticated(false);
        localStorage.removeItem('anassa_kitchen_session');
        alert('Session expired. Please sign in with Kitchen Staff credentials.');
        return;
      }
      if (!res.ok) {
        setOrders(previousOrders);
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to update order status');
      }
    } catch {
      setOrders(previousOrders);
      alert('Network error while updating order status');
    }
  };

  // Fullscreen toggle
  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Filter columns
  const receivedOrders = orders.filter((o) => o.status === 'received');
  const preparingOrders = orders.filter((o) => o.status === 'preparing');
  const readyOrders = orders.filter((o) => o.status === 'ready');

  // Elapsed time calculation
  const getElapsedMinutes = (timestamp: number) => {
    return Math.floor((Date.now() - timestamp) / 60000);
  };

  // ── STAFF AUTHENTICATION GATE ──
  if (!isAuthenticated) {
    return (
      <StaffAuthModal
        isOpen={!isAuthenticated}
        consoleType="kitchen"
        onAuthenticated={(user) => {
          setCurrentUser(user);
          setIsAuthenticated(true);
          setStaffName(user.name);
          fetchOrders();
        }}
      />
    );
  }

  return (
    <div className="kitchen-wrapper">
      {/* ── HEADER ── */}
      <header className="kitchen-header">
        <div className="kitchen-header-left">
          <Image
            src="/images/ozkafe_logo.jpeg"
            alt="OZKAFE"
            width={44}
            height={44}
            className="kitchen-logo"
            style={{ borderRadius: 10 }}
          />
          <div>
            <h1 className="kitchen-title">OZKAFE</h1>
            <span className="kitchen-subtitle">KITCHEN DISPLAY SYSTEM (KDS) · {staffName || 'Staff On Duty'}</span>
          </div>
        </div>

        <div className="kitchen-header-right">
          <span className="kds-status-badge">
            <span className="status-live-dot" /> LIVE
          </span>
          <div className="kitchen-clock">{clock}</div>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`btn-kds-header ${soundEnabled ? 'active' : ''}`}
            title="Toggle Order Arrival Audio Chime"
          >
            {soundEnabled ? '🔔 Sound ON' : '🔕 Muted'}
          </button>

          {recentServed.length > 0 && (
            <button
              onClick={() => setIsRecentServedOpen(true)}
              className="btn-kds-header"
              title="View & Reprint Recent Served Orders"
              style={{ background: '#F4EFEA', color: '#1A1410', fontWeight: 700 }}
            >
              📋 Served History ({recentServed.length})
            </button>
          )}

          <button
            onClick={toggleFullScreen}
            className="btn-kds-header"
            title="Toggle KDS Fullscreen"
          >
            ⛶ Fullscreen
          </button>

          {/* Account Profile Badge Button */}
          <div
            onClick={() => setIsAccountPanelOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 10px',
              borderRadius: 8,
              background: '#FFFFFF',
              border: '1px solid #E5DFD7',
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
            title="Click to view & customize account"
          >
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                background: currentUser?.avatarColor || '#15803D',
                color: '#FFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: 11,
              }}
            >
              {currentUser?.avatarInitials || 'KS'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#1A1410', lineHeight: 1.2 }}>
                {currentUser?.name || staffName || 'Kitchen Staff'}
              </span>
              <span style={{ fontSize: 10, color: '#685E54' }}>
                {currentUser?.badge || 'Kitchen Lead'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* ── KITCHEN TOP VIEW NAVIGATION (Live KDS Board, Bill Settlement, 15-Day History) ── */}
      <nav className="kds-view-nav" aria-label="Kitchen Display Sections">
        <button
          type="button"
          onClick={() => setKitchenViewMode('board')}
          className={`kds-view-btn ${kitchenViewMode === 'board' ? 'active' : ''}`}
        >
          <span>🍳 Live KDS Board</span>
          <span className="kds-view-badge">{orders.length}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setKitchenViewMode('settlement');
            fetchHistoryOrders();
          }}
          className={`kds-view-btn ${kitchenViewMode === 'settlement' ? 'active' : ''}`}
        >
          <span>💰 Bill Settlement</span>
          {unsettledOrdersCount > 0 ? (
            <span className="kds-view-badge unsettled">{unsettledOrdersCount} Pending</span>
          ) : (
            <span className="kds-view-badge">0</span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setKitchenViewMode('history');
            fetchHistoryOrders();
          }}
          className={`kds-view-btn ${kitchenViewMode === 'history' ? 'active' : ''}`}
        >
          <span>📜 Order History</span>
          <span className="kds-view-badge">Past 15 Days</span>
        </button>
      </nav>

      {/* ── VIEW 1: LIVE KANBAN BOARD ── */}
      {kitchenViewMode === 'board' && (
        <>
          {/* MOBILE COLUMN TABS (Under 768px) */}
          <nav className="kds-mobile-nav" aria-label="Kitchen Display Columns">
            <button
              type="button"
              onClick={() => setActiveMobileTab('received')}
              className={`kds-mobile-tab-btn tab-received ${activeMobileTab === 'received' ? 'active' : ''}`}
            >
              <span>🔴 New Orders</span>
              <span className="col-count-badge">{receivedOrders.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveMobileTab('preparing')}
              className={`kds-mobile-tab-btn tab-prep ${activeMobileTab === 'preparing' ? 'active' : ''}`}
            >
              <span>🟡 In Prep</span>
              <span className="col-count-badge">{preparingOrders.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveMobileTab('ready')}
              className={`kds-mobile-tab-btn tab-ready ${activeMobileTab === 'ready' ? 'active' : ''}`}
            >
              <span>🟢 Ready</span>
              <span className="col-count-badge">{readyOrders.length}</span>
            </button>
          </nav>

          {/* 3-COLUMN BOARD */}
          <main className="kds-board">
            {/* COLUMN 1: NEW / RECEIVED */}
            <section className={`kds-column col-type-received ${activeMobileTab === 'received' ? 'mobile-active' : 'mobile-hidden'}`}>
              <div className="column-header col-received">
                <div className="col-header-left">
                  <span className="col-dot"></span>
                  <h2>NEW ORDERS</h2>
                </div>
                <span className="col-count-badge">{receivedOrders.length}</span>
              </div>

              <div className="kds-cards-container">
                {receivedOrders.length === 0 ? (
                  <div className="empty-kds-state">
                    <span className="empty-icon">☕</span>
                    <p>No incoming orders at the moment</p>
                    <span className="empty-sub">New customer and takeaway orders will chime and appear here in real-time.</span>
                  </div>
                ) : (
                  receivedOrders.map((order) => {
                    const elapsedMinutes = getElapsedMinutes(order.createdAt);
                    const isDanger = elapsedMinutes >= kitchenSettings.dangerTimeMinutes;
                    const isWarning = elapsedMinutes >= kitchenSettings.warningTimeMinutes;

                    return (
                      <div
                        key={order.id}
                        className={`kds-order-card ${isDanger ? 'timer-danger' : isWarning ? 'timer-warning' : ''}`}
                      >
                        <div className="card-top-bar">
                          <div className="table-badge">
                            {order.tableNumber === 'Takeaway' || order.tableNumber === 0 ? (
                              <span>🥡 TAKEAWAY & IN-FLAT</span>
                            ) : (
                              <span>🍽️ TABLE {order.tableNumber}</span>
                            )}
                          </div>
                          <div className="order-timer">
                            <span>⏱️ {elapsedMinutes}m ago</span>
                          </div>
                        </div>

                        <div className="card-customer-row">
                          <span className="card-cust-name">👤 {order.customerName}</span>
                          <span className="card-cust-phone">{order.customerPhone}</span>
                        </div>

                        {order.customerFlat && (
                          <div className="card-flat-row">
                            <span>🏢 Flat: <strong>{order.customerFlat}</strong></span>
                          </div>
                        )}

                        <div className="card-order-num">
                          {order.orderNumber}
                        </div>

                        <div style={{ fontSize: 11, color: '#78716C', margin: '2px 0 6px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>📅 {new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                          <span>•</span>
                          <span>⏰ {new Date(order.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>

                        <div className="card-items-list">
                          {order.items.map((it, idx) => (
                            <div key={idx} className="kds-item-row">
                              <span className="item-qty">{it.quantity}x</span>
                              <span className="item-name">
                                {it.name}
                                {it.selectedSize && it.selectedSize !== 'Regular' && (
                                  <span className="item-size-tag">({it.selectedSize})</span>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className="kds-card-actions">
                          <button
                            className="kds-action-btn btn-start-prep"
                            onClick={() => handleUpdateStatus(order.id, 'preparing')}
                          >
                            ▶ Start Prep
                          </button>

                          <button
                            type="button"
                            className="btn-kds-view-receipt"
                            title="View / Print Receipt"
                            onClick={() => setPrintOrder(order)}
                          >
                            🧾 Bill
                          </button>

                          <button
                            type="button"
                            className="btn-kds-edit-receipt"
                            title="Edit Order / Receipt"
                            onClick={() => handleOpenEditReceipt(order)}
                          >
                            ✏️ Edit
                          </button>

                          {kitchenSettings.allowOrderCancellation && (
                            <button
                              className="btn-reject-order"
                              title="Reject / Void suspicious order"
                              onClick={() => {
                                if (confirm(`Reject / Void suspicious order #${order.orderNumber || order.id.slice(0, 8)}?`)) {
                                  handleUpdateStatus(order.id, 'cancelled');
                                }
                              }}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            {/* COLUMN 2: IN PREPARATION */}
            <section className={`kds-column col-type-preparing ${activeMobileTab === 'preparing' ? 'mobile-active' : 'mobile-hidden'}`}>
              <div className="column-header col-preparing">
                <div className="col-header-left">
                  <span className="col-dot"></span>
                  <h2>IN PREPARATION</h2>
                </div>
                <span className="col-count-badge">{preparingOrders.length}</span>
              </div>

              <div className="kds-cards-container">
                {preparingOrders.length === 0 ? (
                  <div className="empty-kds-state">
                    <span className="empty-icon">🍳</span>
                    <p>No orders currently in preparation</p>
                    <span className="empty-sub">Tap &quot;▶ Start Prep&quot; on any new order to move it to prep.</span>
                  </div>
                ) : (
                  preparingOrders.map((order) => {
                    const elapsedMinutes = getElapsedMinutes(order.createdAt);
                    const isDanger = elapsedMinutes >= kitchenSettings.dangerTimeMinutes;
                    const isWarning = elapsedMinutes >= kitchenSettings.warningTimeMinutes;

                    return (
                      <div
                        key={order.id}
                        className={`kds-order-card card-in-prep ${isDanger ? 'timer-danger' : isWarning ? 'timer-warning' : ''}`}
                      >
                        <div className="card-top-bar">
                          <div className="table-badge prep">
                            {order.tableNumber === 'Takeaway' || order.tableNumber === 0 ? (
                              <span>🥡 TAKEAWAY</span>
                            ) : (
                              <span>🍽️ TABLE {order.tableNumber}</span>
                            )}
                          </div>
                          <div className="order-timer">
                            <span>⏱️ {elapsedMinutes}m in prep</span>
                          </div>
                        </div>

                        <div className="card-customer-row">
                          <span className="card-cust-name">👤 {order.customerName}</span>
                          <span className="card-cust-phone">{order.customerPhone}</span>
                        </div>

                        {order.customerFlat && (
                          <div className="card-flat-row">
                            <span>🏢 Flat: <strong>{order.customerFlat}</strong></span>
                          </div>
                        )}

                        <div className="card-order-num">
                          {order.orderNumber}
                        </div>

                        <div style={{ fontSize: 11, color: '#78716C', margin: '2px 0 6px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>📅 {new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                          <span>•</span>
                          <span>⏰ {new Date(order.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>

                        <div className="card-items-list">
                          {order.items.map((it, idx) => (
                            <div key={idx} className="kds-item-row">
                              <span className="item-qty">{it.quantity}x</span>
                              <span className="item-name">
                                {it.name}
                                {it.selectedSize && it.selectedSize !== 'Regular' && (
                                  <span className="item-size-tag">({it.selectedSize})</span>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className="kds-card-actions">
                          <button
                            className="kds-action-btn btn-mark-ready"
                            onClick={() => handleUpdateStatus(order.id, 'ready')}
                          >
                            ✓ Mark Ready
                          </button>
                          <button
                            type="button"
                            className="btn-kds-view-receipt"
                            title="View / Print Receipt"
                            onClick={() => setPrintOrder(order)}
                          >
                            🧾 Bill
                          </button>
                          <button
                            type="button"
                            className="btn-kds-edit-receipt"
                            title="Edit Order / Receipt"
                            onClick={() => handleOpenEditReceipt(order)}
                          >
                            ✏️ Edit
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            {/* COLUMN 3: READY FOR PICKUP / SERVING */}
            <section className={`kds-column col-type-ready ${activeMobileTab === 'ready' ? 'mobile-active' : 'mobile-hidden'}`}>
              <div className="column-header col-ready">
                <div className="col-header-left">
                  <span className="col-dot"></span>
                  <h2>READY FOR PICKUP</h2>
                </div>
                <span className="col-count-badge">{readyOrders.length}</span>
              </div>

              <div className="kds-cards-container">
                {readyOrders.length === 0 ? (
                  <div className="empty-kds-state">
                    <span className="empty-icon">🔔</span>
                    <p>No orders waiting for pickup</p>
                    <span className="empty-sub">Prepared orders awaiting floor staff pickup or guest handover appear here.</span>
                  </div>
                ) : (
                  readyOrders.map((order) => {
                    const elapsedMinutes = getElapsedMinutes(order.createdAt);

                    return (
                      <div key={order.id} className="kds-order-card card-ready">
                        <div className="card-top-bar">
                          <div className="table-badge ready">
                            {order.tableNumber === 'Takeaway' || order.tableNumber === 0 ? (
                              <span>🥡 TAKEAWAY & IN-FLAT</span>
                            ) : (
                              <span>🍽️ TABLE {order.tableNumber}</span>
                            )}
                          </div>
                          <div className="order-timer">
                            <span>{elapsedMinutes}m ago</span>
                          </div>
                        </div>

                        <div className="card-customer-row">
                          <span className="card-cust-name">👤 {order.customerName}</span>
                          <span className="card-cust-phone">{order.customerPhone}</span>
                        </div>

                        {order.customerFlat && (
                          <div className="card-flat-row">
                            <span>🏢 Flat: <strong>{order.customerFlat}</strong></span>
                          </div>
                        )}

                        <div className="card-order-num ready-title">
                          {order.orderNumber}
                        </div>

                        <div style={{ fontSize: 11, color: '#78716C', margin: '2px 0 6px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>📅 {new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                          <span>•</span>
                          <span>⏰ {new Date(order.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>

                        <div className="card-items-list">
                          {order.items.map((it, idx) => (
                            <div key={idx} className="kds-item-row">
                              <span className="item-qty">{it.quantity}x</span>
                              <span className="item-name">{it.name}</span>
                            </div>
                          ))}
                        </div>

                        {/* Instant Serve & Final Bill Receipt Button */}
                        <div className="kds-card-actions">
                          <button
                            className="kds-action-btn btn-complete"
                            onClick={() => handleUpdateStatus(order.id, 'served')}
                            title="Mark order served and print final receipt"
                          >
                            ✓ Serve & Bill
                          </button>
                          <button
                            type="button"
                            className="btn-kds-view-receipt"
                            title="View / Print Receipt"
                            onClick={() => setPrintOrder(order)}
                          >
                            🧾 Bill
                          </button>
                          <button
                            type="button"
                            className="btn-kds-edit-receipt"
                            title="Edit Order / Receipt"
                            onClick={() => handleOpenEditReceipt(order)}
                          >
                            ✏️ Edit
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </main>
        </>
      )}

      {/* ── VIEW 2: BILL SETTLEMENT SECTION ── */}
      {kitchenViewMode === 'settlement' && (
        <div className="kds-section-view">
          <div className="kds-section-header">
            <div className="kds-section-title-wrap">
              <h2>💰 Bill Settlement & Payment Verification</h2>
              <p>Review customer orders, access bills, mark payments settled, or edit receipts if any mistakes occurred.</p>
            </div>

            <div className="kds-section-controls">
              <input
                type="text"
                placeholder="Search order #, guest, phone or flat..."
                value={settleSearch}
                onChange={(e) => setSettleSearch(e.target.value)}
                className="kds-search-input"
              />

              <div className="kds-filter-pills">
                <button
                  type="button"
                  onClick={() => setSettleFilter('unsettled')}
                  className={`kds-filter-pill-btn ${settleFilter === 'unsettled' ? 'active' : ''}`}
                >
                  ⏳ Unsettled ({unsettledOrdersCount})
                </button>
                <button
                  type="button"
                  onClick={() => setSettleFilter('all')}
                  className={`kds-filter-pill-btn ${settleFilter === 'all' ? 'active' : ''}`}
                >
                  All Orders ({allCombinedOrders.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSettleFilter('settled')}
                  className={`kds-filter-pill-btn ${settleFilter === 'settled' ? 'active' : ''}`}
                >
                  ✓ Settled
                </button>
              </div>
            </div>
          </div>

          {filteredSettlementOrders.length === 0 ? (
            <div className="empty-kds-state" style={{ background: '#FFF', borderRadius: 14, border: '1px solid #E5DFD7' }}>
              <span className="empty-icon">💳</span>
              <p>{settleFilter === 'unsettled' ? 'All active orders are settled & paid!' : 'No matching orders found'}</p>
              <span className="empty-sub">Orders waiting for guest bill settlement and payment confirmation will appear here.</span>
            </div>
          ) : (
            <div className="kds-settlement-grid">
              {filteredSettlementOrders.map((ord) => {
                const sub = ord.subtotal || ord.items.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0);
                const tax = ord.taxAmount !== undefined ? ord.taxAmount : Number((sub * 0.05).toFixed(2));
                const tot = ord.total || Number((sub + tax).toFixed(2));

                return (
                  <div key={ord.id} className={`kds-settlement-card ${ord.isPaid ? 'settled' : ''}`}>
                    <div className="card-top-bar">
                      <div className="table-badge">
                        {ord.tableNumber === 'Takeaway' || ord.tableNumber === 0 ? (
                          <span>🥡 TAKEAWAY & IN-FLAT</span>
                        ) : (
                          <span>🍽️ TABLE {ord.tableNumber}</span>
                        )}
                      </div>
                      <div className="order-timer">
                        <span>📅 {new Date(ord.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} · ⏰ {new Date(ord.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>

                    <div className="card-customer-row">
                      <span className="card-cust-name">👤 {ord.customerName}</span>
                      <span className="card-cust-phone">{ord.customerPhone}</span>
                    </div>

                    {ord.customerFlat && (
                      <div className="card-flat-row">
                        <span>🏢 Flat: <strong>{ord.customerFlat}</strong></span>
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="card-order-num">{ord.orderNumber}</span>
                      <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', padding: '3px 8px', borderRadius: 6, background: ord.status === 'served' ? '#E0F2FE' : '#FEF3C7', color: ord.status === 'served' ? '#0369A1' : '#92400E' }}>
                        {ord.status}
                      </span>
                    </div>

                    {/* ITEMS LIST */}
                    <div className="card-items-list" style={{ maxHeight: 130, overflowY: 'auto' }}>
                      {ord.items.map((it, idx) => (
                        <div key={idx} className="kds-item-row">
                          <span className="item-qty">{it.quantity}x</span>
                          <span className="item-name">{it.name} {it.selectedSize && it.selectedSize !== 'Regular' ? `(${it.selectedSize})` : ''}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#57534E' }}>₹{((Number(it.price) || 0) * (Number(it.quantity) || 1)).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>

                    {/* BILL BREAKDOWN */}
                    <div style={{ background: '#F8F6F2', border: '1px solid #EBE5DF', borderRadius: 8, padding: '8px 12px', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#78716C' }}>
                        <span>Subtotal:</span>
                        <span>₹{sub.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#78716C' }}>
                        <span>GST (5%):</span>
                        <span>₹{tax.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: 14, color: '#1A1410', borderTop: '1px solid #DED6CB', paddingTop: 4, marginTop: 2 }}>
                        <span>TOTAL BILL:</span>
                        <span>₹{tot.toFixed(2)}</span>
                      </div>
                    </div>

                    {/* SETTLEMENT STATUS */}
                    <div>
                      {ord.isPaid ? (
                        <div className="settle-badge-paid">
                          ✓ PAID & SETTLED {ord.settledBy ? `· Verified by ${ord.settledBy}` : ''}
                        </div>
                      ) : (
                        <div className="settle-badge-unpaid">
                          ⏳ UNSETTLED · Customer Payment Pending
                        </div>
                      )}
                    </div>

                    {/* ACTION BUTTONS */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 'auto', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => setPrintOrder(ord)}
                        className="btn-kds-view-receipt"
                        style={{ flex: 1, justifyContent: 'center' }}
                      >
                        🧾 View Bill
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenEditReceipt(ord)}
                        className="btn-kds-edit-receipt"
                        style={{ flex: 1, justifyContent: 'center' }}
                      >
                        ✏️ Edit Receipt
                      </button>
                    </div>

                    {!ord.isPaid && (
                      <button
                        type="button"
                        disabled={isSettlingId === ord.id}
                        onClick={() => handleSettleBill(ord.id)}
                        className="btn-settle-pay"
                      >
                        {isSettlingId === ord.id ? 'Processing...' : '💳 Mark Settled (Customer Paid)'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── VIEW 3: 15-DAY ORDER HISTORY SECTION ── */}
      {kitchenViewMode === 'history' && (
        <div className="kds-section-view">
          <div className="kds-section-header">
            <div className="kds-section-title-wrap">
              <h2>📜 Kitchen Order History (Past 15 Days)</h2>
              <p>Showing orders from the past 15 days ({filteredHistoryOrders.length} records). Older orders are kept hidden.</p>
            </div>

            <div className="kds-section-controls">
              <input
                type="text"
                placeholder="Search order #, guest, phone or flat..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="kds-search-input"
              />

              <select
                value={historyStatusFilter}
                onChange={(e) => setHistoryStatusFilter(e.target.value)}
                className="kds-search-input"
                style={{ minWidth: 140, cursor: 'pointer' }}
              >
                <option value="all">All Statuses</option>
                <option value="served">Served</option>
                <option value="ready">Ready</option>
                <option value="preparing">In Prep</option>
                <option value="received">New Orders</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          {filteredHistoryOrders.length === 0 ? (
            <div className="empty-kds-state" style={{ background: '#FFF', borderRadius: 14, border: '1px solid #E5DFD7' }}>
              <span className="empty-icon">📜</span>
              <p>No orders found in the past 15 days</p>
              <span className="empty-sub">Past dining and takeaway orders completed within 15 days are logged here.</span>
            </div>
          ) : (
            <div className="kds-history-table-box" style={{ overflowX: 'auto' }}>
              <table className="kds-history-table">
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Date & Time</th>
                    <th>Table / Flat</th>
                    <th>Customer</th>
                    <th>Items Summary</th>
                    <th>Total</th>
                    <th>Settlement Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistoryOrders.map((ord) => (
                    <tr key={ord.id}>
                      <td>
                        <strong style={{ fontFamily: 'var(--font-mono, monospace)', color: '#1C1917' }}>{ord.orderNumber}</strong>
                      </td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                        <div>📅 {new Date(ord.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                        <div style={{ color: '#78716C' }}>⏰ {new Date(ord.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
                      </td>
                      <td>
                        <span className="table-badge" style={{ fontSize: 11, padding: '3px 8px' }}>
                          {ord.tableNumber === 0 || ord.tableNumber === 'Takeaway' || ord.tableNumber === '0' ? 'Takeaway' : `Table ${ord.tableNumber}`}
                        </span>
                        {ord.customerFlat && (
                          <div style={{ fontSize: 11, color: '#B45309', fontWeight: 700, marginTop: 3 }}>
                            Flat {ord.customerFlat}
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{ord.customerName}</div>
                        <div style={{ fontSize: 11, color: '#78716C' }}>{ord.customerPhone}</div>
                      </td>
                      <td style={{ maxWidth: 220, fontSize: 12, color: '#44403C' }}>
                        {ord.items.map((it) => `${it.quantity}x ${it.name}`).join(', ')}
                      </td>
                      <td>
                        <strong style={{ fontSize: 14 }}>₹{ord.total}</strong>
                      </td>
                      <td>
                        {ord.isPaid ? (
                          <span className="settle-badge-paid" style={{ fontSize: 11 }}>
                            ✓ PAID
                          </span>
                        ) : (
                          <span className="settle-badge-unpaid" style={{ fontSize: 11 }}>
                            ⏳ UNSETTLED
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                          <button
                            type="button"
                            onClick={() => setPrintOrder(ord)}
                            className="btn-kds-view-receipt"
                            style={{ height: 32, padding: '0 10px', fontSize: 11.5 }}
                            title="Check Bill / Receipt"
                          >
                            🧾 View Bill
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEditReceipt(ord)}
                            className="btn-kds-edit-receipt"
                            style={{ height: 32, padding: '0 10px', fontSize: 11.5 }}
                            title="Edit Receipt"
                          >
                            ✏️ Edit
                          </button>
                          {!ord.isPaid && (
                            <button
                              type="button"
                              disabled={isSettlingId === ord.id}
                              onClick={() => handleSettleBill(ord.id)}
                              style={{ height: 32, padding: '0 10px', fontSize: 11.5, background: '#15803D', color: '#FFF', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}
                              title="Mark Settled"
                            >
                              ✓ Settle
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── RECENT SERVED ORDERS DRAWER ── */}
      {isRecentServedOpen && (
        <div className="admin-modal-overlay" onClick={() => setIsRecentServedOpen(false)}>
          <div className="admin-modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Recent Served Orders</h3>
              <button onClick={() => setIsRecentServedOpen(false)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 360, overflowY: 'auto' }}>
              {recentServed.map((s) => (
                <div key={s.id} style={{ padding: 12, borderRadius: 10, border: '1px solid #E5DFD7', background: '#FAF9F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ fontSize: 14 }}>{s.orderNumber}</strong> ({s.tableNumber === 0 ? 'Takeaway' : `Table ${s.tableNumber}`})
                    <div style={{ fontSize: 12, color: '#685E54' }}>{s.customerName} · ₹{s.total}</div>
                    <div style={{ fontSize: 11, color: '#8C827A', marginTop: 2 }}>
                      📅 {new Date(s.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} · ⏰ {new Date(s.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setPrintOrder(s);
                      setIsRecentServedOpen(false);
                    }}
                    style={{ padding: '6px 12px', borderRadius: 8, background: '#5C381E', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                  >
                    🖨️ Receipt
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── FINAL ORDER RECEIPT MODAL (PRINTED AT THE END AFTER ORDER IS SERVED) ── */}
      {printOrder && (() => {
        const orderSubtotal = printOrder.subtotal && printOrder.subtotal > 0
          ? printOrder.subtotal
          : printOrder.items.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0);

        const gstPercent = 5;
        const gstRate = gstPercent / 100;
        const orderTax = printOrder.taxAmount !== undefined && printOrder.taxAmount > 0
          ? printOrder.taxAmount
          : Number((orderSubtotal * gstRate).toFixed(2));

        const halfRate = (gstPercent / 2).toFixed(1);
        const cgst = Number((orderTax / 2).toFixed(2));
        const sgst = Number((orderTax - cgst).toFixed(2));

        const orderTotal = printOrder.total && printOrder.total > 0
          ? printOrder.total
          : Number((orderSubtotal + orderTax).toFixed(2));

        const totalQty = printOrder.items.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0);

        return (
          <div className="admin-modal-overlay" onClick={() => setPrintOrder(null)}>
            <div className="admin-modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400, padding: '20px 20px 16px' }}>
              <div className="kot-print-area" style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 12, color: '#1C1917' }}>
                {/* STORE & ORDER ID */}
                <div style={{ textAlign: 'center', borderBottom: '1.5px dashed #78716C', paddingBottom: 10, marginBottom: 8 }}>
                  <h2 style={{ fontSize: 18, margin: '0 0 2px', fontWeight: 900 }}>OZKAFE · ANASSA</h2>
                  <div style={{ fontSize: 13, fontWeight: 800, marginTop: 6, color: '#1C1917' }}>
                    Order ID: {printOrder.orderNumber}
                  </div>
                  <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                    {new Date(printOrder.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}, {new Date(printOrder.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </div>
                </div>

                {/* ITEMS ORDERED */}
                <table style={{ width: '100%', fontSize: 11.5, borderBottom: '1.5px dashed #78716C', paddingBottom: 8, marginBottom: 8, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd', fontSize: 10.5 }}>
                      <th style={{ padding: '4px 0' }}>ITEM</th>
                      <th style={{ padding: '4px 0', textAlign: 'center' }}>QTY</th>
                      <th style={{ padding: '4px 0', textAlign: 'right' }}>RATE</th>
                      <th style={{ padding: '4px 0', textAlign: 'right' }}>AMOUNT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printOrder.items.map((it, i) => {
                      const itemRate = Number(it.price) || 0;
                      const itemQty = Number(it.quantity) || 1;
                      const itemAmt = itemRate * itemQty;
                      return (
                        <tr key={i}>
                          <td style={{ padding: '4px 0', fontWeight: 600 }}>
                            {it.name}
                            {it.selectedSize && it.selectedSize !== 'Regular' ? ` (${it.selectedSize})` : ''}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 'bold', width: 36, padding: '4px 0' }}>{itemQty}x</td>
                          <td style={{ textAlign: 'right', padding: '4px 0', color: '#555' }}>₹{itemRate.toFixed(2)}</td>
                          <td style={{ textAlign: 'right', padding: '4px 0', fontWeight: 700 }}>₹{itemAmt.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* PRICES, GST & TOTAL */}
                <div style={{ fontSize: 11.5, paddingBottom: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: '#57534E' }}>Item Subtotal:</span>
                    <span style={{ fontWeight: 700 }}>₹{orderSubtotal.toFixed(2)}</span>
                  </div>
                  <div style={{ background: '#F5F5F4', padding: '6px 8px', borderRadius: 4, margin: '4px 0', border: '1px solid #E7E5E4' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#555', marginBottom: 2 }}>
                      <span>CGST ({halfRate}%):</span>
                      <span>₹{cgst.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#555', marginBottom: 2 }}>
                      <span>SGST ({halfRate}%):</span>
                      <span>₹{sgst.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, borderTop: '1px dashed #D6D3D1', paddingTop: 2 }}>
                      <span>Total GST ({gstPercent}%):</span>
                      <span>₹{orderTax.toFixed(2)}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 900, borderTop: '2px solid #000', borderBottom: '2px solid #000', padding: '8px 0', marginTop: 8 }}>
                    <span>TOTAL</span>
                    <span>₹{orderTotal.toFixed(2)}</span>
                  </div>
                </div>

                {/* SETTLEMENT STATUS IN RECEIPT */}
                <div style={{ marginTop: 8, padding: '6px 8px', borderRadius: 4, background: printOrder.isPaid ? '#DCFCE7' : '#FEF3C7', color: printOrder.isPaid ? '#15803D' : '#92400E', fontWeight: 800, fontSize: 11, textAlign: 'center', border: `1px solid ${printOrder.isPaid ? '#86EFAC' : '#FDE68A'}` }}>
                  {printOrder.isPaid
                    ? `✓ PAID & SETTLED ${printOrder.settledBy ? `· Verified by ${printOrder.settledBy}` : ''}`
                    : '⏳ PAYMENT PENDING · UNSETTLED'}
                </div>

                {/* THANK YOU MSG */}
                <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#1C1917', paddingTop: 10, borderTop: '1.5px dashed #78716C' }}>
                  Thank You For Visiting OZKAFE ANASSA!
                </div>
              </div>

              {/* ACTION BUTTONS */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn-solid"
                    style={{ flex: 1, height: 40, background: '#5C381E', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
                    onClick={() => window.print()}
                  >
                    🖨️ Print Receipt
                  </button>
                  <button
                    type="button"
                    style={{ flex: 1, height: 40, background: '#F5F5F4', color: '#1C1917', border: '1px solid #D6D3D1', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
                    onClick={() => {
                      const toEdit = printOrder;
                      setPrintOrder(null);
                      handleOpenEditReceipt(toEdit);
                    }}
                  >
                    ✏️ Edit Receipt
                  </button>
                </div>

                {!printOrder.isPaid && (
                  <button
                    type="button"
                    disabled={isSettlingId === printOrder.id}
                    onClick={() => handleSettleBill(printOrder.id)}
                    style={{ height: 40, background: '#15803D', color: '#FFF', border: 'none', borderRadius: 8, fontWeight: 800, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    {isSettlingId === printOrder.id ? 'Processing...' : '💳 Mark Settled (Customer Paid)'}
                  </button>
                )}

                <button
                  className="btn-outline"
                  style={{ height: 36, borderRadius: 8, border: '1px solid #ccc', background: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 12 }}
                  onClick={() => setPrintOrder(null)}
                >
                  Done / Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── KITCHEN RECEIPT EDIT MODAL ── */}
      {editingReceiptOrder && (
        <div className="admin-modal-overlay" onClick={() => setEditingReceiptOrder(null)}>
          <div
            className="admin-modal-box"
            style={{ maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', background: '#FFFFFF', borderRadius: 14, padding: '20px 24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E5DFD7', paddingBottom: 12, marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#1A1410' }}>
                  ✏️ Edit Receipt & Order ({editingReceiptOrder.orderNumber})
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: '#685E54' }}>
                  Correct item quantities, prices, dishes, or customer details. Changes log in Admin audit trail.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingReceiptOrder(null)}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#78716C' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditReceipt} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Customer & Table */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#44403C', marginBottom: 4 }}>
                    Customer Name
                  </label>
                  <input
                    type="text"
                    value={editCustomerName}
                    onChange={(e) => setEditCustomerName(e.target.value)}
                    placeholder="Guest Name"
                    className="kds-search-input"
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#44403C', marginBottom: 4 }}>
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={editCustomerPhone}
                    onChange={(e) => setEditCustomerPhone(e.target.value)}
                    placeholder="e.g. 9830012345"
                    className="kds-search-input"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#44403C', marginBottom: 4 }}>
                    Table / Order Type
                  </label>
                  <select
                    value={editTableNumber}
                    onChange={(e) => setEditTableNumber(e.target.value)}
                    className="kds-search-input"
                    style={{ width: '100%', cursor: 'pointer' }}
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
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#44403C', marginBottom: 4 }}>
                    Flat / Tower (Optional)
                  </label>
                  <input
                    type="text"
                    value={editCustomerFlat}
                    onChange={(e) => setEditCustomerFlat(e.target.value)}
                    placeholder="e.g. Tower 2 - 14B"
                    className="kds-search-input"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              {/* Items List */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#44403C', marginBottom: 6 }}>
                  Receipt Items ({editItems.length})
                </label>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: '#F8F6F2', padding: 12, borderRadius: 8, border: '1px solid #E5DFD7' }}>
                  {editItems.map((item, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 85px 30px', gap: 6, alignItems: 'center' }}>
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => {
                          const updated = [...editItems];
                          updated[idx].name = e.target.value;
                          setEditItems(updated);
                        }}
                        className="kds-search-input"
                        style={{ fontSize: 12, padding: '4px 8px' }}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button
                          type="button"
                          onClick={() => handleItemQtyChange(idx, -1)}
                          style={{ width: 26, height: 26, borderRadius: 4, border: '1px solid #D6D3D1', background: '#FFF', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          -
                        </button>
                        <span style={{ fontWeight: 700, minWidth: 20, textAlign: 'center', fontSize: 12.5 }}>
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleItemQtyChange(idx, 1)}
                          style={{ width: 26, height: 26, borderRadius: 4, border: '1px solid #D6D3D1', background: '#FFF', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
                          className="kds-search-input"
                          style={{ fontSize: 12, padding: '4px 6px', textAlign: 'right' }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        title="Remove dish"
                        style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', fontSize: 16, fontWeight: 700 }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}

                  {/* Add dish dropdown */}
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, paddingTop: 8, borderTop: '1px dashed #D6D3D1' }}>
                    <select
                      value={editAddItemId}
                      onChange={(e) => setEditAddItemId(e.target.value)}
                      className="kds-search-input"
                      style={{ fontSize: 12, flex: 1 }}
                    >
                      <option value="">-- Add another dish to receipt --</option>
                      {availableMenuItems.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} (₹{m.price})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleAddItem}
                      disabled={!editAddItemId}
                      style={{ padding: '0 12px', background: '#5C381E', color: '#FFF', border: 'none', borderRadius: 8, fontWeight: 700, cursor: editAddItemId ? 'pointer' : 'not-allowed', fontSize: 12 }}
                    >
                      + Add
                    </button>
                  </div>
                </div>
              </div>

              {/* Recalculated Breakdown */}
              {(() => {
                const sub = editItems.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0);
                const gst = Number(((sub * 5) / 100).toFixed(2));
                const tot = Number((sub + gst).toFixed(2));
                return (
                  <div style={{ background: '#FAF9F6', border: '1px solid #E5DFD7', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, color: '#57534E' }}>
                      <span>Item Subtotal:</span>
                      <strong>₹{sub.toFixed(2)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, color: '#57534E' }}>
                      <span>GST (5%):</span>
                      <strong>₹{gst.toFixed(2)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid #D6D3D1', fontWeight: 900, fontSize: 14, color: '#1A1410' }}>
                      <span>Recalculated Total:</span>
                      <span style={{ color: '#5C381E' }}>₹{tot.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Special Instructions / Notes */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#44403C', marginBottom: 4 }}>
                  Correction Notes (Optional)
                </label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="e.g. Corrected quantity per guest request"
                  className="kds-search-input"
                  style={{ width: '100%' }}
                />
              </div>

              {/* Footer buttons */}
              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                <button
                  type="button"
                  onClick={() => setEditingReceiptOrder(null)}
                  style={{ flex: 1, height: 42, borderRadius: 8, border: '1px solid #ccc', background: '#FFF', fontWeight: 700, cursor: 'pointer', color: '#44403C' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingReceipt}
                  style={{ flex: 1, height: 42, borderRadius: 8, border: 'none', background: '#5C381E', color: '#FFF', fontWeight: 800, cursor: isSavingReceipt ? 'wait' : 'pointer' }}
                >
                  {isSavingReceipt ? 'Saving...' : '✓ Save & Update Receipt'}
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
        currentConsole="kitchen"
        onUpdateUser={(updated) => {
          setCurrentUser(updated);
          setStaffName(updated.name);
        }}
        onLogout={handleLogout}
      />
    </div>
  );
}
