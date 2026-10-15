# Changelog

All notable changes to W-Noise. Format: [Keep a Changelog](https://keepachangelog.com), versions follow [SemVer](https://semver.org).

## [1.3.0] — 2026-10-15

### Added
- **Screen mode** button before **?** (Auto, Mobile, Tab, Web), key `v`, remembered in `wn-layout`; new "Screen mode" help item (22 items).

### Changed
- Compact header at 360 px and below so the extra button fits at 320 px. Service worker cache `w-noise-v8`.

## [1.2.0] — 2026-10-15

### Added
- **Place picture**: choosing a place shows an animated scene for it (nine category scenes) with credited Wikimedia Commons photos fading in as a slideshow; tap for full screen while the player keeps working. Photo credits on the Creator page. New `photos.js`, `ph` search words in `data/places.json`, "Place picture" help item (21 items, 10-step tour).

### Changed
- Service worker cache `w-noise-v7`.

## [1.1.0] — 2026-10-15

### Added
- **Spinning 3D globe** (canvas) as the default view, with glowing, pulsing location spots; drag to spin, pinch/scroll to zoom, tap a spot to open the place. A button (key `g`) switches to the flat dotted map.
- **Colour palettes** (🎨 button after **?**): Aurora, Violet Night, Sunset, Ocean, Forest, Rose, Sand Gold, Mono Ice, each with a dark and a light version.
- `tools/build-single.mjs` builds the whole app as one HTML file (`dist/w-noise.html`).
- `CHANGELOG.md`, `.gitattributes`.

### Changed
- Header and headings use **Unbounded** instead of Syne.
- Colours now come from six palette variables per palette (`--pa-*`, `--pk-*`, `--pv-*`); light-mode teal and "playing" amber darkened for readability.
- "How to use" guide has new items for the globe and the palettes (20 items, 9-step tour).
- Service worker cache `w-noise-v6`.

## [1.0.0] — 2026-10-15

### Added
- First release: dotted world map with 32 places, real field recordings found live on Wikimedia Commons with credits, Creator page, player (loop, sleep timer, visualizer, lock-screen controls), dark/light/auto theme, animated logo, "?" guide with Show me and tour, installable PWA.
