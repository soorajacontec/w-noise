/* W-Noise — sounds.js
 * Finds real field recordings for a place on Wikimedia Commons and returns them
 * with full credits (author, licence, source page). No key, no server.
 * Exposes window.WNSounds = { forPlace, pick, cached, allCached, clearCache, API }
 */
(() => {
  'use strict';

  const API = 'https://commons.wikimedia.org/w/api.php';
  const CACHE_KEY = 'wn-cache';
  const CACHE_DAYS = 7;
  const MIN_SEC = 8;          // skip tiny clips
  const MAX_SEC = 3 * 3600;   // skip multi-hour uploads
  // Spoken-word files that match place names but are not soundscapes
  const SKIP_TITLE = /(pronunciation|^File:LL-Q|^File:(En|De|Fr|Es|It|Nl|Pt|Ru|Ja|Zh)-|spoken|wikipedia|podcast|interview|speech|lecture|national anthem|\.midi?$)/i;
  const FREE = /(cc0|public domain|^pd|cc[ -]by|attribution|gfdl|free art|ogl|fal)/i;

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or blocked */ } }
  };

  const textOf = (html) => {
    if (!html) return '';
    try { return (new DOMParser().parseFromString(String(html), 'text/html').body.textContent || '').replace(/\s+/g, ' ').trim(); }
    catch { return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
  };
  const linkOf = (html) => {
    const m = /href="([^"]+)"/.exec(html || '');
    if (!m) return '';
    const u = m[1].replace(/&amp;/g, '&');
    return u.startsWith('//') ? 'https:' + u : u;
  };

  async function getJSON(url, ms = 12000) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms);
    try {
      const r = await fetch(url, { signal: ac.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  function searchURL(term, offset = 0) {
    const p = new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2', origin: '*',
      generator: 'search', gsrnamespace: '6', gsrlimit: '12', gsroffset: String(offset),
      gsrsearch: `${term} filetype:audio`,
      prop: 'videoinfo',
      viprop: 'url|size|mime|mediatype|derivatives|extmetadata',
      viextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl|ImageDescription|DateTimeOriginal|Credit|AttributionRequired|UsageTerms'
    });
    return `${API}?${p}`;
  }
  function titlesURL(titles) {
    const p = new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2', origin: '*',
      titles: titles.join('|'),
      prop: 'videoinfo',
      viprop: 'url|size|mime|mediatype|derivatives|extmetadata',
      viextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl|ImageDescription|DateTimeOriginal|Credit|AttributionRequired|UsageTerms'
    });
    return `${API}?${p}`;
  }

  /** Commons page → W-Noise item, or null if unusable */
  function toItem(page, term) {
    const vi = page && page.videoinfo && page.videoinfo[0];
    if (!vi) return null;
    if (vi.mediatype && vi.mediatype !== 'AUDIO') return null;
    if (/midi/i.test(vi.mime || '')) return null;
    if (SKIP_TITLE.test(page.title)) return null;
    const dur = Number(vi.duration) || null;
    if (dur && (dur < MIN_SEC || dur > MAX_SEC)) return null;
    const md = vi.extmetadata || {};
    const lic = textOf(md.LicenseShortName && md.LicenseShortName.value);
    if (!lic || !FREE.test(lic)) return null;
    const artistHtml = md.Artist && md.Artist.value;
    const srcs = [];
    (vi.derivatives || []).forEach(d => { if (d.src) srcs.push({ src: d.src, type: d.type || '' }); });
    srcs.push({ src: vi.url, type: vi.mime || '' });
    return {
      id: page.title,
      title: page.title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' '),
      file: page.title,
      page: vi.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
      author: textOf(artistHtml) || 'Unknown author',
      authorUrl: linkOf(artistHtml),
      license: lic,
      licenseUrl: (md.LicenseUrl && md.LicenseUrl.value) || '',
      desc: textOf(md.ImageDescription && md.ImageDescription.value).slice(0, 400),
      date: textOf(md.DateTimeOriginal && md.DateTimeOriginal.value).slice(0, 40),
      duration: dur,
      size: vi.size || null,
      srcs,
      term
    };
  }

  /** Choose the first source this browser can play (MP3 transcode first, then Ogg, then original) */
  function pick(item) {
    const a = document.createElement('audio');
    const rank = (s) => /mpeg|mp3/.test(s.type) ? 0 : /ogg|opus|webm/.test(s.type) ? 1 : 2;
    const list = (item.srcs || []).slice().sort((x, y) => rank(x) - rank(y));
    for (const s of list) {
      const t = s.type || '';
      if (!t || a.canPlayType(t)) return s.src;
    }
    return list.length ? list[0].src : '';
  }

  // ---------- cache ----------
  function cached(id) {
    const all = store.get(CACHE_KEY, {});
    const e = all[id];
    if (!e) return null;
    if (Date.now() - e.t > CACHE_DAYS * 864e5) return null;
    return e;
  }
  function save(id, entry) {
    const all = store.get(CACHE_KEY, {});
    all[id] = entry;
    store.set(CACHE_KEY, all);
  }
  function allCached() { return store.get(CACHE_KEY, {}); }
  function clearCache() { store.set(CACHE_KEY, {}); }

  /**
   * Find recordings for a place.
   * place: { id, q:[terms], pins:[ 'File:…' ] }
   * opts: { fresh, offset }
   * Returns { items, offset, more, errors }
   */
  async function forPlace(place, opts = {}) {
    const offset = opts.offset || 0;
    if (!opts.fresh && !offset) {
      const c = cached(place.id);
      if (c && c.items && c.items.length) return { items: c.items, offset: c.offset || 0, more: c.more !== false, fromCache: true, errors: [] };
    }
    const errors = [];
    const seen = new Set();
    const items = [];
    const add = (list) => list.forEach(it => { if (it && !seen.has(it.id)) { seen.add(it.id); items.push(it); } });

    // 1. Curated files first (exact titles in places.json → pins)
    if (place.pins && place.pins.length && !offset) {
      try {
        const j = await getJSON(titlesURL(place.pins.slice(0, 40)));
        add(((j.query && j.query.pages) || []).map(p => toItem(p, 'pinned')));
      } catch (e) { errors.push('pins: ' + e.message); }
    }

    // 2. Search every term in parallel; keep each term's own ranking, then interleave
    const terms = place.q && place.q.length ? place.q : [place.name];
    const results = await Promise.all(terms.map(async (term) => {
      try {
        const j = await getJSON(searchURL(term, offset));
        const pages = ((j.query && j.query.pages) || []).sort((a, b) => (a.index || 0) - (b.index || 0));
        return { list: pages.map(p => toItem(p, term)), more: !!j.continue };
      } catch (e) { errors.push(term + ': ' + e.message); return { list: [], more: false }; }
    }));
    const maxLen = Math.max(0, ...results.map(r => r.list.length));
    for (let i = 0; i < maxLen; i++) add(results.map(r => r.list[i]));
    const more = results.some(r => r.more);

    if (!offset && items.length) save(place.id, { t: Date.now(), items, offset: offset + 12, more });
    if (!items.length && errors.length === terms.length) throw new Error('Wikimedia Commons did not answer. Check your connection and try again.');
    return { items, offset: offset + 12, more, errors };
  }

  window.WNSounds = { forPlace, pick, cached, allCached, clearCache, save, API, _toItem: toItem };
})();
