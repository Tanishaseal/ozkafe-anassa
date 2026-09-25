import { subscribeToOrder } from '../supabase/orders.js';
import { triggerConfetti } from './particles.js';

let activeOrders = []; // Array of { id, status, summary }
let isTrackOpen = false;

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
  window.addEventListener('orderPlaced', (e) => {
    const { orderId, summary } = e.detail;
    addOrderToTracker(orderId, summary);
    triggerConfetti(); // Celebrate successful checkout!
  });
}

function openTracker() {
  const catSheet = document.getElementById('modal-categories');
  const cartSheet = document.getElementById('modal-cart');
  if(catSheet && catSheet.hasAttribute('open')) catSheet.close();
  if(cartSheet && cartSheet.hasAttribute('open')) cartSheet.close();

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

export function addOrderToTracker(orderId, summary) {
  const newOrder = {
    id: orderId,
    status: 'received',
    summary: summary || 'Your order',
    unsub: null
  };
  
  activeOrders.push(newOrder);
  
  // Update Header Button
  trackBtn.classList.remove('hidden');
  trackBtn.classList.add('active'); // Pulsing effect

  // Subscribe to real-time status updates via WebSockets
  newOrder.unsub = subscribeToOrder(orderId, (newStatus) => {
    newOrder.status = newStatus;
    renderTrackerUI();
    
    // Optional: Stop pulsing if order is ready
    if (newStatus === 'ready') {
      trackBtn.classList.remove('active');
    }
  });

  renderTrackerUI();
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
