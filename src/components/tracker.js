import { getTableNumber, getTableKey } from '../supabase/tableAuth.js';

let activeOrders = []; // Array of { id, fullId, status, summary }
let isTrackOpen = false;
let pollInterval = null;

// DOM Elements
let trackBtn;
let trackModal;
let closeTrackBtn;
let trackListContainer;

export function initTracker() {
  trackBtn = document.getElementById('btn-track');
  trackModal = document.getElementById('modal-track');
  closeTrackBtn = document.getElementById('btn-close-track');
  trackListContainer = document.getElementById('track-list');

  // Event Listeners
  trackBtn.addEventListener('click', openTracker);
  closeTrackBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeTracker();
  });
  
  trackModal.addEventListener('click', (e) => {
    if (e.target === trackModal) {
      closeTracker();
      return;
    }
    const rect = trackModal.getBoundingClientRect();
    if (e.clientY < rect.top) {
      closeTracker();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (isTrackOpen || trackModal?.hasAttribute('open'))) {
      closeTracker();
    }
  });

  // Listen to orderPlaced events from cart.js
  window.addEventListener('orderPlaced', () => {
    triggerConfetti(); // Celebrate successful checkout!
    pollTableOrders(); // Immediately refresh tracker
  });
}

export function startTablePolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollTableOrders(); // initial fetch
  pollInterval = setInterval(pollTableOrders, 5000);
}

async function pollTableOrders() {
  const myOrders = JSON.parse(localStorage.getItem('myOrders') || '[]');

  if (myOrders.length === 0) {
    activeOrders = [];
    trackBtn.classList.add('hidden');
    trackBtn.classList.remove('active');
    if (isTrackOpen) renderTrackerUI();
    return;
  }

  // Fetch updated status for each order
  let activeCount = 0;
  let hasPending = false;
  let updatedOrders = [];

  for (const order of myOrders) {
    if (order.status === 'served') continue; // Stop polling served orders

    try {
      const res = await fetch(`/api/orders?id=${order.id}`);
      if (res.ok) {
        const data = await res.json();
        order.status = data.status || order.status;
      }
    } catch (err) {
      console.warn('Tracker polling error:', err);
    }
    
    if (order.status !== 'served') {
      activeCount++;
      updatedOrders.push(order);
      if (order.status !== 'ready') {
        hasPending = true;
      }
    }
  }

  // Save back to localStorage (removes served orders over time, but we keep them active while they exist)
  // For simplicity, we just keep all in localstorage and only filter active in memory
  localStorage.setItem('myOrders', JSON.stringify(myOrders));

  activeOrders = myOrders.filter(o => o.status !== 'served').map(o => ({
    id: o.id.substring(0, 8).toUpperCase(),
    fullId: o.id,
    status: o.status,
    summary: o.summary || 'Your order'
  }));

  // Update Header Button visibility and pulsing state
  if (activeOrders.length > 0) {
    trackBtn.classList.remove('hidden');
    // Pulse if any order is not ready yet
    if (hasPending) {
      trackBtn.classList.add('active');
    } else {
      trackBtn.classList.remove('active');
    }
  } else {
    trackBtn.classList.add('hidden');
    trackBtn.classList.remove('active');
  }

  // Only re-render DOM if the modal is actually open to save CPU
  if (isTrackOpen) {
    renderTrackerUI();
  }
}

function openTracker() {
  const catSheet = document.getElementById('modal-categories');
  const cartSheet = document.getElementById('modal-cart');
  if(catSheet && catSheet.hasAttribute('open')) catSheet.close();
  if(cartSheet && cartSheet.hasAttribute('open')) cartSheet.close();

  renderTrackerUI(); // Render right before opening to ensure fresh state
  trackModal.showModal();
  isTrackOpen = true;
  document.body.style.overflow = 'hidden';
}

export function closeTracker() {
  if (trackModal) {
    trackModal.close();
  }
  isTrackOpen = false;
  document.body.style.overflow = '';
}

function renderTrackerUI() {
  if (activeOrders.length === 0) {
    trackListContainer.innerHTML = '<div class="empty-cart">No active orders</div>';
    return;
  }

  let html = '';
  
  activeOrders.forEach(order => {
    // Map status to progress bar indices
    let stepIndex = 0;
    if (order.status === 'preparing') stepIndex = 1;
    if (order.status === 'ready') stepIndex = 2;
    if (order.status === 'served') stepIndex = 3; // Finished

    const progressWidth = stepIndex === 0 ? '0%' : stepIndex === 1 ? '50%' : '100%';

    html += `
      <div class="track-card">
        <div class="track-header">
          <span>${order.summary}</span>
          <span class="track-id">#${order.id}</span>
        </div>
        
        <div class="track-stepper">
          <div class="track-stepper-fill" style="width: ${progressWidth};"></div>
          
          <div class="step ${stepIndex >= 0 ? (stepIndex === 0 ? 'active' : 'completed') : ''}">
            <div class="step-dot"></div>
            <div class="step-label">Received</div>
          </div>
          
          <div class="step ${stepIndex >= 1 ? (stepIndex === 1 ? 'active' : 'completed') : ''}">
            <div class="step-dot"></div>
            <div class="step-label">Preparing</div>
          </div>
          
          <div class="step ${stepIndex >= 2 ? (stepIndex === 2 ? 'active' : 'completed') : ''}">
            <div class="step-dot"></div>
            <div class="step-label">Ready</div>
          </div>
        </div>
      </div>
    `;
  });
  
  trackListContainer.innerHTML = html;
}
