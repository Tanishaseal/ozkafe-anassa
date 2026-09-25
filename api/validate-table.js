import { supabase } from './supabaseClient.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { table, key } = req.query;

  if (!table || !key) {
    return res.status(200).json({ valid: false });
  }

  try {
    const { data } = await supabase
      .from('tables')
      .select('id')
      .eq('table_number', parseInt(table))
      .eq('secret', key)
      .maybeSingle();

    return res.status(200).json({ valid: !!data });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
