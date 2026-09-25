import QRCode from 'qrcode';

document.addEventListener('DOMContentLoaded', () => {
  const generateBtn = document.getElementById('generate-btn');
  const baseUrlInput = document.getElementById('base-url');
  const numTablesInput = document.getElementById('num-tables');
  const grid = document.getElementById('qr-grid');

  generateBtn.addEventListener('click', async () => {
    grid.innerHTML = '<p style="text-align:center;color:#888;padding:40px;">🔐 Generating secure QR codes...</p>';

    const baseUrl = baseUrlInput.value.trim().replace(/\/+$/, '');
    const numTables = parseInt(numTablesInput.value);

    if (!baseUrl || !numTables || numTables < 1) {
      grid.innerHTML = '<p style="color:red;text-align:center;">Please enter a valid Base URL and number of tables.</p>';
      return;
    }

    try {
      grid.innerHTML = '';

      const secureUrl = baseUrl;

      const card = document.createElement('div');
      card.className = 'qr-card';

      const canvas = document.createElement('canvas');

      const label = document.createElement('div');
      label.className = 'table-label';
      label.textContent = `OZKAFE Takeaway`;

      const scanText = document.createElement('div');
      scanText.className = 'scan-text';
      scanText.textContent = 'Scan to order';

      card.appendChild(canvas);
      card.appendChild(label);
      card.appendChild(scanText);
      grid.appendChild(card);

      await QRCode.toCanvas(canvas, secureUrl, {
        width: 250,
        margin: 1,
        color: {
          dark: '#111111',
          light: '#ffffff'
        }
      });

    } catch (err) {
      console.error('QR generation error:', err);
      grid.innerHTML = `
        <div style="text-align:center;padding:40px;color:#666;">
          <p style="color:#c0392b;font-weight:600;">⚠️ Could not generate QR codes</p>
          <p style="font-size:14px;margin-top:8px;">${err.message}</p>
        </div>`;
    }
  });

  generateBtn.click();
});
