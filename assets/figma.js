(function () {
  // Root elements: grid container and modal container
  const grid = document.getElementById('gg-grid');
  const modal = document.getElementById('ggModal');
  if (!grid || !modal) return;

  // Trigger values (normalized to lowercase for safe comparisons)
  const triggerColor = (grid.dataset.triggerColor || '').toLowerCase();
  const triggerSize  = (grid.dataset.triggerSize  || '').toLowerCase();

  // Modal element references used throughout render/add flow
  const mediaEl = document.getElementById('ggQvMedia');
  const titleEl = document.getElementById('ggQvTitle');
  const priceEl = document.getElementById('ggQvPrice');
  const descEl  = document.getElementById('ggQvDesc');
  const optsEl  = document.getElementById('ggQvOptions');
  const varIdEl = document.getElementById('ggQvVariantId');
  const formEl  = document.getElementById('ggQvForm');
  const errorEl = document.getElementById('ggQvError');

  // OPEN / CLOSE HANDLERS
  // Find all elements inside modal that should close it (data-close attr)
  const closeEls = modal.querySelectorAll('[data-close]');
  closeEls.forEach(el => el.addEventListener('click', close));
  // Close on Escape key for accessibility
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  // Show modal and prevent page scroll while open
  function open()  { modal.hidden = false; document.body.style.overflow = 'hidden'; }
  // Hide modal, re-enable scrolling, clear any visible error
  function close() { modal.hidden = true;  document.body.style.overflow = ''; errorEl.hidden = true; errorEl.textContent = ''; }

  // Read product JSON stored in a script tag by ID (returns parsed object)
  function readProductJsonById(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    try { return JSON.parse(el.textContent); }
    catch (e) { console.error(e); return null; }
  }

  // Format money using Shopify helpers if available; fallback to simple formatting
  function formatMoney(cents) {
    try { return Shopify.formatMoney(cents, Shopify.money_format || '${{amount}}'); }
    catch { return `$${(cents/100).toFixed(2)}`; }
  }

  // Render a product object into the quick-view modal
  function renderProduct(p) {
    // MEDIA: clear previous media and append first image found
    mediaEl.innerHTML = '';
    const firstImg = (p.images && p.images[0]) || (p.featured_image && p.featured_image.src) || '';
    if (firstImg) {
      const img = document.createElement('img');
      img.src = firstImg;
      img.alt = p.title || '';
      img.loading = 'lazy';
      mediaEl.appendChild(img);
    }

    // BASIC INFO: title, price (base/first variant), description
    titleEl.textContent = p.title || '';
    const baseVariant = (p.variants || [])[0];
    priceEl.textContent = formatMoney((baseVariant && baseVariant.price) || p.price || 0);
    descEl.innerHTML = p.description || '';

    // OPTIONS: build selects for each option (colors, sizes, etc.)
    optsEl.innerHTML = '';
    const optionNames = p.options_with_values ? p.options_with_values.map(o => o.name) : (p.options || []);
    const optionValues = p.options_with_values ? p.options_with_values.map(o => o.values) : [];

    (optionNames || []).forEach((name, idx) => {
      const values = optionValues[idx] || [];
      const wrap = document.createElement('div'); wrap.className = 'gg-opt';
      const label = document.createElement('label'); label.textContent = name;
      const select = document.createElement('select'); select.name = `options[${name}]`;

      values.forEach(v => {
        const o = document.createElement('option');
        o.value = v; o.textContent = v;
        select.appendChild(o);
      });

      wrap.append(label, select);
      optsEl.appendChild(wrap);
    });

    // Set initial variant to first available, or fallback first variant
    const firstAvailable = (p.variants || []).find(v => v.available) || (p.variants || [])[0];
    setVariant(firstAvailable);

    // Attach change handling for selects: match selected options to an actual variant
    optsEl.querySelectorAll('select').forEach(() => {
      optsEl.addEventListener('change', () => {
        const selects = Array.from(optsEl.querySelectorAll('select'));
        const chosen = (p.variants || []).find(v => {
          return v.options.every((val, j) => selects[j] && selects[j].value === val);
        }) || (p.variants || [])[0];

        setVariant(chosen);
      }, { once: false });
    });

    // Helper to update hidden variant input and price when variant changes
    function setVariant(variant) {
      if (!variant) return;
      varIdEl.value = variant.id;
      priceEl.textContent = formatMoney(variant.price);
    }
  }

  // Async helper to add a variant to cart using Shopify AJAX endpoint
  async function addToCart(variantId, qty = 1) {
    const res = await fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: variantId, quantity: qty })
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  // OPEN MODAL: wire up each pin inside the grid to read its product JSON and render modal
  grid.querySelectorAll('.gg-pin').forEach(pin => {
    pin.addEventListener('click', () => {
      const scriptId = pin.getAttribute('data-product-json-id');
      const product = readProductJsonById(scriptId);
      if (!product) return;
      renderProduct(product);
      open();
    });
  });

  // FORM SUBMIT: add main variant, then conditionally auto-add based on triggers
  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const currentVarId = varIdEl.value;
      await addToCart(currentVarId, 1);

      // Gather selected option values (lowercased for robust comparison)
      const chosenValues = Array.from(optsEl.querySelectorAll('select')).map(s => (s.value || '').toLowerCase());
      const colorHit = triggerColor && chosenValues.includes(triggerColor);
      const sizeHit  = triggerSize  && chosenValues.includes(triggerSize);

      // If both color and size triggers match, attempt to auto-add the configured product
      if (colorHit && sizeHit) {
        const autoEl = document.getElementById('gg-auto-product');
        if (autoEl) {
          const autoProduct = JSON.parse(autoEl.textContent);
          const autoVar = (autoProduct.variants || []).find(v => v.available) || (autoProduct.variants || [])[0];
          if (autoVar) {
            await addToCart(autoVar.id, 1);
          }
        }
      }

      // Close modal and signal other parts of theme to refresh cart if needed
      close();
      document.dispatchEvent(new CustomEvent('cart:refresh'));
    } catch (err) {
      // Show user-facing error and log for debugging
      console.error(err);
      errorEl.hidden = false;
      errorEl.textContent = 'Could not add to cart. Please try again.';
    }
  });
})();
