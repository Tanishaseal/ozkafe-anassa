import { supabase } from './supabaseClient.js';

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'POST') {
      const { numTables } = req.body;
      
      const tableEntries = Array.from({ length: numTables }, (_, i) => ({
        table_number: i + 1
      }));

      await supabase
        .from('tables')
        .upsert(tableEntries, { onConflict: 'table_number', ignoreDuplicates: true });

      const { data, error } = await supabase
        .from('tables')
        .select('table_number, secret')
        .gte('table_number', 1)
        .lte('table_number', numTables)
        .order('table_number');

      if (error) throw error;
      return res.status(200).json(data);
    } 
    
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
