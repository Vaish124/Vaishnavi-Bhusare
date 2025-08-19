/* Custom Product Grid (Vanilla JS) — Quick View + Add to Cart + Upsell */

(function () {
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  const money = (cents) => {
    try {
      // Shopify global formatter if present
      if (typeof Shopify !== 'undefined' && Shopify.formatMoney) {
        return Shopify.formatMoney(cents, window.theme && theme.moneyFormat ? theme.moneyFormat : '${{amount}}');
      }
    } catch (e) {}
    // Fallback
    const v = (cents || 0) / 100;
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: (window.Shopify && Shopify.currency && Shopify.currency.active) || 'USD' }).format(v);
  };

  const container = $('.cpg');
  if (!container) return;

  const overlay = $('.cpg-qv__overlay', container);
  const dlg = $('.cpg-qv', container);
  const closeBtn = $('.cpg-qv__close', container);
  const imgEl = $('.cpg-qv__img', container);
  const titleEl = $('.cpg-qv__title', container);
  const priceEl = $('.cpg-qv__price', container);
  const descEl = $('.cpg-qv__desc', container);
  const optionsWrap = $('.cpg-qv__options', container);
  const formEl = $('.cpg-qv__form', container);
  const variantInput = $('input[name="id"]', formEl);

  let productJSON = null;
  let currentVariant = null;

  // Open/Close helpers
  const openOverlay = () => { overlay.hidden = false; document.documentElement.style.overflow = 'hidden'; };
  const closeOverlay = () => { overlay.hidden = true; document.documentElement.style.overflow = ''; productJSON = null; currentVariant = null; optionsWrap.innerHTML = ''; };

  closeBtn.addEventListener('click', closeOverlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(); });
  document.addEventListener('keydown', (e) => { if (!overlay.hidden && e.key === 'Escape') closeOverlay(); });

  // Build options UI
  function buildOptionsUI(product) {
    optionsWrap.innerHTML = '';
    // For each option (e.g., Color, Size)
    product.options.forEach((optName, i) => {
      const opt = document.createElement('div');
      opt.className = 'cpg-qv__opt';

      const label = document.createElement('label');
      label.className = 'cpg-qv__opt-label';
      label.textContent = optName;

      const sel = document.createElement('select');
      sel.className = 'cpg-qv__sel';
      sel.dataset.index = i; // 0-based

      // Collect unique values for this option
      const values = Array.from(new Set(product.variants.map(v => v.options[i])));

      values.forEach(v => {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = v;
        sel.appendChild(o);
      });

      sel.addEventListener('change', onOptionChange);
      opt.appendChild(label);
      opt.appendChild(sel);
      optionsWrap.appendChild(opt);
    });

    // Preselect using first available variant
    const firstAvail = product.variants.find(v => v.available) || product.variants[0];
    if (firstAvail) {
      $$('.cpg-qv__sel', optionsWrap).forEach((sel, idx) => {
        const value = firstAvail.options[idx];
        const opt = Array.from(sel.options).find(o => o.value === value);
        if (opt) sel.value = opt.value;
      });
      setCurrentVariantFromSelections();
    }
  }

  function onOptionChange() {
    setCurrentVariantFromSelections();
  }

  function setCurrentVariantFromSelections() {
    const selections = $$('.cpg-qv__sel', optionsWrap).map(s => s.value);
    const match = productJSON.variants.find(v => {
      return selections.every((val, idx) => v.options[idx] === val);
    });
    currentVariant = match || null;
    if (currentVariant) {
      variantInput.value = currentVariant.id;
      priceEl.textContent = money(currentVariant.price);
    } else {
      variantInput.value = '';
      priceEl.textContent = money(productJSON.price);
    }
  }

  // Fetch product JSON and populate dialog
  async function openQuickView(handle) {
    const upsellHandle = container.querySelector('.cpg__wrap')?.dataset?.upsellHandle || '';
    dlg.dataset.upsellHandle = upsellHandle || '';

    try {
      const res = await fetch(`/products/${handle}.js`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Product fetch failed');
      const data = await res.json();
      productJSON = data;

      // Media (first image)
      const img = (data.images && data.images[0]) ? data.images[0] : null;
      imgEl.src = img || '';
      imgEl.alt = data.title || '';

      titleEl.textContent = data.title || '';
      priceEl.textContent = money((data.price != null ? data.price : (data.variants[0] && data.variants[0].price)));
      descEl.innerHTML = (data.description || '').slice(0, 300); // safe cap

      buildOptionsUI(data);
      openOverlay();
    } catch (e) {
      console.error(e);
      alert('Sorry, we could not load this product.');
    }
  }

  // Add to cart (with upsell condition)
  async function addToCart(variantId, quantity) {
    const body = JSON.stringify({ id: Number(variantId), quantity: Number(quantity) || 1 });

    const res = await fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      credentials: 'same-origin',
      body
    });

    if (!res.ok) throw new Error('Add to cart failed');
    return res.json();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!currentVariant || !currentVariant.id) {
      alert('Please select available options.');
      return;
    }

    const selections = $$('.cpg-qv__sel', optionsWrap).map(s => s.value.toLowerCase());
    const hasBlack = selections.includes('black');
    const hasMedium = selections.includes('medium') || selections.includes('m');

    try {
      // 1) Add the chosen variant
      await addToCart(currentVariant.id, 1);

      // 2) Upsell: If Color=Black AND Size=Medium, add upsell product
      const upsellHandle = dlg.dataset.upsellHandle;
      if (upsellHandle && hasBlack && hasMedium) {
        try {
          const upsellRes = await fetch(`/products/${upsellHandle}.js`, { credentials: 'same-origin' });
          if (upsellRes.ok) {
            const upsellData = await upsellRes.json();
            const upsellVariant = upsellData.variants.find(v => v.available) || upsellData.variants[0];
            if (upsellVariant) await addToCart(upsellVariant.id, 1);
          }
        } catch (err) {
          console.warn('Upsell add failed', err);
        }
      }

      closeOverlay();
      // Optionally show the cart drawer if theme supports it:
      document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));
    } catch (err) {
      console.error(err);
      alert('Could not add to cart.');
    }
  }

  // Bind quick view buttons
  $$('.cpg-quick', container).forEach(btn => {
    btn.addEventListener('click', () => openQuickView(btn.dataset.handle));
  });

  formEl.addEventListener('submit', handleSubmit);
})();
