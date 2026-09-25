import { menuData } from '../data/menu.js';
import { addToCart, openCart } from './cart.js';
import { getCategoryMeta } from '../data/categoryMetadata.js';

let allItems = [];
let currentItemIndex = 0;
let currentCategoryIndex = 0;
let currentQty = 1;
let currentSizeIndex = 0;
let scrollTimeout;

export function buildMenu() {
  // Flatten menu items with category context and subheading
  allItems = [];
  menuData.forEach((cat, catIdx) => {
    cat.startIndex = allItems.length;
    const meta = getCategoryMeta(cat.id);
    cat.items.forEach(item => {
      allItems.push({
        ...item,
        category:    cat.title,
        categoryMeta: meta,
        categoryIdx: catIdx,
        subheading:  item.subheading || '',
        sizes:       cat.sizes || ['Regular'],
        isBeans:     cat.isBeans || false,
        sizePriceMultiplier: cat.sizePriceMultiplier || null
      });
    });
  });

  setupHeaderEvents();
  initCategoryNavBar();
  initSlider();
  setupControls();
}

/* ── STICKY CATEGORY NAV BAR ON HOME PAGE ── */
function initCategoryNavBar() {
  const navBar = document.getElementById('category-nav-bar');
  if (!navBar) return;

  let html = '';
  menuData.forEach((cat, idx) => {
    const meta = getCategoryMeta(cat.id);
    html += `
      <button class="cat-nav-pill ${idx === 0 ? 'active' : ''}" data-idx="${idx}" aria-label="${cat.title}">
        <span class="cat-pill-icon">${meta.icon}</span>
        <span class="cat-pill-text">${cat.title}</span>
        <span class="cat-pill-count">${cat.items.length}</span>
      </button>
    `;
  });
  navBar.innerHTML = html;

  navBar.querySelectorAll('.cat-nav-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const catIdx = parseInt(btn.dataset.idx);
      jumpToCategory(catIdx);
    });
  });
}

/* ── SAFE CONTAINER-ONLY HORIZONTAL SCROLL (NEVER SCROLLS WINDOW) ── */
function scrollElementHorizontally(container, element, behavior = 'smooth') {
  if (!container || !element) return;
  const targetPos = element.offsetLeft - (container.clientWidth / 2) + (element.offsetWidth / 2);
  container.scrollTo({ left: Math.max(0, targetPos), behavior });
}

/* ── INSTANT JUMP TO SPECIFIC ITEM INDEX ── */
export function jumpToItem(itemIdx) {
  if (itemIdx < 0 || itemIdx >= allItems.length) return;
  const heroSlider = document.getElementById('hero-slider');
  const targetSlide = heroSlider ? heroSlider.querySelector(`[data-idx="${itemIdx}"]`) : null;

  if (targetSlide && heroSlider) {
    const scrollPos = targetSlide.offsetLeft - (heroSlider.clientWidth / 2) + (targetSlide.offsetWidth / 2);
    heroSlider.scrollTo({ left: Math.max(0, scrollPos), behavior: 'auto' });
  }

  updateActiveDish(itemIdx);

  const thumbnailTrack = document.getElementById('thumbnail-track');
  const activeThumb = thumbnailTrack ? thumbnailTrack.querySelector(`.thumbnail-item[data-idx="${itemIdx}"]`) : null;
  if (activeThumb && thumbnailTrack) {
    scrollElementHorizontally(thumbnailTrack, activeThumb, 'smooth');
  }
}

/* ── INSTANT JUMP TO CATEGORY (NO DIZZY SCROLLING) ── */
export function jumpToCategory(catIdx) {
  if (catIdx < 0 || catIdx >= menuData.length) return;
  const targetItemIdx = menuData[catIdx].startIndex;
  jumpToItem(targetItemIdx);
  updateCategoryUI(catIdx);
}

/* ── UPDATE CATEGORY UI (BANNER, PILLS, MODAL) ── */
function updateCategoryUI(catIdx) {
  if (catIdx < 0 || catIdx >= menuData.length) return;
  currentCategoryIndex = catIdx;
  const cat = menuData[catIdx];
  const meta = getCategoryMeta(cat.id);

  // 1. Sticky Category Nav Pills
  const navBar = document.getElementById('category-nav-bar');
  if (navBar) {
    navBar.querySelectorAll('.cat-nav-pill').forEach((pill, i) => {
      if (i === catIdx) {
        pill.classList.add('active');
        scrollElementHorizontally(navBar, pill, 'smooth');
      } else {
        pill.classList.remove('active');
      }
    });
  }

  // 2. Divider Icon update
  const dividerIcon = document.getElementById('active-divider-icon');
  if (dividerIcon) dividerIcon.innerHTML = meta.icon;

  // 3. Category modal active item state
  const categoryList = document.getElementById('category-list');
  if (categoryList) {
    categoryList.querySelectorAll('.category-item').forEach((item, i) => {
      const viewingBadge = item.querySelector('.viewing-badge');
      if (i === catIdx) {
        item.classList.add('active');
        if (!viewingBadge) {
          const titleRow = item.querySelector('.category-title-row');
          if (titleRow) {
            const badge = document.createElement('span');
            badge.className = 'viewing-badge';
            badge.textContent = 'VIEWING';
            titleRow.appendChild(badge);
          }
        }
      } else {
        item.classList.remove('active');
        if (viewingBadge) viewingBadge.remove();
      }
    });
  }
}

/* ── HEADER / CATEGORY MODAL (WITH SUBHEADINGS) ── */
function setupHeaderEvents() {
  const btnCategories    = document.getElementById('btn-back');
  const modalCategories  = document.getElementById('modal-categories');
  const btnClose         = document.getElementById('btn-close-categories');
  const categoryList     = document.getElementById('category-list');

  btnCategories.addEventListener('click', () => {
    updateCategoryUI(currentCategoryIndex);
    modalCategories.showModal();
  });
  btnClose.addEventListener('click', () => modalCategories.close());

  modalCategories.addEventListener('click', (e) => {
    const rect = modalCategories.getBoundingClientRect();
    if (e.clientY < rect.top || e.clientX < rect.left || e.clientX > rect.right) {
      modalCategories.close();
    }
  });

  let html = '';
  menuData.forEach((cat, idx) => {
    const meta = getCategoryMeta(cat.id);
    
    // Extract unique subheadings for this category
    const subheadings = [...new Set(cat.items.map(it => it.subheading).filter(Boolean))];
    let subChipsHtml = '';
    if (subheadings.length > 0) {
      subChipsHtml = `
        <div class="category-sub-pills">
          ${subheadings.map(sub => {
            const firstIdxInCat = cat.items.findIndex(it => it.subheading === sub);
            const globalIdx = cat.startIndex + firstIdxInCat;
            return `<button type="button" class="category-sub-chip" data-item-idx="${globalIdx}" title="View ${sub}">${sub}</button>`;
          }).join('')}
        </div>
      `;
    }

    html += `
      <div class="category-item ${idx === 0 ? 'active' : ''}" data-idx="${idx}" role="button" tabindex="0">
        <div class="category-item-left">
          <div class="category-icon-box">
            ${meta.icon}
          </div>
          <div class="category-info">
            <div class="category-title-row">
              <h3>${cat.title}</h3>
              ${idx === 0 ? '<span class="viewing-badge">VIEWING</span>' : ''}
            </div>
            <p class="category-subtitle">${meta.subtitle}</p>
            ${subChipsHtml}
          </div>
        </div>
        <div class="category-item-right">
          <span class="category-count">${cat.items.length} Items</span>
          <svg class="category-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </div>
      </div>
    `;
  });
  categoryList.innerHTML = html;

  // Subheading chip click → jump directly to that subheading
  categoryList.querySelectorAll('.category-sub-chip').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetItemIdx = parseInt(btn.dataset.itemIdx);
      modalCategories.close();
      jumpToItem(targetItemIdx);
    });
  });

  // Category item click → jump to category
  categoryList.querySelectorAll('.category-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.category-sub-chip')) return;
      const targetCatIdx = parseInt(el.dataset.idx);
      modalCategories.close();
      jumpToCategory(targetCatIdx);
    });
  });
}

/* ── HERO SLIDER + THUMBNAILS ── */
function initSlider() {
  const thumbnailTrack = document.getElementById('thumbnail-track');
  const heroSlider     = document.getElementById('hero-slider');

  let thumbsHtml = '';
  let heroHtml   = '';

  menuData.forEach((cat, catIdx) => {
    const meta = getCategoryMeta(cat.id);
    
    // Category separator pill in thumbnail track
    thumbsHtml += `
      <div class="thumbnail-cat-divider" data-cat-idx="${catIdx}" title="${cat.title}">
        <span class="cat-divider-icon">${meta.icon}</span>
        <span class="cat-divider-title">${cat.title}</span>
      </div>
    `;

    cat.items.forEach((item, itemIdxInCat) => {
      const globalIdx = cat.startIndex + itemIdxInCat;
      const imgSrc = item.img || item.image;
      thumbsHtml += `
        <div class="thumbnail-item ${globalIdx === 0 ? 'active' : ''}" data-idx="${globalIdx}" title="${item.name}${item.subheading ? ` (${item.subheading})` : ''}">
          <img src="${imgSrc}" alt="${item.name}" loading="lazy" />
        </div>
      `;
    });
  });

  allItems.forEach((item, idx) => {
    const imgSrc = item.img || item.image;
    heroHtml += `
      <div class="hero-slide-item ${idx === 0 ? 'active' : ''}" data-idx="${idx}">
        <img src="${imgSrc}" alt="${item.name}" loading="lazy" />
      </div>
    `;
  });

  thumbnailTrack.innerHTML = thumbsHtml;
  heroSlider.innerHTML     = heroHtml;

  // Category divider click in thumbnail track
  thumbnailTrack.querySelectorAll('.thumbnail-cat-divider').forEach(el => {
    el.addEventListener('click', () => {
      const catIdx = parseInt(el.dataset.catIdx);
      jumpToCategory(catIdx);
    });
  });

  // Thumbnail click → jump/scroll hero slider
  thumbnailTrack.querySelectorAll('.thumbnail-item').forEach(el => {
    el.addEventListener('click', () => {
      const targetIdx   = parseInt(el.dataset.idx);
      const targetSlide = heroSlider.querySelector(`[data-idx="${targetIdx}"]`);
      if (targetSlide) {
        const scrollPos = targetSlide.offsetLeft - (heroSlider.clientWidth / 2) + (targetSlide.offsetWidth / 2);
        heroSlider.scrollTo({ left: Math.max(0, scrollPos), behavior: 'smooth' });
      }
      updateActiveDish(targetIdx);
    });
  });

  // Sync hero slider scroll with active dish detection
  heroSlider.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      const centerPos = heroSlider.scrollLeft + (heroSlider.clientWidth / 2);
      let activeIndex = 0;
      let minDistance = Infinity;

      heroSlider.querySelectorAll('.hero-slide-item').forEach((item, idx) => {
        const itemCenter = item.offsetLeft + (item.offsetWidth / 2);
        const distance   = Math.abs(centerPos - itemCenter);
        if (distance < minDistance) {
          minDistance  = distance;
          activeIndex  = idx;
        }
      });

      if (activeIndex !== currentItemIndex) {
        updateActiveDish(activeIndex);
      }
    }, 50);
  });

  // Init to first item
  setTimeout(() => {
    const firstSlide = heroSlider.querySelector(`[data-idx="0"]`);
    if (firstSlide) {
      const scrollPos = firstSlide.offsetLeft - (heroSlider.clientWidth / 2) + (firstSlide.offsetWidth / 2);
      heroSlider.scrollTo({ left: Math.max(0, scrollPos), behavior: 'auto' });
    }
    updateActiveDish(0);
    updateCategoryUI(0);
  }, 120);
}

/* ── UPDATE ACTIVE DISH ── */
function updateActiveDish(itemIdx) {
  currentItemIndex = itemIdx;
  currentQty       = 1;
  currentSizeIndex = 0;
  updateQtyDisplay();

  const item = allItems[itemIdx];
  if (!item) return;

  if (item.categoryIdx !== undefined && item.categoryIdx !== currentCategoryIndex) {
    updateCategoryUI(item.categoryIdx);
  }

  // Hero slide active state
  const heroSlider = document.getElementById('hero-slider');
  if (heroSlider) {
    heroSlider.querySelectorAll('.hero-slide-item').forEach(el => el.classList.remove('active'));
    const activeSlide = heroSlider.querySelector(`[data-idx="${itemIdx}"]`);
    if (activeSlide) activeSlide.classList.add('active');
  }

  // Thumbnail active state & centering
  const thumbnailTrack = document.getElementById('thumbnail-track');
  if (thumbnailTrack) {
    thumbnailTrack.querySelectorAll('.thumbnail-item').forEach(el => el.classList.remove('active'));
    const activeThumb = thumbnailTrack.querySelector(`[data-idx="${itemIdx}"]`);
    if (activeThumb) {
      activeThumb.classList.add('active');
      scrollElementHorizontally(thumbnailTrack, activeThumb, 'smooth');
    }
  }

  // Animate details text
  const detailsSection = document.querySelector('.details-section');
  if (detailsSection) {
    detailsSection.classList.remove('animate-text');
    void detailsSection.offsetWidth; // force reflow
    detailsSection.classList.add('animate-text');
  }

  // Category Tag
  document.getElementById('item-tag-text').textContent = item.category.toUpperCase();

  // Subheading Tag
  const subTag = document.getElementById('item-subheading-tag');
  const subText = document.getElementById('item-subheading-text');
  if (subTag && subText) {
    if (item.subheading) {
      subText.textContent = item.subheading;
      subTag.style.display = 'inline-flex';
    } else {
      subTag.style.display = 'none';
    }
  }

  // Title
  document.getElementById('item-title').textContent = item.name;

  // Description: Only show real descriptions from PDF. If no description, DO NOT add any description!
  const descEl = document.getElementById('item-desc');
  if (descEl) {
    if (item.isBeans && item.roast) {
      descEl.style.display = 'block';
      descEl.innerHTML = `
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
          <span style="background:#FBF4EA;border:1px solid #E5D5C5;color:#7C4A1E;border-radius:999px;padding:3px 12px;font-size:11px;font-weight:700;">${item.roast} Roast</span>
          <span style="background:#F5F2EC;border:1px solid #E2DCD3;color:#4A3F35;border-radius:999px;padding:3px 12px;font-size:11px;font-weight:600;">${item.origin}</span>
        </div>
        <div>${item.desc || ''}</div>
      `;
    } else if (item.desc && item.desc.trim()) {
      descEl.style.display = 'block';
      descEl.textContent = item.desc;
    } else {
      descEl.style.display = 'none';
      descEl.textContent = '';
    }
  }

  // Price
  const priceContainer = document.querySelector('.item-price');
  if (item.price == null) {
    if (priceContainer) priceContainer.style.display = 'none';
    buildServingSizeToggles(item.sizes, item.sizePriceMultiplier, 0, false);
  } else {
    if (priceContainer) priceContainer.style.display = 'flex';
    const basePrice = item.price;
    const priceStr  = basePrice.toString();
    const parts     = priceStr.split('.');
    document.getElementById('price-int').textContent = parts[0];
    document.getElementById('price-dec').textContent = parts.length > 1 ? '.' + parts[1].padEnd(2, '0') : '.00';

    // Size/Weight toggles — Regular only for drinks, weights for beans
    buildServingSizeToggles(item.sizes, item.sizePriceMultiplier, basePrice, true);
  }
}

/* ── SIZE TOGGLES (Regular only for drinks, 250g/500g/1kg for beans) ── */
function buildServingSizeToggles(sizes, multipliers, basePrice, showPrice = true) {
  const container = document.getElementById('serving-size-control');
  if (!sizes || sizes.length === 0) {
    container.innerHTML = '';
    return;
  }

  let html = '<div class="seg-bg" id="seg-bg"></div>';
  sizes.forEach((s, i) => {
    html += `<button class="seg-btn ${i === currentSizeIndex ? 'active' : ''}" data-idx="${i}">${s}</button>`;
    if (i < sizes.length - 1) html += '<div class="seg-divider"></div>';
  });

  container.innerHTML = html;
  setTimeout(() => updateServingBgPosition(), 10);

  container.querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelector('.seg-btn.active')?.classList.remove('active');
      btn.classList.add('active');
      currentSizeIndex = parseInt(btn.dataset.idx);
      updateServingBgPosition();

      // Update price display if weight multiplier exists (for coffee beans)
      if (showPrice && multipliers && multipliers.length > 0) {
        const newPrice = Math.round(basePrice * multipliers[currentSizeIndex]);
        document.getElementById('price-int').textContent = newPrice.toString();
        document.getElementById('price-dec').textContent = '.00';
      }
    });
  });
}

function updateServingBgPosition() {
  const bg        = document.getElementById('seg-bg');
  const container = document.getElementById('serving-size-control');
  const activeBtn = container?.querySelector('.seg-btn.active');
  if (bg && activeBtn) {
    bg.style.transform = `translateX(${activeBtn.offsetLeft}px)`;
    bg.style.width     = `${activeBtn.offsetWidth}px`;
  }
}

/* ── QTY + ADD TO BAG CONTROLS ── */
function setupControls() {
  document.getElementById('btn-minus').addEventListener('click', () => {
    if (currentQty > 1) { currentQty--; updateQtyDisplay(); }
  });

  document.getElementById('btn-plus').addEventListener('click', () => {
    currentQty++; updateQtyDisplay();
  });

  // Special Note button
  const btnNote = document.getElementById('btn-addons');
  if (btnNote) {
    btnNote.addEventListener('click', () => {
      // Open cart modal and focus instructions
      openCart();
      const instructions = document.getElementById('special-instructions');
      if (instructions) {
        setTimeout(() => instructions.focus(), 150);
      }
    });
  }

  // Add to order button
  const addBtn = document.getElementById('btn-add-bag');
  addBtn.addEventListener('click', () => {
    const item      = allItems[currentItemIndex];
    const cartItem  = { ...item };

    // Set name: For beans append package weight; for drinks and foods keep name clean
    if (item.isBeans && item.sizes && item.sizes.length > 0) {
      const sizeName = item.sizes[currentSizeIndex];
      cartItem.name  = `${item.name} (${sizeName})`;

      if (item.sizePriceMultiplier) {
        cartItem.price = Math.round(item.price * item.sizePriceMultiplier[currentSizeIndex]);
      }
    } else {
      cartItem.name = item.name;
    }

    addToCart(cartItem, currentQty);

    // Success feedback
    const originalHTML = addBtn.innerHTML;
    addBtn.innerHTML    = '✓ ADDED TO ORDER';
    addBtn.style.background = 'linear-gradient(135deg, #16A34A, #15803D)';
    addBtn.style.boxShadow  = '0 6px 20px rgba(22, 163, 74, 0.4)';

    setTimeout(() => {
      addBtn.innerHTML        = originalHTML;
      addBtn.style.background = '';
      addBtn.style.boxShadow  = '';
      currentQty              = 1;
      updateQtyDisplay();
    }, 1000);
  });
}

function updateQtyDisplay() {
  const el = document.getElementById('qty-val');
  if (el) el.textContent = currentQty;
}
