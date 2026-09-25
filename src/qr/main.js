import QRCode from 'qrcode';
import { supabase } from '../supabase/client.js';

document.addEventListener('DOMContentLoaded', () => {
  const generateBtn = document.getElementById('generate-btn');
  const baseUrlInput = document.getElementById('base-url');
  const numTablesInput = document.getElementById('num-tables');
  const grid = document.getElementById('qr-grid');

  generateBtn.addEventListener('click', async () => {
    grid.innerHTML = '<p style="text-align:center;color:#888;padding:40px;">🔐 Generating secure QR codes...</p>';

    const baseUrl = baseUrlInput.value.trim().replace(/\/+$/, ''); // strip trailing slashes
    const numTables = parseInt(numTablesInput.value);

    if (!baseUrl || !numTables || numTables < 1) {
      grid.innerHTML = '<p style="color:red;text-align:center;">Please enter a valid Base URL and number of tables.</p>';
      return;
    }

    try {
      // 1. Register any new tables (existing ones keep their secrets)
      const tableEntries = Array.from({ length: numTables }, (_, i) => ({
        table_number: i + 1
      }));

      await supabase
        .from('tables')
        .upsert(tableEntries, { onConflict: 'table_number', ignoreDuplicates: true });

      // 2. Fetch all table secrets (stable UUIDs — never change once created)
      const { data: tables, error } = await supabase
        .from('tables')
        .select('table_number, secret')
        .gte('table_number', 1)
        .lte('table_number', numTables)
        .order('table_number');

      if (error) throw error;
      if (!tables || tables.length === 0) throw new Error('No tables found. Check your Supabase setup.');

      // 3. Render QR codes with secure, static URLs
      grid.innerHTML = '';

      for (const table of tables) {
        const secureUrl = `${baseUrl}/?table=${table.table_number}&key=${table.secret}`;

        const card = document.createElement('div');
        card.className = 'qr-card';

        const canvas = document.createElement('canvas');

        const label = document.createElement('div');
        label.className = 'table-label';
        label.textContent = `Table ${table.table_number}`;

        const scanText = document.createElement('div');
        scanText.className = 'scan-text';
        scanText.textContent = 'Scan to order';

        card.appendChild(canvas);
        card.appendChild(label);
        card.appendChild(scanText);
        grid.appendChild(card);

        await QRCode.toCanvas(canvas, secureUrl, {
          width: 150,
          margin: 1,
          color: {
            dark: '#111111',
            light: '#ffffff'
          }
        });
      }

    } catch (err) {
      console.error('QR generation error:', err);
      grid.innerHTML = `
        <div style="text-align:center;padding:40px;color:#666;">
          <p style="color:#c0392b;font-weight:600;">⚠️ Could not generate QR codes</p>
          <p style="font-size:14px;margin-top:8px;">${err.message}</p>
          <p style="font-size:13px;margin-top:12px;color:#888;">
            Make sure you've created the <code>tables</code> table in your Supabase database.<br/>
            See the setup guide for the SQL to run.
          </p>
        </div>`;
    }
  });

  // Auto-generate on page load
  generateBtn.click();
});
