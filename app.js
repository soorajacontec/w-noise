/* W-Noise — app.js
 * Created by SSK-BLUM. One IIFE holding the whole UI.
 * Sections: 1 helpers · 2 theme · 3 data · 4 map · 4b globe · 5 list · 6 place view · 7 audio
 *           8 visualizer · 9 creator page · 10 credit dialog · 11 help, Show me & tour
 *           12 mobile sheet · 13 PWA, keyboard, routing, boot
 */
(() => {
  'use strict';
  const VERSION = '1.3.0';

  /* =============== 1. HELPERS =============== */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* blocked */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* blocked */ } }
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtTime = (s) => { if (!isFinite(s) || s < 0) return '0:00'; s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
  const fmtCoord = (lat, lon) => `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`;
  let layoutMobile = null; // set by the screen-mode code: true/false when forced, null = ask the browser
  const isMobile = () => layoutMobile !== null ? layoutMobile : matchMedia('(max-width: 760px)').matches;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let toastT;
  function toast(msg, ms = 2600) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms);
  }
  const ico = (id) => `<svg class="i" aria-hidden="true"><use href="#${id}"/></svg>`;

  const CATS = {
    all: { label: 'All', emoji: '🌍' },
    saved: { label: 'Saved', emoji: '★' },
    forest: { label: 'Forests', emoji: '🌳' },
    wildlife: { label: 'Wildlife', emoji: '🦁' },
    water: { label: 'Water', emoji: '🌊' },
    city: { label: 'Cities', emoji: '🏙️' },
    weather: { label: 'Weather', emoji: '⛈️' },
    mountain: { label: 'Mountains', emoji: '🏔️' },
    ice: { label: 'Ice', emoji: '🧊' },
    desert: { label: 'Deserts', emoji: '🏜️' },
    culture: { label: 'Culture', emoji: '🔔' }
  };

  /* =============== state =============== */
  const state = {
    places: [], byId: {},
    cat: 'all', q: '',
    place: null,          // place open in the panel
    recs: [], recOffset: 0, recMore: false, // recordings of the open place
    queue: [], queuePlace: null, idx: -1,  // what the player is playing from
    playing: false, loop: store.get('wn-loop', false),
    saved: new Set(store.get('wn-saved', [])),
    heard: store.get('wn-heard', {})       // file → { placeId, t }
  };

  /* =============== 2. THEME =============== */
  const THEMES = ['auto', 'light', 'dark'];
  let theme = store.get('wn-theme', 'auto');
  function applyTheme() {
    const root = document.documentElement;
    if (theme === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
    $('#themeIcon').setAttribute('href', theme === 'auto' ? '#i-auto' : theme === 'light' ? '#i-sun' : '#i-moon');
    const lbl = `Theme: ${theme[0].toUpperCase() + theme.slice(1)}`;
    $('#themeBtn').setAttribute('aria-label', lbl); $('#themeBtn').title = lbl;
  }
  $('#themeBtn').addEventListener('click', () => {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % 3]; store.set('wn-theme', theme); applyTheme();
    toast(theme === 'auto' ? 'Theme follows your device' : theme === 'light' ? 'Light mode' : 'Dark mode', 1400);
  });
  applyTheme();

  // Colour palettes: colours live in styles.css ([data-palette="…"]); this only picks one.
  const PALETTES = [{ id: 'aurora', name: 'Aurora' }, { id: 'violet', name: 'Violet Night' }, { id: 'sunset', name: 'Sunset' }, { id: 'ocean', name: 'Ocean' }, { id: 'forest', name: 'Forest' }, { id: 'rose', name: 'Rose' }, { id: 'gold', name: 'Sand Gold' }, { id: 'ice', name: 'Mono Ice' }];
  let palette = store.get('wn-palette', 'aurora');
  if (!PALETTES.some(p => p.id === palette)) palette = 'aurora';
  function applyPalette() {
    const r = document.documentElement;
    if (palette === 'aurora') r.removeAttribute('data-palette'); else r.setAttribute('data-palette', palette);
    $$('.pal').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.palette === palette)));
  }
  $('#palGrid').innerHTML = PALETTES.map(p => `<button class="pal" data-palette="${p.id}" aria-pressed="${p.id === palette}"><span class="pal-sw" aria-hidden="true"><i class="a1"></i><i class="a2"></i><i class="lv"></i></span><span>${p.name}</span></button>`).join('');
  $('#palGrid').addEventListener('click', (e) => {
    const b = e.target.closest('.pal'); if (!b) return;
    palette = b.dataset.palette; store.set('wn-palette', palette); applyPalette();
    toast('Palette: ' + PALETTES.find(p => p.id === palette).name, 1400);
  });
  $('#paletteBtn').addEventListener('click', () => { const m = $('#paletteModal'); m.hidden ? openModal('paletteModal') : closeModal(m); });
  applyPalette();

  // Screen mode: Auto follows the device; Mobile / Tab / Web force that layout (a centred column on wider screens).
  // Forcing works by re-pointing every `(max-width: Npx)` @media rule to a virtual width (mediaText is writable).
  const LAYOUTS = [
    { id: 'auto', name: 'Auto', icon: '#i-auto', vw: 0, fits: 0 },
    { id: 'mobile', name: 'Mobile', icon: '#i-phone', vw: 390, fits: 430 },
    { id: 'tab', name: 'Tab', icon: '#i-tablet', vw: 834, fits: 834 },
    { id: 'web', name: 'Web', icon: '#i-desktop', vw: 1280, fits: 1280 },
  ];
  let layout = store.get('wn-layout', 'auto');
  if (!LAYOUTS.some(l => l.id === layout)) layout = 'auto';
  const widthRules = [];
  for (const sh of Array.from(document.styleSheets)) {
    let rules; try { rules = sh.cssRules; } catch (e) { continue; } // cross-origin font sheet
    for (const r of Array.from(rules)) {
      const m = r.type === 4 && /^\(max-width:\s*(\d+)px\)$/.exec(r.media.mediaText.trim());
      if (m) widthRules.push({ r, orig: r.media.mediaText, max: +m[1] });
    }
  }
  function applyLayout() {
    const L = { ...LAYOUTS.find(l => l.id === layout) }, root = document.documentElement;
    if (layout === 'mobile') L.vw = Math.min(390, screen.width || 390); // a phone narrower than 390 keeps its compact header
    if (L.vw) root.setAttribute('data-layout', layout); else root.removeAttribute('data-layout');
    for (const w of widthRules) w.r.media.mediaText = L.vw ? (L.vw <= w.max ? 'all' : 'not all') : w.orig;
    layoutMobile = L.vw ? L.vw <= 760 : null;
    // On a screen narrower than the chosen layout, let the browser render at that width and scale down.
    const need = L.fits && Math.min(screen.width, screen.height) < L.fits && layout !== 'mobile' ? L.fits : 0;
    $('meta[name="viewport"]').setAttribute('content', (need ? 'width=' + need : 'width=device-width') + ', initial-scale=1, viewport-fit=cover');
    $('#layoutIcon').setAttribute('href', L.icon);
    const lbl = `Screen mode: ${L.name}`;
    $('#layoutBtn').setAttribute('aria-label', lbl); $('#layoutBtn').title = lbl;
    document.body.classList.remove('map-big', 'map-small');
    dispatchEvent(new Event('resize')); // canvas globe, picture and spotlight redraw for the new size
  }
  $('#layoutBtn').addEventListener('click', () => {
    layout = LAYOUTS[(LAYOUTS.findIndex(l => l.id === layout) + 1) % LAYOUTS.length].id; store.set('wn-layout', layout); applyLayout();
    const L = LAYOUTS.find(l => l.id === layout);
    toast(layout === 'auto' ? 'Screen mode: Auto (fits your device)' : `Screen mode: ${L.name}`, 1600);
  });
  applyLayout();

  /* =============== 3. DATA =============== */
  async function loadPlaces() {
    if (Array.isArray(window.WN_PLACES)) state.places = window.WN_PLACES; // single-file build
    else {
      const r = await fetch('data/places.json');
      if (!r.ok) throw new Error('places.json ' + r.status);
      state.places = await r.json();
    }
    state.places.forEach(p => { state.byId[p.id] = p; });
  }
  function updateCounter() {
    const countries = new Set(state.places.map(p => p.cc)).size;
    const cache = WNSounds.allCached();
    const sounds = Object.values(cache).reduce((n, e) => n + ((e.items && e.items.length) || 0), 0);
    $('#counter').textContent = `${state.places.length} places · ${countries} countries` + (sounds ? ` · ${sounds} sounds` : '');
  }

  /* =============== 4. MAP =============== */
  const svg = $('#map');
  const W = 1000, H = 500;
  const vb = { x: 0, y: 0, w: W, h: H };
  const proj = (lon, lat) => [(lon + 180) / 360 * W, (90 - lat) / 180 * H];

  function drawMapBase() {
    $('#land').setAttribute('d', window.WN_MAP ? window.WN_MAP.d : '');
    let g = '';
    for (let lon = -150; lon <= 150; lon += 30) { const x = proj(lon, 0)[0]; g += `<line x1="${x}" y1="0" x2="${x}" y2="${H}"/>`; }
    for (let lat = -60; lat <= 60; lat += 30) { const y = proj(0, lat)[1]; g += `<line x1="0" y1="${y}" x2="${W}" y2="${y}"/>`; }
    $('#grid').innerHTML = g;
  }
  function drawPins() {
    $('#pins').innerHTML = state.places.map(p => {
      const [x, y] = proj(p.lon, p.lat);
      return `<g class="pin" data-id="${p.id}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
        <circle class="glow" r="14"/><circle class="pulse" r="5"/><circle class="pulse p2" r="5"/>
        <circle class="dot" r="5"/><text class="label" x="9" y="4"></text></g>`;
    }).join('');
    scalePins();
  }
  /** units per CSS pixel at the current zoom */
  function unitsPerPx() {
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return vb.w / W;
    return 1 / Math.min(r.width / vb.w, r.height / vb.h);
  }
  function scalePins() {
    const u = unitsPerPx();
    $$('.pin', svg).forEach(g => {
      $('.glow', g).setAttribute('r', 15 * u);
      $$('.pulse', g).forEach(c => c.setAttribute('r', 5 * u));
      const d = $('.dot', g); d.setAttribute('r', 5.5 * u); d.setAttribute('stroke-width', 1.6 * u);
      $$('.pulse', g).forEach(c => c.setAttribute('stroke-width', 1.4 * u));
      const t = $('.label', g); t.setAttribute('x', 10 * u); t.setAttribute('y', 4 * u);
      t.style.fontSize = (12.5 * u) + 'px'; t.style.strokeWidth = (3 * u) + 'px';
    });
  }
  function markPins() {
    const vis = new Set(visiblePlaces().map(p => p.id));
    globeVis = vis;
    const liveId = state.playing || state.idx >= 0 ? state.queuePlace && state.queuePlace.id : null;
    $$('.pin', svg).forEach(g => {
      const id = g.dataset.id;
      g.classList.toggle('dim', !vis.has(id));
      g.classList.toggle('sel', !!state.place && state.place.id === id);
      g.classList.toggle('live', !!liveId && liveId === id && state.playing);
      const show = (state.place && state.place.id === id) || (liveId === id);
      $('.label', g).textContent = show ? state.byId[id].name : '';
    });
  }
  function setVB(x, y, w) {
    w = Math.max(W / 12, Math.min(W, w));
    const h = w / 2;
    x = Math.max(-w * 0.3, Math.min(W - w * 0.7, x));
    y = Math.max(-h * 0.3, Math.min(H - h * 0.7, y));
    Object.assign(vb, { x, y, w, h });
    svg.setAttribute('viewBox', `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`);
    scalePins();
  }
  function toMap(cx, cy) {
    const r = svg.getBoundingClientRect();
    const s = Math.min(r.width / vb.w, r.height / vb.h);
    const ox = (r.width - vb.w * s) / 2, oy = (r.height - vb.h * s) / 2;
    return [vb.x + (cx - r.left - ox) / s, vb.y + (cy - r.top - oy) / s];
  }
  function zoomAt(factor, cx, cy) {
    const [mx, my] = cx == null ? [vb.x + vb.w / 2, vb.y + vb.h / 2] : toMap(cx, cy);
    const nw = Math.max(W / 12, Math.min(W, vb.w * factor));
    const k = nw / vb.w;
    setVB(mx - (mx - vb.x) * k, my - (my - vb.y) * k, nw);
  }
  let flyRaf = 0;
  function flyTo(lon, lat, zoom = 3) {
    if (view === 'globe') { globeTo(lon, lat, 1.35); return; }
    cancelAnimationFrame(flyRaf);
    const [px, py] = proj(lon, lat);
    const tw = W / zoom, th = tw / 2;
    const from = { ...vb }, to = { x: px - tw / 2, y: py - th / 2, w: tw };
    if (reduced()) { setVB(to.x, to.y, to.w); return; }
    const t0 = performance.now(), D = 800;
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const step = (now) => {
      const t = Math.min(1, (now - t0) / D), e = ease(t);
      setVB(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e, from.w + (to.w - from.w) * e);
      if (t < 1) flyRaf = requestAnimationFrame(step);
    };
    flyRaf = requestAnimationFrame(step);
  }
  function nearestPin(cx, cy) {
    const [mx, my] = toMap(cx, cy);
    const tol = 22 * unitsPerPx();
    const vis = new Set(visiblePlaces().map(p => p.id));
    let best = null, bd = Infinity;
    state.places.forEach(p => {
      const [x, y] = proj(p.lon, p.lat);
      const d = Math.hypot(x - mx, y - my) - (vis.has(p.id) ? 0 : tol * 0.5);
      if (d < bd) { bd = d; best = p; }
    });
    return bd <= tol ? best : null;
  }
  // pointer pan / pinch / tap
  const ptrs = new Map();
  let drag = null;
  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    cancelAnimationFrame(flyRaf);
    drag = { moved: 0, sx: e.clientX, sy: e.clientY, vx: vb.x, vy: vb.y, dist: null, w: vb.w };
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      drag.dist = Math.hypot(a.x - b.x, a.y - b.y); drag.w = vb.w;
      drag.mid = toMap((a.x + b.x) / 2, (a.y + b.y) / 2);
    }
  });
  svg.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) {
      if (e.pointerType === 'mouse') svg.style.cursor = nearestPin(e.clientX, e.clientY) ? 'pointer' : '';
      return;
    }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!drag) return;
    if (ptrs.size >= 2 && drag.dist) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const nw = Math.max(W / 12, Math.min(W, drag.w * drag.dist / d));
      const [mx, my] = drag.mid;
      const r = svg.getBoundingClientRect();
      const s = Math.min(r.width / nw, r.height / (nw / 2));
      const ox = (r.width - nw * s) / 2, oy = (r.height - nw / 2 * s) / 2;
      const midx = (a.x + b.x) / 2 - r.left - ox, midy = (a.y + b.y) / 2 - r.top - oy;
      setVB(mx - midx / s, my - midy / s, nw);
      drag.moved = 99;
      return;
    }
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
    if (drag.moved > 5) {
      svg.classList.add('dragging');
      const u = unitsPerPx();
      setVB(drag.vx - dx * u, drag.vy - dy * u, vb.w);
    }
  });
  const endPtr = (e) => {
    const wasTap = drag && drag.moved <= 6 && ptrs.size === 1;
    ptrs.delete(e.pointerId);
    svg.classList.remove('dragging');
    if (wasTap && e.type === 'pointerup') {
      const p = nearestPin(e.clientX, e.clientY);
      if (p) { openPlace(p.id, { fly: false }); hideHint(); }
    }
    if (ptrs.size === 0) drag = null;
    else if (drag) { const [a] = [...ptrs.values()]; Object.assign(drag, { sx: a.x, sy: a.y, vx: vb.x, vy: vb.y, dist: null }); }
  };
  svg.addEventListener('pointerup', endPtr);
  svg.addEventListener('pointercancel', endPtr);
  svg.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.deltaY > 0 ? 1.18 : 1 / 1.18, e.clientX, e.clientY); }, { passive: false });
  $('#zoomIn').addEventListener('click', () => view === 'globe' ? (G.zoom = clamp(G.zoom * 1.3, 0.6, 3)) : zoomAt(1 / 1.5));
  $('#zoomOut').addEventListener('click', () => view === 'globe' ? (G.zoom = clamp(G.zoom / 1.3, 0.6, 3)) : zoomAt(1.5));
  $('#zoomReset').addEventListener('click', () => { if (view === 'globe') { G.resumeAt = 0; globeTo(G.lon, 20, 1); } else flyTo(0, 0, 1); });
  new ResizeObserver(() => scalePins()).observe(svg);
  function hideHint() { const h = $('#mapHint'); if (h) h.style.opacity = '0'; }

  /* =============== 4b. GLOBE (spinning 3D view) =============== */
  // Orthographic projection of the same land dots as the flat map, drawn on a canvas.
  const gcv = $('#globe'), gx = gcv.getContext('2d');
  const D2R = Math.PI / 180, TAU = Math.PI * 2, SPIN = 7; // SPIN = degrees per second
  let view = store.get('wn-view', 'globe') === 'flat' ? 'flat' : 'globe';
  document.body.dataset.view = view;
  let globeVis = null; // ids passing the current filter (set by markPins)
  const G = { lon: 45, lat: 20, zoom: 1, w: 0, h: 0, cx: 0, cy: 0, R: 0, dpr: 1, dragging: false,
    resumeAt: 0, tween: null, raf: 0, last: 0, n: 0, pts: null, pins: [], colors: null, hover: null };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rgba = (hex, a) => {
    let h = String(hex).replace('#', '').trim(); if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16) || 0; return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
  };
  function readColors() {
    const cs = getComputedStyle(document.documentElement), g = (n) => cs.getPropertyValue(n).trim();
    G.colors = { accent: g('--accent'), live: g('--live'), fg: g('--fg'), bg: g('--bg'), bg2: g('--bg-2'), s2: g('--surface-2') };
  }
  function globePoints() { // [lon, sinLat, cosLat] per land dot, parsed once from map-data.js
    if (G.pts) return G.pts;
    const m = window.WN_MAP, out = [];
    if (m) { const re = /M([\d.]+) ([\d.]+)h0/g; let r;
      while ((r = re.exec(m.d))) { const lat = (90 - +r[2] / m.h * 180) * D2R; out.push((+r[1] / m.w * 360 - 180) * D2R, Math.sin(lat), Math.cos(lat)); } }
    return (G.pts = Float32Array.from(out));
  }
  function sizeGlobe() {
    const r = gcv.getBoundingClientRect(); if (!r.width || !r.height) return;
    G.dpr = Math.min(2, devicePixelRatio || 1); G.w = r.width; G.h = r.height; G.cx = r.width / 2; G.cy = r.height / 2;
    gcv.width = Math.round(r.width * G.dpr); gcv.height = Math.round(r.height * G.dpr);
  }
  new ResizeObserver(sizeGlobe).observe($('#mapWrap'));
  function globeTo(lon, lat, zoom = 1.35, instant = false) {
    const to = { lon: G.lon + ((lon - G.lon + 540) % 360 - 180), lat: clamp(lat, -55, 55), zoom };
    if (instant || reduced()) { Object.assign(G, to); G.tween = null; return; }
    G.tween = { t0: performance.now(), D: 1100, from: { lon: G.lon, lat: G.lat, zoom: G.zoom }, to };
    startGlobe();
  }
  function drawGlobe(now) {
    const { w, h, cx, cy } = G; if (!w || !h) return;
    if (!G.colors || G.n % 30 === 0) readColors();
    G.n++;
    const C = G.colors, R = G.R, still = reduced();
    const sL = Math.sin(G.lat * D2R), cL = Math.cos(G.lat * D2R), lon0 = G.lon * D2R;
    gx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0); gx.clearRect(0, 0, w, h);
    // atmosphere glow, then the ocean sphere
    let g = gx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.3);
    g.addColorStop(0, rgba(C.accent, 0.3)); g.addColorStop(1, rgba(C.accent, 0));
    gx.fillStyle = g; gx.beginPath(); gx.arc(cx, cy, R * 1.3, 0, TAU); gx.fill();
    g = gx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
    g.addColorStop(0, C.s2); g.addColorStop(0.8, C.bg2); g.addColorStop(1, C.bg);
    gx.fillStyle = g; gx.beginPath(); gx.arc(cx, cy, R, 0, TAU); gx.fill();
    gx.lineWidth = 1.5; gx.strokeStyle = rgba(C.accent, 0.45); gx.stroke();
    // graticule (30° lines)
    gx.strokeStyle = rgba(C.accent, 0.1); gx.lineWidth = 1; gx.beginPath();
    const line = (lo, la) => {
      const lr = lo * D2R - lon0, sla = Math.sin(la * D2R), cla = Math.cos(la * D2R), cd = Math.cos(lr);
      return sL * sla + cL * cla * cd > 0 ? [cx + R * cla * Math.sin(lr), cy - R * (cL * sla - sL * cla * cd)] : null;
    };
    for (let lo = -180; lo < 180; lo += 30) { let pen = false;
      for (let la = -90; la <= 90; la += 5) { const q = line(lo, la); if (!q) { pen = false; continue; } pen ? gx.lineTo(q[0], q[1]) : gx.moveTo(q[0], q[1]); pen = true; } }
    for (let la = -60; la <= 60; la += 30) { let pen = false;
      for (let lo = -180; lo <= 180; lo += 5) { const q = line(lo, la); if (!q) { pen = false; continue; } pen ? gx.lineTo(q[0], q[1]) : gx.moveTo(q[0], q[1]); pen = true; } }
    gx.stroke();
    // land dots, brighter and larger toward the centre
    const P = globePoints(), paths = [new Path2D(), new Path2D(), new Path2D(), new Path2D()], base = R * 0.0088;
    for (let i = 0; i < P.length; i += 3) {
      const lr = P[i] - lon0, sla = P[i + 1], cla = P[i + 2], cd = Math.cos(lr), c = sL * sla + cL * cla * cd;
      if (c <= 0.02) continue;
      const x = cx + R * cla * Math.sin(lr), y = cy - R * (cL * sla - sL * cla * cd), r = base * (0.4 + 0.6 * c);
      const pa = paths[c < 0.2 ? 0 : c < 0.45 ? 1 : c < 0.75 ? 2 : 3]; pa.moveTo(x + r, y); pa.arc(x, y, r, 0, TAU);
    }
    gx.fillStyle = C.accent;
    [0.2, 0.34, 0.52, 0.75].forEach((a, i) => { gx.globalAlpha = a; gx.fill(paths[i]); });
    gx.globalAlpha = 1;
    // edge shading for depth
    g = gx.createRadialGradient(cx - R * 0.25, cy - R * 0.3, R * 0.45, cx, cy, R);
    g.addColorStop(0, rgba(C.bg, 0)); g.addColorStop(1, rgba(C.bg, 0.5));
    gx.fillStyle = g; gx.beginPath(); gx.arc(cx, cy, R, 0, TAU); gx.fill();
    // location spots
    const pins = [], labels = [], liveId = state.playing && state.queuePlace ? state.queuePlace.id : null;
    state.places.forEach((p, i) => {
      const sla = Math.sin(p.lat * D2R), cla = Math.cos(p.lat * D2R), lr = p.lon * D2R - lon0, cd = Math.cos(lr), c = sL * sla + cL * cla * cd;
      if (c <= 0.03) return;
      const x = cx + R * cla * Math.sin(lr), y = cy - R * (cL * sla - sL * cla * cd);
      const vis = !globeVis || globeVis.has(p.id), isSel = !!state.place && state.place.id === p.id, isLive = liveId === p.id;
      const col = isLive ? C.live : C.accent;
      pins.push({ p, x, y, c, vis });
      gx.globalAlpha = Math.min(1, c * 4) * (vis ? 1 : 0.22);
      g = gx.createRadialGradient(x, y, 0, x, y, 16); g.addColorStop(0, rgba(col, 0.55)); g.addColorStop(1, rgba(col, 0));
      gx.fillStyle = g; gx.beginPath(); gx.arc(x, y, 16, 0, TAU); gx.fill();
      if (vis && !still) {
        const rings = isLive ? 2 : 1, speed = isLive ? 1400 : 2800;
        for (let k = 0; k < rings; k++) {
          const ph = (now / speed + i * 0.37 + k / rings) % 1;
          gx.strokeStyle = rgba(col, (1 - ph) * (isLive ? 0.8 : 0.45)); gx.lineWidth = 1.5;
          gx.beginPath(); gx.arc(x, y, 5 + ph * (isLive ? 20 : 13), 0, TAU); gx.stroke();
        }
      }
      gx.fillStyle = isLive ? C.live : C.fg; gx.strokeStyle = col; gx.lineWidth = 2.4;
      gx.beginPath(); gx.arc(x, y, isSel || isLive ? 6 : 4.6, 0, TAU); gx.fill(); gx.stroke();
      if (isSel) { gx.strokeStyle = C.fg; gx.lineWidth = 1.5; gx.beginPath(); gx.arc(x, y, 11, 0, TAU); gx.stroke(); }
      if ((isSel || isLive || G.hover === p.id) && c > 0.15) labels.push({ p, x, y });
    });
    gx.globalAlpha = 1; G.pins = pins;
    gx.font = '600 13px "DM Sans", system-ui, sans-serif'; gx.textBaseline = 'middle'; gx.lineJoin = 'round';
    labels.forEach(({ p, x, y }) => {
      const left = x + 12 + gx.measureText(p.name).width > w - 6, lx = left ? x - 12 : x + 12;
      gx.textAlign = left ? 'right' : 'left'; gx.lineWidth = 4; gx.strokeStyle = C.bg; gx.strokeText(p.name, lx, y);
      gx.fillStyle = C.fg; gx.fillText(p.name, lx, y);
    });
  }
  function globeFrame(now) {
    G.raf = 0;
    if (view !== 'globe' || document.hidden) return;
    const dt = Math.min(0.05, G.last ? (now - G.last) / 1000 : 0.016); G.last = now;
    if (G.tween) {
      const tw = G.tween, t = Math.min(1, (now - tw.t0) / tw.D), e = 1 - Math.pow(1 - t, 3);
      G.lon = tw.from.lon + (tw.to.lon - tw.from.lon) * e; G.lat = tw.from.lat + (tw.to.lat - tw.from.lat) * e; G.zoom = tw.from.zoom + (tw.to.zoom - tw.from.zoom) * e;
      if (t >= 1) G.tween = null;
    } else {
      if (!G.dragging && !state.place && now >= G.resumeAt && !reduced()) G.lon += SPIN * dt; // the spin
      if (G.lon > 180) G.lon -= 360; else if (G.lon < -180) G.lon += 360;
    }
    G.R = Math.min(G.w, G.h) * 0.44 * G.zoom;
    drawGlobe(now);
    G.raf = requestAnimationFrame(globeFrame);
  }
  function startGlobe() { if (!G.raf && view === 'globe') { G.last = 0; G.raf = requestAnimationFrame(globeFrame); } }
  document.addEventListener('visibilitychange', startGlobe);
  // drag to turn, pinch / wheel to zoom, tap a spot to open it
  const gp = new Map(); let gd = null;
  const gPick = (cx, cy) => {
    const r = gcv.getBoundingClientRect(), x = cx - r.left, y = cy - r.top; let best = null, bd = 24;
    G.pins.forEach(o => { const d = Math.hypot(o.x - x, o.y - y) - (o.vis ? 0 : 10); if (d < bd) { bd = d; best = o.p; } });
    return best;
  };
  gcv.addEventListener('pointerdown', (e) => {
    gcv.setPointerCapture(e.pointerId); gp.set(e.pointerId, { x: e.clientX, y: e.clientY });
    G.tween = null; G.dragging = true;
    gd = { moved: 0, sx: e.clientX, sy: e.clientY, lon: G.lon, lat: G.lat, zoom: G.zoom, dist: null };
    if (gp.size === 2) { const [a, b] = [...gp.values()]; gd.dist = Math.hypot(a.x - b.x, a.y - b.y); gd.moved = 99; }
  });
  gcv.addEventListener('pointermove', (e) => {
    if (!gp.has(e.pointerId)) {
      if (e.pointerType === 'mouse') { const p = gPick(e.clientX, e.clientY); gcv.style.cursor = p ? 'pointer' : ''; G.hover = p ? p.id : null; }
      return;
    }
    gp.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gd) return;
    if (gp.size >= 2 && gd.dist) { const [a, b] = [...gp.values()]; G.zoom = clamp(gd.zoom * Math.hypot(a.x - b.x, a.y - b.y) / gd.dist, 0.6, 3); return; }
    const dx = e.clientX - gd.sx, dy = e.clientY - gd.sy;
    gd.moved = Math.max(gd.moved, Math.hypot(dx, dy));
    if (gd.moved > 5) {
      gcv.classList.add('dragging');
      const k = 1 / Math.max(G.R, 1) / D2R; // degrees per pixel at the centre of the globe
      G.lon = gd.lon - dx * k; G.lat = clamp(gd.lat + dy * k, -80, 80);
    }
  });
  const gEnd = (e) => {
    const tap = gd && gd.moved <= 6 && gp.size === 1 && e.type === 'pointerup';
    gp.delete(e.pointerId); gcv.classList.remove('dragging');
    if (tap) { const p = gPick(e.clientX, e.clientY); if (p) { hideHint(); openPlace(p.id); } }
    if (gp.size === 0) { gd = null; G.dragging = false; G.resumeAt = performance.now() + 2500; }
    else if (gd) { const [a] = [...gp.values()]; Object.assign(gd, { sx: a.x, sy: a.y, lon: G.lon, lat: G.lat, zoom: G.zoom, dist: null, moved: 99 }); }
  };
  gcv.addEventListener('pointerup', gEnd); gcv.addEventListener('pointercancel', gEnd);
  gcv.addEventListener('pointerleave', () => { G.hover = null; });
  gcv.addEventListener('wheel', (e) => { e.preventDefault(); G.zoom = clamp(G.zoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.6, 3); }, { passive: false });
  function setView(v) {
    view = v; store.set('wn-view', v); document.body.dataset.view = v;
    const globe = v === 'globe', lbl = globe ? 'Switch to flat map' : 'Switch to spinning globe';
    $('#viewIcon').setAttribute('href', globe ? '#i-map' : '#i-globe');
    $('#viewBtn').setAttribute('aria-label', lbl); $('#viewBtn').title = lbl;
    $('#zoomReset').setAttribute('aria-label', globe ? 'Re-centre the globe' : 'Show the whole world');
    $('#mapHint').textContent = globe ? 'Drag to spin the globe · tap a glowing dot' : 'Tap a glowing dot to travel there by ear';
    if (globe) { sizeGlobe(); readColors(); if (state.place) globeTo(state.place.lon, state.place.lat, 1.35, true); startGlobe(); }
    else { cancelAnimationFrame(G.raf); G.raf = 0; if (state.place) flyTo(state.place.lon, state.place.lat, 3.2); else setVB(0, 0, W); scalePins(); }
  }
  $('#viewBtn').addEventListener('click', () => { setView(view === 'globe' ? 'flat' : 'globe'); toast(view === 'globe' ? 'Spinning globe' : 'Flat map', 1300); });

  /* =============== 5. LIST =============== */
  function visiblePlaces() {
    const q = state.q.trim().toLowerCase();
    return state.places.filter(p => {
      if (state.cat === 'saved' && !state.saved.has(p.id)) return false;
      if (state.cat !== 'all' && state.cat !== 'saved' && p.cat !== state.cat) return false;
      if (!q) return true;
      return [p.name, p.country, p.blurb, CATS[p.cat] && CATS[p.cat].label, ...(p.q || [])].join(' ').toLowerCase().includes(q);
    });
  }
  function renderChips() {
    const count = (k) => k === 'all' ? state.places.length : k === 'saved' ? state.saved.size : state.places.filter(p => p.cat === k).length;
    $('#chips').innerHTML = Object.keys(CATS).filter(k => k === 'all' || k === 'saved' || count(k)).map(k =>
      `<button class="chip" role="tab" data-cat="${k}" aria-selected="${state.cat === k}">${CATS[k].emoji} ${CATS[k].label} <span class="n">${count(k)}</span></button>`
    ).join('');
  }
  function renderList() {
    const list = visiblePlaces();
    const liveId = state.playing && state.queuePlace ? state.queuePlace.id : null;
    $('#placeList').innerHTML = list.length ? list.map(p => `
      <li><button class="place-row${liveId === p.id ? ' live' : ''}" data-id="${p.id}">
        <span class="p-badge" aria-hidden="true">${CATS[p.cat] ? CATS[p.cat].emoji : '🎧'}</span>
        <span><b>${esc(p.name)}${state.saved.has(p.id) ? ' <span class="star" aria-label="saved">★</span>' : ''}</b><small>${esc(p.country)} · ${esc(p.blurb)}</small></span>
        <span class="coords">${liveId === p.id ? '<span style="color:var(--live)">ON AIR</span><br>' : ''}${fmtCoord(p.lat, p.lon)}</span>
      </button></li>`).join('')
      : `<li class="empty">${state.cat === 'saved' ? 'No saved places yet. Open a place and tap ☆ to save it.' : 'No places match. Try another word.'}</li>`;
    markPins();
  }
  $('#chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    state.cat = b.dataset.cat; store.set('wn-cat', state.cat);
    renderChips(); renderList();
  });
  $('#q').addEventListener('input', (e) => { state.q = e.target.value; renderList(); });
  $('#placeList').addEventListener('click', (e) => {
    const b = e.target.closest('.place-row'); if (b) openPlace(b.dataset.id);
  });

  /* =============== 6. PLACE VIEW =============== */
  let recToken = 0;
  function showView(name) {
    $('#viewList').hidden = name !== 'list';
    $('#viewPlace').hidden = name !== 'place';
    $('#panel').scrollTop = 0;
  }
  function openPlace(id, opts = {}) {
    const p = state.byId[id]; if (!p) return;
    state.place = p;
    $('#pCat').textContent = `${CATS[p.cat] ? CATS[p.cat].emoji + ' ' + CATS[p.cat].label : ''} · ${fmtCoord(p.lat, p.lon)}`;
    $('#pName').textContent = p.name;
    $('#pWhere').textContent = p.country;
    $('#pBlurb').textContent = p.blurb;
    syncSaveBtn();
    renderHero(p);
    showView('place');
    if (opts.fly !== false) flyTo(p.lon, p.lat, 3.2);
    if (location.hash !== '#place=' + id) history.replaceState(null, '', '#place=' + id);
    markPins();
    if (isMobile() && document.body.classList.contains('map-big')) setSheet('');
    return loadRecs(p, { autoplay: opts.autoplay });
  }
  async function loadRecs(p, { fresh = false, autoplay = false } = {}) {
    const tok = ++recToken;
    state.recs = []; state.recOffset = 0; state.recMore = false;
    $('#moreBtn').hidden = true;
    $('#recStatus').className = 'status';
    $('#recStatus').textContent = 'Listening around the world for recordings…';
    $('#recList').innerHTML = '<li class="skel"></li><li class="skel"></li><li class="skel"></li>';
    try {
      const r = await WNSounds.forPlace(p, { fresh });
      if (tok !== recToken) return;
      state.recs = r.items; state.recOffset = r.offset; state.recMore = r.more;
      renderRecs();
      updateCounter();
      if (autoplay && state.recs.length) playFrom(p, state.recs, 0);
    } catch (err) {
      if (tok !== recToken) return;
      $('#recList').innerHTML = '';
      $('#recStatus').className = 'status err';
      $('#recStatus').textContent = err.message || 'Could not load recordings.';
    }
  }
  function renderRecs() {
    const p = state.place;
    const n = state.recs.length;
    $('#recStatus').textContent = n ? `${n} real recording${n === 1 ? '' : 's'} from Wikimedia Commons` : 'No free recordings found for this place yet. Try Refresh, or add search words in data/places.json.';
    const playingHere = state.queuePlace && p && state.queuePlace.id === p.id;
    $('#recList').innerHTML = state.recs.map((it, i) => {
      const on = playingHere && state.queue[state.idx] && state.queue[state.idx].id === it.id;
      return `<li class="rec${on ? ' playing' : ''}" data-i="${i}">
        <button class="rp" data-act="play" aria-label="${on && state.playing ? 'Pause' : 'Play'} ${esc(it.title)}">${ico(on && state.playing ? 'i-pause' : 'i-play')}</button>
        <div><b>${esc(it.title)}</b><small>by ${esc(it.author)}</small></div>
        <div class="dur"><span class="lic">${esc(it.license)}</span><br>${it.duration ? fmtTime(it.duration) : ''}</div>
      </li>`;
    }).join('');
    $('#moreBtn').hidden = !state.recMore;
  }
  $('#recList').addEventListener('click', (e) => {
    const li = e.target.closest('.rec'); if (!li) return;
    const i = +li.dataset.i;
    const it = state.recs[i];
    const cur = state.queue[state.idx];
    if (cur && it && cur.id === it.id) { togglePlay(); return; }
    playFrom(state.place, state.recs, i);
  });
  $('#moreBtn').addEventListener('click', async () => {
    const p = state.place; if (!p) return;
    const b = $('#moreBtn'); b.disabled = true; b.textContent = 'Searching…';
    try {
      const r = await WNSounds.forPlace(p, { offset: state.recOffset });
      const have = new Set(state.recs.map(x => x.id));
      const add = r.items.filter(x => !have.has(x.id));
      state.recs = state.recs.concat(add); state.recOffset = r.offset; state.recMore = r.more && add.length > 0;
      WNSounds.save(p.id, { t: Date.now(), items: state.recs, offset: state.recOffset, more: state.recMore });
      if (state.queuePlace && state.queuePlace.id === p.id) state.queue = state.recs;
      renderRecs(); updateCounter();
      toast(add.length ? `${add.length} more recordings` : 'No more recordings found');
    } catch (err) { toast('Could not load more'); }
    b.disabled = false; b.textContent = 'Find more recordings';
  });
  $('#refreshBtn').addEventListener('click', () => state.place && loadRecs(state.place, { fresh: true }));
  $('#playPlace').addEventListener('click', () => {
    const p = state.place; if (!p) return;
    if (state.recs.length) playFrom(p, state.recs, 0);
    else loadRecs(p, { autoplay: true });
  });
  $('#backBtn').addEventListener('click', () => {
    state.place = null; closeStage(); showView('list'); renderList();
    history.replaceState(null, '', location.pathname + location.search);
  });
  function syncSaveBtn() {
    const on = !!state.place && state.saved.has(state.place.id);
    const b = $('#savePlace');
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', on ? 'Remove from saved places' : 'Save this place');
  }
  $('#savePlace').addEventListener('click', () => {
    const p = state.place; if (!p) return;
    if (state.saved.has(p.id)) { state.saved.delete(p.id); toast('Removed from Saved'); }
    else { state.saved.add(p.id); toast('Saved ★'); }
    store.set('wn-saved', [...state.saved]);
    syncSaveBtn(); renderChips();
  });
  $('#randomBtn').addEventListener('click', () => {
    const pool = visiblePlaces().length ? visiblePlaces() : state.places;
    const choices = pool.filter(p => !state.queuePlace || p.id !== state.queuePlace.id);
    const p = (choices.length ? choices : pool)[Math.floor(Math.random() * (choices.length || pool.length))];
    toast(`✈ Travelling to ${p.name}…`);
    hideHint();
    openPlace(p.id, { autoplay: true });
  });

  /* =============== 6b. PLACE PICTURE (animated scene + real photos) =============== */
  // Every place gets a moving illustration drawn in code for its kind of place (SVG, varied per place by a seeded
  // random generator). Real photos from Wikimedia Commons (photos.js) fade in over it with Ken Burns motion and a credit.
  state.photos = [];
  let sceneUid = 0, sceneTop = 0, heroScene = null, stageScene = null, sceneTok = 0; // sceneTop < 0 when the picture is taller than 2:1 (sky is extended upward)
  const R1 = (v) => Math.round(v * 10) / 10;
  const rng = (seed) => { // string → repeatable random numbers (mulberry32)
    let h = 1779033703 ^ seed.length;
    for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
    let t = h >>> 0;
    return () => { t = t + 0x6D2B79F5 | 0; let x = Math.imul(t ^ t >>> 15, 1 | t); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; };
  };
  const sky = (u, a, b, c) => `<defs><linearGradient id="sk${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".62" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient></defs><rect y="${sceneTop}" width="400" height="${200 - sceneTop}" fill="url(#sk${u})"/>`;
  // n small circles with a class (animation), random place, size and speed
  const dots = (r, n, y0, y1, cls, fill, rmin, rmax, op, dmin, dmax) => {
    if (sceneTop < 0 && ((cls === 'tw' && y0 <= 4) || cls === 'snow')) { n = Math.round(n * (y1 - sceneTop) / (y1 - y0)); y0 = sceneTop; } // stars and snow fill the taller sky
    return Array.from({ length: n }, () =>
      `<circle class="${cls}" cx="${R1(r() * 400)}" cy="${R1(y0 + r() * (y1 - y0))}" r="${R1(rmin + r() * (rmax - rmin))}" fill="${fill}" opacity="${op}" style="animation-delay:${R1(-r() * dmax)}s;animation-duration:${R1(dmin + r() * (dmax - dmin))}s"/>`).join('');
  };
  const ridge = (r, y, amp, fill, steps) => { let d = `M0 200V${R1(y)}`; for (let i = 0; i <= steps; i++) d += `L${R1(i * 400 / steps)} ${R1(y - r() * amp)}`; return `<path d="${d}V200Z" fill="${fill}"/>`; };
  const dune = (r, y, amp, fill) => `<path d="M0 200V${R1(y)}C90 ${R1(y - amp * r())} 170 ${R1(y + amp * .5 * r())} 250 ${R1(y - amp * .6 * r())}S360 ${R1(y + amp * .4)} 400 ${R1(y - amp * .3 * r())}V200Z" fill="${fill}"/>`;
  const wave = (y, amp, fill, dur, rev) => `<path class="wv" style="animation-duration:${dur}s;${rev ? 'animation-direction:reverse;' : ''}" d="M-100 ${y}${('q25 ' + (-amp) + ' 50 0t50 0').repeat(12)}V200H-100Z" fill="${fill}"/>`;
  const tree = (r, x, base, h, fill, conifer) => {
    const w = h * (conifer ? .32 : .42), o = `style="transform-origin:${R1(x)}px ${base}px;animation-delay:${R1(-r() * 5)}s"`;
    return conifer
      ? `<g class="sw" ${o} fill="${fill}"><path d="M${R1(x - w)} ${base}L${R1(x)} ${R1(base - h)}L${R1(x + w)} ${base}Z"/><path d="M${R1(x - w * .8)} ${R1(base - h * .35)}L${R1(x)} ${R1(base - h * 1.05)}L${R1(x + w * .8)} ${R1(base - h * .35)}Z"/></g>`
      : `<g class="sw" ${o} fill="${fill}"><rect x="${R1(x - 1.2)}" y="${R1(base - h * .6)}" width="2.4" height="${R1(h * .6)}"/><ellipse cx="${R1(x)}" cy="${R1(base - h * .72)}" rx="${R1(w)}" ry="${R1(h * .3)}"/><ellipse cx="${R1(x - w * .5)}" cy="${R1(base - h * .6)}" rx="${R1(w * .6)}" ry="${R1(h * .2)}"/></g>`;
  };
  const glowSun = (cx, cy, r0, glow, core, op) => `<circle class="pulse" cx="${cx}" cy="${cy}" r="${r0 * 1.7}" fill="${glow}" opacity="${op}" style="transform-origin:${cx}px ${cy}px"/><circle cx="${cx}" cy="${cy}" r="${r0}" fill="${core}"/>`;

  const SCENES = {
    forest(r, u, p) {
      const con = p.id === 'black-forest', sx = R1(110 + r() * 180);
      let s = sky(u, '#071a22', '#16473e', '#8fc19a') + glowSun(sx, 64, 26, '#fff3b0', '#fffbe0', .22);
      s += ridge(r, 128, 26, '#0f3a30', 14);
      s += '<ellipse class="dr slow" cx="0" cy="118" rx="90" ry="9" fill="#fff" opacity=".1"/><ellipse class="dr" style="animation-delay:-20s" cx="0" cy="136" rx="120" ry="11" fill="#fff" opacity=".08"/>';
      for (let i = 0; i < 11; i++) s += tree(r, 12 + i * 37 + r() * 14, 158 + r() * 8, 42 + r() * 24, '#0a2b22', con);
      for (let i = 0; i < 8; i++) s += tree(r, 20 + i * 52 + r() * 20, 200, 78 + r() * 42, '#04150f', con);
      return s + dots(r, 16, 90, 185, 'ff', '#eaff96', 1, 2, .9, 5, 9);
    },
    wildlife(r, u) {
      const sx = R1(220 + r() * 100), dark = '#0c0502';
      let s = sky(u, '#24103a', '#d4561f', '#ffc15e') + glowSun(sx, 128, 28, '#ffe9a8', '#fff0c2', .3) + ridge(r, 170, 8, '#2b1306', 20);
      for (let i = 0; i < 3; i++) { const x = R1(40 + i * 130 + r() * 50), h = 34 + r() * 22; s += `<g class="sw" style="transform-origin:${x}px 176px;animation-duration:7s"><path d="M${x} 176V${R1(176 - h)}" stroke="#120803" stroke-width="2.4" fill="none"/><ellipse cx="${x}" cy="${R1(176 - h)}" rx="${R1(24 + r() * 14)}" ry="7" fill="#120803"/></g>`; }
      s += '<g class="dr slow" style="animation-duration:90s;animation-delay:-30s">' + Array.from({ length: 5 }, (_, i) => `<g transform="translate(${i * 22} ${178 + (i % 2) * 3})"><ellipse rx="7" ry="3.6" fill="${dark}"/><circle cx="8" cy="-1" r="2.2" fill="${dark}"/><path d="M-4 2v6M-1 2v6M3 2v6M6 2v6" stroke="${dark}" stroke-width="1.2"/></g>`).join('') + '</g>';
      for (let i = 0; i < 44; i++) { const x = R1(r() * 400); s += `<path class="sw" d="M${x} 200q1-8 3-12" stroke="#1d0d04" stroke-width="1.1" fill="none" style="transform-origin:${x}px 200px;animation-delay:${R1(-r() * 5)}s"/>`; }
      for (let i = 0; i < 3; i++) s += `<path class="dr" d="M0 ${R1(36 + r() * 36)}q4-4 8 0q4-4 8 0" stroke="#1a0a14" stroke-width="1.4" fill="none" style="animation-duration:${R1(22 + r() * 12)}s;animation-delay:${R1(-r() * 30)}s"/>`;
      return s;
    },
    water(r, u) {
      const mx = R1(90 + r() * 220);
      return sky(u, '#06142c', '#0f4c75', '#7fd1e8') + dots(r, 18, 4, 70, 'tw', '#fff', .5, 1.2, .8, 3, 7) + glowSun(mx, 62, 16, '#dff6ff', '#f4fbff', .22)
        + wave(116, 5, '#0f6a96', 11) + wave(134, 7, '#0b5483', 8, true) + wave(154, 9, '#083d66', 6) + wave(176, 11, '#052b4a', 9, true)
        + dots(r, 20, 120, 195, 'rs', '#bfeaff', .8, 1.8, .55, 8, 16);
    },
    city(r, u) {
      let s = sky(u, '#070b1f', '#2a1b55', '#ff7a59') + dots(r, 22, 4, 80, 'tw', '#fff', .5, 1, .8, 3, 7) + `<circle cx="${R1(300 + r() * 70)}" cy="46" r="13" fill="#fff4dc" opacity=".9"/>`;
      const bld = (n, y0, hmin, hmax, fill, win) => { let t = '', x = -6; for (let i = 0; i < n; i++) { const w = 20 + r() * 22, h = hmin + r() * (hmax - hmin); t += `<rect x="${R1(x)}" y="${R1(y0 - h)}" width="${R1(w)}" height="${R1(h)}" fill="${fill}"/>`; if (win) for (let k = 0; k < w * h / 150; k++) t += `<rect class="tw" x="${R1(x + 3 + r() * (w - 7))}" y="${R1(y0 - h + 4 + r() * (h - 10))}" width="2" height="2.6" fill="#ffd479" style="animation-delay:${R1(-r() * 9)}s;animation-duration:${R1(4 + r() * 8)}s"/>`; x += w + 2 + r() * 4; } return t; };
      s += bld(11, 190, 40, 90, '#141a3a', false) + bld(10, 196, 30, 100, '#090c1c', true) + '<rect y="190" width="400" height="10" fill="#04060e"/>';
      return s + [0, 1, 2].map(i => `<g class="car" style="animation-delay:${-i * 3}s;animation-duration:${7 + i * 2}s"><circle cx="0" cy="194" r="1.6" fill="#fff6c8"/><circle cx="-7" cy="194" r="1.4" fill="#ff5a5a"/></g>`).join('');
    },
    weather(r, u) {
      let s = sky(u, '#080b18', '#1e2745', '#46547a');
      for (let i = 0; i < 5; i++) s += `<g class="dr" style="animation-duration:${R1(30 + r() * 40)}s;animation-delay:${R1(-r() * 50)}s" fill="#121830" opacity="${R1(.7 + r() * .3)}"><ellipse cx="0" cy="${18 + i * 14}" rx="${R1(60 + r() * 40)}" ry="${R1(12 + r() * 8)}"/><ellipse cx="30" cy="${10 + i * 14}" rx="${R1(40 + r() * 30)}" ry="${R1(12 + r() * 8)}"/></g>`;
      const lx = R1(90 + r() * 220);
      s += `<rect class="fa2" width="400" height="200" fill="#cfe0ff" opacity="0"/><path class="fa" d="M${lx} 40l-12 46h10l-14 58 30-70h-12l14-34z" fill="#fff" opacity="0"/>`;
      for (let i = 0, nr = Math.round(70 * (200 - sceneTop) / 200); i < nr; i++) { const x = R1(r() * 420), y = R1(sceneTop + r() * (200 - sceneTop)); s += `<line class="fl" x1="${x}" y1="${y}" x2="${R1(x - 3)}" y2="${R1(y + 13)}" stroke="#a9c2ff" stroke-width=".9" opacity=".5" style="animation-delay:${R1(-r() * 1.2)}s;animation-duration:${R1(.7 + r() * .6)}s"/>`; }
      return s + ridge(r, 184, 8, '#05070e', 18);
    },
    mountain(r, u) {
      const peaks = (n, base, hmin, hmax, fill, cap) => { let t = ''; for (let i = 0; i < n; i++) { const x = R1((i + .2 + r() * .6) * 400 / n), h = hmin + r() * (hmax - hmin), w = h * 1.05; t += `<path d="M${R1(x - w)} ${base}L${x} ${R1(base - h)}L${R1(x + w)} ${base}Z" fill="${fill}"/><path d="M${R1(x - w * .26)} ${R1(base - h * .74)}L${x} ${R1(base - h)}L${R1(x + w * .26)} ${R1(base - h * .74)}L${R1(x + w * .1)} ${R1(base - h * .66)}L${x} ${R1(base - h * .74)}L${R1(x - w * .1)} ${R1(base - h * .66)}Z" fill="${cap}"/>`; } return t; };
      let s = sky(u, '#0b1236', '#3a4a96', '#f3a7a0') + dots(r, 16, 4, 70, 'tw', '#fff', .5, 1, .8, 3, 7) + '<path class="shoot" d="M300 20l-26 9" stroke="#fff" stroke-width="1.2" stroke-linecap="round" fill="none"/>';
      s += peaks(5, 150, 60, 100, '#2b3566', '#eef2ff') + peaks(4, 182, 70, 110, '#171f4a', '#d8e0ff');
      for (let i = 0; i < 3; i++) s += `<ellipse class="dr" cx="0" cy="${R1(96 + i * 22 + r() * 8)}" rx="${R1(50 + r() * 30)}" ry="7" fill="#fff" opacity=".16" style="animation-duration:${R1(50 + r() * 40)}s;animation-delay:${R1(-r() * 60)}s"/>`;
      return s + ridge(r, 192, 10, '#0a0f2a', 16);
    },
    ice(r, u, p) {
      let s = sky(u, '#030b18', '#0a3040', '#0d5a63') + dots(r, 34, 4, 100, 'tw', '#fff', .5, 1.1, .85, 3, 7);
      s += `<defs><filter id="bl${u}"><feGaussianBlur stdDeviation="5"/></filter><linearGradient id="au${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5cffc4" stop-opacity="0"/><stop offset=".35" stop-color="#5cffc4" stop-opacity=".7"/><stop offset="1" stop-color="#7a8cff" stop-opacity="0"/></linearGradient></defs>`;
      for (let i = 0; i < 3; i++) { const x = R1(40 + i * 120 + r() * 40); s += `<path class="aur" filter="url(#bl${u})" style="animation-duration:${R1(9 + i * 3)}s;animation-delay:${R1(-i * 3)}s" d="M${x} 10C${x + 40} 40 ${x - 30} 80 ${x + 20} 150L${x + 60} 150C${x + 20} 80 ${x + 80} 40 ${x + 50} 10Z" fill="url(#au${u})"/>`; }
      s += ridge(r, 166, 6, '#dff3ff', 14);
      for (let i = 0; i < 3; i++) { const x = R1(30 + i * 140 + r() * 60), h = 24 + r() * 26; s += `<path d="M${x} 170L${R1(x + 10)} ${R1(170 - h)}L${R1(x + 22)} ${R1(170 - h * .6)}L${R1(x + 34)} ${R1(170 - h * .95)}L${R1(x + 52)} 170Z" fill="#eaf8ff"/><path d="M${R1(x + 22)} ${R1(170 - h * .6)}L${R1(x + 34)} ${R1(170 - h * .95)}L${R1(x + 52)} 170L${R1(x + 30)} 170Z" fill="#a8d4ee"/>`; }
      if (p.id === 'antarctica') for (let i = 0; i < 4; i++) { const x = R1(60 + i * 80 + r() * 30); s += `<g class="sw" style="transform-origin:${x}px 182px;animation-delay:${R1(-r() * 5)}s"><ellipse cx="${x}" cy="174" rx="5" ry="9" fill="#0a0f18"/><ellipse cx="${R1(x + .8)}" cy="176" rx="3" ry="6.5" fill="#fff"/><path d="M${R1(x + 4)} 168l4 1.6-4 1.2z" fill="#ff9d3a"/></g>`; }
      return s + dots(r, 40, -10, 200, 'snow', '#fff', .8, 1.8, .85, 7, 14);
    },
    desert(r, u) {
      const sx = R1(120 + r() * 160), camel = (x, y) => `<g transform="translate(${x} ${y})" stroke-width="1.2"><ellipse cx="0" cy="-8" rx="9" ry="4.2"/><ellipse cx="-2" cy="-13" rx="3" ry="3"/><path d="M8-9L13-17" stroke-width="2.4" stroke-linecap="round" fill="none"/><ellipse cx="14.5" cy="-18" rx="3.2" ry="1.9"/><path d="M-6-5v8M-3-5v8M3-5v8M6-5v8" fill="none"/></g>`;
      let s = sky(u, '#220b36', '#d9482b', '#ffc872') + glowSun(sx, 108, 32, '#ffe3a0', '#fff0b5', .28);
      s += dune(r, 130, 24, '#8a3315') + dune(r, 152, 28, '#b04a1d');
      s += `<g class="dr slow" style="animation-duration:80s;animation-delay:-25s" fill="#1a0a08" stroke="#1a0a08">${[0, 1, 2].map(i => camel(i * 28, 156)).join('')}</g>`;
      return s + dune(r, 176, 24, '#cf6a2a') + dots(r, 26, 110, 195, 'dr', '#ffd9a0', .6, 1.3, .5, 8, 18);
    },
    culture(r, u) {
      const mx = R1(60 + r() * 100), px = R1(250 + r() * 60);
      let s = sky(u, '#140a28', '#5a2a6b', '#f59e6b') + dots(r, 16, 4, 70, 'tw', '#fff', .5, 1, .8, 3, 7) + glowSun(mx, 50, 22, '#fff1d6', '#fff1d6', .16) + ridge(r, 150, 30, '#2a1244', 12);
      let g = '';
      for (let k = 0; k < 5; k++) { const y = 176 - k * 22, w = 46 - k * 7; g += `<path d="M${px - w} ${y}Q${px} ${y - 14} ${px + w} ${y}L${px + w - 6} ${y - 4}L${px - w + 6} ${y - 4}Z"/><rect x="${R1(px - w * .55)}" y="${y - 20}" width="${R1(w * 1.1)}" height="16"/>`; }
      s += `<g fill="#10061c"><path d="M${px} 68V44" stroke="#10061c" stroke-width="2"/>${g}</g>` + ridge(r, 190, 6, '#0b0416', 20);
      for (let i = 0; i < 14; i++) { const x = R1(r() * 400); s += `<g class="rs" style="animation-delay:${R1(-r() * 20)}s;animation-duration:${R1(12 + r() * 10)}s"><circle cx="${x}" cy="200" r="7" fill="#ffb84d" opacity=".25"/><ellipse cx="${x}" cy="200" rx="2.6" ry="3.4" fill="#ffb84d"/></g>`; }
      return s + dots(r, 14, -10, 200, 'snow', '#ffc4d6', 1, 2, .7, 9, 16);
    }
  };
  // aspect = width / height of the box. Wide boxes show the whole 400×200 scene; tall boxes (phones) zoom in a little
  // and get extra sky above, so the landscape stays visible instead of being cropped to a few trees.
  function sceneSVG(p, aspect) {
    const u = ++sceneUid, a = aspect > 0 && isFinite(aspect) ? aspect : 2, vw = a < 1 ? 267 : 400;
    const N = Math.min(420, Math.max(0, Math.round(vw / a - 200))), vh = 200 + N, make = SCENES[p.cat] || SCENES.forest;
    sceneTop = -N;
    const svg = `<svg viewBox="${R1((400 - vw) / 2)} ${-N} ${vw} ${vh}" preserveAspectRatio="xMidYMax slice" style="--fall:${vh + 50}px;--rise:${-(vh + 60)}px" aria-hidden="true" focusable="false">${make(rng(p.id), u, p)}</svg>`;
    sceneTop = 0;
    return svg;
  }

  /** Puts the animated scene into a box (.s-art, .s-photos, .s-credit) and returns a handle for the photo slideshow. */
  function mountScene(box, place, onShow) {
    const art = $('.s-art', box), ph = $('.s-photos', box), cr = $('.s-credit', box);
    art.innerHTML = sceneSVG(place, box.clientHeight ? box.clientWidth / box.clientHeight : 2); ph.innerHTML = ''; cr.innerHTML = ''; box.classList.remove('has-photo');
    let list = [], i = -1, timer = 0, tok = 0;
    const credit = (it) => `<a href="${esc(it.page)}" target="_blank" rel="noopener">Photo: ${esc(it.author)} · ${esc(it.license)}</a>`;
    function show(n) {
      if (!list.length) return;
      i = (n + list.length) % list.length;
      const it = list[i], my = ++tok, img = new Image();
      img.alt = ''; img.decoding = 'async'; img.referrerPolicy = 'no-referrer'; img.className = 's-img';
      img.style.setProperty('--kx', ((Math.random() < .5 ? -1 : 1) * (1 + Math.random() * 2)).toFixed(1) + '%');
      img.style.setProperty('--ky', ((Math.random() < .5 ? -1 : 1) * (1 + Math.random() * 2)).toFixed(1) + '%');
      img.onload = () => {
        if (my !== tok) return;
        ph.appendChild(img);
        requestAnimationFrame(() => requestAnimationFrame(() => img.classList.add('on')));
        $$('.s-img', ph).forEach(o => { if (o !== img) { o.classList.remove('on'); setTimeout(() => o.remove(), 1500); } });
        cr.innerHTML = credit(it); box.classList.add('has-photo');
        if (onShow) onShow(it, i, list.length);
      };
      img.onerror = () => { // a photo that will not load is dropped; the illustration stays
        if (my !== tok) return;
        list.splice(i, 1);
        if (list.length) show(i); else { box.classList.remove('has-photo'); cr.innerHTML = ''; if (onShow) onShow(null, 0, 0); }
      };
      img.src = it.thumb;
    }
    const run = () => { clearInterval(timer); if (list.length > 1) timer = setInterval(() => show(i + 1), 8000); };
    return {
      setPhotos(items) { list = items.slice(0, 10); i = -1; if (list.length) { show(0); run(); } },
      next() { show(i + 1); run(); },
      stop() { clearInterval(timer); tok++; }
    };
  }
  function renderHero(p) {
    if (heroScene) heroScene.stop();
    state.photos = [];
    heroScene = mountScene($('#hero'), p);
    $('#heroChip').textContent = CATS[p.cat] ? `${CATS[p.cat].emoji} ${CATS[p.cat].label}` : '';
    if (!$('#stage').hidden) openStage();
    const tok = ++sceneTok;
    WNPhotos.forPlace(p).then(items => {
      if (tok !== sceneTok || !items.length) return;
      state.photos = items; heroScene.setPhotos(items);
      if (!$('#stage').hidden && stageScene) stageScene.setPhotos(items);
      if (!$('#creatorPage').hidden) renderPhotoCredits();
    }).catch(() => { /* photos are optional */ });
  }
  function openStage() {
    const p = state.place; if (!p) return;
    if (stageScene) stageScene.stop();
    const wasOpen = !$('#stage').hidden;
    $('#stage').hidden = false; // show first so the picture can measure its box
    stageScene = mountScene($('#stage'), p, (it, i, n) => { $('#stCount').textContent = n > 1 ? `${i + 1} / ${n}` : ''; });
    $('#stCat').textContent = CATS[p.cat] ? `${CATS[p.cat].emoji} ${CATS[p.cat].label} · ${fmtCoord(p.lat, p.lon)}` : '';
    $('#stName').textContent = p.name; $('#stWhere').textContent = p.country; $('#stCount').textContent = '';
    if (state.photos.length) stageScene.setPhotos(state.photos);
    if (!wasOpen) $('[data-stage-close]').focus();
  }
  function closeStage() {
    if ($('#stage').hidden) return;
    $('#stage').hidden = true;
    if (stageScene) stageScene.stop();
    if (!$('#viewPlace').hidden) $('#heroExpand').focus();
  }
  let stageResize = 0;
  addEventListener('resize', () => { clearTimeout(stageResize); stageResize = setTimeout(() => { if (!$('#stage').hidden) openStage(); }, 250); }); // phone turned: redraw for the new shape
  $('#hero').addEventListener('click', (e) => { if (!e.target.closest('a')) openStage(); });
  $('#stage').addEventListener('click', (e) => { if (e.target.closest('a')) return; if (e.target.closest('[data-stage-close]')) closeStage(); else if (stageScene) stageScene.next(); });
  function renderPhotoCredits() {
    const pc = WNPhotos.allCached();
    const groups = state.places.filter(p => pc[p.id] && pc[p.id].items && pc[p.id].items.length);
    $('#crPhotos').innerHTML = groups.length ? groups.map(p => `
      <section class="cr-group"><h4>${CATS[p.cat] ? CATS[p.cat].emoji : ''} ${esc(p.name)} <span class="sub">· ${esc(p.country)}</span></h4>
      ${pc[p.id].items.map(it => `<div class="cr-item"><b><a href="${esc(it.page)}" target="_blank" rel="noopener">${esc(it.title)}</a></b><br>
        <span class="meta">by ${it.authorUrl ? `<a href="${esc(it.authorUrl)}" target="_blank" rel="noopener">${esc(it.author)}</a>` : esc(it.author)}
        · ${it.licenseUrl ? `<a href="${esc(it.licenseUrl)}" target="_blank" rel="noopener">${esc(it.license)}</a>` : esc(it.license)} · Wikimedia Commons</span></div>`).join('')}</section>`).join('')
      : '<p class="empty">No photos loaded yet. Open a place to see its pictures.</p>';
  }

  /* =============== 7. AUDIO =============== */
  const elCors = $('#audioCors'), elPlain = $('#audioPlain');
  let cur = elCors;       // the element currently in use
  let actx = null, analyser = null, freq = null;
  let playTok = 0, skips = 0;
  let volume = store.get('wn-vol', 0.8);
  $('#vol').value = volume;
  [elCors, elPlain].forEach(a => { a.volume = volume; });

  function initAudioGraph() {
    if (actx || !window.AudioContext && !window.webkitAudioContext) return;
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      const src = actx.createMediaElementSource(elCors);
      analyser = actx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = .82;
      freq = new Uint8Array(analyser.frequencyBinCount);
      src.connect(analyser); analyser.connect(actx.destination);
    } catch { actx = null; analyser = null; }
  }
  function orderedSources(item) {
    const a = document.createElement('audio');
    const rank = (s) => /mpeg|mp3/.test(s.type) ? 0 : /ogg|opus|webm/.test(s.type) ? 1 : 2;
    return (item.srcs || []).slice().sort((x, y) => rank(x) - rank(y)).filter(s => !s.type || a.canPlayType(s.type));
  }
  function playFrom(place, list, i) {
    state.queuePlace = place; state.queue = list; skips = 0;
    playIndex(i);
  }
  async function playIndex(i) {
    if (!state.queue.length) return;
    state.idx = (i + state.queue.length) % state.queue.length;
    const item = state.queue[state.idx];
    const tok = ++playTok;
    initAudioGraph();
    if (actx && actx.state === 'suspended') actx.resume().catch(() => {});
    [elCors, elPlain].forEach(a => { a.pause(); });
    showNowPlaying(item, true);
    const srcs = orderedSources(item);
    for (const s of srcs) {
      for (const el of [elCors, elPlain]) {
        if (tok !== playTok) return;
        const ok = await tryEl(el, s.src, tok);
        if (tok !== playTok) return;
        if (ok) {
          cur = el; skips = 0;
          logHeard(item);
          return;
        }
      }
    }
    if (tok !== playTok) return;
    skips++;
    if (skips < Math.min(4, state.queue.length)) { toast('That recording would not play, trying the next one'); playIndex(state.idx + 1); }
    else { setPlaying(false); setLoading(false); toast('These recordings would not play here. Try another place.'); }
  }
  function tryEl(el, src, tok) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (done) return; done = true; clearTimeout(t); el.removeEventListener('playing', onOk); el.removeEventListener('error', onErr); if (!v && tok === playTok) { el.pause(); el.removeAttribute('src'); el.load(); } resolve(v); };
      const onOk = () => finish(true);
      const onErr = () => finish(false);
      const t = setTimeout(() => finish(false), 20000);
      el.addEventListener('playing', onOk);
      el.addEventListener('error', onErr);
      el.loop = state.loop;
      el.volume = volume;
      el.src = src;
      const p = el.play();
      if (p && p.catch) p.catch((e) => { if (e && e.name === 'NotAllowedError') { finish(false); setPlaying(false); toast('Tap play to start the sound'); } else if (e && e.name !== 'AbortError') finish(false); });
    });
  }
  function togglePlay() {
    if (state.idx < 0) {
      if (state.place) { $('#playPlace').click(); return; }
      $('#randomBtn').click(); return;
    }
    if (cur.paused) {
      if (actx && actx.state === 'suspended') actx.resume().catch(() => {});
      if (!cur.src) { playIndex(state.idx); return; }
      cur.play().catch(() => playIndex(state.idx));
    } else cur.pause();
  }
  function setPlaying(on) {
    state.playing = on;
    $('#playIcon').setAttribute('href', on ? '#i-pause' : '#i-play');
    $('#playBtn').setAttribute('aria-label', on ? 'Pause' : 'Play');
    $('#logo').classList.toggle('live', on);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = on ? 'playing' : 'paused';
    markPins();
    if (!$('#viewList').hidden) renderList();
    if (state.place && !$('#viewPlace').hidden) renderRecs();
    if (on) startViz();
  }
  function setLoading(on) { $('#playBtn').classList.toggle('loading', on); }
  function showNowPlaying(item, loading) {
    const p = state.queuePlace;
    $('#pTitle').textContent = item.title;
    $('#pSub').textContent = `${p ? p.name + ' · ' : ''}by ${item.author} · ${item.license}`;
    setLoading(!!loading);
    document.title = `${item.title} · W-Noise`;
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: item.title, artist: item.author, album: p ? `${p.name}, ${p.country}` : 'W-Noise',
          artwork: [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }]
        });
      } catch { /* old browser */ }
    }
  }
  [elCors, elPlain].forEach(el => {
    el.addEventListener('playing', () => { if (el === cur || el.src) { cur = el; setLoading(false); setPlaying(true); } });
    el.addEventListener('pause', () => { if (el === cur) setPlaying(false); });
    el.addEventListener('waiting', () => { if (el === cur) setLoading(true); });
    el.addEventListener('timeupdate', () => {
      if (el !== cur) return;
      $('#pTime').textContent = fmtTime(el.currentTime);
      $('#pDur').textContent = fmtTime(el.duration);
      if (!seeking && isFinite(el.duration) && el.duration) $('#seek').value = Math.round(el.currentTime / el.duration * 1000);
    });
    el.addEventListener('ended', () => { if (el === cur && !state.loop) playIndex(state.idx + 1); });
  });
  $('#playBtn').addEventListener('click', togglePlay);
  $('#nextBtn').addEventListener('click', () => state.idx >= 0 ? playIndex(state.idx + 1) : $('#randomBtn').click());
  $('#prevBtn').addEventListener('click', () => {
    if (state.idx < 0) return;
    if (cur.currentTime > 5) cur.currentTime = 0; else playIndex(state.idx - 1);
  });
  let seeking = false;
  $('#seek').addEventListener('input', () => { seeking = true; });
  $('#seek').addEventListener('change', (e) => {
    seeking = false;
    if (isFinite(cur.duration) && cur.duration) cur.currentTime = e.target.value / 1000 * cur.duration;
  });
  $('#vol').addEventListener('input', (e) => {
    volume = +e.target.value; [elCors, elPlain].forEach(a => { a.volume = volume; }); store.set('wn-vol', volume);
  });
  function syncLoop() {
    $('#loopBtn').setAttribute('aria-pressed', String(state.loop));
    $('#loopBtn').setAttribute('aria-label', state.loop ? 'Loop is on' : 'Loop this recording');
    [elCors, elPlain].forEach(a => { a.loop = state.loop; });
  }
  $('#loopBtn').addEventListener('click', () => { state.loop = !state.loop; store.set('wn-loop', state.loop); syncLoop(); toast(state.loop ? 'Loop on: this recording repeats' : 'Loop off: plays the next recording'); });
  syncLoop();

  // Sleep timer
  const SLEEP = [0, 15, 30, 60, 90];
  let sleepI = 0, sleepAt = 0, sleepTimer = 0;
  function syncSleep() {
    const left = sleepAt ? Math.max(0, Math.ceil((sleepAt - Date.now()) / 60000)) : 0;
    $('#sleepLbl').textContent = sleepAt ? `${left}m` : '';
    $('#sleepBtn').setAttribute('aria-label', sleepAt ? `Sleep timer: ${left} minutes left` : 'Sleep timer: off');
    $('#sleepBtn').setAttribute('aria-pressed', String(!!sleepAt));
  }
  $('#sleepBtn').addEventListener('click', () => {
    sleepI = (sleepI + 1) % SLEEP.length;
    const m = SLEEP[sleepI];
    sleepAt = m ? Date.now() + m * 60000 : 0;
    toast(m ? `Sleep in ${m} minutes` : 'Sleep timer off');
    syncSleep();
  });
  setInterval(() => {
    if (!sleepAt) return;
    syncSleep();
    if (Date.now() >= sleepAt && !sleepTimer) {
      // fade out over 8 s, then pause
      const start = volume; let n = 0;
      sleepTimer = setInterval(() => {
        n++; cur.volume = Math.max(0, start * (1 - n / 32));
        if (n >= 32) { clearInterval(sleepTimer); sleepTimer = 0; cur.pause(); cur.volume = volume; sleepAt = 0; sleepI = 0; syncSleep(); toast('Good night 🌙'); }
      }, 250);
    }
  }, 5000);

  if ('mediaSession' in navigator) {
    const ms = navigator.mediaSession;
    try {
      ms.setActionHandler('play', togglePlay);
      ms.setActionHandler('pause', togglePlay);
      ms.setActionHandler('nexttrack', () => $('#nextBtn').click());
      ms.setActionHandler('previoustrack', () => $('#prevBtn').click());
    } catch { /* unsupported action */ }
  }

  function logHeard(item) {
    state.heard[item.file] = { placeId: state.queuePlace && state.queuePlace.id, t: Date.now() };
    store.set('wn-heard', state.heard);
  }

  /* =============== 8. VISUALIZER =============== */
  const cv = $('#viz'), g2 = cv.getContext('2d');
  let vizRaf = 0;
  function startViz() { if (!vizRaf) vizRaf = requestAnimationFrame(drawViz); }
  function drawViz(now) {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
    g2.setTransform(dpr, 0, 0, dpr, 0, 0);
    g2.clearRect(0, 0, w, h);
    const col = getComputedStyle(document.documentElement).getPropertyValue(state.playing ? '--accent' : '--line').trim() || '#4ee6c3';
    g2.fillStyle = col;
    const bars = Math.max(24, Math.floor(w / 9));
    const bw = w / bars;
    const useReal = analyser && cur === elCors && state.playing;
    if (useReal) analyser.getByteFrequencyData(freq);
    for (let i = 0; i < bars; i++) {
      let v;
      if (useReal) v = freq[Math.floor(i / bars * freq.length * 0.7)] / 255;
      else if (state.playing) v = 0.25 + 0.2 * Math.sin(now / 420 + i * 0.5) * Math.sin(now / 900 + i * 0.13);
      else v = 0.04;
      const bh = Math.max(2, v * h * 0.85);
      g2.globalAlpha = 0.18 + v * 0.5;
      g2.fillRect(i * bw + 1, h - bh, bw - 2, bh);
    }
    g2.globalAlpha = 1;
    if (state.playing && !reduced()) vizRaf = requestAnimationFrame(drawViz); else vizRaf = 0;
  }

  /* =============== 9. CREATOR PAGE =============== */
  function openPage(id) {
    const pg = $('#' + id); pg.hidden = false; pg.scrollTop = 0;
    lastFocus = document.activeElement;
    setTimeout(() => $('[data-close]', pg).focus(), 30);
  }
  function closePage(pg) {
    pg.hidden = true;
    if (location.hash === '#creator') history.replaceState(null, '', state.place ? '#place=' + state.place.id : location.pathname + location.search);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  let lastFocus = null;
  function openCreator() {
    renderCreator(); openPage('creatorPage');
    if (location.hash !== '#creator') history.replaceState(null, '', '#creator');
  }
  function renderCreator() {
    const slot = $('#crLogo');
    if (slot && !slot.firstChild) { const c = $('#logo').cloneNode(true); c.removeAttribute('id'); c.classList.add('live'); slot.appendChild(c); }
    const cache = WNSounds.allCached();
    const total = Object.values(cache).reduce((n, e) => n + ((e.items && e.items.length) || 0), 0);
    const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    $('#crMeta').textContent = `W-Noise v${VERSION} · ${state.places.length} places · ${total} credited sounds · ${installed ? 'installed app' : 'web'}`;
    const groups = state.places.filter(p => cache[p.id] && cache[p.id].items && cache[p.id].items.length);
    $('#crList').innerHTML = groups.length ? groups.map(p => `
      <section class="cr-group"><h4>${CATS[p.cat] ? CATS[p.cat].emoji : ''} ${esc(p.name)} <span class="sub">· ${esc(p.country)}</span></h4>
      ${cache[p.id].items.map(it => `<div class="cr-item">
        <b><a href="${esc(it.page)}" target="_blank" rel="noopener">${esc(it.title)}</a></b>${state.heard[it.file] ? ' <span class="eyebrow" style="color:var(--live)">♪ heard</span>' : ''}<br>
        <span class="meta">by ${it.authorUrl ? `<a href="${esc(it.authorUrl)}" target="_blank" rel="noopener">${esc(it.author)}</a>` : esc(it.author)}
        · ${it.licenseUrl ? `<a href="${esc(it.licenseUrl)}" target="_blank" rel="noopener">${esc(it.license)}</a>` : esc(it.license)}
        ${it.duration ? ' · ' + fmtTime(it.duration) : ''}${it.date ? ' · ' + esc(it.date) : ''} · Wikimedia Commons</span>
      </div>`).join('')}</section>`).join('')
      : '<p class="empty">No sounds loaded yet. Open a place, or tap <b>Collect credits for all places</b>.</p>';
    renderPhotoCredits();
  }
  $('#brandBtn').addEventListener('click', openCreator);
  $('#creatorBtn').addEventListener('click', openCreator);
  $('#collectBtn').addEventListener('click', async () => {
    const b = $('#collectBtn'); b.disabled = true;
    let done = 0, fail = 0;
    const list = state.places.slice();
    const worker = async () => {
      while (list.length) {
        const p = list.shift();
        try { await WNSounds.forPlace(p); } catch { fail++; }
        try { await WNPhotos.forPlace(p); } catch { /* photos are optional */ }
        done++;
        $('#crStatus').textContent = `Collecting credits… ${done} / ${state.places.length}`;
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    $('#crStatus').textContent = fail ? `Done. ${fail} place(s) did not answer; try again later.` : 'Done. Every place is credited below.';
    b.disabled = false; renderCreator(); updateCounter();
  });
  $('#copyCredits').addEventListener('click', async () => {
    const cache = WNSounds.allCached();
    const lines = ['W-Noise — sound credits (created by SSK-BLUM)', 'All recordings: Wikimedia Commons contributors', ''];
    state.places.forEach(p => {
      const e = cache[p.id]; if (!e || !e.items || !e.items.length) return;
      lines.push(`## ${p.name}, ${p.country}`);
      e.items.forEach(it => lines.push(`- "${it.title}" by ${it.author}, ${it.license}${it.licenseUrl ? ' (' + it.licenseUrl + ')' : ''} — ${it.page}`));
      lines.push('');
    });
    const pc = WNPhotos.allCached(); let anyPhoto = false;
    state.places.forEach(p => {
      const e = pc[p.id]; if (!e || !e.items || !e.items.length) return;
      if (!anyPhoto) { lines.push('# Photos (Wikimedia Commons)', ''); anyPhoto = true; }
      lines.push(`## ${p.name}, ${p.country}`);
      e.items.forEach(it => lines.push(`- "${it.title}" by ${it.author}, ${it.license}${it.licenseUrl ? ' (' + it.licenseUrl + ')' : ''} — ${it.page}`));
      lines.push('');
    });
    try { await navigator.clipboard.writeText(lines.join('\n')); toast('Credits copied'); }
    catch { toast('Copy is blocked in this browser'); }
  });
  $('#clearCache').addEventListener('click', () => { WNSounds.clearCache(); WNPhotos.clearCache(); renderCreator(); updateCounter(); toast('Saved sound lists cleared; they reload next time'); });

  /* =============== 10. CREDIT DIALOG =============== */
  function openModal(id) {
    lastFocus = document.activeElement;
    const m = $('#' + id); m.hidden = false;
    setTimeout(() => { const c = $('[data-close]', m); if (c) c.focus(); }, 30);
  }
  function closeModal(m) { m.hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  $$('.modal').forEach(m => m.addEventListener('click', (e) => { if (e.target === m) closeModal(m); }));
  document.addEventListener('click', (e) => {
    const c = e.target.closest('[data-close]'); if (!c) return;
    const m = c.closest('.modal'); if (m) return closeModal(m);
    const pg = c.closest('.page'); if (pg) closePage(pg);
  });
  $('#creditBtn').addEventListener('click', () => {
    const it = state.queue[state.idx];
    if (!it) { toast('Play a recording to see its credit'); return; }
    const p = state.queuePlace;
    const row = (k, v) => v ? `<div class="cm-row"><span>${k}</span><span>${v}</span></div>` : '';
    $('#cmBody').innerHTML =
      `<p style="margin:0 0 10px;font-weight:700;font-size:17px">${esc(it.title)}</p>` +
      row('Place', p ? esc(`${p.name}, ${p.country}`) : '') +
      row('Recordist', it.authorUrl ? `<a href="${esc(it.authorUrl)}" target="_blank" rel="noopener">${esc(it.author)}</a>` : esc(it.author)) +
      row('Licence', it.licenseUrl ? `<a href="${esc(it.licenseUrl)}" target="_blank" rel="noopener">${esc(it.license)}</a>` : esc(it.license)) +
      row('Recorded', esc(it.date)) +
      row('Length', it.duration ? fmtTime(it.duration) : '') +
      row('Original file', `<a href="${esc(it.page)}" target="_blank" rel="noopener">Wikimedia Commons ${ico('i-ext')}</a>`) +
      row('Found by', esc(`search: “${it.term}”`)) +
      row('Description', esc(it.desc)) +
      row('Visualizer', cur === elCors && analyser ? 'Live audio spectrum' : 'Simple animation (this file\'s server does not share audio data)');
    openModal('creditModal');
  });

  /* =============== 11. HELP, SHOW ME & TOUR =============== */
  const HELP = [
    { sec: 'Start', id: 'map', icon: '🌍', title: 'The world map', text: 'Every glowing dot is a place with real sounds. Tap one to open it. Drag to move, pinch or scroll to zoom.', target: '#mapWrap' },
    { sec: 'Start', id: 'globe', icon: '🌐', title: 'Spinning globe or flat map', text: 'The globe turns by itself. Drag to spin it, pinch or scroll to zoom, tap a glowing dot to listen. This button switches to the flat map and back. Key: g.', target: '#viewBtn' },
    { sec: 'Start', id: 'random', icon: '🔀', title: 'Random trip', text: 'Not sure where to go? This picks a place and starts playing straight away.', target: '#randomBtn' },
    { sec: 'Start', id: 'search', icon: '🔎', title: 'Search', text: 'Find a place, country or kind of sound: try “rain”, “India” or “penguin”.', target: '.search', prep: 'list' },
    { sec: 'Start', id: 'chips', icon: '🏷️', title: 'Categories', text: 'Forests, wildlife, water, cities, weather, mountains, ice, deserts and culture. ★ Saved shows your favourite places.', target: '#chips', prep: 'list' },
    { sec: 'Top bar', id: 'logo', icon: '🎧', title: 'Logo and Creator page', text: 'The animated logo spins while sound plays. Tap it (or ♡) for the Creator page with credits for every recording.', target: '#brandBtn' },
    { sec: 'Top bar', id: 'theme', icon: '◐', title: 'Dark, light or auto', text: 'Switches between Auto (follows your device), Light and Dark.', target: '#themeBtn' },
    { sec: 'Top bar', id: 'layout', icon: '📱', title: 'Screen mode', text: 'Optimise the layout: Auto fits your device, Mobile is a phone column, Tab a two-pane tablet layout, Web the full desktop layout. Tap to cycle; it is remembered.', target: '#layoutBtn' },
    { sec: 'Top bar', id: 'palette', icon: '🎨', title: 'Colour palettes', text: 'Pick the accent colour of the whole app: Aurora, Violet Night, Sunset, Ocean, Forest, Rose, Sand Gold or Mono Ice. Each has a dark and a light version and is remembered.', target: '#paletteBtn' },
    { sec: 'Top bar', id: 'install', icon: '⬇', title: 'Install', text: 'Appears when your browser can install W-Noise as an app. On iPhone use Share → Add to Home Screen.', target: '#installBtn', optional: true },
    { sec: 'A place', id: 'scene', icon: '🖼️', title: 'Place picture', text: 'Every place has a moving picture: a forest swaying, waves rolling, a city at dusk, rain, aurora… Real photos from Wikimedia Commons fade in over it, with the photographer credited. Tap the picture or the full-screen button to enlarge it while you listen.', target: '#hero', prep: 'place' },
    { sec: 'A place', id: 'recs', icon: '🎙️', title: 'Recordings', text: 'Real field recordings found on Wikimedia Commons for this place, with the recordist and licence. Tap one to play it.', target: '#recList', prep: 'place' },
    { sec: 'A place', id: 'playplace', icon: '▶', title: 'Play this place', text: 'Plays the recordings one after another.', target: '#playPlace', prep: 'place' },
    { sec: 'A place', id: 'save', icon: '☆', title: 'Save a place', text: 'Keeps the place under ★ Saved on this device.', target: '#savePlace', prep: 'place' },
    { sec: 'Player', id: 'play', icon: '⏯', title: 'Play and pause', text: 'Space bar works too. Lock-screen controls work on phones.', target: '#playBtn' },
    { sec: 'Player', id: 'next', icon: '⏭', title: 'Previous and next', text: 'Moves through the recordings of the place you are listening to.', target: '.p-ctl' },
    { sec: 'Player', id: 'loop', icon: '🔁', title: 'Loop', text: 'Repeats one recording for as long as you like — great for rain or waves.', target: '#loopBtn' },
    { sec: 'Player', id: 'sleep', icon: '🌙', title: 'Sleep timer', text: 'Tap to cycle 15, 30, 60 or 90 minutes. The sound fades out gently.', target: '#sleepBtn' },
    { sec: 'Player', id: 'credit', icon: 'ⓘ', title: 'Credit', text: 'Who recorded this sound, its licence and a link to the original file.', target: '#creditBtn' },
    { sec: 'Player', id: 'vol', icon: '🔊', title: 'Volume', text: 'Remembered for next time.', target: '.vol' },
    { sec: 'Tips', id: 'zoom', icon: '＋', title: 'Zoom buttons', text: '+ and − zoom the map; the globe button shows the whole world again.', target: '#zoomCtl' },
    { sec: 'Tips', id: 'sheet', icon: '↕', title: 'Bigger map (phones)', text: 'Tap the handle above the list to make the map bigger, smaller or hide it.', target: '#sheetHandle', when: isMobile }
  ];
  const TOUR = ['map', 'globe', 'random', 'chips', 'scene', 'recs', 'play', 'loop', 'credit', 'logo'];

  function renderHelp() {
    const secs = [...new Set(HELP.map(h => h.sec))];
    $('#helpBody').innerHTML = secs.map(s => `<h3>${s}</h3>` + HELP.filter(h => h.sec === s && (!h.when || h.when())).map(h => `
      <div class="help-item"><span class="hi" aria-hidden="true">${h.icon}</span>
        <div><b>${esc(h.title)}</b><p>${esc(h.text)}</p></div>
        <button class="btn ghost" data-show="${h.id}">Show me</button></div>`).join('')).join('');
  }
  $('#helpBtn').addEventListener('click', () => {
    renderHelp(); openModal('helpModal');
    $('#helpBtn').classList.remove('nudge'); store.set('wn-seen-help', true);
  });
  let helpScroll = 0, tourI = -1;
  $('#helpBody').addEventListener('click', (e) => {
    const b = e.target.closest('[data-show]'); if (!b) return;
    helpScroll = $('#helpModal .modal-card').scrollTop;
    tourI = -1;
    showStep(HELP.find(h => h.id === b.dataset.show));
  });
  $('#tourBtn').addEventListener('click', () => { tourI = 0; showStep(HELP.find(h => h.id === TOUR[0])); });

  async function prepareStep(h) {
    if (h.prep === 'list' && $('#viewList').hidden) $('#backBtn').click();
    if (h.prep === 'place' && $('#viewPlace').hidden) openPlace(state.queuePlace ? state.queuePlace.id : 'amazon');
    if (isMobile() && document.body.classList.contains('map-small') && h.target === '#mapWrap') setSheet('');
    await new Promise(r => setTimeout(r, 420));
  }
  async function showStep(h) {
    if (!h) return;
    $('#helpModal').hidden = true;
    await prepareStep(h);
    let el = $(h.target);
    if (!el || el.hidden || !el.getClientRects().length) {
      if (tourI >= 0) { nextTour(); return; }
      toast(h.optional ? 'This button only appears when your browser offers it' : 'That part is not on screen right now');
      backToGuide(); return;
    }
    el.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
    await new Promise(r => setTimeout(r, 260));
    $('#spot').hidden = false;
    $('#spotStep').textContent = tourI >= 0 ? `Tour · ${tourI + 1} of ${TOUR.length}` : h.sec;
    $('#spotTitle').textContent = h.title;
    $('#spotText').textContent = h.text;
    $('#spotNext').textContent = tourI >= 0 ? (tourI === TOUR.length - 1 ? 'Finish' : 'Next') : 'Got it';
    $('#spotBack').textContent = tourI >= 0 ? 'End tour' : 'Back to guide';
    placeSpot(el);
    $('#spotNext').focus();
  }
  function placeSpot(el) {
    const r = el.getBoundingClientRect(), pad = 6;
    const hole = $('#spotHole');
    const vw = innerWidth, vh = innerHeight;
    const top = Math.max(4, r.top - pad), left = Math.max(4, r.left - pad);
    const w = Math.min(vw - 8, r.width + pad * 2), hgt = Math.min(vh - 8, r.height + pad * 2);
    Object.assign(hole.style, { top: top + 'px', left: left + 'px', width: w + 'px', height: hgt + 'px' });
    const card = $('#spotCard');
    const cw = card.offsetWidth || 300, ch = card.offsetHeight || 160;
    let ct = top + hgt + 12;
    if (ct + ch > vh - 8) ct = top - ch - 12;
    if (ct < 8) ct = Math.max(8, Math.min(vh - ch - 8, top + 12));
    const cl = Math.max(8, Math.min(vw - cw - 8, left + w / 2 - cw / 2));
    Object.assign(card.style, { top: ct + 'px', left: cl + 'px' });
  }
  function endSpot() { $('#spot').hidden = true; }
  function backToGuide() {
    endSpot(); tourI = -1; renderHelp(); $('#helpModal').hidden = false;
    $('#helpModal .modal-card').scrollTop = helpScroll;
  }
  function nextTour() {
    tourI++;
    if (tourI >= TOUR.length) { tourI = -1; endSpot(); toast('Tour done — enjoy the world 🌍'); return; }
    showStep(HELP.find(h => h.id === TOUR[tourI]));
  }
  $('#spotNext').addEventListener('click', () => { if (tourI >= 0) nextTour(); else endSpot(); });
  $('#spotBack').addEventListener('click', () => { if (tourI >= 0) { tourI = -1; endSpot(); } else backToGuide(); });
  addEventListener('resize', () => { if (!$('#spot').hidden) endSpot(); });

  /* =============== 12. MOBILE SHEET =============== */
  const SHEET = ['', 'map-big', 'map-small'];
  function setSheet(cls) {
    document.body.classList.remove('map-big', 'map-small');
    if (cls) document.body.classList.add(cls);
    setTimeout(scalePins, 380);
  }
  $('#sheetHandle').addEventListener('click', () => {
    const now = SHEET.find(c => c && document.body.classList.contains(c)) || '';
    setSheet(SHEET[(SHEET.indexOf(now) + 1) % SHEET.length]);
  });
  // swipe on the handle: up = smaller map, down = bigger map
  let sy = null;
  $('#sheetHandle').addEventListener('touchstart', (e) => { sy = e.touches[0].clientY; }, { passive: true });
  $('#sheetHandle').addEventListener('touchend', (e) => {
    if (sy == null) return;
    const dy = e.changedTouches[0].clientY - sy; sy = null;
    if (Math.abs(dy) < 30) return;
    const big = document.body.classList.contains('map-big'), small = document.body.classList.contains('map-small');
    if (dy < 0) setSheet(big ? '' : 'map-small'); else setSheet(small ? '' : 'map-big');
  });

  /* =============== 13. PWA, KEYBOARD, ROUTING, BOOT =============== */
  let deferredPrompt = null;
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; $('#installBtn').hidden = false; });
  $('#installBtn').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => {});
    deferredPrompt = null; $('#installBtn').hidden = true;
  });
  addEventListener('appinstalled', () => { $('#installBtn').hidden = true; toast('W-Noise installed'); });
  if (!window.WN_PLACES && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  document.addEventListener('keydown', (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && document.activeElement.type !== 'range';
    if (e.key === 'Escape') {
      if (!$('#spot').hidden) { tourI = -1; endSpot(); return; }
      const m = $$('.modal').find(x => !x.hidden); if (m) { closeModal(m); return; }
      if (!$('#creatorPage').hidden) { closePage($('#creatorPage')); return; }
      if (!$('#stage').hidden) { closeStage(); return; }
      if (!$('#viewPlace').hidden) { $('#backBtn').click(); return; }
    }
    if (typing) return;
    if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    else if (e.key === '/') { e.preventDefault(); if ($('#viewList').hidden) $('#backBtn').click(); $('#q').focus(); }
    else if (e.key === 'n' || e.key === 'ArrowRight' && e.shiftKey) $('#nextBtn').click();
    else if (e.key === 'r') $('#randomBtn').click();
    else if (e.key === 'g') $('#viewBtn').click();
    else if (e.key === '?') $('#helpBtn').click();
    else if (e.key === 'v') $('#layoutBtn').click();
  });

  function route() {
    const h = location.hash;
    if (h === '#creator') { openCreator(); return; }
    if (h === '#random') { history.replaceState(null, '', location.pathname + location.search); $('#randomBtn').click(); return; }
    const m = /^#place=([\w-]+)/.exec(h);
    if (m && state.byId[m[1]]) openPlace(m[1]);
  }
  addEventListener('hashchange', route);

  async function boot() {
    drawMapBase();
    state.cat = store.get('wn-cat', 'all');
    if (!CATS[state.cat]) state.cat = 'all';
    try { await loadPlaces(); }
    catch (e) {
      $('#placeList').innerHTML = `<li class="empty">Could not load the places list.<br><button class="btn ghost" id="retryBoot" style="margin-top:10px">Retry</button></li>`;
      $('#retryBoot').addEventListener('click', () => location.reload());
      return;
    }
    drawPins(); renderChips(); renderList(); updateCounter();
    setVB(0, 0, W); setView(view);
    if (!store.get('wn-seen-help', false)) $('#helpBtn').classList.add('nudge');
    route();
    window.WNoise = { state, openPlace, playIndex, flyTo, setView, globe: G, openStage, closeStage, VERSION };
  }
  boot();
})();
