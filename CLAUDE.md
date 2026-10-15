# CLAUDE.md — rules for coding agents (W-Noise)

- Static PWA, vanilla HTML/CSS/JS (ES2020). **No build step, no frameworks, no npm runtime dependencies.** `tools/` is dev-only.
- Files: `index.html` (markup), `styles.css`, `app.js` (one IIFE, numbered sections), `sounds.js` (`window.WNSounds`), `photos.js` (`window.WNPhotos`), `map-data.js` (generated, don't hand-edit), `data/places.json`, `sw.js`, `manifest.webmanifest`. Full guide: `PROJECT.md`.
- Views: the globe (canvas, section 4b of `app.js`) is the default; the flat SVG map is the alternative. Both read the same `state` and `data/places.json`. Keep both working.
- Screen mode forces layouts by re-pointing `(max-width: Npx)` @media rules (see PROJECT.md §9a): write responsive CSS only as `max-width` media queries, and use `isMobile()` in JS, never raw `innerWidth`.
- Palettes live only in `styles.css` as `[data-palette="id"]` lines (six `--p*` variables) plus an entry in `PALETTES` in `app.js`. Never hard-code the accent or live colours elsewhere.
- Place pictures: the SVG illustration must work with no photos; every photo must be free-licensed and credited (hero caption + Creator page).
- Credit: keep "Created by SSK-BLUM" in the Creator page, README, PROJECT and LICENSE.
- **Every sound must carry credits** (author, licence, Commons page). Never ship audio files in the repo; never show a recording without a free licence.
- Storage only through the `store` helper (try/catch, JSON). Keys use the `wn-` prefix; list new keys in PROJECT.md §12.
- Colours only via CSS tokens; every change must work in dark and light (`data-theme` and `prefers-color-scheme`).
- Mobile first: check 320 px and 390 px widths, no horizontal scroll, touch targets ≥ 42 px.
- New buttons need an `aria-label`, a `HELP` item, and a working **Show me**.
- Respect `prefers-reduced-motion`.
- After any change: `node --check app.js sounds.js photos.js sw.js map-data.js`, validate JSON, **bump `VERSION` in `sw.js`**, update README/PROJECT/CHANGELOG (and `VERSION` in `app.js` for releases).
