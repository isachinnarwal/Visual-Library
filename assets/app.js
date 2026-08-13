/* ============================================================================
   Visual Library — static port of the Course Studio "Visual Library" page.

   Same model as the Next.js original: one flat list of visuals + a facets
   object, grouped into collapsible category sections, searchable by
   id/name/category/tag, filterable by tag, previewable full-screen in three
   modes (animated / final frame / preview.png).

   The one difference is where the data comes from. The studio app calls
   /api/visual-library, which walks the library on disk at request time. Here
   the same payload is baked into data/library.json by _build/build.py, so the
   whole thing is static files — no server, no build step at deploy time.
   ========================================================================== */

(function () {
  'use strict';

  // ── Category display metadata (mirrors app/visual-library/page.js) ────────
  var CATEGORY_LABELS = {
    'infographics/2-point': '2-point infographics',
    'infographics/3-point': '3-point infographics',
    'infographics/4-point': '4-point infographics',
    'infographics/5-point': '5-point infographics',
    'infographics/6-point': '6-point infographics',
    'timelines': 'Timelines',
    'text-boxes': 'Text boxes',
    'slide-layouts': 'Slide layouts',
    'mind-maps': 'Mind maps',
    'flow-charts': 'Flow charts',
    'charts': 'Charts'
  };

  var CATEGORY_ICONS = {
    'infographics/2-point': 'data_thresholding',
    'infographics/3-point': 'view_module',
    'infographics/4-point': 'grid_view',
    'infographics/5-point': 'apps',
    'infographics/6-point': 'view_comfy',
    'timelines': 'timeline',
    'text-boxes': 'text_fields',
    'slide-layouts': 'slideshow',
    'mind-maps': 'account_tree',
    'flow-charts': 'schema',
    'charts': 'bar_chart'
  };

  var NAV_LABELS = {
    'infographics/2-point': '2-pt',
    'infographics/3-point': '3-pt',
    'infographics/4-point': '4-pt',
    'infographics/5-point': '5-pt',
    'infographics/6-point': '6-pt'
  };

  function categoryLabel(c) { return CATEGORY_LABELS[c] || c; }
  function categoryIcon(c) { return CATEGORY_ICONS[c] || 'photo_library'; }
  function navLabel(c) { return NAV_LABELS[c] || categoryLabel(c); }

  function shortCategory(c) {
    if (!c) return '';
    if (c.indexOf('infographics/') === 0) return c.replace('infographics/', 'INF·');
    return c;
  }

  function slugify(c) { return String(c).replace(/[^a-z0-9]+/gi, '-').toLowerCase(); }

  // ── DOM helpers ───────────────────────────────────────────────────────────
  var $ = function (sel) { return document.querySelector(sel); };

  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  function icon(name, filled) {
    var s = el('span', filled ? 'ms filled' : 'ms', name);
    s.setAttribute('aria-hidden', 'true');
    return s;
  }

  // ── State ─────────────────────────────────────────────────────────────────
  var visuals = [];
  var facets = { categories: [], aspects: [], tags: [], total: 0 };
  var byId = new Map();

  var search = '';
  var activeTag = null;
  var openSections = new Set();
  var openVisual = null;
  var dialogMode = 'animated';
  var pushedHash = false;
  var toastTimer = null;

  // ── Elements ──────────────────────────────────────────────────────────────
  var elSections = $('#sections');
  var elSkeletons = $('#skeletons');
  var elEmpty = $('#emptyState');
  var elCount = $('#countLine');
  var elSearch = $('#search');
  var elSearchClear = $('#searchClear');
  var elExpandAll = $('#expandAll');
  var elCollapseAll = $('#collapseAll');
  var elNav = $('.nav-links');
  var elTagRow = $('#activeTagRow');
  var elTagChip = $('#activeTagChip');
  var elTagLabel = $('#activeTagLabel');
  var elDialog = $('#dialog');
  var elStage = $('#dlgStage');
  var elToast = $('#toast');

  // ── Theme ─────────────────────────────────────────────────────────────────
  function currentMode() {
    return document.documentElement.getAttribute('data-mode') === 'light' ? 'light' : 'dark';
  }

  function applyMode(mode) {
    document.documentElement.setAttribute('data-mode', mode);
    try { localStorage.setItem('vl-mode', mode); } catch (e) {}
    var btn = $('#themeToggle');
    var isDark = mode === 'dark';
    btn.querySelector('.ms').textContent = isDark ? 'light_mode' : 'dark_mode';
    btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    btn.setAttribute('title', isDark ? 'Switch to light mode' : 'Switch to dark mode');
  }

  $('#themeToggle').addEventListener('click', function () {
    applyMode(currentMode() === 'dark' ? 'light' : 'dark');
  });

  // ── Toast ─────────────────────────────────────────────────────────────────
  function showToast(msg, kind) {
    clearTimeout(toastTimer);
    $('#toastMsg').textContent = msg;
    elToast.classList.toggle('is-error', kind === 'error');
    elToast.querySelector('.toast-icon').textContent = kind === 'error' ? 'error' : 'check_circle';
    elToast.hidden = false;
    toastTimer = setTimeout(function () { elToast.hidden = true; }, 2600);
  }
  $('#toastClose').addEventListener('click', function () {
    clearTimeout(toastTimer);
    elToast.hidden = true;
  });

  // ── Clipboard ─────────────────────────────────────────────────────────────
  // navigator.clipboard needs a secure context. Served over HTTPS (Netlify) or
  // from localhost it is there; opened as a file:// it is not, so fall back to
  // the old selection trick rather than failing outright.
  function copyId(id) {
    var text = '#' + id;

    function ok() { showToast('Copied ' + text, 'success'); }
    function fail() { showToast('Clipboard blocked. Select the ID manually.', 'error'); }

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(ok, function () { legacyCopy(text) ? ok() : fail(); });
      return;
    }
    legacyCopy(text) ? ok() : fail();
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      var done = document.execCommand('copy');
      document.body.removeChild(ta);
      return done;
    } catch (e) {
      return false;
    }
  }

  // ── Filtering ─────────────────────────────────────────────────────────────
  function filterActive() { return search.trim().length > 0 || !!activeTag; }

  function filtered() {
    var q = search.trim().toLowerCase();
    return visuals.filter(function (v) {
      if (activeTag && (v.tags || []).indexOf(activeTag) === -1) return false;
      if (q) {
        var hay = [v.id, v.name, v.category].concat(v.tags || []).join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function grouped(items) {
    var map = new Map();
    facets.categories.forEach(function (c) { map.set(c, []); });
    items.forEach(function (v) {
      if (!map.has(v.category)) map.set(v.category, []);
      map.get(v.category).push(v);
    });
    var out = [];
    map.forEach(function (list, category) {
      if (list.length) out.push({ category: category, items: list });
    });
    return out;
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  function buildCard(v) {
    var card = el('div', 'card');

    var media = el('button', 'card-media' + (v.aspect === '9:16' ? ' portrait' : ''));
    media.type = 'button';
    media.setAttribute('aria-label', 'Preview ' + v.id + ' — ' + v.name);

    if (v.hasPreview && v.thumbUrl) {
      var img = new Image();
      img.src = v.thumbUrl;
      img.alt = v.name;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.addEventListener('error', function () {
        media.replaceChild(noPreview(), img);
      });
      media.appendChild(img);
    } else {
      media.appendChild(noPreview());
    }

    media.appendChild(el('span', 'card-id', v.id));
    media.addEventListener('click', function () { navigateToVisual(v.id); });
    card.appendChild(media);

    var body = el('div', 'card-body');

    var titleRow = el('div', 'card-title-row');
    titleRow.appendChild(el('span', 'card-name', v.name));

    var copyBtn = el('button', 'icon-btn');
    copyBtn.type = 'button';
    copyBtn.title = 'Copy #' + v.id;
    copyBtn.setAttribute('aria-label', 'Copy #' + v.id);
    copyBtn.appendChild(icon('content_copy'));
    copyBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      copyId(v.id);
    });
    titleRow.appendChild(copyBtn);
    body.appendChild(titleRow);

    var chips = el('div', 'card-chips');
    chips.appendChild(el('span', 'chip chip-outlined', shortCategory(v.category)));
    chips.appendChild(el('span', 'chip chip-outlined', v.aspect || ''));

    var tags = v.tags || [];
    tags.slice(0, 3).forEach(function (t) {
      var c = el('button', 'chip chip-filled chip-clickable', t);
      c.type = 'button';
      c.title = 'Filter by ' + t;
      c.addEventListener('click', function (e) {
        e.stopPropagation();
        setActiveTag(t);
      });
      chips.appendChild(c);
    });
    if (tags.length > 3) {
      chips.appendChild(el('span', 'chip chip-outlined', '+' + (tags.length - 3)));
    }

    body.appendChild(chips);
    card.appendChild(body);
    return card;
  }

  function noPreview() {
    var box = el('div', 'no-preview');
    box.appendChild(icon('image_not_supported'));
    return box;
  }

  function buildSection(group, isOpen, forceOpen) {
    var section = el('section', 'section' + (isOpen ? ' is-open' : ''));
    section.id = 'cat-' + slugify(group.category);

    var head = el('button', 'section-head');
    head.type = 'button';
    head.setAttribute('aria-expanded', String(isOpen));
    head.setAttribute('aria-controls', section.id + '-body');
    if (forceOpen) head.setAttribute('aria-disabled', 'true');

    var iconBox = el('span', 'section-icon');
    iconBox.appendChild(icon(categoryIcon(group.category), true));
    head.appendChild(iconBox);
    head.appendChild(el('span', 'section-label', categoryLabel(group.category)));
    head.appendChild(el('span', 'chip chip-outlined', String(group.items.length)));
    head.appendChild(el('span', 'spacer'));
    if (!forceOpen) {
      var caret = icon('expand_more');
      caret.classList.add('section-caret');
      head.appendChild(caret);
    }
    head.addEventListener('click', function () {
      if (forceOpen) return;
      toggleSection(group.category);
    });
    section.appendChild(head);

    if (isOpen) {
      var body = el('div', 'section-body');
      body.id = section.id + '-body';
      group.items.forEach(function (v) { body.appendChild(buildCard(v)); });
      section.appendChild(body);
    }

    return section;
  }

  function render() {
    var items = filtered();
    var groups = grouped(items);
    var forced = filterActive();

    elCount.textContent =
      items.length + ' of ' + facets.total + ' templates' + (forced ? ' (filtered)' : '');

    elExpandAll.disabled = forced;
    elCollapseAll.disabled = forced;
    elSearchClear.hidden = search.length === 0;

    if (activeTag) {
      elTagLabel.textContent = 'Tag: #' + activeTag;
      elTagRow.hidden = false;
    } else {
      elTagRow.hidden = true;
    }

    elEmpty.hidden = groups.length !== 0;

    elSections.textContent = '';
    groups.forEach(function (g) {
      var isOpen = forced || openSections.has(g.category);
      elSections.appendChild(buildSection(g, isOpen, forced));
    });
  }

  function renderNav() {
    elNav.textContent = '';
    facets.categories.forEach(function (c) {
      var a = el('a', 'nav-link');
      a.href = '#cat-' + slugify(c);
      a.title = categoryLabel(c);
      a.appendChild(icon(categoryIcon(c)));
      a.appendChild(el('span', null, navLabel(c)));
      a.addEventListener('click', function (e) {
        e.preventDefault();
        if (!filterActive()) {
          openSections.add(c);
          render();
        }
        var target = document.getElementById('cat-' + slugify(c));
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      elNav.appendChild(a);
    });
  }

  // ── Interactions ──────────────────────────────────────────────────────────
  function toggleSection(cat) {
    if (openSections.has(cat)) openSections.delete(cat);
    else openSections.add(cat);
    render();
  }

  function setActiveTag(tag) {
    activeTag = tag;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  elExpandAll.addEventListener('click', function () {
    openSections = new Set(facets.categories);
    render();
  });

  elCollapseAll.addEventListener('click', function () {
    openSections = new Set();
    render();
  });

  elSearch.addEventListener('input', function () {
    search = elSearch.value;
    render();
  });

  elSearchClear.addEventListener('click', function () {
    search = '';
    elSearch.value = '';
    elSearch.focus();
    render();
  });

  elTagChip.addEventListener('click', function () {
    activeTag = null;
    render();
  });

  // "/" focuses search, the way a catalogue should behave.
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !elDialog.hidden) { closeVisual(); return; }
    if (e.key === '/' && !elDialog.hidden) return;
    if (e.key === '/' && document.activeElement !== elSearch) {
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      elSearch.focus();
      elSearch.select();
    }
  });

  // ── Dialog ────────────────────────────────────────────────────────────────
  function stageSrc(v, mode) {
    if (mode === 'still') return v.previewUrl;
    if (mode === 'snapshot') return v.templateUrl + '?snapshot=1';
    return v.templateUrl;
  }

  // Templates draw onto a fixed pixel canvas and never scale themselves, so the
  // iframe is laid out at the canvas size and transform-scaled into the stage.
  function fitScaler() {
    var scaler = elStage.querySelector('.stage-scaler');
    if (!scaler || !openVisual) return;
    var canvas = openVisual.canvas || { width: 1920, height: 1080 };
    var rect = elStage.getBoundingClientRect();
    if (!rect.width) return;
    scaler.style.transform = 'scale(' + (rect.width / canvas.width) + ')';
  }

  function renderStage() {
    var v = openVisual;
    if (!v) return;

    elStage.classList.toggle('portrait', v.aspect === '9:16');
    elStage.textContent = '';

    if (dialogMode === 'still') {
      var img = new Image();
      img.src = v.previewUrl;
      img.alt = v.name;
      elStage.appendChild(img);
    } else {
      var canvas = v.canvas || { width: 1920, height: 1080 };
      var scaler = el('div', 'stage-scaler');
      scaler.style.width = canvas.width + 'px';
      scaler.style.height = canvas.height + 'px';

      var frame = document.createElement('iframe');
      frame.src = stageSrc(v, dialogMode);
      frame.title = v.id + ' — ' + v.name;
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      frame.loading = 'eager';

      scaler.appendChild(frame);
      elStage.appendChild(scaler);
      fitScaler();
    }

    Array.prototype.forEach.call(elDialog.querySelectorAll('.toggle'), function (b) {
      var on = b.dataset.mode === dialogMode;
      b.setAttribute('aria-pressed', String(on));
      if (b.dataset.mode === 'still') b.disabled = !v.hasPreview;
    });
  }

  if (window.ResizeObserver) {
    new ResizeObserver(fitScaler).observe(elStage);
  } else {
    window.addEventListener('resize', fitScaler);
  }

  function openVisualById(id) {
    var v = byId.get(id);
    if (!v) return false;
    openVisual = v;
    dialogMode = 'animated';
    $('#dlgId').textContent = v.id;
    $('#dlgName').textContent = v.name;
    $('#dlgCopyLabel').textContent = 'Copy #' + v.id;
    $('#dlgCopy').setAttribute('aria-label', 'Copy #' + v.id);
    elDialog.hidden = false;
    document.body.style.overflow = 'hidden';
    renderStage();
    $('#dlgClose').focus();
    return true;
  }

  function closeVisual() {
    if (pushedHash) {
      pushedHash = false;
      history.back();          // hashchange handler tears the dialog down
      return;
    }
    if (location.hash) {
      history.replaceState(null, '', location.pathname + location.search);
    }
    teardownDialog();
  }

  function teardownDialog() {
    openVisual = null;
    elStage.textContent = '';   // stop GSAP/rAF work in the iframe
    elDialog.hidden = true;
    document.body.style.overflow = '';
  }

  function navigateToVisual(id) {
    pushedHash = true;
    location.hash = id;         // hashchange handler opens it
  }

  $('#dlgClose').addEventListener('click', closeVisual);

  $('#dlgCopy').addEventListener('click', function () {
    if (openVisual) copyId(openVisual.id);
  });

  Array.prototype.forEach.call(elDialog.querySelectorAll('.toggle'), function (b) {
    b.addEventListener('click', function () {
      if (b.disabled || b.dataset.mode === dialogMode) return;
      dialogMode = b.dataset.mode;
      renderStage();
    });
  });

  // ── Deep links ────────────────────────────────────────────────────────────
  // "Copy #ID" yields "#INF-2P-001" — pasted onto the site URL that is already a
  // working permalink, so the same string works for the pipeline and the web.
  function syncFromHash() {
    var raw = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (raw && byId.has(raw)) {
      openVisualById(raw);
    } else if (openVisual) {
      teardownDialog();
    }
    // #cat-… anchors are handled by the nav links themselves.
  }

  window.addEventListener('hashchange', function () {
    if (!location.hash) pushedHash = false;
    syncFromHash();
  });

  // ── Boot ──────────────────────────────────────────────────────────────────
  applyMode(currentMode());

  fetch('data/library.json', { cache: 'no-cache' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      visuals = data.visuals || [];
      facets = data.facets || facets;
      visuals.forEach(function (v) { byId.set(v.id, v); });

      // Default: first category expanded, rest collapsed.
      if (facets.categories.length) openSections = new Set([facets.categories[0]]);

      if (data.generated) {
        $('#liveStampText').textContent = 'indexed · ' + data.generated;
        $('#liveStamp').hidden = false;
      }

      elSkeletons.remove();
      renderNav();
      render();
      syncFromHash();
    })
    .catch(function (err) {
      elSkeletons.remove();
      elCount.textContent = 'Could not load the library index.';
      elEmpty.hidden = false;
      elEmpty.querySelector('.empty-title').textContent = 'Library index unavailable';
      elEmpty.querySelector('.caption').textContent =
        'data/library.json failed to load (' + err.message + '). If you opened index.html directly ' +
        'from disk, serve the folder over HTTP instead — browsers block fetch on file:// URLs.';
    });
})();
