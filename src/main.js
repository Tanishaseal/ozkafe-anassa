import { buildMenu }    from './components/menuBuilder.js';
import { initCart }     from './components/cart.js';
import { initTracker, startTablePolling }  from './components/tracker.js';
import { validateTable } from './supabase/tableAuth.js';

document.addEventListener('DOMContentLoaded', async () => {

  // 0. Validate table secret from QR code (async, checked at checkout)
  await validateTable();

  // 1. Table number from QR code URL param
  const urlParams   = new URLSearchParams(window.location.search);
  const tableNumber = urlParams.get('table') || '—';
  const tableBadge  = document.getElementById('table-badge');
  if (tableBadge) tableBadge.textContent = `Table ${tableNumber}`;

  // 2. Build menu + cart
  buildMenu();
  initCart();

  // 3. Init tracker and start polling for any active orders on this table!
  initTracker();
  startTablePolling();

  // 4. Splash screen — hide after 2.3s (CSS animation handles it, just remove from DOM)
  const splash = document.getElementById('splash-screen');
  if (splash) {
    setTimeout(() => {
      splash.style.display = 'none';
    }, 3000);
  }
});

// Subtle parallax on scroll
window.addEventListener('scroll', () => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.querySelectorAll('.hero-slide-item.active img').forEach(img => {
    const rect = img.parentElement.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      img.style.transform = `translateY(${rect.top * 0.05}px)`;
    }
  });
}, { passive: true });
