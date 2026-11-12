'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Image from 'next/image';
import { Category, MenuItem, MenuAddon, CartItem, Order, CafeSettings } from '@/lib/types';
import { logActionError, logOptimisticSuccess, logActionSuccess } from '@/lib/clientLog';

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
  const [addons] = useState<MenuAddon[]>(() =>
    (initialAddons || []).filter(
      (a) =>
        a.name !== 'Extra Cold Brew Flavour Shot' &&
        a.name !== 'Plant Oat Milk Swap' &&
        a.id !== 'ad-4' &&
        a.id !== 'ad-5'
    )
  );

  const [activeCategoryIdx, setActiveCategoryIdx] = useState(0);
  const [activeItemIdx, setActiveItemIdx] = useState(0);
  const [selectedSizeIdx, setSelectedSizeIdx] = useState(0);
  const [quantity, setQuantity] = useState(0);

  // Modals
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isTrackerOpen, setIsTrackerOpen] = useState(false);
  const [isSplashVisible, setIsSplashVisible] = useState(true);
  const [isGuestLoginModalOpen, setIsGuestLoginModalOpen] = useState(false);

  // Cart & Orders
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const cartRef = useRef(cart);
  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);
  const isFetchingOrdersRef = useRef(false);
  const [customerFlat, setCustomerFlat] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [deletedOrdersNotice, setDeletedOrdersNotice] = useState<Order[]>([]);
  const [hasLocalOrders, setHasLocalOrders] = useState(false);
  const [cartBadgePop, setCartBadgePop] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  // Live Main Menu Search Bar (for easy dish discovery across all categories)
  const [menuSearch, setMenuSearch] = useState('');

  const searchResults = useMemo(() => {
    const q = menuSearch.trim().toLowerCase();
    if (!q) return [];
    return items.filter(
      (it) =>
        it.name.toLowerCase().includes(q) ||
        (it.subheading && it.subheading.toLowerCase().includes(q)) ||
        (it.category && it.category.toLowerCase().includes(q)) ||
        (it.desc && it.desc.toLowerCase().includes(q))
    );
  }, [items, menuSearch]);

  const handleSelectSearchResult = (searchedItem: MenuItem) => {
    const catIdx = categories.findIndex((c) => c.id === searchedItem.categoryId);
    if (catIdx !== -1) {
      setActiveCategoryIdx(catIdx);
      const catItems = items.filter((it) => it.categoryId === searchedItem.categoryId);
      const itemIdx = catItems.findIndex((it) => it.id === searchedItem.id);
      if (itemIdx !== -1) {
        setActiveItemIdx(itemIdx);
      }
    }
    setQuantity(1);
    setMenuSearch('');
    setTimeout(() => {
      heroImageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  // Cart impact & interaction refs
  const [cartImpactActive, setCartImpactActive] = useState(false);
  const cartBtnRef = useRef<HTMLButtonElement>(null);
  const heroImageRef = useRef<HTMLDivElement>(null);

  // Guest Identification & Device Native Picker
  const [isContactPickerSupported, setIsContactPickerSupported] = useState(false);
  const [isGuestProfileSaved, setIsGuestProfileSaved] = useState(false);
  const [isEditingGuestProfile, setIsEditingGuestProfile] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [flatError, setFlatError] = useState('');
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

  // Real-time count of items per category (ensures counts never show 0)
  const categoryItemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    flattenedItems.forEach((it) => {
      counts[it.categoryId] = (counts[it.categoryId] || 0) + 1;
    });
    return counts;
  }, [flattenedItems]);

  // Menu Directory Drawer Search & Expanded Dropdowns
  const [directorySearch, setDirectorySearch] = useState('');
  const [expandedCatIds, setExpandedCatIds] = useState<Record<string, boolean>>({
    'hot-coffee': true,
  });

  const toggleCategoryDropdown = (catId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedCatIds((prev) => ({
      ...prev,
      [catId]: !prev[catId],
    }));
  };

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

  const handleFlatChange = (val: string) => {
    setCustomerFlat(val);
    const trimmed = val.trim();
    if (trimmed.length > 0) {
      const hasDigits = /\d/.test(trimmed);
      const hasLetters = /[a-zA-Z]/.test(trimmed);
      if (!hasDigits || !hasLetters) {
        setFlatError('Flat number must contain both digits and letters (e.g. 14B or Tower 2 - 14B)');
      } else {
        setFlatError('');
      }
    } else {
      setFlatError('');
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
      const savedOrdersStr = localStorage.getItem('anassa_orders');
      if (savedOrdersStr) {
        try {
          const ords = JSON.parse(savedOrdersStr);
          if (Array.isArray(ords) && ords.length > 0) {
            setHasLocalOrders(true);
          }
        } catch {}
      }

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
      if (!existingSessionId) {
        existingSessionId = `sess_${initialTable}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        localStorage.setItem(sessionKey, existingSessionId);
      }
      setTableSessionId(existingSessionId);

      try {
        const queryParams = new URLSearchParams({
          table: String(initialTable),
          session: existingSessionId,
        });
        if (initialKey) queryParams.set('key', initialKey);

        const res = await fetch(`/api/tables?${queryParams.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setIsTableVerified(Boolean(data.isVerified || data.valid));

          if (data.sessionId && data.sessionId !== existingSessionId) {
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

  // Fetch orders strictly bound to this dining session + recover local placed orders (concurrency-locked)
  const fetchSessionOrders = async (tbl: string, sessId: string) => {
    if (isFetchingOrdersRef.current) return;
    isFetchingOrdersRef.current = true;
    try {
      const savedOrdersStr = typeof window !== 'undefined' ? localStorage.getItem('anassa_orders') : null;
      let knownIds = '';
      if (savedOrdersStr) {
        try {
          const ids: string[] = JSON.parse(savedOrdersStr);
          if (Array.isArray(ids) && ids.length > 0) {
            knownIds = ids.slice(0, 15).join(',');
          }
        } catch {}
      }

      let effPhone = customerPhone?.trim() || '';
      if (!effPhone && typeof window !== 'undefined') {
        try {
          const profStr = localStorage.getItem('anassa_guest_profile');
          if (profStr) {
            const prof = JSON.parse(profStr);
            if (prof.phone) effPhone = prof.phone;
          }
        } catch {}
      }

      const qParams = new URLSearchParams({
        table: String(tbl),
        _t: String(Date.now()),
      });
      if (sessId) qParams.set('session', sessId);
      if (knownIds) qParams.set('knownIds', knownIds);
      if (effPhone) qParams.set('phone', effPhone);

      const res = await fetch(`/api/orders?${qParams.toString()}`);
      if (res.ok) {
        const data: Order[] = await res.json();
        if (Array.isArray(data)) {
          const liveActive = data.filter((o) => !o.isDeleted && o.status !== 'cancelled');
          const deletedByAdmin = data.filter((o) => o.isDeleted || (o.status === 'cancelled' && o.deletedBy === 'admin'));

          if (deletedByAdmin.length > 0) {
            setDeletedOrdersNotice(deletedByAdmin);
          }

          if (liveActive.length > 0) {
            setActiveOrders(liveActive);
          } else {
            // Guard: Retain active orders placed within the last 10 minutes (strictly non-deleted and non-cancelled)
            setActiveOrders((prev) => {
              const recent = prev.filter((o) => !o.isDeleted && o.status !== 'cancelled' && Date.now() - o.createdAt < 10 * 60 * 1000);
              return recent.length > 0 ? recent : [];
            });
          }
        }
      }
    } catch (err) {
      console.warn('Fetch session orders error:', err);
    } finally {
      isFetchingOrdersRef.current = false;
    }
  };

  // Re-sync menu updates (e.g. stock availability changes in real-time, relaxed to 40s to prevent spamming)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/menu');
        if (res.ok) {
          const data = await res.json();
          if (data.items) {
            setItems(data.items);
            // Check if any cart item was 86'd (marked out of stock)
            const currentCart = cartRef.current;
            Object.values(currentCart).forEach((cartIt) => {
              const liveDish = data.items.find((i: MenuItem) => i.id === cartIt.id);
              if (liveDish && (!liveDish.isAvailable || (typeof liveDish.stock === 'number' && liveDish.stock <= 0))) {
                updateCartItemQuantity(cartIt.cartKey, -cartIt.quantity);
                console.warn(`[OZKAFE] Notice: "${cartIt.name}" was marked OUT OF STOCK by kitchen and removed from cart.`);
              }
            });
          }
        }
      } catch {
        // silent fail
      }
    }, 40000);
    return () => clearInterval(interval);
  }, []);

  // Real-time synchronization of Cafe Settings from server (relaxed to 60s)
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

    const interval = setInterval(syncSettings, 60000);
    return () => clearInterval(interval);
  }, []);

  // Adaptive poller: 5s when active orders exist, 25s when idle
  useEffect(() => {
    if (!initialTable || !tableSessionId) return;

    const pollInterval = activeOrders.length > 0 ? 5000 : 25000;
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
      setQuantity(0);

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
    setQuantity(0);

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

  // Visual Fly-to-Cart Drag Animation using Web Animations API (direct to document.body)
  const triggerFlyAnimation = (
    sourceEl?: HTMLElement | null,
    options?: { img?: string; icon?: string }
  ) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    try {
      // 1. Get destination (Cart button in header)
      const cartEl = cartBtnRef.current || document.querySelector('.header-btn-right');
      let targetX = window.innerWidth - 38;
      let targetY = 32;
      if (cartEl) {
        const rect = cartEl.getBoundingClientRect();
        targetX = Math.round(rect.left + rect.width / 2);
        targetY = Math.round(rect.top + rect.height / 2);
      }

      // 2. Get origin (Hero dish image, or clicked button, or center)
      let startX = window.innerWidth / 2;
      let startY = window.innerHeight / 2;

      const heroImgEl = heroImageRef.current || document.querySelector('.hero-slide-item');
      if (heroImgEl) {
        const rect = heroImgEl.getBoundingClientRect();
        if (rect.bottom > 80 && rect.top < window.innerHeight) {
          startX = Math.round(rect.left + rect.width / 2);
          startY = Math.round(rect.top + rect.height / 2);
        } else if (sourceEl) {
          const rect = sourceEl.getBoundingClientRect();
          startX = Math.round(rect.left + rect.width / 2);
          startY = Math.round(rect.top + rect.height / 2);
        }
      } else if (sourceEl) {
        const rect = sourceEl.getBoundingClientRect();
        startX = Math.round(rect.left + rect.width / 2);
        startY = Math.round(rect.top + rect.height / 2);
      }

      // 3. Create flyer DOM element directly on document.body (bypasses all overflow/stacking contexts)
      const flyer = document.createElement('div');
      flyer.className = 'flying-dish-particle';
      flyer.style.position = 'fixed';
      flyer.style.top = '0px';
      flyer.style.left = '0px';
      flyer.style.width = '64px';
      flyer.style.height = '64px';
      flyer.style.marginLeft = '-32px';
      flyer.style.marginTop = '-32px';
      flyer.style.borderRadius = '50%';
      flyer.style.pointerEvents = 'none';
      flyer.style.zIndex = '999999';
      flyer.style.backgroundColor = '#FFFFFF';
      flyer.style.border = '2.5px solid #C59A6F';
      flyer.style.boxShadow = '0 12px 28px rgba(166, 107, 51, 0.45), 0 4px 14px rgba(0,0,0,0.25)';
      flyer.style.display = 'flex';
      flyer.style.alignItems = 'center';
      flyer.style.justifyContent = 'center';
      flyer.style.overflow = 'hidden';
      flyer.style.willChange = 'transform, opacity';
      flyer.style.transform = `translate3d(${startX}px, ${startY}px, 0)`;

      const imgSrc = options?.img || activeItem?.img;
      if (imgSrc) {
        const img = document.createElement('img');
        img.src = imgSrc;
        img.alt = 'Dish';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '50%';
        img.style.display = 'block';
        flyer.appendChild(img);
      } else {
        const span = document.createElement('span');
        span.textContent = options?.icon || '☕';
        span.style.fontSize = '28px';
        span.style.lineHeight = '1';
        flyer.appendChild(span);
      }

      document.body.appendChild(flyer);

      // 4. Parabolic arc trajectory to cart
      const midX = Math.round(startX + (targetX - startX) * 0.45);
      const midY = Math.round(Math.min(startY, targetY) - 60);

      const keyframes = [
        {
          transform: `translate3d(${startX}px, ${startY}px, 0) scale(1) rotate(0deg)`,
          opacity: 1,
        },
        {
          transform: `translate3d(${midX}px, ${midY}px, 0) scale(1.18) rotate(-16deg)`,
          opacity: 1,
          offset: 0.35,
        },
        {
          transform: `translate3d(${Math.round(startX + (targetX - startX) * 0.8)}px, ${targetY - 10}px, 0) scale(0.65) rotate(16deg)`,
          opacity: 0.95,
          offset: 0.75,
        },
        {
          transform: `translate3d(${targetX}px, ${targetY}px, 0) scale(0.16) rotate(35deg)`,
          opacity: 0,
          offset: 1,
        },
      ];

      const handleImpact = () => {
        try {
          flyer.remove();
        } catch {}

        // Trigger Cart Button magnetic impact bounce
        setCartImpactActive(true);
        setCartBadgePop(true);
        setTimeout(() => {
          setCartImpactActive(false);
          setCartBadgePop(false);
        }, 500);

        // Mobile haptics feedback
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate([25, 35, 25]);
          } catch {}
        }
      };

      if (typeof flyer.animate === 'function') {
        const anim = flyer.animate(keyframes, {
          duration: 680,
          easing: 'cubic-bezier(0.2, 0.85, 0.3, 1)',
          fill: 'forwards',
        });
        anim.onfinish = handleImpact;
      } else {
        setTimeout(handleImpact, 680);
      }
    } catch (err) {
      console.error('Flying animation error:', err);
    }
  };

  const handleAddToCart = (e?: React.MouseEvent) => {
    if (!activeItem || !activeItem.isAvailable || (typeof activeItem.stock === 'number' && activeItem.stock <= 0)) return;

    const effQty = quantity <= 0 ? 1 : quantity;

    const cartKey = `${activeItem.id}_${selectedSize}`;
    const existing = cart[cartKey];
    const newQty = existing ? existing.quantity + effQty : effQty;
    if (typeof activeItem.stock === 'number' && newQty > activeItem.stock) {
      console.warn(`[OZKAFE Inventory] Only ${activeItem.stock} item(s) available in stock for "${activeItem.name}".`);
      return;
    }

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

    // Trigger visual drag-into-cart flying animation
    triggerFlyAnimation(e?.currentTarget as HTMLElement, { img: activeItem.img });

    // Trigger cart pop
    setCartBadgePop(true);
    setTimeout(() => setCartBadgePop(false), 400);
    setQuantity(0);
  };

  const handleAddAddonToCart = (addon: MenuAddon, e?: React.MouseEvent) => {
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

    triggerFlyAnimation(e?.currentTarget as HTMLElement, { icon: addon.icon || '✨' });
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

  const formatCurrency = (val: number): string => {
    if (val === undefined || val === null || isNaN(val)) return '0';
    return Number.isInteger(val) ? val.toString() : val.toFixed(2);
  };

  const totalCartCount = Object.values(cart).reduce((sum, it) => sum + it.quantity, 0);
  const cartSubtotal = Object.values(cart).reduce((sum, it) => sum + it.price * it.quantity, 0);
  const gstRate = (settings.gstPercent ?? 5) / 100;
  // Calculate 5% GST accurately with 2 decimal precision without integer truncating/rounding
  const cartTax = Number((cartSubtotal * gstRate).toFixed(2));
  const cartGrandTotal = Number((cartSubtotal + cartTax).toFixed(2));

  // Handle Checkout / Place Order
  const handlePlaceOrder = async () => {
    if (totalCartCount === 0) return;

    if (!settings.isOpen) {
      alert(settings.closedMessage || 'Store is currently closed for customer orders.');
      return;
    }

    if (settings.minOrderAmount && settings.minOrderAmount > 0 && cartSubtotal < settings.minOrderAmount) {
      alert(`Minimum order amount is ₹${settings.minOrderAmount}. Please add ₹${formatCurrency(settings.minOrderAmount - cartSubtotal)} more to your cart.`);
      return;
    }

    const isTakeaway = initialTable === 'Takeaway' || initialTable === '0' || String(initialTable).toLowerCase() === 'takeaway';

    const cleanedPhone = sanitizePhoneNumber(customerPhone);
    if (settings.requireCustomerPhone !== false) {
      if (!cleanedPhone || cleanedPhone.length !== 10) {
        setPhoneError('Please enter a valid 10-digit mobile number');
        console.warn('[OZKAFE Validation] Invalid phone number entered:', customerPhone);
        return;
      }
    }

    if (settings.requireCustomerName !== false && !customerName.trim()) {
      console.warn('[OZKAFE Validation] Customer name is required');
      return;
    }

    if (isTakeaway) {
      if (!customerFlat || !customerFlat.trim()) {
        setFlatError('Flat Number is required (e.g. 14B or Tower 2 - 14B)');
        console.warn('[OZKAFE Validation] Flat number required for takeaway');
        return;
      }
      const hasDigits = /\d/.test(customerFlat);
      const hasLetters = /[a-zA-Z]/.test(customerFlat);
      if (!hasDigits || !hasLetters) {
        setFlatError('Flat number must contain both digits and letters (e.g. 14B or Tower 2 - 14B)');
        console.warn('[OZKAFE Validation] Invalid flat number format:', customerFlat);
        return;
      }
    } else if (customerFlat && customerFlat.trim()) {
      const hasDigits = /\d/.test(customerFlat);
      const hasLetters = /[a-zA-Z]/.test(customerFlat);
      if (!hasDigits || !hasLetters) {
        setFlatError('Flat number must contain both digits and letters (e.g. 14B or Tower 2 - 14B)');
        console.warn('[OZKAFE Validation] Invalid flat number format:', customerFlat);
        return;
      }
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

      const idempotencyKey = `idem_${cleanedPhone}_${cartGrandTotal.toFixed(2)}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

      const orderPayload = {
        tableNumber: initialTable,
        tableKey: initialKey,
        sessionId: tableSessionId,
        idempotencyKey,
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
        specialInstructions: '',
      };

      const tempOrderId = `opt_${Date.now()}`;
      const optimisticOrderNumber = `oz-anassa-${Math.floor(Date.now() / 1000).toString().slice(-4)}`;
      const optimisticOrder: Order = {
        id: tempOrderId,
        orderNumber: optimisticOrderNumber,
        tableNumber: initialTable,
        tableKey: initialKey,
        sessionId: tableSessionId,
        idempotencyKey,
        customerName: customerName.trim() || 'Guest',
        customerPhone: cleanedPhone,
        customerFlat: customerFlat.trim() || undefined,
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
        specialInstructions: '',
        status: 'received',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // Snapshot previous state for rollback in case of background failure
      const previousCart = { ...cart };
      const previousActiveOrders = [...activeOrders];
      const previousHasLocalOrders = hasLocalOrders;

      const completeOrderSuccess = (placedOrder: Order, serverSessionId?: string) => {
        // Ensure session ID is synchronized with server response
        const effSession = serverSessionId || placedOrder.sessionId;
        if (effSession) {
          setTableSessionId(effSession);
          try {
            localStorage.setItem(`anassa_session_${initialTable}`, effSession);
          } catch {}
        }

        // Save to localStorage for persistent state recovery
        try {
          const savedOrdersStr = localStorage.getItem('anassa_orders');
          const savedOrders: string[] = savedOrdersStr ? JSON.parse(savedOrdersStr) : [];
          if (!savedOrders.includes(placedOrder.id)) {
            savedOrders.unshift(placedOrder.id);
          }
          localStorage.setItem('anassa_orders', JSON.stringify(savedOrders.slice(0, 30)));
        } catch {}

        // Save guest profile for 1-tap ordering on next visit
        try {
          localStorage.setItem('anassa_guest_profile', JSON.stringify({
            name: customerName.trim() || placedOrder.customerName,
            phone: cleanedPhone || placedOrder.customerPhone,
            flat: customerFlat.trim() || placedOrder.customerFlat || '',
          }));
        } catch {}
        setIsGuestProfileSaved(true);
        setIsEditingGuestProfile(false);

        setActiveOrders((prev) => [placedOrder, ...prev.filter((o) => o.id !== placedOrder.id && o.id !== tempOrderId)]);
        setHasLocalOrders(true);

        // Clear cart in both state & persistent localStorage
        setCart({});
        try {
          localStorage.removeItem(`anassa_cart_${initialTable}`);
        } catch {}
        setIsCartOpen(false);

        // Trigger celebration confetti
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 5000);

        // Open Tracker
        setIsTrackerOpen(true);
      };

      // ── STEP 1: OPTIMISTIC UI UPDATE (Instant user feedback) ──
      completeOrderSuccess(optimisticOrder, tableSessionId);
      logOptimisticSuccess('Customer Order Submitted Instantly', optimisticOrder);

      // ── STEP 2: BACKGROUND DATABASE SYNC ──
      let res: Response | null = null;
      try {
        res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orderPayload),
          signal: AbortSignal.timeout(12000), // 12-second safe timeout
        });

        if (!res.ok) {
          let errData: unknown = null;
          try {
            errData = await res.json();
          } catch {}
          throw new Error(`Server returned HTTP ${res.status}: ${JSON.stringify(errData)}`);
        }

        const data = await res.json();
        const serverOrder: Order = data.order;

        // Reconcile optimistic order with server-confirmed order
        completeOrderSuccess(serverOrder, data.sessionId);
        logActionSuccess('Customer Order Confirmed by Database', serverOrder);
      } catch (networkOrServerError) {
        // Attempt instant reconciliation in case server already created order before connection dropped
        let reconciled = false;
        try {
          const checkParams = new URLSearchParams({
            table: String(initialTable),
            phone: cleanedPhone,
            session: tableSessionId,
            _t: String(Date.now()),
          });
          const checkRes = await fetch(`/api/orders?${checkParams.toString()}`);
          if (checkRes.ok) {
            const recentOrders: Order[] = await checkRes.json();
            const matched = recentOrders.find((o) =>
              Date.now() - o.createdAt < 120_000 &&
              (o.customerPhone?.replace(/\D/g, '').slice(-10) === cleanedPhone.slice(-10))
            );
            if (matched) {
              completeOrderSuccess(matched, matched.sessionId);
              logActionSuccess('Order Reconciled Successfully from Kitchen', matched);
              reconciled = true;
            }
          }
        } catch (reconErr) {
          console.warn('[OZKAFE] Reconciliation attempt failed:', reconErr);
        }

        if (!reconciled) {
          // ── STEP 3: ROLLBACK UI STATE ON DEFINITIVE FAILURE ──
          setCart(previousCart);
          try {
            localStorage.setItem(`anassa_cart_${initialTable}`, JSON.stringify(previousCart));
          } catch {}
          setActiveOrders(previousActiveOrders);
          setHasLocalOrders(previousHasLocalOrders);
          setIsCartOpen(true);
          setIsTrackerOpen(false);
          setShowConfetti(false);

          // Detailed console debug log instead of alert dialog
          logActionError({
            action: 'Submit Customer Order to Kitchen',
            endpoint: '/api/orders',
            method: 'POST',
            payload: orderPayload,
            status: res?.status,
            error: networkOrServerError,
            rollbackState: {
              cartItemsRestored: Object.keys(previousCart).length,
              activeOrdersRestored: previousActiveOrders.length,
            },
          });
        }
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
          {(activeOrders.length > 0 || hasLocalOrders) && (
            <button
              className="icon-btn"
              onClick={() => {
                setIsTrackerOpen(true);
                if (activeOrders.length === 0) {
                  fetchSessionOrders(initialTable, tableSessionId);
                }
              }}
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
                backgroundColor: activeOrders.length > 0 ? 'var(--veg-green)' : 'var(--brand-gold)',
                boxShadow: activeOrders.length > 0 ? '0 0 6px var(--veg-green)' : '0 0 6px var(--brand-gold)',
              }} />
            </button>
          )}

          <button
            ref={cartBtnRef}
            className={`icon-btn header-btn-right ${cartImpactActive ? 'cart-impact' : ''}`}
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
            setIsGuestLoginModalOpen(true);
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
            <span className="cat-pill-count">
              {categoryItemCounts[cat.id] ?? cat.itemsCount ?? 0}
            </span>
          </button>
        ))}
      </nav>

      {/* ── ALL MENU INSTANT SEARCH BAR ── */}
      <div className="main-menu-search-container">
        <div className="main-menu-search-bar">
          <svg className="main-menu-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            className="main-menu-search-input"
            placeholder="Search all 76 coffees, bites & desserts..."
            value={menuSearch}
            onChange={(e) => setMenuSearch(e.target.value)}
          />
          {menuSearch && (
            <button
              type="button"
              className="main-menu-search-clear"
              onClick={() => setMenuSearch('')}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Live Search Results Dropdown */}
        {menuSearch.trim() && (
          <div className="main-menu-search-results-box">
            <div style={{ fontSize: 11, fontWeight: 700, color: '#78716C', padding: '4px 6px' }}>
              {searchResults.length} dish{searchResults.length === 1 ? '' : 'es'} found for &ldquo;{menuSearch}&rdquo;
            </div>
            {searchResults.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', fontSize: 12.5, color: '#78716C' }}>
                No dishes found. Try searching for &quot;Latte&quot;, &quot;Cold&quot;, &quot;Pasta&quot;, or &quot;Cake&quot;.
              </div>
            ) : (
              searchResults.map((item) => (
                <div
                  key={item.id}
                  className="main-menu-search-result-item"
                  onClick={() => handleSelectSearchResult(item)}
                >
                  <Image
                    src={item.img}
                    alt={item.name}
                    width={48}
                    height={48}
                    className="main-menu-search-result-img"
                  />
                  <div className="main-menu-search-result-info">
                    <div className="main-menu-search-result-name">{item.name}</div>
                    <div className="main-menu-search-result-meta">
                      <span>{item.category}</span>
                      {item.subheading && <span>· {item.subheading}</span>}
                    </div>
                  </div>
                  <div className="main-menu-search-result-price">₹{item.price}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* ── HERO SPOTLIGHT SECTION ── */}
      <section className="hero-section">
        <div className="light-ray"></div>
        <div className="hero-slider">
          {activeItem && (
            <div className="hero-slide-item" ref={heroImageRef}>
              <Image
                src={activeItem.img}
                alt={activeItem.name}
                width={250}
                height={250}
                priority
                style={{
                  filter: (activeItem.isAvailable && (typeof activeItem.stock !== 'number' || activeItem.stock > 0)) ? 'none' : 'grayscale(80%) brightness(0.7)',
                }}
              />
              {(!activeItem.isAvailable || (typeof activeItem.stock === 'number' && activeItem.stock <= 0)) && (
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
              {(!item.isAvailable || (typeof item.stock === 'number' && item.stock <= 0)) && (
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
            {typeof activeItem.stock === 'number' && activeItem.stock > 0 && activeItem.stock <= 3 && (
              <span className="pill-tag" style={{ background: '#FEF3C7', color: '#92400E', borderColor: '#FDE68A', fontWeight: 700, fontSize: '10px' }}>
                Only {activeItem.stock} left!
              </span>
            )}
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
                onClick={() => setQuantity((q) => Math.max(0, q - 1))}
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
          ADD-ONS
        </button>

        <button
          className="btn-solid"
          onClick={(e) => handleAddToCart(e)}
          disabled={!activeItem?.isAvailable || (typeof activeItem?.stock === 'number' && activeItem.stock <= 0)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <path d="M16 10a4 4 0 0 1-8 0"></path>
          </svg>
          {activeItem?.isAvailable && (typeof activeItem?.stock !== 'number' || activeItem.stock > 0)
            ? (quantity > 0 ? `ADD TO ORDER (${quantity})` : 'ADD TO ORDER')
            : 'SOLD OUT'}
        </button>
      </footer>

      {/* ── PROFESSIONAL MENU DIRECTORY SIDEBAR / DRAWER ── */}
      {isCategoriesOpen && (
        <div className="modal-overlay" onClick={() => setIsCategoriesOpen(false)}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle"></div>

            <div className="directory-sheet-header">
              <div className="directory-badge-row">
                <span className="directory-tag">OZKAFE MENU DIRECTORY · ANASSA</span>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setIsCategoriesOpen(false)}
                  aria-label="Close directory"
                >
                  ×
                </button>
              </div>
              <h2>Menu Categories & Brews</h2>
              <div className="directory-sheet-sub">
                100% Pure Veg Artisan Cafe · {flattenedItems.length} Handcrafted Dishes & Brews
              </div>

              {/* Instant Search Bar */}
              <div className="directory-search-wrapper">
                <svg className="directory-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input
                  type="text"
                  className="directory-search-input"
                  placeholder="Search drinks, dishes, desserts..."
                  value={directorySearch}
                  onChange={(e) => setDirectorySearch(e.target.value)}
                />
              </div>
            </div>

            <div className="directory-content-list">
              {categories.map((cat, idx) => {
                const totalInCat = categoryItemCounts[cat.id] || 0;
                const catDishes = flattenedItems.filter((it) => it.categoryId === cat.id);

                // If user is searching, filter dishes
                const searchQ = directorySearch.trim().toLowerCase();
                const filteredDishes = searchQ
                  ? catDishes.filter(
                      (d) =>
                        d.name.toLowerCase().includes(searchQ) ||
                        (d.subheading && d.subheading.toLowerCase().includes(searchQ)) ||
                        (d.desc && d.desc.toLowerCase().includes(searchQ))
                    )
                  : catDishes;

                // When searching, auto-expand if there are matches
                const isExpanded = searchQ ? filteredDishes.length > 0 : !!expandedCatIds[cat.id];

                if (searchQ && filteredDishes.length === 0) {
                  return null;
                }

                return (
                  <div key={cat.id} className={`directory-cat-card ${idx === activeCategoryIdx ? 'active' : ''}`}>
                    <button
                      type="button"
                      className="directory-cat-header-btn"
                      onClick={() => toggleCategoryDropdown(cat.id)}
                    >
                      <div className="directory-cat-left">
                        <div
                          className="directory-cat-icon"
                          dangerouslySetInnerHTML={{ __html: cat.iconSvg || '☕' }}
                        />
                        <div className="directory-cat-title-wrap">
                          <span className="directory-cat-title">{cat.title}</span>
                          <span className="directory-cat-subtitle">{cat.subtitle}</span>
                        </div>
                      </div>

                      <div className="directory-cat-right">
                        <span className="directory-count-badge">
                          {totalInCat} items
                        </span>
                        <div className={`directory-chevron-btn ${isExpanded ? 'open' : ''}`}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9"></polyline>
                          </svg>
                        </div>
                      </div>
                    </button>

                    {/* Sub-category / Dishes dropdown */}
                    {isExpanded && (
                      <div className="directory-dishes-dropdown">
                        {filteredDishes.map((dish) => {
                          const dishIndex = flattenedItems.findIndex((it) => it.id === dish.id);
                          return (
                            <div
                              key={dish.id}
                              className="directory-dish-item"
                              onClick={() => {
                                if (dishIndex !== -1) {
                                  handleSelectItem(dishIndex);
                                }
                                setIsCategoriesOpen(false);
                              }}
                            >
                              <div className="directory-dish-left">
                                <div className="directory-dish-thumb-wrap">
                                  {dish.img ? (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img
                                      src={dish.img}
                                      alt={dish.name}
                                      className="directory-dish-thumb"
                                      loading="lazy"
                                      onError={(e) => {
                                        const target = e.currentTarget;
                                        if (!target.src.endsWith('ozkafe_logo.jpeg')) {
                                          target.src = '/images/ozkafe_logo.jpeg';
                                        }
                                      }}
                                    />
                                  ) : (
                                    <span style={{ fontSize: '18px' }}>☕</span>
                                  )}
                                </div>
                                <div className="directory-dish-info">
                                  <span className="directory-dish-name">{dish.name}</span>
                                  {dish.subheading && (
                                    <span className="directory-dish-sub">{dish.subheading}</span>
                                  )}
                                </div>
                              </div>

                              <div className="directory-dish-right">
                                <span className="directory-dish-price">₹{dish.price}</span>
                                <span className="veg-icon-box" style={{ width: 11, height: 11 }}>
                                  <span className="veg-icon-dot" style={{ width: 5, height: 5 }}></span>
                                </span>
                              </div>
                            </div>
                          );
                        })}

                        <button
                          type="button"
                          className="directory-jump-btn"
                          onClick={() => {
                            handleSelectCategory(idx);
                            setIsCategoriesOpen(false);
                          }}
                        >
                          Explore All {cat.title} in Main View →
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── GUEST LOGIN & PROFILE MODAL SHEET ── */}
      {isGuestLoginModalOpen && (
        <div className="modal-overlay" onClick={() => setIsGuestLoginModalOpen(false)}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle"></div>

            <div className="sheet-header">
              <div>
                <span style={{ fontSize: '10px', color: 'var(--brand-gold-dark)', fontWeight: 700, letterSpacing: 1 }}>
                  OZKAFE ANASSA · GUEST ACCESS
                </span>
                <h2>{customerPhone ? 'Edit Guest Profile' : 'Guest Login & Fast Checkout'}</h2>
                <div style={{ fontSize: 11.5, color: 'var(--text-grey)', marginTop: 2 }}>
                  Saved securely on your device for instant 1-tap ordering
                </div>
              </div>
              <button
                type="button"
                className="btn-close"
                onClick={() => setIsGuestLoginModalOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="sheet-content" style={{ padding: '16px 20px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                    borderRadius: 12,
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
                <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: 5 }}>
                  Mobile Number (for order notifications & status) *
                </label>
                <input
                  type="tel"
                  name="tel"
                  autoComplete="tel mobile"
                  inputMode="tel"
                  id="guest-login-phone"
                  className="instructions-input"
                  placeholder="10-digit mobile number"
                  value={customerPhone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  maxLength={10}
                  required
                  style={{ fontSize: 15 }}
                />
                {phoneError && (
                  <span style={{ fontSize: 11, color: '#DC2626', marginTop: 4, display: 'block', fontWeight: 600 }}>
                    ⚠️ {phoneError}
                  </span>
                )}
              </div>

              <div>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: 5 }}>
                  Your Name *
                </label>
                <input
                  type="text"
                  name="name"
                  autoComplete="name"
                  id="guest-login-name"
                  className="instructions-input"
                  placeholder="e.g. Rahul Sen"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  required
                  style={{ fontSize: 15 }}
                />
              </div>

              {(initialTable === 'Takeaway' || initialTable === '0' || String(initialTable).toLowerCase() === 'takeaway') && (
                <div style={{ background: '#FFFDF9', padding: '12px 14px', border: `1.5px solid ${flatError ? '#DC2626' : 'var(--brand-gold)'}`, borderRadius: 12 }}>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: flatError ? '#DC2626' : 'var(--brand-accent)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                    <span>🏢</span> Flat / Apartment Number (Mandatory for Takeaway) *
                  </label>
                  <input
                    type="text"
                    name="flat"
                    id="guest-login-flat"
                    className="instructions-input"
                    placeholder="e.g. 14B or Tower 2 - 14B"
                    value={customerFlat}
                    onChange={(e) => handleFlatChange(e.target.value)}
                    required
                    style={{ fontSize: 14, background: '#FFFFFF', borderColor: flatError ? '#DC2626' : undefined }}
                  />
                  {flatError ? (
                    <span style={{ fontSize: 11, color: '#DC2626', marginTop: 4, display: 'block', fontWeight: 600 }}>
                      ⚠️ {flatError}
                    </span>
                  ) : (
                    <span style={{ fontSize: 10.5, color: '#7C4A1E', marginTop: 4, display: 'block' }}>
                      Required for Anassa flat delivery (must contain both digits & letters, e.g. 14B)
                    </span>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                <button
                  type="button"
                  onClick={() => {
                    const cleaned = sanitizePhoneNumber(customerPhone);
                    if (!cleaned || cleaned.length !== 10) {
                      setPhoneError('Please enter a valid 10-digit mobile number.');
                      console.warn('[OZKAFE Validation] Invalid phone number:', customerPhone);
                      return;
                    }
                    if (!customerName.trim()) {
                      console.warn('[OZKAFE Validation] Customer name is required');
                      return;
                    }
                    const isTakeaway = initialTable === 'Takeaway' || initialTable === '0' || String(initialTable).toLowerCase() === 'takeaway';
                    if (isTakeaway && !customerFlat.trim()) {
                      setFlatError('Flat Number is required (e.g. 14B or Tower 2 - 14B)');
                      console.warn('[OZKAFE Validation] Flat number required for takeaway');
                      return;
                    }
                    if (customerFlat.trim()) {
                      const hasDigits = /\d/.test(customerFlat);
                      const hasLetters = /[a-zA-Z]/.test(customerFlat);
                      if (!hasDigits || !hasLetters) {
                        setFlatError('Flat number must contain both digits and letters (e.g. 14B or Tower 2 - 14B)');
                        console.warn('[OZKAFE Validation] Invalid flat number format:', customerFlat);
                        return;
                      }
                    }
                    const profileData = {
                      name: customerName.trim(),
                      phone: cleaned,
                      flat: customerFlat.trim(),
                    };
                    localStorage.setItem('anassa_guest_profile', JSON.stringify(profileData));
                    localStorage.setItem('anassa_billing_details', JSON.stringify(profileData));
                    setIsGuestProfileSaved(true);
                    setIsEditingGuestProfile(false);
                    setIsGuestLoginModalOpen(false);
                  }}
                  className="btn-solid"
                  style={{ height: 44, fontSize: 14, flex: 1, borderRadius: 12 }}
                >
                  ✓ Save Profile & Continue
                </button>

                {customerPhone && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Clear saved guest profile on this device?')) {
                        localStorage.removeItem('anassa_guest_profile');
                        localStorage.removeItem('anassa_billing_details');
                        setCustomerPhone('');
                        setCustomerName('');
                        setCustomerFlat('');
                        setIsGuestProfileSaved(false);
                        setIsEditingGuestProfile(true);
                        setIsGuestLoginModalOpen(false);
                      }
                    }}
                    className="btn-outline"
                    style={{ height: 44, fontSize: 12, padding: '0 12px', borderRadius: 12, borderColor: '#DC2626', color: '#DC2626' }}
                  >
                    Logout
                  </button>
                )}
              </div>
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
                          onClick={(e) => handleAddAddonToCart(ad, e)}
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
                          onClick={() => {
                            setIsEditingGuestProfile(true);
                            setIsGuestLoginModalOpen(true);
                          }}
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
                          Edit Profile
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
                          <div style={{ background: '#FFFDF9', padding: '10px 12px', border: `1.5px solid ${flatError ? '#DC2626' : 'var(--brand-gold)'}`, borderRadius: 10 }}>
                            <label style={{ fontSize: 11, fontWeight: 700, color: flatError ? '#DC2626' : 'var(--brand-accent)', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                              <span>🏢</span> Flat / Apartment Number (Mandatory for Takeaway) *
                            </label>
                            <input
                              type="text"
                              name="flat"
                              id="customer-flat"
                              className="instructions-input"
                              placeholder="e.g. 14B or Tower 2 - 14B"
                              value={customerFlat}
                              onChange={(e) => handleFlatChange(e.target.value)}
                              required
                              style={{ fontSize: 14, background: '#FFFFFF', borderColor: flatError ? '#DC2626' : undefined }}
                            />
                            {flatError ? (
                              <span style={{ fontSize: 11, color: '#DC2626', marginTop: 4, display: 'block', fontWeight: 600 }}>
                                ⚠️ {flatError}
                              </span>
                            ) : (
                              <span style={{ fontSize: 10.5, color: '#7C4A1E', marginTop: 3, display: 'block' }}>
                                Required for Anassa flat delivery & counter order dispatch (must contain both digits & letters, e.g. 14B)
                              </span>
                            )}
                          </div>
                        ) : null}

                        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                          <button
                            type="button"
                            onClick={() => {
                              const cleaned = sanitizePhoneNumber(customerPhone);
                              if (!cleaned || cleaned.length !== 10) {
                                setPhoneError('Please enter a valid 10-digit mobile number.');
                                console.warn('[OZKAFE Validation] Invalid phone number:', customerPhone);
                                return;
                              }
                              if (!customerName.trim()) {
                                console.warn('[OZKAFE Validation] Customer name is required');
                                return;
                              }
                              const isTakeaway = initialTable === 'Takeaway' || initialTable === '0';
                              if (isTakeaway && !customerFlat.trim()) {
                                setFlatError('Flat Number is required (e.g. 14B or Tower 2 - 14B)');
                                console.warn('[OZKAFE Validation] Flat number required for takeaway');
                                return;
                              }
                              if (customerFlat.trim()) {
                                const hasDigits = /\d/.test(customerFlat);
                                const hasLetters = /[a-zA-Z]/.test(customerFlat);
                                if (!hasDigits || !hasLetters) {
                                  setFlatError('Flat number must contain both digits and letters (e.g. 14B or Tower 2 - 14B)');
                                  console.warn('[OZKAFE Validation] Invalid flat number format:', customerFlat);
                                  return;
                                }
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
                      ₹{formatCurrency(cartSubtotal)} + {settings.gstPercent}% GST (₹{formatCurrency(cartTax)})
                    </div>
                  </div>
                  <span className="cart-total-price">₹{formatCurrency(cartGrandTotal)}</span>
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
                    Min Order: ₹{settings.minOrderAmount} (Add ₹{formatCurrency(settings.minOrderAmount - cartSubtotal)})
                  </button>
                ) : (
                  <button
                    className="btn-solid"
                    style={{ width: '100%' }}
                    onClick={handlePlaceOrder}
                    disabled={isSubmittingOrder}
                  >
                    {isSubmittingOrder ? 'Submitting Order to Kitchen...' : `SEND ORDER TO KITCHEN · ₹${formatCurrency(cartGrandTotal)}`}
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
              {/* Notifications for Orders Deleted by Admin */}
              {deletedOrdersNotice.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  {deletedOrdersNotice.map((del) => (
                    <div
                      key={del.id}
                      style={{
                        padding: '14px 16px',
                        borderRadius: 12,
                        background: '#FEE2E2',
                        border: '1.5px solid #FCA5A5',
                        color: '#991B1B',
                        marginBottom: 10,
                        animation: 'fadeIn 0.2s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 800, fontSize: 13.5 }}>
                          ⚠️ Order #{del.orderNumber} Deleted by Admin
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setDeletedOrdersNotice((prev) => prev.filter((o) => o.id !== del.id));
                            try {
                              const saved = localStorage.getItem('anassa_my_order_ids');
                              if (saved) {
                                const ids = JSON.parse(saved).filter((id: string) => id !== del.id);
                                localStorage.setItem('anassa_my_order_ids', JSON.stringify(ids));
                              }
                            } catch {}
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#991B1B',
                            fontSize: 16,
                            fontWeight: 800,
                            cursor: 'pointer',
                            padding: '0 4px',
                          }}
                          title="Dismiss"
                        >
                          ✕
                        </button>
                      </div>
                      <p style={{ margin: '6px 0 0', fontSize: 12, color: '#7F1D1D', lineHeight: 1.4 }}>
                        This order has been cancelled and deleted by the cafe admin. Please visit the counter or place a fresh order.
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {activeOrders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-grey)' }}>
                  <p style={{ margin: '0 0 16px', fontSize: 14 }}>No active orders in progress right now.</p>
                  <button
                    onClick={() => {
                      fetchSessionOrders(initialTable, tableSessionId);
                    }}
                    style={{
                      padding: '8px 18px',
                      borderRadius: 10,
                      border: '1px solid var(--border-subtle)',
                      background: 'var(--bg-card-elevated)',
                      color: 'var(--brand-gold)',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    🔄 Refresh Orders
                  </button>
                </div>
              ) : (
                activeOrders.map((ord) => {
                  const isReceived = ['received', 'preparing', 'ready', 'served'].includes(ord.status);
                  const isPreparing = ['preparing', 'ready', 'served'].includes(ord.status);
                  const isReady = ['ready', 'served'].includes(ord.status);
                  const isServed = ord.status === 'served';

                  const badgeBg = isServed ? '#DCFCE7' : ord.status === 'ready' ? '#DCFCE7' : ord.status === 'preparing' ? '#FEF3C7' : '#FEE2E2';
                  const badgeColor = isServed ? '#166534' : ord.status === 'ready' ? '#166534' : ord.status === 'preparing' ? '#92400E' : '#991B1B';
                  const badgeText = isServed ? 'Served / Completed' : ord.status;

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
                            ({ord.tableNumber === 'Takeaway' || ord.tableNumber === 0 ? 'Takeaway' : `Table ${ord.tableNumber}`})
                          </span>
                          <div style={{ fontSize: 11, color: 'var(--text-grey)', marginTop: 2 }}>
                            📅 {new Date(ord.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} · ⏰ {new Date(ord.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        <span style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '3px 10px',
                          borderRadius: 999,
                          textTransform: 'uppercase',
                          background: badgeBg,
                          color: badgeColor,
                        }}>
                          {badgeText}
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
                        <div className={`timeline-step ${isReady ? (isServed ? 'completed' : 'current') : ''}`}>
                          <span className="step-title">Ready for Pickup / Serving</span>
                          <span className="step-desc">{isServed ? 'Prepared fresh and served' : 'Your order is ready to enjoy'}</span>
                        </div>
                        {isServed && (
                          <div className="timeline-step completed">
                            <span className="step-title">✨ Order Completed</span>
                            <span className="step-desc">Served fresh! Thank you for choosing Anassa.</span>
                          </div>
                        )}
                      </div>

                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', borderTop: '1px dashed var(--border-strong)', paddingTop: 8, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                        <div><strong>Items:</strong> {ord.items.map((i) => `${i.name} (x${i.quantity})`).join(', ')}</div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: 13 }}>₹{ord.total.toFixed(2)}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: ord.isPaid ? '#DCFCE7' : '#FEF3C7', color: ord.isPaid ? '#166534' : '#92400E' }}>
                            {ord.isPaid ? '✓ Paid' : '⏳ Unsettled'}
                          </span>
                        </div>
                        {ord.customerFlat && (
                          <div style={{ width: '100%', fontWeight: 700, color: 'var(--brand-accent)', marginTop: 2 }}>
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
