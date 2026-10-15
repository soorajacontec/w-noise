// Builds dist/w-noise.html: the whole app in ONE file (CSS, scripts, places and icon inlined).
// Handy for sharing or opening from a phone's files. Dev tool, no packages needed:  node tools/build-single.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let html = read('index.html');
const swap = (from, to) => {
  if (!html.includes(from)) throw new Error('index.html changed; cannot find: ' + from);
  html = html.replace(from, () => to);
};

const icon = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(root, 'icons/icon.svg')).toString('base64');
const inline = (f) => '<script>\n' + read(f).replace(/<\/script/gi, '<\\/script') + '\n</script>\n';
const places = '<script>window.WN_PLACES=' + JSON.stringify(JSON.parse(read('data/places.json'))) + ';</script>\n';

swap('<link rel="stylesheet" href="styles.css">', '<style>\n' + read('styles.css') + '\n</style>');
swap('<link rel="manifest" href="manifest.webmanifest">\n', '');            // PWA install needs the full repo
swap('href="icons/icon.svg"', `href="${icon}"`);
swap('href="icons/apple-touch-icon.png"', `href="${icon}"`);
swap('<script src="map-data.js"></script>\n<script src="sounds.js"></script>\n<script src="photos.js"></script>\n<script src="app.js"></script>\n',
  places + inline('map-data.js') + inline('sounds.js') + inline('photos.js') + inline('app.js'));

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/w-noise.html'), html);
console.log('dist/w-noise.html', Math.round(html.length / 1024) + ' KB');
