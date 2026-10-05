// Capture still frames at given times:  node tools/stills.mjs --t 1,5.5,12 [--only s1] [--w 1280] [--out renders/stills] [--q extra=1]
import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import fs from 'node:fs'; import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => (x.startsWith('--') ? [...a, [x.slice(2), arr[i + 1]]] : a), []));
const W = +(args.w || 1280), H = Math.round((W * 9) / 16); const out = args.out || 'renders/stills'; fs.mkdirSync(out, { recursive: true });
const times = (args.t || '0').split(',').map(Number);
const { port, close } = await serve();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning' || m.text().startsWith('[asset]')) console.log('[page]', m.text()); });
page.on('pageerror', (e) => { console.log('[pageerror]', e.message, e.stack); process.exit(1); });
const q = new URLSearchParams({ render: '1', w: W, h: H }); if (args.only) q.set('only', args.only); if (args.q) for (const kv of args.q.split('&')) { const [k, v] = kv.split('='); q.set(k, v); }
const t0 = Date.now();
await page.goto(`http://localhost:${port}/index.html?${q}`);
await page.waitForFunction(() => window.__film?.ready, null, { timeout: 600000 });
console.log(`init ${((Date.now() - t0) / 1000).toFixed(1)}s`);
for (const t of times) {
  const a = Date.now(); const info = await page.evaluate((t) => window.__film.frame(t), t);
  const data = await page.evaluate(() => window.__film.capture('image/jpeg', 0.92));
  const f = path.join(out, `${args.prefix || 'still'}_${String(t.toFixed(2)).padStart(6, '0')}.jpg`); fs.writeFileSync(f, Buffer.from(data.split(',')[1], 'base64'));
  console.log(`${t}s → ${f} (${info.shot}) ${((Date.now() - a) / 1000).toFixed(2)}s`);
}
await browser.close(); close();
