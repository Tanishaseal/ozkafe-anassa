/**
 * Place a new order via Vercel API Proxy.
 */
export async function placeOrder(tableNumber, items, total, specialInstructions, customerName, customerPhone, tableKey) {
  const res = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tableNumber,
      items,
      total,
      specialInstructions,
      customerName,
      customerPhone,
      tableKey
    })
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('API placeOrder error:', data.error);
    throw new Error(data.error || 'Failed to place order. Please try again.');
  }

  return data.id;
}

/**
 * Subscribe to a specific order's status changes.
 * Polls the Vercel API every 5 seconds.
 */
export function subscribeToOrder(orderId, callback) {
  let active = true;

  const poll = async () => {
    if (!active) return;
    try {
      const res = await fetch(`/api/orders?id=${orderId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.status && active) {
        callback(data.status);
      }
    } catch (err) {
      console.warn('Polling error:', err);
    }
  };

  // Fetch initial status immediately
  poll();

  const intervalId = setInterval(poll, 5000);

  return () => {
    active = false;
    clearInterval(intervalId);
  };
}

/**
 * Fetch all active orders for a specific table session.
 */
export async function fetchActiveOrdersForTable(tableNumber, tableKey) {
  try {
    const res = await fetch(`/api/orders?table=${tableNumber}&key=${tableKey}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error('Failed to fetch active orders:', err);
    return [];
  }
}
