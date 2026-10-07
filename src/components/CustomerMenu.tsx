'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Image from 'next/image';
import { Category, MenuItem, MenuAddon, CartItem, Order, CafeSettings } from '@/lib/types';

interface CustomerMenuProps {
  initialCategories: Category[];
  initialItems: MenuItem[];
  initialAddons: MenuAddon[];
  initialTable?: string;
  initialKey?: string;
  initialSettings?: CafeSettings;
}

export default function CustomerMenu({
  initialCategories,
  initialItems,
  initialAddons,
  initialTable = 'Takeaway',
  initialKey,
  initialSettings,
}: CustomerMenuProps) {
  // Live Cafe Settings state
  const [settings, setSettings] = useState<CafeSettings>(initialSettings || {
    cafeName: 'OZKAFE',
    tagline: 'At Anassa · Kolkata',
    address: 'Beside JW Marriott, EM Bypass, Kolkata · 100% Pure Veg',
    gstPercent: 5,
    currencySymbol: '₹',
    isOpen: true,
    kitchenSoundEnabled: true,
    adminPin: '1234',
    geofencingEnabled: false,
    cafeLatitude: 22.5448,
    cafeLongitude: 88.4000,
    geofenceRadiusMeters: 150,
  });

  // State
  const [categories] = useState<Category[]>(initialCategories);
  const [items, setItems] = useState<MenuItem[]>(initialItems);
  const [addons] = useState<MenuAddon[]>(initialAddons);
  
  const [activeCategoryIdx, setActiveCategoryIdx] = useState(0);
  const [activeItemIdx, setActiveItemIdx] = useState(0);
  const [selectedSizeIdx, setSelectedSizeIdx] = useState(0);
  const [quantity, setQuantity] = useState(1);

  // Modals
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isTrackerOpen, setIsTrackerOpen] = useState(false);
  const [isSplashVisible, setIsSplashVisible] = useState(true);

  // Cart & Orders
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [specialNote, setSpecialNote] = useState('');
  const [customerFlat, setCustomerFlat] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [cartBadgePop, setCartBadgePop] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  // Guest Identification & Device Native Picker
  const [isContactPickerSupported, setIsContactPickerSupported] = useState(false);
  const [isGuestProfileSaved, setIsGuestProfileSaved] = useState(false);
  const [isEditingGuestProfile, setIsEditingGuestProfile] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [isOffline, setIsOffline] = useState(false);

  const thumbnailTrackRef = useRef<HTMLDivElement>(null);
  const categoryNavRef = useRef<HTMLDivElement>(null);

  // Table Session State
  const [tableSessionId, setTableSessionId] = useState<string>('');
  const [, setIsTableVerified] = useState<boolean>(false);

  // Flat all items with category metadata
  const flattenedItems = useMemo(() => {
    return items;
  }, [items]);

  const activeItem: MenuItem | undefined = flattenedItems[activeItemIdx] || flattenedItems[0];
  const activeCategory: Category | undefined = categories[activeCategoryIdx] || categories[0];

  // Splash timeout
  useEffect(() => {
    const timer = setTimeout(() => setIsSplashVisible(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  // Detect Web Contact Picker API capability (Android Chrome / Chromium)
  useEffect(() => {
    if (typeof window !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window) {
      setIsContactPickerSupported(true);
    }
  }, []);

  // Clean and sanitize phone numbers (strips +91, 0, spaces, dashes)
  const sanitizePhoneNumber = (raw: string): string => {
    let digits = raw.replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) {
      digits = digits.slice(2);
    }
    if (digits.length === 11 && digits.startsWith('0')) {
      digits = digits.slice(1);
    }
    return digits.slice(0, 10);
  };

  const handlePhoneChange = (val: string) => {
    const cleaned = sanitizePhoneNumber(val);
    setCustomerPhone(cleaned);
    if (cleaned.length > 0 && cleaned.length < 10) {
      setPhoneError('Please enter a 10-digit mobile number');
    } else {
      setPhoneError('');
    }
  };

  // Web Contact Picker handler
  const handlePickFromContacts = async () => {
    if (typeof navigator === 'undefined' || !('contacts' in navigator)) return;
    try {
      // @ts-expect-error - Web Contact Picker API in Chromium browsers
      const contacts = await navigator.contacts.select(['tel', 'name'], { multiple: false });
      if (contacts && contacts.length > 0) {
        const selected = contacts[0];
        if (selected.name && selected.name[0] && !customerName) {
          setCustomerName(selected.name[0]);
        }
        if (selected.tel && selected.tel[0]) {
          const cleaned = sanitizePhoneNumber(selected.tel[0]);
          setCustomerPhone(cleaned);
          setPhoneError('');
        }
      }
    } catch (err) {
      // User cancelled picker dialog
      console.log('Contact picker dismissed:', err);
    }
  };

  // ── TABLE SESSION INITIALIZATION & STATE RESTORATION ON RE-SCAN ──
  useEffect(() => {
    const initTableSession = async () => {
      // 1. Recover saved guest profile if previously entered
      const savedProfileStr = localStorage.getItem('anassa_guest_profile') || localStorage.getItem('anassa_billing_details');
      if (savedProfileStr) {
        try {
          const profile = JSON.parse(savedProfileStr);
          if (profile.flat) setCustomerFlat(profile.flat);
          if (profile.name) setCustomerName(profile.name);
          if (profile.phone) {
            setCustomerPhone(profile.phone);
            setIsGuestProfileSaved(true);
          }
        } catch {
          // ignore error
        }
      }

      // 2. Recover saved cart for this table if any
      const savedCartStr = localStorage.getItem(`anassa_cart_${initialTable}`);
      if (savedCartStr) {
        try {
          const savedCart = JSON.parse(savedCartStr);
          if (savedCart && Object.keys(savedCart).length > 0) {
            setCart(savedCart);
          }
        } catch {
          // ignore error
        }
      }

      // 3. Authenticate table & obtain/recover Session ID
      const sessionKey = `anassa_session_${initialTable}`;
      let existingSessionId = localStorage.getItem(sessionKey) || '';

      try {
        const queryUrl = initialKey
          ? `/api/tables?table=${encodeURIComponent(initialTable)}&key=${encodeURIComponent(initialKey)}`
          : `/api/tables?table=${encodeURIComponent(initialTable)}`;

        const res = await fetch(queryUrl);
        if (res.ok) {
          const data = await res.json();
          setIsTableVerified(Boolean(data.isVerified || data.valid));

          if (data.sessionId) {
            existingSessionId = data.sessionId;
            localStorage.setItem(sessionKey, existingSessionId);
            setTableSessionId(existingSessionId);
          }

          // ── PILLAR 1: INSTANT URL CLEANSING (ANTI-LINK-SHARING DEFENSE) ──
          // Scrub the cryptographic secret key from the browser address bar immediately!
          // If the guest copies the URL from their browser or taps "Share",
          // they only copy "/?table=1" (view-only), NOT the secret table key!
          if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
            const cleanUrl = initialTable !== 'Takeaway' && initialTable !== '0'
              ? `/?table=${encodeURIComponent(initialTable)}`
              : '/';
            window.history.replaceState({}, document.title, cleanUrl);
          }
        }
      } catch (err) {
        console.warn('Table validation error:', err);
      }

      if (!existingSessionId) {
        existingSessionId = `sess_${initialTable}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        localStorage.setItem(sessionKey, existingSessionId);
      }
      setTableSessionId(existingSessionId);

      // 4. Fetch active orders for this specific table session (Restores state if page closed and re-scanned!)
      fetchSessionOrders(initialTable, existingSessionId);
    };

    initTableSession();
  }, [initialTable, initialKey]);

  // Save cart state whenever it changes so user never loses their selection if browser closes
  useEffect(() => {
    if (Object.keys(cart).length > 0) {
      localStorage.setItem(`anassa_cart_${initialTable}`, JSON.stringify(cart));
    } else {
      localStorage.removeItem(`anassa_cart_${initialTable}`);
    }
  }, [cart, initialTable]);

  // Save guest profile details whenever customer edits them
  useEffect(() => {
    if (customerName || customerPhone || customerFlat) {
      localStorage.setItem('anassa_billing_details', JSON.stringify({
        flat: customerFlat,
        name: customerName,
        phone: customerPhone,
      }));
    }
  }, [customerFlat, customerName, customerPhone]);

  // Fetch orders strictly bound to this dining session
  const fetchSessionOrders = async (tbl: string, sessId: string) => {
    try {
      const res = await fetch(`/api/orders?table=${encodeURIComponent(tbl)}&session=${encodeURIComponent(sessId)}&_t=${Date.now()}`);
      if (res.ok) {
        const data: Order[] = await res.json();
        setActiveOrders(data);
      }
    } catch (err) {
      console.warn('Fetch session orders error:', err);
    }
  };

  // Re-sync menu updates (e.g. stock availability changes in real-time)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/menu');
        if (res.ok) {
          const data = await res.json();
          if (data.items) {
            setItems(data.items);
            // Check if any cart item was 86'd (marked out of stock)
            Object.values(cart).forEach((cartIt) => {
              const liveDish = data.items.find((i: MenuItem) => i.id === cartIt.id);
              if (liveDish && !liveDish.isAvailable) {
                updateCartItemQuantity(cartIt.cartKey, -cartIt.quantity);
                alert(`Notice: "${cartIt.name}" was just marked OUT OF STOCK by the kitchen and has been removed from your cart.`);
              }
            });
          }
        }
      } catch {
        // silent fail
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [cart]);

  // Real-time synchronization of Cafe Settings from server
  useEffect(() => {
    const syncSettings = async () => {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          if (data.settings) {
            setSettings((prev) => ({ ...prev, ...data.settings }));
          }
        }
      } catch {
        // silent fail
      }
    };

    const interval = setInterval(syncSettings, 10000);
    return () => clearInterval(interval);
  }, []);

  // Adaptive poller: 4s when active orders exist, 12s when idle
  useEffect(() => {
    if (!initialTable || !tableSessionId) return;

    const pollInterval = activeOrders.length > 0 ? 4000 : 12000;
    const interval = setInterval(() => {
      fetchSessionOrders(initialTable, tableSessionId);
    }, pollInterval);
    return () => clearInterval(interval);
  }, [initialTable, tableSessionId, activeOrders.length]);

  // Online / Offline network recovery listener
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      if (initialTable && tableSessionId) {
        fetchSessionOrders(initialTable, tableSessionId);
      }
    };
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [initialTable, tableSessionId]);

  // Jump to Category
  const handleSelectCategory = (catIdx: number) => {
    setActiveCategoryIdx(catIdx);
    const cat = categories[catIdx];
    if (!cat) return;

    // Find first item in this category
    const firstItemIndex = flattenedItems.findIndex((it) => it.categoryId === cat.id);
    if (firstItemIndex !== -1) {
      setActiveItemIdx(firstItemIndex);
      setSelectedSizeIdx(0);
      setQuantity(1);

      // Scroll thumbnail track
      if (thumbnailTrackRef.current) {
        const thumb = thumbnailTrackRef.current.querySelector(`[data-idx="${firstItemIndex}"]`) as HTMLElement;
        if (thumb) {
          thumb.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
      }
    }

    // Scroll Category Nav Pill into view
    if (categoryNavRef.current) {
      const pill = categoryNavRef.current.querySelector(`[data-cat-idx="${catIdx}"]`) as HTMLElement;
      if (pill) {
        pill.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  };

  // Jump to Item
  const handleSelectItem = (itemIdx: number) => {
    setActiveItemIdx(itemIdx);
    setSelectedSizeIdx(0);
    setQuantity(1);

    const it = flattenedItems[itemIdx];
    if (it) {
      const catIdx = categories.findIndex((c) => c.id === it.categoryId);
      if (catIdx !== -1 && catIdx !== activeCategoryIdx) {
        setActiveCategoryIdx(catIdx);
      }
    }

    if (thumbnailTrackRef.current) {
      const thumb = thumbnailTrackRef.current.querySelector(`[data-idx="${itemIdx}"]`) as HTMLElement;
      if (thumb) {
        thumb.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  };

  // Cart operations
  const currentSizes = activeItem?.sizes && activeItem.sizes.length > 0 ? activeItem.sizes : ['Regular'];
  const selectedSize = currentSizes[selectedSizeIdx] || 'Regular';

  const handleAddToCart = () => {
    if (!activeItem || !activeItem.isAvailable) return;

    const cartKey = `${activeItem.id}_${selectedSize}`;
    const existing = cart[cartKey];
    const newQty = existing ? existing.quantity + quantity : quantity;

    setCart((prev) => ({
      ...prev,
      [cartKey]: {
        id: activeItem.id,
        cartKey,
        name: activeItem.name,
        price: activeItem.price,
        quantity: newQty,
        selectedSize,
        category: activeItem.category,
      },
    }));

    // Trigger cart pop
    setCartBadgePop(true);
    setTimeout(() => setCartBadgePop(false), 400);
    setQuantity(1);
  };

  const handleAddAddonToCart = (addon: MenuAddon) => {
    const cartKey = `addon_${addon.id}`;
    const existing = cart[cartKey];
    const newQty = existing ? existing.quantity + 1 : 1;

    setCart((prev) => ({
      ...prev,
      [cartKey]: {
        id: addon.id,
        cartKey,
        name: addon.name,
        price: addon.price,
        quantity: newQty,
        category: 'Add-on',
        isAddon: true,
        icon: addon.icon,
      },
    }));
  };

  const updateCartItemQuantity = (cartKey: string, delta: number) => {
    setCart((prev) => {
      const existing = prev[cartKey];
      if (!existing) return prev;
      const nextQty = existing.quantity + delta;
      if (nextQty <= 0) {
        const copy = { ...prev };
        delete copy[cartKey];
        return copy;
      }
      return {
        ...prev,
        [cartKey]: { ...existing, quantity: nextQty },
      };
    });
  };

  const totalCartCount = Object.values(cart).reduce((sum, it) => sum + it.quantity, 0);
  const cartSubtotal = Object.values(cart).reduce((sum, it) => sum + it.price * it.quantity, 0);
  const gstRate = (settings.gstPercent ?? 5) / 100;
  const cartTax = Math.round(cartSubtotal * gstRate);
  const cartGrandTotal = cartSubtotal + cartTax;

  // Handle Checkout / Place Order
  const handlePlaceOrder = async () => {
    if (totalCartCount === 0) return;

    if (!settings.isOpen) {
      alert(settings.closedMessage || 'Store is currently closed for customer orders.');
      return;
    }

    if (settings.minOrderAmount && settings.minOrderAmount > 0 && cartSubtotal < settings.minOrderAmount) {
      alert(`Minimum order amount is ₹${settings.minOrderAmount}. Please add ₹${settings.minOrderAmount - cartSubtotal} more to your cart.`);
      return;
    }

    const isTakeaway = initialTable === 'Takeaway' || initialTable === '0' || String(initialTable).toLowerCase() === 'takeaway';

    const cleanedPhone = sanitizePhoneNumber(customerPhone);
    if (settings.requireCustomerPhone !== false) {
      if (!cleanedPhone || cleanedPhone.length !== 10) {
        setPhoneError('Please enter a valid 10-digit mobile number');
        alert('Please enter a valid 10-digit mobile number to complete your order.');
        return;
      }
    }

    if (settings.requireCustomerName !== false && !customerName.trim()) {
      alert('Please enter your name for the order.');
      return;
    }

    if (isTakeaway && (!customerFlat || !customerFlat.trim())) {
      alert('Flat Number is required for Takeaway / In-Flat orders (e.g. Tower 2 - 14B).');
      return;
    }

    // Trigger haptic vibration feedback on mobile
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([30, 40, 30]);
      } catch {
        // ignore
      }
    }

    setIsSubmittingOrder(true);
    try {
      // ── PILLAR 2: GEOLOCATION PHYSICAL PROXIMITY VERIFICATION ──
      let customerLat: number | undefined = undefined;
      let customerLng: number | undefined = undefined;

      // Geofencing applies to both Dine-In and Takeaway (nearby flats can order directly)
      if (settings.geofencingEnabled && typeof window !== 'undefined' && 'geolocation' in navigator) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 6000,
              maximumAge: 60000,
            });
          });
          customerLat = position.coords.latitude;
          customerLng = position.coords.longitude;
        } catch (geoErr) {
          console.log('Geolocation prompt status:', geoErr);
        }
      }

      const orderPayload = {
        tableNumber: initialTable,
        tableKey: initialKey,
        sessionId: tableSessionId,
        customerName: customerName.trim(),
        customerPhone: cleanedPhone,
        customerFlat: customerFlat.trim(),
        customerLat,
        customerLng,
        items: Object.values(cart).map((it) => ({
          id: it.id,
          name: it.name,
          price: it.price,
          quantity: it.quantity,
          selectedSize: it.selectedSize,
          category: it.category,
          isAddon: it.isAddon,
        })),
        subtotal: cartSubtotal,
        taxAmount: cartTax,
        total: cartGrandTotal,
        specialInstructions: specialNote.trim(),
      };

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to place order');
      }

      const data = await res.json();
      const placedOrder: Order = data.order;

      // Save to localStorage
      const savedOrdersStr = localStorage.getItem('anassa_orders');
      const savedOrders: string[] = savedOrdersStr ? JSON.parse(savedOrdersStr) : [];
      savedOrders.unshift(placedOrder.id);
      localStorage.setItem('anassa_orders', JSON.stringify(savedOrders));

      // Save guest profile for 1-tap ordering on next visit
      localStorage.setItem('anassa_guest_profile', JSON.stringify({
        name: customerName.trim(),
        phone: cleanedPhone,
        flat: customerFlat.trim(),
      }));
      setIsGuestProfileSaved(true);
      setIsEditingGuestProfile(false);

      setActiveOrders((prev) => [placedOrder, ...prev]);

      // Clear cart
      setCart({});
      setSpecialNote('');
      setIsCartOpen(false);

      // Trigger celebration confetti
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 5000);

      // Open Tracker
      setIsTrackerOpen(true);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Order submission failed.');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  return (
    <div id="app-wrapper">
      {!settings.isOpen && (
        <div style={{
          background: '#7F1D1D',
          color: '#FEF2F2',
          padding: '8px 16px',
          fontSize: 13,
          fontWeight: 600,
          textAlign: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 9998,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
        }}>
          <span>🛑</span> {settings.closedMessage || 'Cafe is currently closed for customer orders.'}
        </div>
      )}
      {isOffline && (
        <div style={{
          background: '#B45309',
          color: '#FFFFFF',
          padding: '6px 16px',
          fontSize: 12,
          fontWeight: 600,
          textAlign: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}>
          <span>📡</span> You are currently offline. Orders will sync once connection returns.
        </div>
      )}
      {/* ── SPLASH SCREEN ── */}
      {isSplashVisible && (
        <div id="splash-screen">
          <div className="splash-inner">
            <Image
              src="/images/ozkafe_logo.jpeg"
              alt="OZKAFE Logo"
              width={110}
              height={110}
              priority
              className="splash-logo"
            />
            <p className="splash-tagline">Brewing Fresh · Anassa</p>
            <div className="splash-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </div>
      )}

      {/* ── HEADER ── */}
      <header className="header">
        <button
          className="icon-btn header-btn-left"
          onClick={() => setIsCategoriesOpen(true)}
          aria-label="Menu Directory"
          title="Categories Directory"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>

        <div className="header-brand">
          <Image
            src="/images/ozkafe_logo.jpeg"
            alt="OZKAFE Logo"
            width={42}
            height={42}
            className="header-logo"
          />
          <div className="header-brand-text">
            <span className="header-name">OZKAFE</span>
            <span className="header-tagline">At Anassa · Kolkata</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {activeOrders.length > 0 && (
            <button
              className="icon-btn"
              onClick={() => setIsTrackerOpen(true)}
              aria-label="Track Order"
              title="Track Order"
              style={{ borderColor: 'var(--brand-gold)' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--brand-gold)" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              <span style={{
                position: 'absolute',
                top: 4,
                right: 4,
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: 'var(--veg-green)',
                boxShadow: '0 0 6px var(--veg-green)',
              }} />
            </button>
          )}

          <button
            className="icon-btn header-btn-right"
            onClick={() => setIsCartOpen(true)}
            aria-label="View Cart"
            title="Cart"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="9" cy="21" r="1"></circle>
              <circle cx="20" cy="21" r="1"></circle>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
            </svg>
            {totalCartCount > 0 && (
              <span className={`cart-badge ${cartBadgePop ? 'pop' : ''}`}>
                {totalCartCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ── TOP INFO BAR (TABLE & PURE VEG) ── */}
      <div className="top-info-bar">
        <div className="table-banner">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          </svg>
          <span>{initialTable === 'Takeaway' || initialTable === '0' ? '🥡 Takeaway & In-Flat' : `🍽️ Table ${initialTable}`}</span>
        </div>

        <div className="veg-indicator" title="100% Pure Vegetarian Cafe">
          <span className="veg-icon-box">
            <span className="veg-icon-dot"></span>
          </span>
          <span>100% Pure Veg</span>
        </div>
      </div>

      {/* ── RECOGNIZED GUEST LOGIN BANNER ── */}
      <div className="guest-login-bar">
        <div className="guest-login-info">
          <span className="guest-login-icon">👤</span>
          {customerPhone ? (
            <span className="guest-login-text">
              <strong>{customerName || 'Guest'}</strong> · +91 {customerPhone}
              {(initialTable === 'Takeaway' || initialTable === '0') && customerFlat ? ` · 🏢 Flat ${customerFlat}` : ''}
            </span>
          ) : (
            <span className="guest-login-text" style={{ color: 'var(--text-grey)' }}>
              Guest Profile · Instant 1-tap ordering
            </span>
          )}
        </div>
        <button
          type="button"
          className="guest-login-edit-btn"
          onClick={() => {
            setIsEditingGuestProfile(true);
            setIsCartOpen(true);
          }}
        >
          {customerPhone ? 'Edit Profile' : '+ Guest Login'}
        </button>
      </div>

      {/* ── STICKY CATEGORY NAV BAR ── */}
      <nav className="category-nav-bar" ref={categoryNavRef} aria-label="Menu Categories">
        {categories.map((cat, idx) => (
          <button
            key={cat.id}
            data-cat-idx={idx}
            className={`cat-nav-pill ${idx === activeCategoryIdx ? 'active' : ''}`}
            onClick={() => handleSelectCategory(idx)}
          >
            {cat.iconSvg && (
              <span
                className="cat-pill-icon"
                dangerouslySetInnerHTML={{ __html: cat.iconSvg }}
              />
            )}
            <span className="cat-pill-text">{cat.title}</span>
            {cat.itemsCount !== undefined && (
              <span className="cat-pill-count">{cat.itemsCount}</span>
            )}
          </button>
        ))}
      </nav>

      {/* ── HERO SPOTLIGHT SECTION ── */}
      <section className="hero-section">
        <div className="light-ray"></div>
        <div className="hero-slider">
          {activeItem && (
            <div className="hero-slide-item">
              <Image
                src={activeItem.img}
                alt={activeItem.name}
                width={250}
                height={250}
                priority
                style={{
                  filter: activeItem.isAvailable ? 'none' : 'grayscale(80%) brightness(0.7)',
                }}
              />
              {!activeItem.isAvailable && (
                <div className="out-of-stock-overlay">
                  <span>Sold Out</span>
                  <span style={{ fontSize: '10px', marginTop: 4, opacity: 0.9 }}>Preparing more soon</span>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── CATEGORY DIVIDER ── */}
      <div className="divider">
        <div className="divider-line"></div>
        <div
          className="divider-icon"
          dangerouslySetInnerHTML={{ __html: activeCategory?.iconSvg || '☕' }}
        />
        <div className="divider-line"></div>
      </div>

      {/* ── THUMBNAIL CAROUSEL ── */}
      <section className="carousel-section">
        <div className="carousel-scroll" ref={thumbnailTrackRef}>
          {flattenedItems.map((item, idx) => (
            <button
              key={item.id}
              data-idx={idx}
              className={`thumbnail-item ${idx === activeItemIdx ? 'active' : ''}`}
              onClick={() => handleSelectItem(idx)}
              title={item.name}
            >
              <Image
                src={item.img}
                alt={item.name}
                width={58}
                height={58}
              />
              {!item.isAvailable && (
                <div className="thumbnail-soldout">
                  <span>OUT</span>
                </div>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* ── DETAILS SECTION ── */}
      {activeItem && (
        <section className="details-section">
          <div className="tag-wrapper">
            <span className="pill-tag">
              <span>{activeItem.category}</span>
            </span>
            <span className="veg-indicator" style={{ padding: '2px 8px', fontSize: '9.5px' }}>
              <span className="veg-icon-box" style={{ width: 11, height: 11 }}>
                <span className="veg-icon-dot" style={{ width: 5, height: 5 }}></span>
              </span>
              <span>100% Veg</span>
            </span>
          </div>

          <div className="title-price-row">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: '65%' }}>
              <h1 className="item-title">{activeItem.name}</h1>
              {activeItem.subheading && (
                <span className="item-subheading-tag">{activeItem.subheading}</span>
              )}
            </div>

            <div className="item-price">
              <span className="currency">₹</span>
              <span className="price-int">{Math.floor(activeItem.price)}</span>
              <span className="price-dec">.00</span>
            </div>
          </div>

          <p className="item-desc">
            {activeItem.desc || 'Handcrafted fresh with signature specialty ingredients.'}
          </p>
        </section>
      )}

      {/* ── CONTROLS SECTION ── */}
      {activeItem && (
        <section className="controls-section">
          <div className="control-group">
            <span className="control-label">SIZE / SELECTION</span>
            <div className="segmented-control">
              {currentSizes.map((size, idx) => (
                <button
                  key={size}
                  className={`seg-btn ${idx === selectedSizeIdx ? 'active' : ''}`}
                  onClick={() => setSelectedSizeIdx(idx)}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          <div className="control-group align-right">
            <span className="control-label">QUANTITY</span>
            <div className="qty-stepper">
              <button
                className="stepper-btn"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="Decrease"
              >
                −
              </button>
              <span className="stepper-val">{quantity}</span>
              <button
                className="stepper-btn"
                onClick={() => setQuantity((q) => q + 1)}
                aria-label="Increase"
              >
                +
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── BOTTOM ACTION BAR ── */}
      <footer className="action-bar">
        <button
          className="btn-outline"
          onClick={() => setIsCartOpen(true)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="16"></line>
            <line x1="8" y1="12" x2="16" y2="12"></line>
          </svg>
          NOTE / ADDONS
        </button>

        <button
          className="btn-solid"
          onClick={handleAddToCart}
          disabled={!activeItem?.isAvailable}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <path d="M16 10a4 4 0 0 1-8 0"></path>
          </svg>
          {activeItem?.isAvailable ? 'ADD TO ORDER' : 'SOLD OUT'}
        </button>
      </footer>

      {/* ── CATEGORIES MODAL SHEET ── */}
      {isCategoriesOpen && (
        <div className="modal-overlay" onClick={() => setIsCategoriesOpen(false)}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle"></div>
            <div className="sheet-header">
              <div>
                <span style={{ fontSize: '10px', color: 'var(--brand-gold-dark)', fontWeight: 700, letterSpacing: 1 }}>
                  OZKAFE DIRECTORY
                </span>
                <h2>Menu Categories</h2>
              </div>
              <button className="btn-close" onClick={() => setIsCategoriesOpen(false)}>×</button>
            </div>
            <div className="sheet-content">
              {categories.map((cat, idx) => (
                <div
                  key={cat.id}
                  onClick={() => {
                    handleSelectCategory(idx);
                    setIsCategoriesOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 0',
                    borderBottom: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                      style={{ color: 'var(--brand-gold-dark)', display: 'flex' }}
                      dangerouslySetInnerHTML={{ __html: cat.iconSvg || '☕' }}
                    />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{cat.title}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-grey)' }}>{cat.subtitle}</div>
                    </div>
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    background: 'var(--bg-surface-light)',
                    padding: '3px 8px',
                    borderRadius: 999,
                    color: 'var(--text-grey)'
                  }}>
                    {cat.itemsCount ?? 0} items
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── CART MODAL SHEET ── */}
      {isCartOpen && (
        <div className="modal-overlay" onClick={() => setIsCartOpen(false)}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle"></div>
            <div className="sheet-header">
              <h2>Your Order Summary</h2>
              <button className="btn-close" onClick={() => setIsCartOpen(false)}>×</button>
            </div>

            <div className="sheet-content">
              {Object.keys(cart).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-grey)' }}>
                  <p style={{ fontSize: '2.5rem', marginBottom: 8 }}>☕</p>
                  <p style={{ fontWeight: 600 }}>Your order is currently empty</p>
                  <p style={{ fontSize: 12 }}>Select items from the menu to build your feast</p>
                </div>
              ) : (
                <div>
                  {Object.values(cart).map((item) => (
                    <div key={item.cartKey} className="cart-item-row">
                      <div className="cart-item-info">
                        <span className="cart-item-name">{item.name}</span>
                        {item.selectedSize && (
                          <span className="cart-item-sub">Size: {item.selectedSize}</span>
                        )}
                        <span className="cart-item-price">₹{item.price * item.quantity}</span>
                      </div>

                      <div className="qty-stepper" style={{ transform: 'scale(0.9)' }}>
                        <button
                          className="stepper-btn"
                          onClick={() => updateCartItemQuantity(item.cartKey, -1)}
                        >
                          −
                        </button>
                        <span className="stepper-val">{item.quantity}</span>
                        <button
                          className="stepper-btn"
                          onClick={() => updateCartItemQuantity(item.cartKey, 1)}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Add-ons Upsell */}
                  <div className="cart-addons-wrapper">
                    <div className="cart-addons-header">
                      <span className="cart-addons-title">✨ Extra Flavours & Add-ons</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--brand-accent)' }}>POPULAR</span>
                    </div>
                    <div className="cart-addons-grid">
                      {addons.map((ad) => (
                        <div
                          key={ad.id}
                          className={`cart-addon-card ${cart[`addon_${ad.id}`] ? 'in-cart' : ''}`}
                          onClick={() => handleAddAddonToCart(ad)}
                        >
                          <span style={{ fontSize: 12, fontWeight: 600 }}>
                            {ad.icon} {ad.name}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand-accent)' }}>
                            +₹{ad.price}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Preparation Note */}
                  <textarea
                    className="instructions-input"
                    placeholder="Any special preparation instructions? (e.g. Less sugar, extra hot...)"
                    rows={2}
                    value={specialNote}
                    onChange={(e) => setSpecialNote(e.target.value)}
                  />

                  {/* Guest Identification & Frictionless Details */}
                  <div style={{ marginTop: 18, borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>
                        Guest & Order Identification
                      </h3>
                      <span style={{ fontSize: 11, color: 'var(--brand-accent)', fontWeight: 600 }}>
                        {initialTable === 'Takeaway' || initialTable === '0' ? '🥡 Takeaway Order' : `🍽️ Table ${initialTable}`}
                      </span>
                    </div>

                    {isGuestProfileSaved && !isEditingGuestProfile ? (
                      <div style={{
                        background: 'rgba(166, 107, 51, 0.08)',
                        border: '1px solid rgba(166, 107, 51, 0.25)',
                        borderRadius: 12,
                        padding: '12px 14px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}>
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--brand-accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            ✨ Recognized Guest Login
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-dark)', marginTop: 2 }}>
                            {customerName || 'Guest'} · +91 {customerPhone}
                          </div>
                          {(initialTable === 'Takeaway' || initialTable === '0') && customerFlat ? (
                            <div style={{ fontSize: 12, color: 'var(--brand-accent)', fontWeight: 700, marginTop: 2 }}>
                              🏢 Flat: {customerFlat}
                            </div>
                          ) : customerFlat ? (
                            <div style={{ fontSize: 11, color: 'var(--text-grey)', marginTop: 2 }}>
                              Note: {customerFlat}
                            </div>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsEditingGuestProfile(true)}
                          style={{
                            background: '#FFFFFF',
                            border: '1px solid rgba(166, 107, 51, 0.3)',
                            color: 'var(--brand-accent)',
                            fontWeight: 600,
                            fontSize: 12,
                            padding: '6px 12px',
                            borderRadius: 8,
                            cursor: 'pointer',
                          }}
                        >
                          Edit
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {isContactPickerSupported && (
                          <button
                            type="button"
                            onClick={handlePickFromContacts}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 8,
                              padding: '10px 14px',
                              background: 'linear-gradient(135deg, #2D1A10, #3E2415)',
                              color: '#FFFFFF',
                              border: '1px solid rgba(166, 107, 51, 0.4)',
                              borderRadius: 10,
                              fontWeight: 600,
                              fontSize: 13,
                              cursor: 'pointer',
                              width: '100%',
                            }}
                          >
                            <span>📱</span> Auto-Select Phone from Device Contacts
                          </button>
                        )}

                        <div>
                          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-grey)', display: 'block', marginBottom: 4 }}>
                            Mobile Number (for order notifications & status) *
                          </label>
                          <input
                            type="tel"
                            name="tel"
                            autoComplete="tel mobile"
                            inputMode="tel"
                            id="customer-phone"
                            className="instructions-input"
                            placeholder="10-digit mobile number"
                            value={customerPhone}
                            onChange={(e) => handlePhoneChange(e.target.value)}
                            maxLength={14}
                            required
                            style={{ fontSize: 15 }}
                          />
                          {phoneError && (
                            <span style={{ fontSize: 11, color: '#DC2626', marginTop: 3, display: 'block' }}>
                              {phoneError}
                            </span>
                          )}
                        </div>

                        <div>
                          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-grey)', display: 'block', marginBottom: 4 }}>
                            Your Name *
                          </label>
                          <input
                            type="text"
                            name="name"
                            autoComplete="name"
                            id="customer-name"
                            className="instructions-input"
                            placeholder="Your Name"
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            required
                            style={{ fontSize: 15 }}
                          />
                        </div>

                        {(initialTable === 'Takeaway' || initialTable === '0') ? (
                          <div style={{ background: '#FFFDF9', padding: '10px 12px', border: '1.5px solid var(--brand-gold)', borderRadius: 10 }}>
                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand-accent)', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                              <span>🏢</span> Flat / Apartment Number (Mandatory for Takeaway) *
                            </label>
                            <input
                              type="text"
                              name="flat"
                              id="customer-flat"
                              className="instructions-input"
                              placeholder="e.g. Tower 2 - 14B or Block A - 402"
                              value={customerFlat}
                              onChange={(e) => setCustomerFlat(e.target.value)}
                              required
                              style={{ fontSize: 14, background: '#FFFFFF' }}
                            />
                            <span style={{ fontSize: 10.5, color: '#7C4A1E', marginTop: 3, display: 'block' }}>
                              Required for Anassa flat delivery & counter order dispatch
                            </span>
                          </div>
                        ) : null}

                        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                          <button
                            type="button"
                            onClick={() => {
                              const cleaned = sanitizePhoneNumber(customerPhone);
                              if (!cleaned || cleaned.length !== 10) {
                                alert('Please enter a valid 10-digit mobile number.');
                                return;
                              }
                              if (!customerName.trim()) {
                                alert('Please enter your name.');
                                return;
                              }
                              const isTakeaway = initialTable === 'Takeaway' || initialTable === '0';
                              if (isTakeaway && !customerFlat.trim()) {
                                alert('Please enter your Flat Number for Takeaway / In-Flat order.');
                                return;
                              }
                              localStorage.setItem('anassa_guest_profile', JSON.stringify({
                                name: customerName.trim(),
                                phone: cleaned,
                                flat: customerFlat.trim(),
                              }));
                              setIsGuestProfileSaved(true);
                              setIsEditingGuestProfile(false);
                            }}
                            className="btn-solid"
                            style={{ height: 36, fontSize: 12, flex: 1 }}
                          >
                            ✓ Save Profile
                          </button>
                          {isGuestProfileSaved && (
                            <button
                              type="button"
                              onClick={() => setIsEditingGuestProfile(false)}
                              className="btn-outline"
                              style={{ height: 36, fontSize: 12 }}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {totalCartCount > 0 && (
              <div className="sheet-footer">
                <div className="cart-total-row">
                  <div>
                    <span className="cart-total-label">Grand Total</span>
                    <div style={{ fontSize: 11, color: 'var(--text-grey)' }}>
                      ₹{cartSubtotal} + {settings.gstPercent}% GST (₹{cartTax})
                    </div>
                  </div>
                  <span className="cart-total-price">₹{cartGrandTotal}</span>
                </div>

                {!settings.isOpen ? (
                  <button
                    className="btn-solid"
                    style={{ width: '100%', background: '#78716C', cursor: 'not-allowed', opacity: 0.8 }}
                    disabled={true}
                  >
                    🛑 Store Currently Closed
                  </button>
                ) : settings.minOrderAmount && cartSubtotal < settings.minOrderAmount ? (
                  <button
                    className="btn-solid"
                    style={{ width: '100%', background: '#D97706', cursor: 'not-allowed', opacity: 0.9 }}
                    disabled={true}
                  >
                    Min Order: ₹{settings.minOrderAmount} (Add ₹{settings.minOrderAmount - cartSubtotal})
                  </button>
                ) : (
                  <button
                    className="btn-solid"
                    style={{ width: '100%' }}
                    onClick={handlePlaceOrder}
                    disabled={isSubmittingOrder}
                  >
                    {isSubmittingOrder ? 'Submitting Order to Kitchen...' : `SEND ORDER TO KITCHEN · ₹${cartGrandTotal}`}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ORDER TRACKER MODAL SHEET ── */}
      {isTrackerOpen && (
        <div className="modal-overlay" onClick={() => setIsTrackerOpen(false)}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle"></div>
            <div className="sheet-header">
              <h2>Active Orders Status</h2>
              <button className="btn-close" onClick={() => setIsTrackerOpen(false)}>×</button>
            </div>

            <div className="sheet-content">
              {activeOrders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-grey)' }}>
                  <p>No active orders in progress right now.</p>
                </div>
              ) : (
                activeOrders.map((ord) => {
                  const isReceived = ['received', 'preparing', 'ready', 'served'].includes(ord.status);
                  const isPreparing = ['preparing', 'ready', 'served'].includes(ord.status);
                  const isReady = ['ready', 'served'].includes(ord.status);

                  return (
                    <div
                      key={ord.id}
                      style={{
                        padding: '16px',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 14,
                        marginBottom: 14,
                        background: 'var(--bg-card-elevated)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div>
                          <span style={{ fontWeight: 800, fontSize: 15 }}>{ord.orderNumber}</span>
                          <span style={{ fontSize: 12, color: 'var(--text-grey)', marginLeft: 8 }}>
                            ({ord.tableNumber === 'Takeaway' ? 'Takeaway' : `Table ${ord.tableNumber}`})
                          </span>
                        </div>
                        <span style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '3px 10px',
                          borderRadius: 999,
                          textTransform: 'uppercase',
                          background: ord.status === 'ready' ? '#DCFCE7' : ord.status === 'preparing' ? '#FEF3C7' : '#FEE2E2',
                          color: ord.status === 'ready' ? '#166534' : ord.status === 'preparing' ? '#92400E' : '#991B1B',
                        }}>
                          {ord.status}
                        </span>
                      </div>

                      {/* Timeline */}
                      <div className="timeline-track">
                        <div className={`timeline-step ${isReceived ? 'completed' : ''}`}>
                          <span className="step-title">Order Received</span>
                          <span className="step-desc">Ticket logged and dispatched to kitchen</span>
                        </div>
                        <div className={`timeline-step ${isPreparing ? (isReady ? 'completed' : 'current') : ''}`}>
                          <span className="step-title">In Preparation</span>
                          <span className="step-desc">Barista & chef are preparing your order fresh</span>
                        </div>
                        <div className={`timeline-step ${isReady ? 'current' : ''}`}>
                          <span className="step-title">Ready for Pickup / Serving</span>
                          <span className="step-desc">Your order is ready to enjoy</span>
                        </div>
                      </div>

                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', borderTop: '1px dashed var(--border-strong)', paddingTop: 8, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                        <div><strong>Items:</strong> {ord.items.map((i) => `${i.name} (x${i.quantity})`).join(', ')}</div>
                        {ord.customerFlat && (
                          <div style={{ fontWeight: 700, color: 'var(--brand-accent)' }}>
                            🏢 Flat: {ord.customerFlat}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── CELEBRATION CONFETTI ── */}
      {showConfetti && (
        <div style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            background: 'rgba(26, 20, 16, 0.92)',
            color: '#FFFFFF',
            padding: '20px 32px',
            borderRadius: 18,
            textAlign: 'center',
            boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
            animation: 'fadeIn 0.3s ease-out',
          }}>
            <span style={{ fontSize: '2.5rem' }}>🎉</span>
            <h3 style={{ fontFamily: 'var(--font-display)', margin: '8px 0 4px', fontSize: '1.4rem' }}>
              Order Placed Successfully!
            </h3>
            <p style={{ fontSize: 13, color: '#D4C5B9' }}>
              Your order is now being sent straight to the kitchen.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
