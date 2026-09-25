import { supabase, IS_PRODUCTION } from '../supabase/client.js';

let orders = [];

// Notification sound
const SOUND_NEW = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

document.addEventListener('DOMContentLoaded', () => {
  startClock();

  if (IS_PRODUCTION) {
    // ── PRODUCTION (Vercel): Supabase Realtime ──
    initRealtimeKitchen();
  } else {
    // ── LOCAL DEV (India): Polling fallback ──
    initPollingKitchen();
  }

  // Refresh elapsed times every minute
  setInterval(() => renderBoard(), 60000);
});

/* ── REALTIME MODE (Production / Vercel) ── */
async function initRealtimeKitchen() {
  // 1. Fetch current active orders via REST
  const { data: initialOrders } = await supabase
    .from('orders')
    .select('*')
    .in('status', ['received', 'preparing', 'ready'])
    .order('created_at', { ascending: true });

  orders = (initialOrders || []).map(normalizeOrder);
  renderBoard();

  // 2. Subscribe to Realtime changes on the orders table
  supabase
    .channel('kitchen-board')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'orders',
      },
      (payload) => {
        const newOrder = normalizeOrder(payload.new);
        // Only add if it's an active order and not already present
        if (['received', 'preparing', 'ready'].includes(newOrder.status)) {
          const existingIdx = orders.findIndex(o => o.id === newOrder.id);
          if (existingIdx === -1) {
            orders.push(newOrder);
            flashColumn('col-received-wrapper');
            SOUND_NEW.play().catch(() => {});
          }
        }
        renderBoard();
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
      },
      (payload) => {
        const updated = normalizeOrder(payload.new);
        const idx = orders.findIndex(o => o.id === updated.id);

        if (updated.status === 'served') {
          // Remove served orders from the board
          if (idx !== -1) orders.splice(idx, 1);
        } else if (idx !== -1) {
          orders[idx] = updated;
        } else {
          // Might be a re-activated order
          orders.push(updated);
        }
        renderBoard();
      }
    )
    .subscribe();
}

/* ── POLLING MODE (Local Dev / India ISP) ── */
async function initPollingKitchen() {
  let previousOrderIds = new Set();

  async function poll() {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .in('status', ['received', 'preparing', 'ready'])
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('Polling error:', error.message);
      return;
    }

    const newOrders = (data || []).map(normalizeOrder);
    const newOrderIds = new Set(newOrders.map(o => o.id));

    // Detect truly new orders (not just status changes)
    for (const order of newOrders) {
      if (!previousOrderIds.has(order.id)) {
        flashColumn('col-received-wrapper');
        SOUND_NEW.play().catch(() => {});
        break; // Only flash once per poll cycle
      }
    }

    previousOrderIds = newOrderIds;
    orders = newOrders;
    renderBoard();
  }

  // Initial fetch
  await poll();

  // Poll every 3 seconds
  setInterval(poll, 3000);
}

/* ── NORMALIZE Supabase row → order object ── */
function normalizeOrder(row) {
  return {
    id: row.id,
    tableNumber: row.table_number,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    items: row.items || [],
    total: row.total,
    specialInstructions: row.special_instructions || '',
    status: row.status,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  };
}

/* ── CLOCK ── */
function startClock() {
  const clock = document.getElementById('clock');
  const tick = () => {
    clock.textContent = new Date().toLocaleTimeString('en-AU', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  };
  tick();
  setInterval(tick, 1000);
}

/* ── RENDER KANBAN BOARD ── */
function renderBoard() {
  const cols = {
    received:  document.getElementById('col-received'),
    preparing: document.getElementById('col-preparing'),
    ready:     document.getElementById('col-ready')
  };

  const counts = { received: 0, preparing: 0, ready: 0 };

  // Clear all columns
  Object.values(cols).forEach(col => col.innerHTML = '');

  const template = document.getElementById('order-card-template');

  orders.forEach(order => {
    if (order.status === 'served') return; // archived

    counts[order.status] = (counts[order.status] || 0) + 1;
    const col = cols[order.status];
    if (!col) return;

    const clone = template.content.cloneNode(true);
    const card  = clone.querySelector('.order-card');

    card.dataset.id = order.id;
    clone.querySelector('.table-num').textContent = order.tableNumber || '—';
    // Show short ID (first 8 chars of UUID) for readability
    clone.querySelector('.order-id span').textContent = order.id.substring(0, 8).toUpperCase();
    clone.querySelector('.customer-name').textContent = order.customerName || 'No Name';
    clone.querySelector('.customer-phone').textContent = order.customerPhone || '';

    // Elapsed time
    const elapsedMin = Math.floor((Date.now() - order.createdAt) / 60000);
    const timeSpan   = clone.querySelector('.time-elapsed');
    timeSpan.textContent = elapsedMin < 1 ? 'Just now' : `${elapsedMin}m ago`;
    if (elapsedMin > 15) timeSpan.classList.add('time-danger');
    else if (elapsedMin > 10) timeSpan.classList.add('time-warning');

    // Items
    const ul = clone.querySelector('.item-list');
    (order.items || []).forEach(item => {
      const li = document.createElement('li');
      const qty = item.quantity || item.qty || 1;
      li.innerHTML = `<span class="qty">${qty}x</span> <span>${item.name}</span>`;
      ul.appendChild(li);
    });

    // Special instructions
    if (order.specialInstructions && order.specialInstructions.trim()) {
      const instDiv = clone.querySelector('.special-instructions');
      instDiv.classList.remove('hidden');
      instDiv.querySelector('span').textContent = order.specialInstructions;
    }

    // Action button
    const btn = clone.querySelector('.advance-btn');
    if (order.status === 'received') {
      btn.textContent = '▶ Start Preparing';
      btn.onclick = () => updateStatus(order.id, 'preparing');
    } else if (order.status === 'preparing') {
      btn.textContent = '✓ Mark Ready';
      btn.onclick = () => updateStatus(order.id, 'ready');
    } else if (order.status === 'ready') {
      btn.textContent = '✓ Mark Served';
      btn.onclick = () => updateStatus(order.id, 'served');
    }

    col.appendChild(clone);
  });

  // Update badges
  document.getElementById('count-received').textContent  = counts.received  || 0;
  document.getElementById('count-preparing').textContent = counts.preparing || 0;
  document.getElementById('count-ready').textContent     = counts.ready     || 0;
}

/* ── UPDATE STATUS ── */
async function updateStatus(id, newStatus) {
  // Optimistic local update
  const order = orders.find(o => o.id === id);
  if (order) { order.status = newStatus; renderBoard(); }

  const { error } = await supabase
    .from('orders')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('Failed to update order status:', error.message);
    // Revert optimistic update on failure
    if (order) { order.status = getStatusBefore(newStatus); renderBoard(); }
  }
}

function getStatusBefore(status) {
  const flow = ['received', 'preparing', 'ready', 'served'];
  const idx = flow.indexOf(status);
  return idx > 0 ? flow[idx - 1] : 'received';
}

/* ── FLASH COLUMN on new order ── */
function flashColumn(colId) {
  const col = document.getElementById(colId);
  if (!col) return;
  col.classList.remove('flash');
  void col.offsetWidth;
  col.classList.add('flash');
  setTimeout(() => col.classList.remove('flash'), 1200);
}
