let orders = [];

// Notification sound
const SOUND_NEW = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

document.addEventListener('DOMContentLoaded', () => {
  startClock();
  initPollingKitchen();

  // Refresh elapsed times every minute
  setInterval(() => renderBoard(), 60000);
});

/* ── POLLING MODE VIA VERCEL API ── */
async function initPollingKitchen() {
  let previousOrderIds = new Set();

  async function poll() {
    try {
      const res = await fetch(`/api/orders?_t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('API fetch failed');
      const data = await res.json();

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
    } catch (err) {
      console.warn('Polling error:', err.message);
    }
  }

  // Initial fetch
  await poll();

  // Poll every 3 seconds
  setInterval(poll, 3000);
}

/* ── NORMALIZE API row → order object ── */
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

/* ── RENDER KANBAN BOARD (OPTIMIZED) ── */
function renderBoard() {
  const cols = {
    received:  document.getElementById('col-received'),
    preparing: document.getElementById('col-preparing'),
    ready:     document.getElementById('col-ready')
  };

  const counts = { received: 0, preparing: 0, ready: 0 };
  const template = document.getElementById('order-card-template');

  // Track which IDs are currently active
  const currentOrderIds = new Set();

  orders.forEach(order => {
    if (order.status === 'served') return; // archived

    currentOrderIds.add(order.id);
    counts[order.status] = (counts[order.status] || 0) + 1;
    const col = cols[order.status];
    if (!col) return;

    let card = document.querySelector(`.order-card[data-id="${order.id}"]`);

    if (card) {
      // ── UPDATE EXISTING CARD ──
      // Move to correct column if status changed
      if (card.parentElement !== col) {
        col.appendChild(card);
      }
      
      // Update elapsed time smoothly
      const elapsedMin = Math.floor((Date.now() - order.createdAt) / 60000);
      const timeSpan = card.querySelector('.time-elapsed');
      timeSpan.textContent = elapsedMin < 1 ? 'Just now' : `${elapsedMin}m ago`;
      timeSpan.className = 'time-elapsed'; // reset classes
      if (elapsedMin > 15) timeSpan.classList.add('time-danger');
      else if (elapsedMin > 10) timeSpan.classList.add('time-warning');

      // Update action button smoothly
      const btn = card.querySelector('.advance-btn');
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
    } else {
      // ── CREATE NEW CARD ──
      const clone = template.content.cloneNode(true);
      card = clone.querySelector('.order-card');
      card.dataset.id = order.id;
      
      const nameParts = (order.customerName || '').split('|');
      let flatNo = '—';
      let name = 'No Name';
      if (nameParts.length > 1) {
        flatNo = nameParts[0].trim();
        name = nameParts[1].trim();
      } else {
        name = nameParts[0] ? nameParts[0].trim() : 'No Name';
      }

      clone.querySelector('.table-num').textContent = flatNo;
      clone.querySelector('.customer-name').textContent = name;
      clone.querySelector('.customer-phone').textContent = order.customerPhone || '';

      // Elapsed time
      const elapsedMin = Math.floor((Date.now() - order.createdAt) / 60000);
      const timeSpan = clone.querySelector('.time-elapsed');
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
    }
  });

  // 3. Remove old cards that are no longer active (e.g., served or deleted)
  document.querySelectorAll('.order-card').forEach(card => {
    if (!currentOrderIds.has(card.dataset.id)) {
      card.remove();
    }
  });

  // Update badges and Empty States
  Object.keys(cols).forEach(status => {
    const countBadge = document.getElementById(`count-${status}`);
    if (countBadge) countBadge.textContent = counts[status] || 0;

    const emptyCol = cols[status].querySelector('.empty-col');
    if (emptyCol) {
      emptyCol.style.display = counts[status] > 0 ? 'none' : 'block';
    }
  });
}

/* ── UPDATE STATUS VIA API ── */
async function updateStatus(id, newStatus) {
  // Optimistic local update
  const order = orders.find(o => o.id === id);
  if (order) { order.status = newStatus; renderBoard(); }

  try {
    const res = await fetch('/api/orders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: newStatus })
    });
    
    if (!res.ok) throw new Error('API update failed');
  } catch (err) {
    console.error('Failed to update order status:', err.message);
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
