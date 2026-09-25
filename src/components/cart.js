import { placeOrder } from '../supabase/orders.js';
import { ensureValidated, isTableVerified, getTableKey } from '../supabase/tableAuth.js';
import { menuAddons } from '../data/menu.js';

// State
let cart = {};
let isCartOpen = false;

// DOM refs
let cartBadge, cartToggle, cartSheet, closeCartBtn;
let checkoutBtn, cartItemsContainer, cartTotalDisplay, instructionsInput;
let customerNameInput, customerPhoneInput;

export function initCart() {
  cartBadge          = document.getElementById('cart-badge');
  cartToggle         = document.getElementById('btn-cart');
  cartSheet          = document.getElementById('modal-cart');
  closeCartBtn       = document.getElementById('btn-close-cart');
  checkoutBtn        = document.getElementById('checkout-btn');
  cartItemsContainer = document.getElementById('cart-list');
  cartTotalDisplay   = document.getElementById('cart-total-price');
  instructionsInput  = document.getElementById('special-instructions');
  customerNameInput  = document.getElementById('customer-name');
  customerPhoneInput = document.getElementById('customer-phone');

  // Reset cart state on init (starts empty)
  cart = {};
  updateCartUI();

  cartToggle.addEventListener('click', openCart);
  closeCartBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeCart();
  });
  checkoutBtn.addEventListener('click', handleCheckout);

  // Close on backdrop click
  cartSheet.addEventListener('click', (e) => {
    if (e.target === cartSheet) {
      closeCart();
      return;
    }
    const rect = cartSheet.getBoundingClientRect();
    if (e.clientY < rect.top) closeCart();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (isCartOpen || cartSheet?.hasAttribute('open'))) closeCart();
  });
}

export function getCartQuantity(itemId) {
  const match = Object.values(cart).find(({ item }) => item.id === itemId);
  return match ? match.quantity : 0;
}

export function addToCart(item, quantity = 1) {
  const qtyToAdd = Math.max(1, parseInt(quantity) || 1);
  const key = item.cartKey || `${item.id || 'item'}_${item.name}_${item.price}`;
  if (!cart[key]) {
    cart[key] = { item: { ...item, cartKey: key }, quantity: qtyToAdd };
  } else {
    cart[key].quantity += qtyToAdd;
  }
  updateCartUI();

  // Pop animation
  if (cartBadge) {
    cartBadge.classList.remove('pop');
    void cartBadge.offsetWidth;
    cartBadge.classList.add('pop');
  }

  return cart[key].quantity;
}

export function removeFromCart(key) {
  if (!cart[key]) return 0;
  cart[key].quantity--;
  if (cart[key].quantity <= 0) {
    delete cart[key];
  }
  updateCartUI();
  return cart[key] ? cart[key].quantity : 0;
}

export function increaseCartItem(key) {
  if (!cart[key]) return;
  cart[key].quantity++;
  updateCartUI();
}

export function decreaseCartItem(key) {
  if (!cart[key]) return;
  cart[key].quantity--;
  if (cart[key].quantity <= 0) {
    delete cart[key];
  }
  updateCartUI();
}

function getTotalItems() {
  return Object.values(cart).reduce((total, { quantity }) => total + quantity, 0);
}

function getTotalPrice() {
  return Object.values(cart).reduce((total, { item, quantity }) => total + (item.price * quantity), 0);
}

function updateCartUI() {
  const totalItems = getTotalItems();
  const totalPrice = getTotalPrice();

  if (cartBadge) {
    if (totalItems > 0) {
      cartBadge.textContent = totalItems;
      cartBadge.classList.remove('hidden');
    } else {
      cartBadge.classList.add('hidden');
    }
  }

  if (checkoutBtn) {
    checkoutBtn.disabled = totalItems === 0;
  }

  renderCartItems();
  renderAddons();

  if (cartTotalDisplay) {
    cartTotalDisplay.textContent = `₹${totalPrice}`;
  }
}

function renderCartItems() {
  const entries = Object.entries(cart);
  const addonsWrapper = document.getElementById('cart-addons-wrapper');

  if (entries.length === 0) {
    if (addonsWrapper) addonsWrapper.style.display = 'none';
    cartItemsContainer.innerHTML = `
      <div class="empty-cart-state">
        <div class="empty-cart-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--brand-gold)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="9" cy="21" r="1"></circle>
            <circle cx="20" cy="21" r="1"></circle>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
          </svg>
        </div>
        <p class="empty-cart-title">Your order is empty</p>
        <p class="empty-cart-sub">Select your favorite handcrafted coffee & dishes to add them here.</p>
      </div>
    `;
    return;
  }

  const hasSingleOrigin = entries.some(([key, { item }]) => {
    return item.id && (item.id.startsWith('hc-') || (item.subheading && item.subheading.toUpperCase().includes('SINGLE ORIGIN')));
  });

  if (addonsWrapper) {
    addonsWrapper.style.display = hasSingleOrigin ? 'block' : 'none';
  }
  let html = '<div class="cart-items-list">';
  entries.forEach(([key, { item, quantity }]) => {
    const isAddon = item.isAddon || false;
    const imgSrc = item.img || item.image || '/images/ozkafe_logo.jpeg';
    
    html += `
      <div class="cart-item ${isAddon ? 'cart-item-addon' : ''}" data-key="${key}">
        <div class="cart-item-img-wrap" ${isAddon ? 'style="display:flex;align-items:center;justify-content:center;background:var(--brand-gold-dim);font-size:22px;"' : ''}>
          ${isAddon ? (item.icon || '✨') : `<img src="${imgSrc}" alt="${item.name}" loading="lazy" />`}
        </div>
        <div class="cart-item-details">
          <h4 class="cart-item-name">
            ${item.name}
            ${isAddon ? '<span class="cart-addon-badge-tag">ADD-ON</span>' : ''}
          </h4>
          <span class="cart-item-price-unit">₹${item.price} each</span>
        </div>
        <div class="cart-item-control-column">
          <div class="cart-stepper">
            <button type="button" class="cart-step-btn btn-cart-minus" data-key="${key}" aria-label="Decrease quantity">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
            <span class="cart-step-qty">${quantity}</span>
            <button type="button" class="cart-step-btn btn-cart-plus" data-key="${key}" aria-label="Increase quantity">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
          </div>
          <span class="cart-item-line-total">₹${item.price * quantity}</span>
        </div>
      </div>
    `;
  });
  html += '</div>';

  cartItemsContainer.innerHTML = html;

  // Attach stepper listeners
  cartItemsContainer.querySelectorAll('.btn-cart-minus').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      decreaseCartItem(btn.dataset.key);
    });
  });

  cartItemsContainer.querySelectorAll('.btn-cart-plus').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      increaseCartItem(btn.dataset.key);
    });
  });
}

function renderAddons() {
  const container = document.getElementById('cart-addons-grid');
  if (!container) return;

  let html = '';
  menuAddons.forEach(addon => {
    const key = `addon_${addon.id}_${addon.price}`;
    const qtyInCart = cart[key]?.quantity || 0;
    const isAdded = qtyInCart > 0;

    html += `
      <div class="cart-addon-card ${isAdded ? 'in-cart' : ''}" data-addon-id="${addon.id}">
        <div class="cart-addon-left">
          <span class="cart-addon-emoji">${addon.icon}</span>
          <div class="cart-addon-info">
            <span class="cart-addon-name">${addon.name}</span>
            <span class="cart-addon-price">+₹${addon.price}</span>
          </div>
        </div>
        <button type="button" class="cart-addon-btn ${isAdded ? 'active' : ''}" data-addon-id="${addon.id}" aria-label="Add ${addon.name}">
          ${isAdded ? `✓ (${qtyInCart})` : '+ Add'}
        </button>
      </div>
    `;
  });

  container.innerHTML = html;

  container.querySelectorAll('.cart-addon-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const addonId = btn.dataset.addonId;
      const addon = menuAddons.find(a => a.id === addonId);
      if (!addon) return;

      const key = `addon_${addon.id}_${addon.price}`;
      addToCart({
        id: addon.id,
        name: addon.name,
        price: addon.price,
        category: 'Add-on',
        isAddon: true,
        icon: addon.icon,
        cartKey: key
      }, 1);
    });
  });
}

export function openCart() {
  const catSheet = document.getElementById('modal-categories');
  if (catSheet?.hasAttribute('open')) catSheet.close();

  updateCartUI();
  cartSheet.showModal();
  isCartOpen = true;
  document.body.style.overflow = 'hidden';
}

export function closeCart() {
  if (cartSheet) {
    cartSheet.close();
  }
  isCartOpen = false;
  document.body.style.overflow = '';
}

async function handleCheckout() {
  // ── Gate: ensure table QR key is verified ──
  await ensureValidated();
  if (!isTableVerified()) {
    const t = new URLSearchParams(window.location.search).get('table') || 'none';
    const k = getTableKey() ? getTableKey().substring(0, 4) + '...' : 'none';
    alert(`📱 Table verification failed (Table: ${t}, Key: ${k}).\n\nPlease scan the QR code at your table to place an order.`);
    checkoutBtn.disabled = false;
    checkoutBtn.textContent = 'PLACE ORDER';
    return;
  }

  const tableParam = new URLSearchParams(window.location.search).get('table');
  const tableNum   = tableParam ? parseInt(tableParam) : 0;
  const tableKey   = getTableKey();

  const name = customerNameInput ? customerNameInput.value.trim() : '';
  const phone = customerPhoneInput ? customerPhoneInput.value.trim() : '';

  if (!name || !phone) {
    alert('Please provide your Name and Phone Number for billing details before placing the order.');
    return;
  }

  checkoutBtn.disabled  = true;
  checkoutBtn.textContent = 'Sending order…';

  try {
    const orderItems = Object.values(cart).map(({ item, quantity }) => ({
      id:       item.id,
      name:     item.name,
      price:    item.price,
      quantity,
      category: item.category || (item.isAddon ? 'Add-on' : 'General')
    }));

    const instructions = instructionsInput ? instructionsInput.value.trim() : '';
    const total        = getTotalPrice();

    const orderId = await placeOrder(tableNum, orderItems, total, instructions, name, phone, tableKey);

    closeCart();

    // Clear state
    cart = {};
    updateCartUI();
    if (instructionsInput) instructionsInput.value = '';
    if (customerNameInput) customerNameInput.value = '';
    if (customerPhoneInput) customerPhoneInput.value = '';
    checkoutBtn.textContent = 'PLACE ORDER';

    // Notify tracker component + confetti
    const summary = `${orderItems.length} item${orderItems.length > 1 ? 's' : ''}`;
    window.dispatchEvent(new CustomEvent('orderPlaced', { detail: { orderId, summary } }));

  } catch (error) {
    console.error('Checkout failed:', error);
    alert(error.message || 'Failed to place order. Please check your connection and try again.');
    checkoutBtn.disabled  = false;
    checkoutBtn.textContent = 'PLACE ORDER';
  }
}
