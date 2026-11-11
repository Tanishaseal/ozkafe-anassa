'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { Order, OrderStatus, StaffUser, MenuItem } from '@/lib/types';
import StaffAuthModal from '@/components/StaffAuthModal';
import AccountPanel from '@/components/AccountPanel';
import SearchableDishPicker from '@/components/SearchableDishPicker';

// Helper to get kitchen authorization headers (supports Bearer token for seamless cross-device auth)
const getKitchenAuthHeaders = (): Record<string, string> => {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('oz_kitchen_token') || localStorage.getItem('oz_admin_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function KitchenDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<StaffUser | null>(null);
  const [isAccountPanelOpen, setIsAccountPanelOpen] = useState(false);
  const [staffName, setStaffName] = useState('');

  // Top Section Mode: 'board' (Live KDS Board with All 4 Sections), 'history' (15-Day Order History)
  const [kitchenViewMode, setKitchenViewMode] = useState<'board' | 'history'>('board');

  const [orders, setOrders] = useState<Order[]>([]);
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState('all');

  // Bill Settlement State
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

  // Custom / Previous Order Bill Creation State for Kitchen
  const [isCustomBillModalOpen, setIsCustomBillModalOpen] = useState(false);
  const [customBillDateTime, setCustomBillDateTime] = useState('');
  const [customBillTable, setCustomBillTable] = useState('Takeaway');
  const [customBillGuest, setCustomBillGuest] = useState('');
  const [customBillPhone, setCustomBillPhone] = useState('');
  const [customBillFlat, setCustomBillFlat] = useState('');
  const [customBillItems, setCustomBillItems] = useState<{ id: string; name: string; price: number; quantity: number; selectedSize: string; category?: string }[]>([]);
  const [customBillNotes, setCustomBillNotes] = useState('');
  const [customBillIsPaid, setCustomBillIsPaid] = useState(false);
  const [customBillPaymentMethod, setCustomBillPaymentMethod] = useState<'Cash' | 'UPI' | 'Card'>('Cash');
  const [isSubmittingCustomBill, setIsSubmittingCustomBill] = useState(false);
  const [customBillSuccessMsg, setCustomBillSuccessMsg] = useState('');

  const getNowLocalDateTimeString = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [recentServed, setRecentServed] = useState<Order[]>([]);
  const [clock, setClock] = useState('00:00:00');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem('oz_kds_sound');
    return stored !== null ? stored === 'true' : true;
  });
  const [printOrder, setPrintOrder] = useState<Order | null>(null);
  const [activeMobileTab, setActiveMobileTab] = useState<'received' | 'preparing' | 'ready' | 'settlement'>('received');
  const previousOrderIdsRef = useRef<Set<string>>(new Set());

  // Unlock Web Audio API on first user gesture
  useEffect(() => {
    const unlockAudio = () => {
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          const dummy = new AudioCtx();
          if (dummy.state === 'suspended') {
            dummy.resume().catch(() => {});
          }
        }
      } catch {}
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
    window.addEventListener('click', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);
    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
  }, []);

  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('oz_kds_sound', String(next));
      }
      return next;
    });
  };

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
        }
      }
    } catch {
      // silent
    }
  };

  // Check persistent kitchen session on mount (do NOT lock on refresh!)
  useEffect(() => {
    fetchKitchenSettings();
    fetchMenuItems();

    // Verify session with server using Bearer token or cookie
    fetch(`/api/kitchen/auth?_t=${Date.now()}`, {
      headers: getKitchenAuthHeaders(),
    })
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
    localStorage.removeItem('oz_kitchen_token');
    localStorage.removeItem('anassa_kitchen_session');
    setIsAuthenticated(false);
    setCurrentUser(null);
    setIsAccountPanelOpen(false);
    await fetch('/api/kitchen/auth', {
      method: 'DELETE',
      headers: getKitchenAuthHeaders(),
    });
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
      const res = await fetch(`/api/orders?status=active&_t=${Date.now()}`, {
        headers: getKitchenAuthHeaders(),
      });
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
      const res = await fetch(`/api/orders?history=true&_t=${Date.now()}`, {
        headers: getKitchenAuthHeaders(),
      });
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
      const res = await fetch('/api/menu', {
        headers: getKitchenAuthHeaders(),
      });
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

  const unsettledOrders = useMemo(() => {
    return allCombinedOrders.filter((o) => o.status === 'served' && !o.isPaid);
  }, [allCombinedOrders]);

  const unsettledOrdersCount = unsettledOrders.length;

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
        headers: {
          'Content-Type': 'application/json',
          ...getKitchenAuthHeaders(),
        },
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

    if (editCustomerFlat.trim()) {
      const hasDigits = /\d/.test(editCustomerFlat.trim());
      const hasLetters = /[a-zA-Z]/.test(editCustomerFlat.trim());
      if (!hasDigits || !hasLetters) {
        alert('Flat Number must contain both digits and letters (e.g. 14B or Tower 2 - 14B).');
        return;
      }
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
        headers: {
          'Content-Type': 'application/json',
          ...getKitchenAuthHeaders(),
        },
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

  // ── CUSTOM / PREVIOUS ORDER BILL CREATION ──
  const openCustomBillModal = async () => {
    setCustomBillDateTime(getNowLocalDateTimeString());
    setCustomBillTable('Takeaway');
    setCustomBillGuest('');
    setCustomBillPhone('');
    setCustomBillFlat('');
    setCustomBillNotes('');
    setCustomBillIsPaid(false);
    setCustomBillPaymentMethod('Cash');

    let items = availableMenuItems;
    if (!items || items.length === 0) {
      try {
        const res = await fetch('/api/menu', {
          headers: getKitchenAuthHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.items) {
            items = data.items;
            setAvailableMenuItems(data.items);
          }
        }
      } catch {
        // silent
      }
    }

    if (items && items.length > 0) {
      const first = items[0];
      setCustomBillItems([
        {
          id: first.id,
          name: first.name,
          price: first.price,
          quantity: 1,
          selectedSize: first.sizes?.[0] || 'Regular',
          category: first.category,
        },
      ]);
    } else {
      setCustomBillItems([]);
    }

    setIsCustomBillModalOpen(true);
  };

  const handleAddCustomBillItem = () => {
    if (availableMenuItems.length === 0) return;
    const item = availableMenuItems[0];
    setCustomBillItems((prev) => [
      ...prev,
      {
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: 1,
        selectedSize: item.sizes?.[0] || 'Regular',
        category: item.category,
      },
    ]);
  };

  const handleUpdateCustomBillItem = (
    index: number,
    updates: Partial<{ id: string; name: string; price: number; quantity: number; selectedSize: string; category?: string }>
  ) => {
    setCustomBillItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it;
        const updated = { ...it, ...updates };
        if (updates.id) {
          const matched = availableMenuItems.find((m) => m.id === updates.id);
          if (matched) {
            updated.name = matched.name;
            updated.price = matched.price;
            updated.category = matched.category;
            updated.selectedSize = matched.sizes?.[0] || 'Regular';
          }
        }
        return updated;
      })
    );
  };

  const handleRemoveCustomBillItem = (index: number) => {
    setCustomBillItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmitCustomBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (customBillItems.length === 0) {
      alert('Please add at least one dish / item to the custom bill.');
      return;
    }

    for (const it of customBillItems) {
      if (!it.id) {
        alert('Please choose a valid dish for all items.');
        return;
      }
    }

    if (customBillFlat.trim()) {
      const hasDigits = /\d/.test(customBillFlat.trim());
      const hasLetters = /[a-zA-Z]/.test(customBillFlat.trim());
      if (!hasDigits || !hasLetters) {
        alert('Flat Number must contain both digits and letters (e.g. 14B or Tower 2 - 14B).');
        return;
      }
    }

    setIsSubmittingCustomBill(true);
    try {
      const subtotal = customBillItems.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0);
      const gstRate = 5;
      const taxAmount = Math.round((subtotal * gstRate) / 100);
      const total = subtotal + taxAmount;
      const customCreatedAt = customBillDateTime ? new Date(customBillDateTime).getTime() : Date.now();

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getKitchenAuthHeaders(),
        },
        body: JSON.stringify({
          action: 'kitchen_custom_order',
          tableNumber: customBillTable,
          customerName: customBillGuest.trim() || 'Counter Walk-in',
          customerPhone: customBillPhone.trim() || '9830000000',
          customerFlat: customBillFlat.trim() || undefined,
          items: customBillItems.map((it) => ({
            id: it.id,
            name: it.name,
            price: it.price,
            quantity: Math.max(1, Number(it.quantity) || 1),
            selectedSize: it.selectedSize || 'Regular',
            category: it.category || 'General',
          })),
          subtotal,
          taxAmount,
          total,
          specialInstructions: customBillNotes.trim() || `Custom bill recorded from Kitchen by ${currentUser?.name || staffName || 'Kitchen Staff'}`,
          createdAt: customCreatedAt,
          status: 'served', // Directly completed! Does not go to new/prep/ready
          isPaid: customBillIsPaid,
          settledBy: customBillIsPaid ? (currentUser?.name || staffName || 'Kitchen Staff') : undefined,
          staffName: currentUser?.name || staffName || 'Kitchen Staff',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const createdOrder: Order = data.order;
        setIsCustomBillModalOpen(false);
        setCustomBillSuccessMsg(`✓ Custom Bill #${createdOrder.orderNumber} successfully recorded!`);
        setTimeout(() => setCustomBillSuccessMsg(''), 5000);

        // Refresh orders & history
        await fetchHistoryOrders();
        await fetchOrders();

        // Switch to history view so kitchen staff immediately sees the logged bill
        setKitchenViewMode('history');

        // Offer to print receipt
        if (confirm(`Bill #${createdOrder.orderNumber} (₹${createdOrder.total}) recorded directly to Order History & Admin!\n\nWould you like to print or view the receipt now?`)) {
          setPrintOrder(createdOrder);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to record custom bill. Please check inputs.');
      }
    } catch {
      alert('Network error while creating custom bill.');
    } finally {
      setIsSubmittingCustomBill(false);
    }
  };

  // Crisp Restaurant Order Notification Chime
  const playChime = () => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const now = ctx.currentTime;

      // Tone 1: D5 (587.33 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(0.4, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.45);

      // Tone 2: A5 (880.00 Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.15);
      gain2.gain.setValueAtTime(0.5, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.85);
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

    // 1. Server-Sent Events (SSE) Stream with token fallback for strict cross-browser support
    let eventSource: EventSource | null = null;
    try {
      const token = typeof window !== 'undefined'
        ? (localStorage.getItem('oz_kitchen_token') || localStorage.getItem('oz_admin_token') || '')
        : '';
      const streamUrl = token ? `/api/orders/stream?token=${encodeURIComponent(token)}` : '/api/orders/stream';
      eventSource = new EventSource(streamUrl);
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
        headers: {
          'Content-Type': 'application/json',
          ...getKitchenAuthHeaders(),
        },
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

  // Dynamic window / tab title alert for kitchen staff
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (receivedOrders.length > 0) {
      document.title = `🔔 (${receivedOrders.length}) NEW ORDER! - OZKAFE Kitchen`;
    } else if (orders.length > 0) {
      document.title = `(${orders.length} Active) - OZKAFE Kitchen`;
    } else {
      document.title = 'OZKAFE Kitchen Display (KDS)';
    }
  }, [receivedOrders.length, orders.length]);

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
            onClick={toggleSound}
            className={`btn-kds-header ${soundEnabled ? 'active' : ''}`}
            title={soundEnabled ? 'Order sound alert is ON (click to mute)' : 'Order sound alert is MUTED (click to turn ON)'}
            style={{
              background: soundEnabled ? '#FEF3C7' : '#F4EFEA',
              color: soundEnabled ? '#92400E' : '#78716C',
              borderColor: soundEnabled ? '#F59E0B' : '#E5DFD7',
              fontWeight: 700,
            }}
          >
            {soundEnabled ? '🔔 Sound ON' : '🔕 Sound OFF'}
          </button>

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

      {/* ── KITCHEN TOP VIEW NAVIGATION (Live KDS Board with All 4 Columns & 15-Day History) ── */}
      <nav className="kds-view-nav" aria-label="Kitchen Display Sections">
        <button
          type="button"
          onClick={() => setKitchenViewMode('board')}
          className={`kds-view-btn ${kitchenViewMode === 'board' ? 'active' : ''}`}
        >
          <span>🍳 Live KDS Board</span>
          {receivedOrders.length > 0 ? (
            <span className="kds-view-badge" style={{ background: '#DC2626', color: '#FFF', fontWeight: 800 }}>
              {receivedOrders.length} NEW
            </span>
          ) : unsettledOrdersCount > 0 ? (
            <span className="kds-view-badge unsettled">{unsettledOrdersCount} Bills</span>
          ) : (
            <span className="kds-view-badge">{orders.length}</span>
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

        <button
          type="button"
          onClick={openCustomBillModal}
          className="kds-view-btn kds-custom-bill-btn"
          title="Add a custom bill for previous orders directly to history and admin records"
        >
          <span>🧾 + Add Custom Bill</span>
          <span className="kds-view-badge" style={{ background: '#8E402A', color: '#FFFFFF', fontSize: 10, letterSpacing: 0.3 }}>
            PREVIOUS ORDER
          </span>
        </button>
      </nav>

      {/* Custom Bill Feedback Toast */}
      {customBillSuccessMsg && (
        <div
          style={{
            background: '#DCFCE7',
            color: '#15803D',
            borderBottom: '1px solid #86EFAC',
            padding: '10px 24px',
            fontWeight: 700,
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>✓</span>
            <span>{customBillSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setCustomBillSuccessMsg('')}
            style={{
              background: 'none',
              border: 'none',
              color: '#15803D',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: 16,
              padding: '0 4px',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── VIEW 1: LIVE KANBAN BOARD ── */}
      {kitchenViewMode === 'board' && (
        <>
          {/* MOBILE COLUMN TABS (Under 768px) — All 4 Sections */}
          <nav className="kds-mobile-nav" aria-label="Kitchen Display Columns">
            <button
              type="button"
              onClick={() => setActiveMobileTab('received')}
              className={`kds-mobile-tab-btn tab-received ${activeMobileTab === 'received' ? 'active' : ''}`}
            >
              <span>🔴 New ({receivedOrders.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveMobileTab('preparing')}
              className={`kds-mobile-tab-btn tab-prep ${activeMobileTab === 'preparing' ? 'active' : ''}`}
            >
              <span>🟡 Prep ({preparingOrders.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveMobileTab('ready')}
              className={`kds-mobile-tab-btn tab-ready ${activeMobileTab === 'ready' ? 'active' : ''}`}
            >
              <span>🟢 Ready ({readyOrders.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveMobileTab('settlement')}
              className={`kds-mobile-tab-btn tab-settlement ${activeMobileTab === 'settlement' ? 'active' : ''}`}
            >
              <span>💰 Settle ({unsettledOrders.length})</span>
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

            {/* COLUMN 4: BILL SETTLEMENT (Directly on Live KDS Board) */}
            <section className={`kds-column col-type-settlement ${activeMobileTab === 'settlement' ? 'mobile-active' : 'mobile-hidden'}`}>
              <div className="column-header col-settlement">
                <div className="col-header-left">
                  <span className="col-dot"></span>
                  <h2>BILL SETTLEMENT</h2>
                </div>
                <span className="col-count-badge">{unsettledOrders.length}</span>
              </div>

              <div className="kds-cards-container">
                {unsettledOrders.length === 0 ? (
                  <div className="empty-kds-state">
                    <span className="empty-icon">✓</span>
                    <p>No bills awaiting settlement</p>
                    <span style={{ fontSize: 11, color: '#A8A29E', marginTop: 4 }}>Orders pop here after passing Ready for Pickup & Served until payment is collected.</span>
                  </div>
                ) : (
                  unsettledOrders.map((order) => {
                    const elapsed = getElapsedMinutes(order.createdAt);
                    return (
                      <div key={order.id} className="kds-order-card" style={{ borderLeft: '4px solid #C59A6F' }}>
                        <div className="card-top-bar">
                          <div className="table-badge" style={{ background: '#FDF4E7', color: '#7C4A1E', border: '1px solid #F5DEB3' }}>
                            {order.tableNumber === 0 || String(order.tableNumber).toLowerCase() === 'takeaway' ? (
                              <span>🥡 TAKEAWAY & IN-FLAT</span>
                            ) : (
                              <span>🍽️ TABLE {order.tableNumber}</span>
                            )}
                          </div>
                          <div className="order-timer">
                            <span>⏱️ {elapsed}m ago</span>
                          </div>
                        </div>

                        <div className="card-customer-row">
                          <span className="card-cust-name">👤 {order.customerName || 'Walk-in Guest'}</span>
                          {order.customerPhone && (
                            <span className="card-cust-phone">{order.customerPhone}</span>
                          )}
                        </div>

                        {order.customerFlat && (
                          <div className="card-flat-row">
                            <span>🏢 Flat: <strong>{order.customerFlat}</strong></span>
                          </div>
                        )}

                        <div style={{ fontSize: 11, color: '#78716C', margin: '2px 0 6px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 800, color: '#5C381E' }}>#{order.orderNumber}</span>
                          <span>•</span>
                          <span>⏰ {new Date(order.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>

                        <div className="card-items-list">
                          {order.items.map((it, idx) => (
                            <div key={idx} className="kds-item-row">
                              <span className="item-qty">{it.quantity}x</span>
                              <span className="item-name">
                                {it.name}
                                {it.selectedSize && it.selectedSize !== 'Regular' ? ` (${it.selectedSize})` : ''}
                              </span>
                              <span style={{ fontSize: 11, color: '#78716C', fontWeight: 600, marginLeft: 'auto' }}>
                                ₹{((Number(it.price) || 0) * (Number(it.quantity) || 1)).toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Bill Total Highlight */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F5EBE1', padding: '6px 10px', borderRadius: 6, margin: '6px 0 8px' }}>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: '#5C381E' }}>Total Payable:</span>
                          <strong style={{ fontSize: 14.5, fontWeight: 900, color: '#5C381E' }}>₹{(order.total || 0).toFixed(2)}</strong>
                        </div>

                        {/* Card Actions */}
                        <div className="kds-card-actions" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <button
                            type="button"
                            disabled={isSettlingId === order.id}
                            onClick={() => handleSettleBill(order.id)}
                            className="kds-action-btn"
                            style={{
                              flex: 1,
                              height: 36,
                              background: '#15803D',
                              color: '#FFF',
                              border: 'none',
                              borderRadius: 8,
                              fontWeight: 800,
                              fontSize: 12,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 4,
                            }}
                            title="Mark order paid and settled"
                          >
                            {isSettlingId === order.id ? 'Settling...' : '💳 Mark Settled'}
                          </button>
                          <button
                            type="button"
                            className="btn-kds-view-receipt"
                            title="View / Print Bill"
                            onClick={() => setPrintOrder(order)}
                            style={{ height: 36, padding: '0 10px', borderRadius: 8, border: '1px solid #D6D3D1', background: '#FFF', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                          >
                            🧾 Bill
                          </button>
                          <button
                            type="button"
                            className="btn-kds-edit-receipt"
                            title="Edit Order / Bill"
                            onClick={() => handleOpenEditReceipt(order)}
                            style={{ height: 36, padding: '0 10px', borderRadius: 8, border: '1px solid #D6D3D1', background: '#FFF', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
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

              <button
                type="button"
                onClick={openCustomBillModal}
                className="kds-action-btn-custom-bill"
                title="Add custom bill for previous orders directly to history & admin"
              >
                <span>🧾 + Add Custom Bill</span>
              </button>
            </div>
          </div>

          {filteredHistoryOrders.length === 0 ? (
            <div className="empty-kds-state" style={{ background: '#FFF', borderRadius: 14, border: '1px solid #E5DFD7' }}>
              <span className="empty-icon">📜</span>
              <p>No orders found in the past 15 days</p>
              <span className="empty-sub">Past dining and takeaway orders completed within 15 days are logged here.</span>
              <button
                type="button"
                onClick={openCustomBillModal}
                className="kds-action-btn-custom-bill"
                style={{ marginTop: 14 }}
              >
                🧾 + Add Custom Bill for Previous Order
              </button>
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
            <div
              className="admin-modal-box"
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: 420,
                padding: '22px 24px',
                background: '#FFFFFF',
                backgroundColor: '#FFFFFF',
                borderRadius: 16,
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
                border: '1px solid #E5DFD7',
              }}
            >
              <div
                className="kot-print-area"
                style={{
                  fontFamily: 'var(--font-mono), monospace',
                  fontSize: 12,
                  color: '#1C1917',
                  background: '#FFFFFF',
                  backgroundColor: '#FFFFFF',
                }}
              >
                {/* STORE & ORDER ID */}
                <div style={{ textAlign: 'center', borderBottom: '1.5px dashed #78716C', paddingBottom: 10, marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                    <img
                      src="/images/ozkafe_logo.jpeg"
                      alt="OZKAFE"
                      style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }}
                    />
                  </div>
                  <h2 style={{ fontSize: 18, margin: '0 0 2px', fontWeight: 900 }}>OZKAFE · ANASSA</h2>
                  <div style={{ fontSize: 13, fontWeight: 800, marginTop: 4, color: '#1C1917' }}>
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

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: '#F8F6F2', padding: 12, borderRadius: 8, border: '1px solid #E5DFD7', width: '100%', boxBoxSizing: 'border-box' } as React.CSSProperties}>
                  {editItems.map((item, idx) => (
                    <div key={idx} className="receipt-item-row-card">
                      <div className="receipt-item-top">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => {
                            const updated = [...editItems];
                            updated[idx].name = e.target.value;
                            setEditItems(updated);
                          }}
                          className="receipt-item-name-input"
                          placeholder="Dish name"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          title="Remove dish from receipt"
                          className="receipt-item-del-btn"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="receipt-item-bottom">
                        <div className="receipt-item-stepper">
                          <button
                            type="button"
                            onClick={() => handleItemQtyChange(idx, -1)}
                            className="receipt-item-stepper-btn"
                            title="Decrease quantity"
                          >
                            -
                          </button>
                          <span className="receipt-item-stepper-val">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleItemQtyChange(idx, 1)}
                            className="receipt-item-stepper-btn"
                            title="Increase quantity"
                          >
                            +
                          </button>
                        </div>

                        <div className="receipt-item-pricing">
                          <span className="receipt-item-price-label">Price:</span>
                          <div className="receipt-item-price-wrapper">
                            <span className="receipt-item-currency">₹</span>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={item.price}
                              onChange={(e) => handleUpdateItemPrice(idx, parseFloat(e.target.value) || 0)}
                              className="receipt-item-price-input"
                            />
                          </div>
                        </div>

                        <div className="receipt-item-subtotal-badge">
                          = ₹{((Number(item.price) || 0) * (Number(item.quantity) || 1)).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Searchable Add dish picker */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 4, paddingTop: 8, borderTop: '1px dashed #D6D3D1', alignItems: 'center', width: '100%' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <SearchableDishPicker
                        items={availableMenuItems}
                        selectedId={editAddItemId}
                        placeholder="🔍 Search dish to add..."
                        onSelect={(dish) => setEditAddItemId(dish.id)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddItem}
                      disabled={!editAddItemId}
                      style={{ height: 38, padding: '0 14px', background: '#5C381E', color: '#FFF', border: 'none', borderRadius: 8, fontWeight: 700, cursor: editAddItemId ? 'pointer' : 'not-allowed', fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }}
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

      {/* ── KITCHEN CUSTOM BILL (PREVIOUS ORDER) MODAL ── */}
      {isCustomBillModalOpen && (
        <div className="admin-modal-overlay" onClick={() => setIsCustomBillModalOpen(false)}>
          <div
            className="admin-modal-box"
            style={{
              maxWidth: 540,
              maxHeight: '90vh',
              overflowY: 'auto',
              background: '#FFFFFF',
              borderRadius: 16,
              padding: '22px 26px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #E5DFD7', paddingBottom: 14, marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#1A1410', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>🧾</span> + Add Custom Bill (Previous Order)
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#78716C', lineHeight: 1.4 }}>
                  Directly record counter or previous orders into Order History and Admin ledger. No kitchen prep queue required.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCustomBillModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#78716C', padding: '0 4px' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitCustomBill} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* 1. Order Date & Time */}
              <div style={{ background: '#FAF8F5', padding: '12px 14px', borderRadius: 10, border: '1px solid #E5DFD7' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#44403C', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>📅</span> Order Date & Time (Previous or Current)
                  </label>
                  <button
                    type="button"
                    onClick={() => setCustomBillDateTime(getNowLocalDateTimeString())}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#8E402A',
                      fontSize: 11.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: '2px 4px',
                      textDecoration: 'underline',
                    }}
                  >
                    Set to Now
                  </button>
                </div>
                <input
                  type="datetime-local"
                  value={customBillDateTime}
                  onChange={(e) => setCustomBillDateTime(e.target.value)}
                  required
                  className="kds-search-input"
                  style={{ width: '100%', fontWeight: 700, fontSize: 13 }}
                />
                <div style={{ fontSize: 11, color: '#78716C', marginTop: 4 }}>
                  Timestamp this bill for today, or backdate to any previous day/time.
                </div>
              </div>

              {/* 2. Customer Name & Table/Type */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#44403C', marginBottom: 4 }}>
                    Table / Order Type
                  </label>
                  <select
                    value={customBillTable}
                    onChange={(e) => setCustomBillTable(e.target.value)}
                    className="kds-search-input"
                    style={{ width: '100%', cursor: 'pointer', fontWeight: 600 }}
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
                    Customer / Guest Name
                  </label>
                  <input
                    type="text"
                    value={customBillGuest}
                    onChange={(e) => setCustomBillGuest(e.target.value)}
                    placeholder="e.g. Rahul Sen"
                    className="kds-search-input"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              {/* 3. Phone & Flat Number */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#44403C', marginBottom: 4 }}>
                    Phone Number (Optional)
                  </label>
                  <input
                    type="tel"
                    value={customBillPhone}
                    onChange={(e) => setCustomBillPhone(e.target.value)}
                    placeholder="e.g. 9830012345"
                    className="kds-search-input"
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#44403C', marginBottom: 4 }}>
                    Flat / Apartment (Digits & Letters, e.g. 14B)
                  </label>
                  <input
                    type="text"
                    value={customBillFlat}
                    onChange={(e) => setCustomBillFlat(e.target.value)}
                    placeholder="e.g. 14B or Tower 2 - 14B"
                    className="kds-search-input"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              {/* 4. Dishes / Bill Items */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#44403C' }}>
                    Dishes & Drinks on this Bill ({customBillItems.length})
                  </label>
                  <button
                    type="button"
                    onClick={handleAddCustomBillItem}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#8E402A',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    + Add Another Dish
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: '#F8F6F2', padding: 12, borderRadius: 10, border: '1px solid #E5DFD7', maxHeight: 220, overflowY: 'auto' }}>
                  {customBillItems.map((item, idx) => {
                    const menuItem = availableMenuItems.find((m) => m.id === item.id);
                    const sizes = menuItem?.sizes && menuItem.sizes.length > 0 ? menuItem.sizes : ['Regular'];

                    return (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                          background: '#FFFFFF',
                          padding: 10,
                          borderRadius: 8,
                          border: '1px solid #E5DFD7',
                        }}
                      >
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
                          <SearchableDishPicker
                            items={availableMenuItems}
                            selectedId={item.id}
                            onSelect={(selectedDish) => {
                              handleUpdateCustomBillItem(idx, {
                                id: selectedDish.id,
                                name: selectedDish.name,
                                price: selectedDish.price,
                                category: selectedDish.category,
                                selectedSize: selectedDish.sizes?.[0] || 'Regular',
                              });
                            }}
                          />
                          {customBillItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveCustomBillItem(idx)}
                              style={{
                                background: '#FEE2E2',
                                color: '#DC2626',
                                border: '1px solid #FCA5A5',
                                borderRadius: 6,
                                width: 28,
                                height: 32,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                fontWeight: 800,
                                fontSize: 13,
                              }}
                              title="Remove dish"
                            >
                              ✕
                            </button>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                          <div style={{ flex: '1 1 100px', minWidth: 90 }}>
                            <label style={{ fontSize: 10, fontWeight: 700, color: '#78716C', textTransform: 'uppercase' }}>Portion</label>
                            <select
                              value={item.selectedSize}
                              onChange={(e) => handleUpdateCustomBillItem(idx, { selectedSize: e.target.value })}
                              style={{ width: '100%', minWidth: 0, height: 28, fontSize: 11.5, padding: '0 6px', marginTop: 2, cursor: 'pointer', borderRadius: 6, border: '1px solid #D6D3D1', background: '#FFF' }}
                            >
                              {sizes.map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </div>

                          <div style={{ flex: '0 0 auto' }}>
                            <label style={{ fontSize: 10, fontWeight: 700, color: '#78716C', textTransform: 'uppercase' }}>Quantity</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                              <button
                                type="button"
                                onClick={() => handleUpdateCustomBillItem(idx, { quantity: Math.max(1, item.quantity - 1) })}
                                style={{
                                  width: 26,
                                  height: 26,
                                  borderRadius: 4,
                                  border: '1px solid #D6D3D1',
                                  background: '#FAF8F5',
                                  fontWeight: 800,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                -
                              </button>
                              <input
                                type="number"
                                min="1"
                                max="99"
                                value={item.quantity}
                                onChange={(e) => handleUpdateCustomBillItem(idx, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                                style={{ width: 38, minWidth: 0, height: 26, textAlign: 'center', fontWeight: 700, padding: 0, borderRadius: 4, border: '1px solid #D6D3D1', background: '#FFF' }}
                              />
                              <button
                                type="button"
                                onClick={() => handleUpdateCustomBillItem(idx, { quantity: item.quantity + 1 })}
                                style={{
                                  width: 26,
                                  height: 26,
                                  borderRadius: 4,
                                  border: '1px solid #D6D3D1',
                                  background: '#FAF8F5',
                                  fontWeight: 800,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                +
                              </button>
                            </div>
                          </div>

                          <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
                            <label style={{ fontSize: 10, fontWeight: 700, color: '#78716C', textTransform: 'uppercase' }}>Total</label>
                            <div style={{ fontSize: 12.5, fontWeight: 800, color: '#8E402A', marginTop: 4 }}>
                              ₹{(item.price * item.quantity).toFixed(2)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 5. Payment & Settlement Status */}
              <div style={{ background: '#FAF8F5', padding: '12px 14px', borderRadius: 10, border: '1px solid #E5DFD7' }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#44403C', marginBottom: 6 }}>
                  💳 Settlement Status
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: `1.5px solid ${!customBillIsPaid ? '#8E402A' : '#E5DFD7'}`,
                      background: !customBillIsPaid ? '#FFF7ED' : '#FFFFFF',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 700,
                      color: !customBillIsPaid ? '#8E402A' : '#57534E',
                    }}
                  >
                    <input
                      type="radio"
                      name="paymentStatus"
                      checked={!customBillIsPaid}
                      onChange={() => setCustomBillIsPaid(false)}
                      style={{ accentColor: '#8E402A' }}
                    />
                    <span>⏳ Unsettled (Collect Later)</span>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: `1.5px solid ${customBillIsPaid ? '#15803D' : '#E5DFD7'}`,
                      background: customBillIsPaid ? '#DCFCE7' : '#FFFFFF',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 700,
                      color: customBillIsPaid ? '#15803D' : '#57534E',
                    }}
                  >
                    <input
                      type="radio"
                      name="paymentStatus"
                      checked={customBillIsPaid}
                      onChange={() => setCustomBillIsPaid(true)}
                      style={{ accentColor: '#15803D' }}
                    />
                    <span>✅ Already Settled / Paid</span>
                  </label>
                </div>

                {customBillIsPaid && (
                  <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: '#44403C' }}>Payment Method:</span>
                    {(['Cash', 'UPI', 'Card'] as const).map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setCustomBillPaymentMethod(method)}
                        style={{
                          padding: '3px 10px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                          border: customBillPaymentMethod === method ? '1.5px solid #15803D' : '1px solid #D6D3D1',
                          background: customBillPaymentMethod === method ? '#15803D' : '#FFFFFF',
                          color: customBillPaymentMethod === method ? '#FFFFFF' : '#44403C',
                        }}
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 6. Live Bill Total */}
              {(() => {
                const subtotal = customBillItems.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0);
                const taxAmount = Math.round((subtotal * 5) / 100);
                const total = subtotal + taxAmount;

                return (
                  <div style={{ background: '#2A2118', color: '#FFFFFF', padding: '12px 16px', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 11.5, color: '#D6CEC3' }}>
                        Subtotal: ₹{subtotal.toFixed(2)} + GST 5%: ₹{taxAmount.toFixed(2)}
                      </div>
                      <div style={{ fontSize: 11, color: '#A8A29E', marginTop: 2 }}>
                        {customBillItems.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0)} items · Direct to History & Admin
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10.5, color: '#C59A6F', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Total Bill
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#FAF8F5' }}>
                        ₹{total.toFixed(2)}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Footer Buttons */}
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setIsCustomBillModalOpen(false)}
                  style={{
                    flex: 1,
                    height: 42,
                    borderRadius: 8,
                    border: '1px solid #D6D3D1',
                    background: '#FAF8F5',
                    color: '#44403C',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCustomBill || customBillItems.length === 0}
                  style={{
                    flex: 2,
                    height: 42,
                    borderRadius: 8,
                    border: 'none',
                    background: 'linear-gradient(135deg, #8E402A 0%, #A64E35 100%)',
                    color: '#FFFFFF',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: isSubmittingCustomBill ? 'not-allowed' : 'pointer',
                    boxShadow: '0 2px 8px rgba(142, 64, 42, 0.3)',
                    opacity: isSubmittingCustomBill ? 0.7 : 1,
                  }}
                >
                  {isSubmittingCustomBill ? 'Recording Bill...' : '✓ Record Bill (To History & Admin)'}
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
