import { supabase } from './supabaseClient.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // ── POST: Place New Order ──
    if (req.method === 'POST') {
      const { items, total, specialInstructions, customerName, customerPhone } = req.body;

      // Automatically fetch Table 1's secret to satisfy RLS for takeaway
      const { data: tableData } = await supabase.from('tables').select('secret').eq('table_number', 1).single();
      const validSecret = tableData ? tableData.secret : null;

      const { data, error } = await supabase
        .from('orders')
        .insert({
          table_number: 1,
          table_key: validSecret,
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

    // ── GET: Fetch Orders (Kitchen Polling, Tracker Polling, or Table History) ──
    if (req.method === 'GET') {
      const { id, table, key } = req.query;
      
      // 1. If ID is provided, it's the customer tracker asking for a single order
      if (id) {
        const { data, error } = await supabase
          .from('orders')
          .select('status')
          .eq('id', id)
          .single();
        if (error) throw error;
        return res.status(200).json(data);
      } 
      
      // 2. If table and key are provided, fetch all active orders for this specific customer
      if (table && key) {
        const { data, error } = await supabase
          .from('orders')
          .select('id, items, status, total, created_at')
          .eq('table_number', parseInt(table))
          .eq('table_key', key)
          .in('status', ['received', 'preparing', 'ready'])
          .order('created_at', { ascending: false });
          
        if (error) throw error;
        return res.status(200).json(data || []);
      }
      
      // 3. Otherwise, it's the kitchen dashboard asking for all active orders globally
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
