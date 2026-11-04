'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { Order, OrderStatus } from '@/lib/types';

export default function KitchenDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [staffName, setStaffName] = useState('');
  const [staffPhone, setStaffPhone] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  const [orders, setOrders] = useState<Order[]>([]);
  const [recentServed, setRecentServed] = useState<Order[]>([]);
  const [isRecentServedOpen, setIsRecentServedOpen] = useState(false);
  const [clock, setClock] = useState('00:00:00');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [printOrder, setPrintOrder] = useState<Order | null>(null);
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
    const saved = localStorage.getItem('anassa_kitchen_session');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.name) setStaffName(parsed.name);
        if (parsed.phone) setStaffPhone(parsed.phone);
        if (parsed.email) setStaffEmail(parsed.email);
      } catch {}
    }

    // Verify session with server
    fetch(`/api/kitchen/auth?_t=${Date.now()}`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated) {
            setIsAuthenticated(true);
            if (data.staff?.name) setStaffName(data.staff.name);
            if (data.staff?.phone) setStaffPhone(data.staff.phone);
            if (data.staff?.email) setStaffEmail(data.staff.email);
            fetchOrders();
          }
        }
      })
      .catch(() => {});
  }, []);

  const handleLoginSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setPinError('');

    if (!staffName.trim()) {
      setPinError('Please enter your Full Name');
      return;
    }
    if (!staffPhone.trim() || staffPhone.replace(/\D/g, '').length < 10) {
      setPinError('Please enter a valid 10-digit Mobile Number');
      return;
    }
    if (!staffEmail.trim() || !staffEmail.includes('@')) {
      setPinError('Please enter a valid Email ID');
      return;
    }
    if (!pinInput.trim()) {
      setPinError('Please enter Kitchen Staff PIN');
      return;
    }

    try {
      const res = await fetch('/api/kitchen/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: pinInput.trim(),
          name: staffName.trim(),
          phone: staffPhone.trim(),
          email: staffEmail.trim(),
        }),
      });

      if (res.ok) {
        setIsAuthenticated(true);
        localStorage.setItem(
          'anassa_kitchen_session',
          JSON.stringify({
            name: staffName.trim(),
            phone: staffPhone.trim(),
            email: staffEmail.trim(),
            authed: true,
          })
        );
        setPinInput('');
        fetchOrders();
      } else {
        setPinError('Invalid Kitchen Staff PIN (Default: 1234)');
      }
    } catch {
      setPinError('Authentication error. Check network connection.');
    }
  };

  const handleLogout = async () => {
    if (!confirm('Lock Kitchen Display and sign out current staff?')) return;
    localStorage.removeItem('anassa_kitchen_session');
    setIsAuthenticated(false);
    setPinInput('');
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

    // 1. Server-Sent Events (SSE) Stream
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/orders/stream');
      eventSource.addEventListener('order', () => {
        fetchOrders();
      });
    } catch (err) {
      console.warn('SSE connection failed, using smart poll:', err);
    }

    // 2. Fallback Polling every 4 seconds
    const interval = setInterval(fetchOrders, 4000);

    return () => {
      clearInterval(interval);
      if (eventSource) eventSource.close();
    };
  }, [isAuthenticated, fetchOrders]);

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

  // ── STAFF LOGIN PAGE (NAME, NUMBER, EMAIL, PIN) ──
  if (!isAuthenticated) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F8F6F2',
        padding: '24px 16px',
        fontFamily: 'var(--font-body), sans-serif',
      }}>
        <div style={{
          background: '#FFFFFF',
          borderRadius: 20,
          border: '1px solid #E5DFD7',
          boxShadow: '0 10px 30px rgba(30, 20, 15, 0.08)',
          maxWidth: 420,
          width: '100%',
          padding: '32px 24px',
          textAlign: 'center',
        }}>
          <Image
            src="/images/ozkafe_logo.jpeg"
            alt="OZKAFE"
            width={68}
            height={68}
            style={{ borderRadius: 16, border: '2px solid #5C381E', margin: '0 auto 12px' }}
          />
          <h2 style={{ fontFamily: 'var(--font-display)', margin: '0 0 6px', fontSize: '1.45rem', color: '#1A1410' }}>
            Kitchen Staff Access
          </h2>
          <p style={{ fontSize: 13, color: '#685E54', margin: '0 0 22px' }}>
            Enter your duty credentials to access Kitchen Display System (KDS)
          </p>

          <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'left' }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: '#73675C', display: 'block', marginBottom: 4 }}>
                Full Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Debolina Kumar"
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: 10,
                  border: '1px solid #E5DFD7',
                  background: '#FAF9F6',
                  fontSize: 14,
                  outline: 'none',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: '#73675C', display: 'block', marginBottom: 4 }}>
                Mobile Number
              </label>
              <input
                type="tel"
                required
                placeholder="e.g. 9163498840"
                value={staffPhone}
                onChange={(e) => setStaffPhone(e.target.value)}
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: 10,
                  border: '1px solid #E5DFD7',
                  background: '#FAF9F6',
                  fontSize: 14,
                  outline: 'none',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: '#73675C', display: 'block', marginBottom: 4 }}>
                Email ID
              </label>
              <input
                type="email"
                required
                placeholder="e.g. staff@ozkafe.in"
                value={staffEmail}
                onChange={(e) => setStaffEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: 10,
                  border: '1px solid #E5DFD7',
                  background: '#FAF9F6',
                  fontSize: 14,
                  outline: 'none',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: '#73675C', display: 'block', marginBottom: 4 }}>
                Kitchen Staff PIN
              </label>
              <input
                type="password"
                required
                placeholder="Default: 1234"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: 10,
                  border: '1px solid #E5DFD7',
                  background: '#FAF9F6',
                  fontSize: 16,
                  textAlign: 'center',
                  letterSpacing: 4,
                  outline: 'none',
                }}
              />
            </div>

            {pinError && (
              <div style={{ color: '#DC2626', fontSize: 12.5, fontWeight: 700, textAlign: 'center', marginTop: 4 }}>
                {pinError}
              </div>
            )}

            <button
              type="submit"
              style={{
                width: '100%',
                height: 48,
                borderRadius: 12,
                background: '#5C381E',
                color: '#FFFFFF',
                border: 'none',
                fontSize: 14.5,
                fontWeight: 700,
                cursor: 'pointer',
                marginTop: 8,
                boxShadow: '0 4px 14px rgba(92, 56, 30, 0.3)',
              }}
            >
              UNLOCK KITCHEN DASHBOARD
            </button>
          </form>

          <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid #E5DFD7', fontSize: 11, color: '#9C8F82' }}>
            OZKAFE Kitchen Display · Session stays active on refresh
          </div>
        </div>
      </div>
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

          <button
            onClick={handleLogout}
            className="btn-kds-header"
            title="Sign out of Kitchen Dashboard"
            style={{ color: '#DC2626', borderColor: '#FCA5A5' }}
          >
            🔒 Sign Out
          </button>
        </div>
      </header>

      {/* ── KDS 3-COLUMN BOARD ── */}
      <main className="kds-board">
        {/* COLUMN 1: NEW / RECEIVED */}
        <section className="kds-column">
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
                        ▶ Start Preparing
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
                          ✕ Reject
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
        <section className="kds-column">
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
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* COLUMN 3: READY FOR PICKUP / SERVING */}
        <section className="kds-column">
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
                        ✓ Serve & Print Final Receipt
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </main>

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
      {printOrder && (
        <div className="admin-modal-overlay" onClick={() => setPrintOrder(null)}>
          <div className="admin-modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360, padding: 24 }}>
            <div className="kot-print-area">
              <div style={{ textAlign: 'center', borderBottom: '1px dashed #000', paddingBottom: 10, marginBottom: 10 }}>
                <h2 style={{ fontSize: 18, margin: '0 0 2px', fontWeight: 800 }}>OZKAFE — ANASSA</h2>
                <div style={{ fontSize: 11, color: '#555' }}>Beside JW Marriott, EM Bypass, Kolkata</div>
                <div style={{ fontSize: 13, fontWeight: 'bold', marginTop: 6, textTransform: 'uppercase' }}>
                  FINAL ORDER RECEIPT
                </div>
                <div style={{ fontSize: 14, fontWeight: 'bold' }}>
                  {printOrder.orderNumber} · {printOrder.tableNumber === 'Takeaway' || printOrder.tableNumber === 0 ? 'TAKEAWAY & IN-FLAT' : `TABLE ${printOrder.tableNumber}`}
                </div>
                <div style={{ fontSize: 11, color: '#666' }}>{new Date(printOrder.updatedAt || printOrder.createdAt).toLocaleString()}</div>
              </div>

              <div style={{ fontSize: 12, marginBottom: 8 }}>
                <strong>Guest:</strong> {printOrder.customerName} ({printOrder.customerPhone})<br />
                {printOrder.customerFlat && <><strong>Flat:</strong> {printOrder.customerFlat}<br /></>}
                <strong>Status:</strong> <span style={{ textTransform: 'uppercase', fontWeight: 700 }}>{printOrder.status}</span>
              </div>

              <table style={{ width: '100%', fontSize: 13, borderBottom: '1px dashed #000', paddingBottom: 8, marginBottom: 8, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                    <th style={{ padding: '4px 0' }}>QTY</th>
                    <th style={{ padding: '4px 0' }}>ITEM</th>
                    <th style={{ padding: '4px 0', textAlign: 'right' }}>AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  {printOrder.items.map((it, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 'bold', width: 36, padding: '4px 0' }}>{it.quantity}x</td>
                      <td style={{ padding: '4px 0' }}>
                        {it.name}
                        {it.selectedSize && it.selectedSize !== 'Regular' ? ` (${it.selectedSize})` : ''}
                      </td>
                      <td style={{ textAlign: 'right', padding: '4px 0', fontWeight: 600 }}>₹{it.price * it.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 800, padding: '4px 0' }}>
                <span>TOTAL PAID</span>
                <span>₹{printOrder.total}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                className="btn-solid"
                style={{ flex: 1, height: 42, background: '#5C381E', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
                onClick={() => window.print()}
              >
                🖨️ Print Receipt
              </button>
              <button
                className="btn-outline"
                style={{ flex: 1, height: 42, borderRadius: 8, border: '1px solid #ccc', background: '#fff', fontWeight: 700, cursor: 'pointer' }}
                onClick={() => setPrintOrder(null)}
              >
                Done / Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
