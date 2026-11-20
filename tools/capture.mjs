// Browser QA: render an actual WebGL fish, rather than only its CPU texture/mesh.
// node tools/capture.mjs ocellaris-clownfish side .qa/clown-before.png
import { chromium } from 'playwright';

const [species = 'ocellaris-clownfish', view = 'side', output = '.qa/capture.png'] = process.argv.slice(2);
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--enable-webgl', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
const errors = [];
await page.addInitScript(() => {
  window.__webglLost = 0;
  document.addEventListener('webglcontextlost', () => { window.__webglLost++; }, true);
});
page.on('pageerror', (e) => errors.push(`page: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' || (m.type() === 'warning' && /shader|WebGL/i.test(m.text()))) errors.push(`${m.type()}: ${m.text()}`);
});
await page.goto(`http://127.0.0.1:5173/?sp=${species}&view=${view}&ui=0&panel=0&list=0&feed=0&swim=0&caustic=0&zoom=1.26`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__frames > 12, null, { timeout: 90000 });
const gl = await page.evaluate(() => ({
  frames: window.__frames,
  lost: window.__webglLost,
  canvas: [...document.querySelectorAll('canvas')].map((c) => [c.width, c.height]),
  mem: performance.memory?.usedJSHeapSize,
}));
await page.screenshot({ path: output, animations: 'disabled' });
console.log(`Captured ${species} ${view}: ${output}`, gl);
console.log(errors.length ? errors.join('\n') : 'No browser/WebGL errors');
await browser.close();