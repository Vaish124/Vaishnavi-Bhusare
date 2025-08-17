(function () {
  const grid = document.getElementById('gg-grid');
  const modal = document.getElementById('ggModal');
  if (!grid || !modal) return;

  const triggerColor = (grid.dataset.triggerColor || '').toLowerCase();
  const triggerSize  = (grid.dataset.triggerSize  || '').toLowerCase();

  const mediaEl = document.getElementById('ggQvMedia');
  const titleEl = document.getElementById('ggQvTitle');
  const priceEl = document.getElementById('ggQvPrice');
  const descEl  = document.getElementById('ggQvDesc');
  const optsEl  = document.getElementById('ggQvOptions');
  const varIdEl = document.getElementById('ggQvVariantId');
  const formEl  = document.getElementById('ggQvForm');
  const errorEl = document.getElementById('ggQvError');

  // open/close
  const closeEls = modal.querySelectorAll('[data-close]');
  closeEls.forEach(el => el.addEventListener('click', close));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  function open()  { modal.hidden = false; document.body.style.overflow = 'hidden'; }
  function close() { modal.hidden = true;  document.body.style.overflow = ''; errorEl.hidden = true; errorEl.textContent = ''; }

  function readProductJsonById(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    try { return JSON.parse(el.textContent); }
    catch (e) { console.error(e); return null; }
  }

  function formatMoney(cents) {
    try { return Shopify.formatMoney(cents, Shopify.money_format || '${{amount}}'); }
    catch { return `$${(cents/100).toFixed(2)}`; }
  }

  function renderProduct(p) {
    // media
    mediaEl.innerHTML = '';
    const firstImg = (p.images && p.images[0]) || (p.featured_image && p.featured_image.src) || '';
    if (firstImg) {
      const img = document.createElement('img');
      img.src = firstImg;
      img.alt = p.title || '';
      img.loading = 'lazy';
      mediaEl.appendChild(img);
    }

    // basic info
    titleEl.textContent = p.title || '';
    const baseVariant = (p.variants || [])[0];
    priceEl.textContent = formatMoney((baseVariant && baseVariant.price) || p.price || 0);
    descEl.innerHTML = p.description || '';

    // options
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

    // set initial variant
    const firstAvailable = (p.variants || []).find(v => v.available) || (p.variants || [])[0];
    setVariant(firstAvailable);

    // change handler: try to match a variant by selected options
    optsEl.querySelectorAll('select').forEach(() => {
      optsEl.addEventListener('change', () => {
        const selects = Array.from(optsEl.querySelectorAll('select'));
        const chosen = (p.variants || []).find(v => {
          return v.options.every((val, j) => selects[j] && selects[j].value === val);
        }) || (p.variants || [])[0];

        setVariant(chosen);
      }, { once: false });
    });

    function setVariant(variant) {
      if (!variant) return;
      varIdEl.value = variant.id;
      priceEl.textContent = formatMoney(variant.price);
    }
  }

  async function addToCart(variantId, qty = 1) {
    const res = await fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: variantId, quantity: qty })
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  // open modal on pin click
  grid.querySelectorAll('.gg-pin').forEach(pin => {
    pin.addEventListener('click', () => {
      const scriptId = pin.getAttribute('data-product-json-id');
      const product = readProductJsonById(scriptId);
      if (!product) return;
      renderProduct(product);
      open();
    });
  });

  // add to cart + conditional auto-add
  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const currentVarId = varIdEl.value;
      await addToCart(currentVarId, 1);

      // check chosen values for triggers
      const chosenValues = Array.from(optsEl.querySelectorAll('select')).map(s => (s.value || '').toLowerCase());
      const colorHit = triggerColor && chosenValues.includes(triggerColor);
      const sizeHit  = triggerSize  && chosenValues.includes(triggerSize);

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

      close();
      document.dispatchEvent(new CustomEvent('cart:refresh')); // optional for themes with ajax mini-cart
    } catch (err) {
      console.error(err);
      errorEl.hidden = false;
      errorEl.textContent = 'Could not add to cart. Please try again.';
    }
  });
})();
