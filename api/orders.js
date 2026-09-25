import { supabase } from './supabaseClient.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // ── POST: Place New Order ──
    if (req.method === 'POST') {
      const { tableNumber, items, total, specialInstructions, customerName, customerPhone, tableKey } = req.body;

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
        if (error.code === '42501' || error.message?.includes('policy')) {
          return res.status(403).json({ error: 'Invalid table verification. Please scan the QR code at your table.' });
        }
        throw error;
      }
      return res.status(200).json({ id: data.id });
    }

    // ── GET: Fetch Orders (Kitchen Polling or Tracker Polling) ──
    if (req.method === 'GET') {
      const { id } = req.query;
      
      // If ID is provided, it's the customer tracker asking for a single order
      if (id) {
        const { data, error } = await supabase
          .from('orders')
          .select('status')
          .eq('id', id)
          .single();
        if (error) throw error;
        return res.status(200).json(data);
      } 
      
      // Otherwise, it's the kitchen dashboard asking for all active orders
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .in('status', ['received', 'preparing', 'ready'])
        .order('created_at', { ascending: true });
        
      if (error) throw error;
      return res.status(200).json(data);
    }

    // ── PATCH: Update Order Status (Kitchen) ──
    if (req.method === 'PATCH') {
      const { id, status } = req.body;
      const { error } = await supabase
        .from('orders')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);
        
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
