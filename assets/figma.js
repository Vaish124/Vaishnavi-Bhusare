/* eslint-env browser */
/* global Shopify, fetch */
// @ts-nocheck
// Figma page interactions — vanilla JS, theme-safe
(function () {
  'use strict';

  // ---- Helpers -------------------------------------------------------------
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function money(cents) {
    var curr = (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || 'USD';
    return (cents / 100).toLocaleString(undefined, { style: 'currency', currency: curr });
  }

  // ---- Modal ---------------------------------------------------------------
  function openProductModal(rawProduct, dataset) {
    if (!rawProduct) return;

    // Backdrop
    var back = document.createElement('div');
    back.className = 'gg-modal__backdrop';
    back.setAttribute('role', 'dialog');
    back.setAttribute('aria-modal', 'true');

    // Modal shell
    var modal = document.createElement('div');
    modal.className = 'gg-modal';

    var imgSrc = '';
    if (rawProduct.images && rawProduct.images[0] && rawProduct.images[0].src) {
      imgSrc = rawProduct.images[0].src;
    } else if (rawProduct.featured_image && rawProduct.featured_image.src) {
      imgSrc = rawProduct.featured_image.src;
    }

    modal.innerHTML =
      '<div class="gg-modal__header">' +
        (imgSrc ? '<img class="gg-modal__thumb" src="' + imgSrc + '" alt="">' : '') +
        '<h3 class="gg-modal__title">' + (rawProduct.title || '') + '</h3>' +
        '<div class="gg-modal__price" data-price></div>' +
      '</div>' +
      '<div class="gg-modal__desc">' + (rawProduct.body_html || '') + '</div>' +
      '<form class="gg-modal__form" id="gg-add-form" novalidate></form>' +
      '<div class="gg-modal__actions">' +
        '<button type="button" class="gg-btn gg-btn--ghost" data-close>Close</button>' +
        '<button type="submit" form="gg-add-form" class="gg-btn gg-btn--solid gg-btn--full gg-btn--arrow"><span>Add to cart</span><span class="gg-arrow">→</span></button>' +
      '</div>';

    // Build options UI
    var form = modal.querySelector('.gg-modal__form');
    var options = rawProduct.options_with_values || rawProduct.options || [];
    var i, j;

    for (i = 0; i < options.length; i++) {
      var opt = options[i];
      var wrap = document.createElement('div');
      wrap.className = 'gg-opt';

      var lab = document.createElement('label');
      lab.className = 'gg-opt__label';
      lab.textContent = (opt && opt.name) ? opt.name : ('Option ' + (i + 1));
      wrap.appendChild(lab);

      var values = (opt && opt.values) ? opt.values : [];

      if (values.length && values.length <= 6) {
        var group = document.createElement('div');
        group.className = 'gg-swatch';
        for (j = 0; j < values.length; j++) {
          var id = 'gg-' + (opt.name || ('opt' + i)) + '-' + j + '-' + Math.random().toString(36).slice(2, 8);
          var input = document.createElement('input');
          input.type = 'radio';
          input.name = opt.name || ('Option' + (i + 1));
          input.id = id;
          input.value = values[j];
          if (j === 0) input.checked = true;

          var l2 = document.createElement('label');
          l2.htmlFor = id;
          l2.textContent = values[j];

          group.appendChild(input);
          group.appendChild(l2);
        }
        wrap.appendChild(group);
      } else {
        var select = document.createElement('select');
        select.className = 'gg-select';
        for (j = 0; j < values.length; j++) {
          var o = document.createElement('option');
          o.value = values[j];
          o.textContent = values[j];
          if (j === 0) o.selected = true;
          select.appendChild(o);
        }
        wrap.appendChild(select);
      }
      form.appendChild(wrap);
    }

    // Resolve variant from form selections
    function resolveVariant() {
      var selected = {};
      $all('input[type=radio]:checked', form).forEach(function (r) { selected[r.name] = r.value; });
      $all('select', form).forEach(function (s) { selected[s.name] = s.value; });

      var variants = rawProduct.variants || [];
      var candidate = null;

      for (var v = 0; v < variants.length; v++) {
        var variant = variants[v];
        var ok = true;

        if (variant.options && variant.options.length && options && options.length) {
          for (var k = 0; k < variant.options.length; k++) {
            var optName = (options[k] && options[k].name) ? options[k].name : ('Option' + (k + 1));
            if (String(selected[optName]) !== String(variant.options[k])) {
              ok = false; break;
            }
          }
        }
        if (ok) { candidate = variant; break; }
      }

      if (!candidate) candidate = variants[0] || null;

      var priceNode = modal.querySelector('[data-price]');
      if (priceNode) {
        var p = candidate && typeof candidate.price === 'number'
          ? candidate.price
          : (typeof rawProduct.price === 'number' ? rawProduct.price : 0);
        priceNode.textContent = money(p);
      }
      return candidate;
    }

    var currentVariant = resolveVariant();
    form.addEventListener('change', function () { currentVariant = resolveVariant(); });

    // Submit (add to cart)
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      currentVariant = resolveVariant();
      if (!currentVariant) return;

      // 1) add selected item
      fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentVariant.id, quantity: 1 })
      })
      .then(function () {
        // 2) Auto-add rule: Black + Medium
        try {
          var triggerColor = (dataset && dataset.triggerColor ? String(dataset.triggerColor) : '').toLowerCase();
          var triggerSize  = (dataset && dataset.triggerSize ? String(dataset.triggerSize) : '').toLowerCase();

          var hasColor = false, hasSize = false;
          if (currentVariant && currentVariant.options && currentVariant.options.length) {
            for (var z = 0; z < currentVariant.options.length; z++) {
              var val = String(currentVariant.options[z] || '').toLowerCase();
              if (val === triggerColor) hasColor = true;
              if (val === triggerSize)  hasSize = true;
            }
          }

          if (hasColor && hasSize) {
            var holder = $('#gg-auto-product');
            if (holder && holder.textContent) {
              var autoProd = {};
              try { autoProd = JSON.parse(holder.textContent); } catch (err) {}
              var autoVar = null;
              if (autoProd && autoProd.variants && autoProd.variants.length) {
                for (var m = 0; m < autoProd.variants.length; m++) {
                  if (autoProd.variants[m].available) { autoVar = autoProd.variants[m]; break; }
                }
                if (!autoVar) autoVar = autoProd.variants[0];
              }
              if (autoVar) {
                fetch('/cart/add.js', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id: autoVar.id, quantity: 1 })
                });
              }
            }
          }
        } catch (err) {
          console.warn('Auto-add rule error', err);
        }
      })
      .finally(function () {
        if (back.parentNode) back.parentNode.removeChild(back);
        try {
          var ev = document.createEvent('CustomEvent');
          ev.initCustomEvent('cart:updated', true, true, {});
          window.dispatchEvent(ev);
        } catch (e2) {}
      });
    });

    // Close behaviour
    back.addEventListener('click', function (e) {
      if (e.target === back && back.parentNode) back.parentNode.removeChild(back);
    });
    var closeBtn = modal.querySelector('[data-close]');
    if (closeBtn) closeBtn.addEventListener('click', function () {
      if (back.parentNode) back.parentNode.removeChild(back);
    });

    back.appendChild(modal);
    document.body.appendChild(back);
  }

  // ---- Pins -> open modal ---------------------------------------------------
  document.addEventListener('click', function (e) {
    var pin = e.target.closest ? e.target.closest('.gg-pin') : null;
    if (!pin) return;

    var id = pin.getAttribute('data-product-json-id');
    if (!id) return;

    var holder = document.getElementById(id);
    if (!holder || !holder.textContent) return;

    var product = null;
    try { product = JSON.parse(holder.textContent); } catch (err) {}
    if (!product) return;

    var grid = document.getElementById('gg-grid');
    var data = {
      triggerColor: grid && grid.dataset ? grid.dataset.triggerColor : '',
      triggerSize:  grid && grid.dataset ? grid.dataset.triggerSize  : ''
    };

    openProductModal(product, data);
  });
})();
