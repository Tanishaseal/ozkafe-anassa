'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Order, OrderStatus } from '@/lib/types';

export default function KitchenDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  const [orders, setOrders] = useState<Order[]>([]);
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

  // Require PIN on every window access: clear any legacy persistent auth
  useEffect(() => {
    fetchKitchenSettings();
    try {
      localStorage.removeItem('anassa_kitchen_authed');
      sessionStorage.removeItem('anassa_kitchen_authed');
    } catch {
      // silent
    }
  }, []);

  const handlePinSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setPinError('');

    try {
      const res = await fetch('/api/kitchen/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinInput }),
      });

      if (res.ok) {
        setIsAuthenticated(true);
        setPinInput('');
        fetchOrders();
      } else {
        setPinError('Invalid Kitchen Staff PIN.');
        setPinInput('');
      }
    } catch {
      setPinError('Authentication error');
    }
  };

  const handleLogout = async () => {
    try {
      localStorage.removeItem('anassa_kitchen_authed');
      sessionStorage.removeItem('anassa_kitchen_authed');
    } catch {
      // silent
    }
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
  const fetchOrders = async () => {
    try {
      const res = await fetch(`/api/orders?status=active&_t=${Date.now()}`);
      if (res.status === 401) {
        setIsAuthenticated(false);
        localStorage.removeItem('anassa_kitchen_authed');
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
  }, [isAuthenticated, soundEnabled]);

  // Advance Order Status
  const handleUpdateStatus = async (orderId: string, nextStatus: OrderStatus) => {
    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orderId, status: nextStatus }),
      });
      if (res.ok) {
        fetchOrders();
      }
    } catch {
      alert('Failed to update order status');
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

  // ── PIN AUTHENTICATION GATE ──
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
            Kitchen Staff Access
          </h2>
          <p style={{ fontSize: 12, color: '#685E54', marginTop: 4 }}>
            Enter Staff PIN to access live kitchen orders & ticket display
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
              UNLOCK KITCHEN DASHBOARD
            </button>
          </form>
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
          />
          <div>
            <div className="kitchen-brand-name">OZKAFE</div>
            <div className="kitchen-brand-sub">Kitchen Display System (KDS)</div>
          </div>
        </div>

        <div className="kitchen-header-right">
          <div className="kitchen-live-dot">LIVE</div>
          <div className="kitchen-clock">{clock}</div>

          <button
            className="kitchen-btn"
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? 'Mute Chimes' : 'Unmute Chimes'}
          >
            {soundEnabled ? '🔔 Sound ON' : '🔕 Sound OFF'}
          </button>

          <button className="kitchen-btn" onClick={toggleFullScreen}>
            ⛶ Fullscreen
          </button>

          <button
            className="kitchen-btn"
            onClick={handleLogout}
            style={{ color: '#DC2626', borderColor: '#FCA5A5' }}
          >
            🔒 Lock KDS
          </button>
        </div>
      </header>

      {/* ── KANBAN BOARD ── */}
      <main className="kds-board">
        {/* COLUMN 1: NEW ORDERS */}
        <section className="kds-column col-received">
          <div className="kds-col-header">
            <span className="kds-col-title">
              <span>🔔</span> New Orders
            </span>
            <span className="kds-badge" style={{ background: '#FEE2E2', color: '#991B1B' }}>
              {receivedOrders.length}
            </span>
          </div>

          <div className="kds-card-list">
            {receivedOrders.length === 0 ? (
              <div className="kds-empty-col">
                <span style={{ fontSize: '2rem' }}>📋</span>
                <span>No new orders</span>
              </div>
            ) : (
              receivedOrders.map((order) => {
                const elapsed = getElapsedMinutes(order.createdAt);
                return (
                  <div key={order.id} className="kds-card">
                    <div className="kds-card-top">
                      <span className="kds-table-tag" style={order.tableNumber === 'Takeaway' || order.tableNumber === '0' || order.tableNumber === 0 ? { background: '#A66B33' } : undefined}>
                        {order.tableNumber === 'Takeaway' || order.tableNumber === '0' || order.tableNumber === 0 ? '🥡 TAKEAWAY & IN-FLAT' : `TABLE ${order.tableNumber}`}
                      </span>
                      <span className={`kds-time-elapsed ${elapsed > kitchenSettings.dangerTimeMinutes ? 'kds-time-danger' : elapsed > kitchenSettings.warningTimeMinutes ? 'kds-time-warning' : ''}`}>
                        {elapsed < 1 ? 'Just now' : `${elapsed}m ago`}
                      </span>
                    </div>

                    <div className="kds-customer-row">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong>👤 {order.customerName}</strong>
                        <span style={{ fontSize: 11, color: '#685E54' }}>📞 {order.customerPhone}</span>
                      </div>
                      {order.customerFlat && (
                        <div style={{ marginTop: 3, fontSize: 11.5, fontWeight: 700, color: '#A66B33' }}>
                          🏢 Flat: {order.customerFlat}
                        </div>
                      )}
                      {order.distanceMeters !== undefined && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '1px 5px',
                            borderRadius: 4,
                            marginLeft: 'auto',
                            background: order.distanceMeters > 150 ? '#FEE2E2' : '#DCFCE7',
                            color: order.distanceMeters > 150 ? '#991B1B' : '#166534',
                          }}
                          title={`Customer was ${Math.round(order.distanceMeters)}m from cafe when order was placed`}
                        >
                          📍 {Math.round(order.distanceMeters)}m
                        </span>
                      )}
                    </div>

                    <ul className="kds-items-list">
                      {order.items.map((it, i) => (
                        <li key={i} className="kds-item-entry">
                          <span>
                            <span className="kds-item-qty">{it.quantity}x</span>
                            {it.name}
                            {it.selectedSize && it.selectedSize !== 'Regular' && (
                              <span style={{ fontSize: 11, color: '#685E54', marginLeft: 4 }}>
                                ({it.selectedSize})
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {order.specialInstructions && (
                      <div className="kds-note-box">
                        <strong>📝 Note:</strong> {order.specialInstructions}
                      </div>
                    )}

                    <div className="kds-card-actions">
                      <button
                        className="kds-action-btn btn-start-prep"
                        onClick={() => handleUpdateStatus(order.id, 'preparing')}
                      >
                        ▶ Start Preparing
                      </button>
                      <button
                        className="btn-print-kot"
                        onClick={() => setPrintOrder(order)}
                        title="Print Kitchen Ticket"
                      >
                        🖨️
                      </button>
                      {kitchenSettings.allowOrderCancellation !== false && (
                        <button
                          onClick={() => {
                            if (confirm(`Reject / Void suspicious order #${order.orderNumber || order.id.slice(0, 8)}?`)) {
                              handleUpdateStatus(order.id, 'cancelled');
                            }
                          }}
                          title="Reject suspicious or prank order"
                          style={{
                            background: '#FEE2E2',
                            color: '#DC2626',
                            border: '1px solid #FCA5A5',
                            borderRadius: 8,
                            padding: '0 10px',
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 3,
                          }}
                        >
                          🚫 Reject
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
        <section className="kds-column col-preparing">
          <div className="kds-col-header">
            <span className="kds-col-title">
              <span>🔥</span> In Preparation
            </span>
            <span className="kds-badge" style={{ background: '#FEF3C7', color: '#92400E' }}>
              {preparingOrders.length}
            </span>
          </div>

          <div className="kds-card-list">
            {preparingOrders.length === 0 ? (
              <div className="kds-empty-col">
                <span style={{ fontSize: '2rem' }}>🍳</span>
                <span>Nothing cooking right now</span>
              </div>
            ) : (
              preparingOrders.map((order) => {
                const elapsed = getElapsedMinutes(order.createdAt);
                return (
                  <div key={order.id} className="kds-card">
                    <div className="kds-card-top">
                      <span className="kds-table-tag" style={{ background: '#7C4A1E' }}>
                        {order.tableNumber === 'Takeaway' || order.tableNumber === '0' || order.tableNumber === 0 ? '🥡 TAKEAWAY & IN-FLAT' : `TABLE ${order.tableNumber}`}
                      </span>
                      <span className={`kds-time-elapsed ${elapsed > kitchenSettings.dangerTimeMinutes ? 'kds-time-danger' : elapsed > kitchenSettings.warningTimeMinutes ? 'kds-time-warning' : ''}`}>
                        {elapsed < 1 ? 'Just now' : `${elapsed}m ago`}
                      </span>
                    </div>

                    <div className="kds-customer-row">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong>👤 {order.customerName}</strong>
                        <span style={{ fontSize: 11, color: '#685E54' }}>📞 {order.customerPhone}</span>
                      </div>
                      {order.customerFlat && (
                        <div style={{ marginTop: 3, fontSize: 11.5, fontWeight: 700, color: '#7C4A1E' }}>
                          🏢 Flat: {order.customerFlat}
                        </div>
                      )}
                    </div>

                    <ul className="kds-items-list">
                      {order.items.map((it, i) => (
                        <li key={i} className="kds-item-entry">
                          <span>
                            <span className="kds-item-qty">{it.quantity}x</span>
                            {it.name}
                            {it.selectedSize && it.selectedSize !== 'Regular' && (
                              <span style={{ fontSize: 11, color: '#685E54', marginLeft: 4 }}>
                                ({it.selectedSize})
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {order.specialInstructions && (
                      <div className="kds-note-box">
                        <strong>📝 Note:</strong> {order.specialInstructions}
                      </div>
                    )}

                    <div className="kds-card-actions">
                      <button
                        className="kds-action-btn btn-mark-ready"
                        onClick={() => handleUpdateStatus(order.id, 'ready')}
                      >
                        ✓ Mark Ready
                      </button>
                      <button
                        className="btn-print-kot"
                        onClick={() => setPrintOrder(order)}
                        title="Print Kitchen Ticket"
                      >
                        🖨️
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* COLUMN 3: READY FOR PICKUP */}
        <section className="kds-column col-ready">
          <div className="kds-col-header">
            <span className="kds-col-title">
              <span>✅</span> Ready for Pickup
            </span>
            <span className="kds-badge" style={{ background: '#DCFCE7', color: '#166534' }}>
              {readyOrders.length}
            </span>
          </div>

          <div className="kds-card-list">
            {readyOrders.length === 0 ? (
              <div className="kds-empty-col">
                <span style={{ fontSize: '2rem' }}>🛎️</span>
                <span>No orders ready yet</span>
              </div>
            ) : (
              readyOrders.map((order) => {
                const elapsed = getElapsedMinutes(order.createdAt);
                return (
                  <div key={order.id} className="kds-card" style={{ borderColor: '#86EFAC' }}>
                    <div className="kds-card-top">
                      <span className="kds-table-tag" style={{ background: '#166534' }}>
                        {order.tableNumber === 'Takeaway' || order.tableNumber === '0' || order.tableNumber === 0 ? '🥡 TAKEAWAY & IN-FLAT' : `TABLE ${order.tableNumber}`}
                      </span>
                      <span className="kds-time-elapsed">
                        {elapsed < 1 ? 'Just now' : `${elapsed}m ago`}
                      </span>
                    </div>

                    <div className="kds-customer-row">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong>👤 {order.customerName}</strong>
                        <span style={{ fontSize: 11, color: '#685E54' }}>📞 {order.customerPhone}</span>
                      </div>
                      {order.customerFlat && (
                        <div style={{ marginTop: 3, fontSize: 11.5, fontWeight: 700, color: '#166534' }}>
                          🏢 Flat: {order.customerFlat}
                        </div>
                      )}
                    </div>

                    <ul className="kds-items-list">
                      {order.items.map((it, i) => (
                        <li key={i} className="kds-item-entry">
                          <span>
                            <span className="kds-item-qty">{it.quantity}x</span>
                            {it.name}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <div className="kds-card-actions">
                      <button
                        className="kds-action-btn btn-complete"
                        onClick={() => handleUpdateStatus(order.id, 'served')}
                      >
                        ✓ Serve & Archive
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </main>

      {/* ── KOT THERMAL TICKET PRINT MODAL ── */}
      {printOrder && (
        <div className="admin-modal-overlay" onClick={() => setPrintOrder(null)}>
          <div className="admin-modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360, padding: 24 }}>
            <div className="kot-print-area">
              <div style={{ textAlign: 'center', borderBottom: '1px dashed #000', paddingBottom: 10, marginBottom: 10 }}>
                <h2 style={{ fontSize: 18, margin: 0 }}>OZKAFE — ANASSA</h2>
                <div style={{ fontSize: 12 }}>KITCHEN ORDER TICKET (KOT)</div>
                <div style={{ fontSize: 13, fontWeight: 'bold', marginTop: 4 }}>
                  {printOrder.orderNumber} · {printOrder.tableNumber === 'Takeaway' ? 'TAKEAWAY' : `TABLE ${printOrder.tableNumber}`}
                </div>
                <div style={{ fontSize: 11 }}>{new Date(printOrder.createdAt).toLocaleTimeString()}</div>
              </div>

              <div style={{ fontSize: 12, marginBottom: 8 }}>
                <strong>Guest:</strong> {printOrder.customerName} ({printOrder.customerPhone})<br />
                {printOrder.customerFlat && <><strong>Flat:</strong> {printOrder.customerFlat}<br /></>}
              </div>

              <table style={{ width: '100%', fontSize: 13, borderBottom: '1px dashed #000', paddingBottom: 8, marginBottom: 8 }}>
                <thead>
                  <tr style={{ textAlign: 'left' }}>
                    <th>QTY</th>
                    <th>ITEM</th>
                  </tr>
                </thead>
                <tbody>
                  {printOrder.items.map((it, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 'bold', width: 40 }}>{it.quantity}x</td>
                      <td>
                        {it.name}
                        {it.selectedSize && it.selectedSize !== 'Regular' ? ` (${it.selectedSize})` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {printOrder.specialInstructions && (
                <div style={{ fontSize: 11, fontStyle: 'italic', marginBottom: 12 }}>
                  <strong>Special Note:</strong> {printOrder.specialInstructions}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button
                className="btn-solid"
                style={{ flex: 1 }}
                onClick={() => window.print()}
              >
                🖨️ Print Ticket
              </button>
              <button
                className="btn-outline"
                style={{ flex: 1 }}
                onClick={() => setPrintOrder(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
