import { supabase, IS_PRODUCTION } from './client.js';

/**
 * Place a new order into Supabase.
 * The tableKey (from QR code URL) is sent along and verified by 
 * Supabase RLS policy server-side before allowing the insert.
 */
export async function placeOrder(tableNumber, items, total, specialInstructions, customerName, customerPhone, tableKey) {
  const { data, error } = await supabase
    .from('orders')
    .insert({
      table_number: tableNumber,
      table_key: tableKey || null,
      customer_name: customerName,
      customer_phone: customerPhone,
      items: items,
      total: total,
      special_instructions: specialInstructions,
      status: 'received',
    })
    .select('id')
    .single();

  if (error) {
    console.error('Supabase placeOrder error:', error);
    if (error.code === '42501' || error.message?.includes('policy')) {
      throw new Error('Invalid table verification. Please scan the QR code at your table to place orders.');
    }
    throw new Error(error.message || 'Failed to place order. Please try again.');
  }

  return data.id;
}

/**
 * Subscribe to a specific order's status changes.
 * 
 * - Production (Vercel): Uses Supabase Realtime (WebSocket) for instant updates.
 * - Local dev (India): Falls back to polling every 5 seconds since ISPs block WebSocket.
 * 
 * Returns an unsubscribe function.
 */
export function subscribeToOrder(orderId, callback) {
  // Fetch initial status immediately via REST (works everywhere)
  supabase
    .from('orders')
    .select('status')
    .eq('id', orderId)
    .single()
    .then(({ data }) => {
      if (data) callback(data.status);
    });

  if (IS_PRODUCTION) {
    // ── PRODUCTION: Supabase Realtime ──
    const channel = supabase
      .channel(`order-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          callback(payload.new.status);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  } else {
    // ── LOCAL DEV: Polling fallback (every 5s) ──
    let active = true;
    const poll = async () => {
      if (!active) return;
      const { data } = await supabase
        .from('orders')
        .select('status')
        .eq('id', orderId)
        .single();

      if (data && active) {
        callback(data.status);
      }
    };

    const intervalId = setInterval(poll, 5000);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }
}
