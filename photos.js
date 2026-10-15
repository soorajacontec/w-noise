/* W-Noise — photos.js
 * Finds real photos of a place on Wikimedia Commons, with credits (author, licence, file page).
 * Used behind the animated place picture; the app works fine without them.
 * Exposes window.WNPhotos = { forPlace, cached, allCached, clearCache }
 */
(() => {
  'use strict';

  const API = 'https://commons.wikimedia.org/w/api.php';
  const CACHE_KEY = 'wn-img-cache';
  const CACHE_DAYS = 7;
  const MAX_PHOTOS = 10;
  // Titles that match a place name but are not photographs of it
  const SKIP_TITLE = /\b(maps?|locator|flags?|coat of arms|logo|diagram|chart|graph|stamp|poster|plans?|schematic|icon|screenshot|collage|montage|portrait|painting|drawing|illustration|postcard|scan|cover|specimen|skull)\b/i;
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

  function searchURL(term) {
    const p = new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2', origin: '*',
      generator: 'search', gsrnamespace: '6', gsrlimit: '20',
      gsrsearch: `${term} filetype:bitmap`,
      prop: 'imageinfo',
      iiprop: 'url|size|mime|extmetadata',
      iiurlwidth: '1100',
      iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl|ImageDescription|DateTimeOriginal'
    });
    return `${API}?${p}`;
  }

  /** Commons page → photo, or null if it is not a free, landscape, photo-sized JPEG */
  function toPhoto(page, term) {
    const ii = page && page.imageinfo && page.imageinfo[0];
    if (!ii) return null;
    if (!/^image\/(jpeg|webp)$/.test(ii.mime || '')) return null;
    const w = ii.width, h = ii.height;
    if (!w || !h || w < 1000 || h < 550) return null;
    const ratio = w / h;
    if (ratio < 1.25 || ratio > 2.4) return null;
    const title = page.title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ');
    if (SKIP_TITLE.test(title)) return null;
    const md = ii.extmetadata || {};
    const lic = textOf(md.LicenseShortName && md.LicenseShortName.value);
    if (!lic || !FREE.test(lic)) return null;
    const artistHtml = md.Artist && md.Artist.value;
    return {
      id: page.title,
      title,
      thumb: ii.thumburl || ii.url,
      page: ii.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
      author: textOf(artistHtml) || 'Unknown author',
      authorUrl: linkOf(artistHtml),
      license: lic,
      licenseUrl: (md.LicenseUrl && md.LicenseUrl.value) || '',
      date: textOf(md.DateTimeOriginal && md.DateTimeOriginal.value).slice(0, 40),
      w, h, term
    };
  }

  function cached(id) {
    const e = store.get(CACHE_KEY, {})[id];
    return e && Date.now() - e.t < CACHE_DAYS * 864e5 ? e : null;
  }
  const allCached = () => store.get(CACHE_KEY, {});
  const clearCache = () => store.set(CACHE_KEY, {});

  /** Photos for a place (uses place.ph search words, else the place name). Never throws: [] means "no photos". */
  async function forPlace(place, opts = {}) {
    if (!opts.fresh) { const c = cached(place.id); if (c && c.items.length) return c.items; }
    const terms = place.ph && place.ph.length ? place.ph : [place.name];
    const results = await Promise.all(terms.map(async (term) => {
      try {
        const j = await getJSON(searchURL(term));
        return ((j.query && j.query.pages) || []).sort((a, b) => (a.index || 0) - (b.index || 0)).map(p => toPhoto(p, term)).filter(Boolean);
      } catch { return []; }
    }));
    const seen = new Set(), items = [];
    const maxLen = Math.max(0, ...results.map(r => r.length));
    for (let i = 0; i < maxLen && items.length < MAX_PHOTOS; i++) {
      results.forEach(r => { const it = r[i]; if (it && !seen.has(it.id) && items.length < MAX_PHOTOS) { seen.add(it.id); items.push(it); } });
    }
    if (items.length) {
      const all = store.get(CACHE_KEY, {});
      all[place.id] = { t: Date.now(), items };
      store.set(CACHE_KEY, all);
    }
    return items;
  }

  window.WNPhotos = { forPlace, cached, allCached, clearCache, _toPhoto: toPhoto };
})();
