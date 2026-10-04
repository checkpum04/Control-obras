import { chromium } from 'playwright';
const S = '/tmp/claude-0/shots/';
let browser;
try { browser = await chromium.launch(); } catch (e) { browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); }
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'es-ES', colorScheme: process.env.DARK ? 'dark' : 'light' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
page.on('console', (m) => m.type() === 'error' && errors.push('console ' + m.text()));
await page.goto('http://localhost:4173/');
await page.waitForSelector('.obra-card', { timeout: 15000 });
await page.screenshot({ path: S + '1-home.png', fullPage: true });
const cards = await page.$$eval('.obra-card', (els) => els.map((e) => e.innerText.replace(/\n+/g, ' | ')));
console.log(cards.join('\n'));
// abrir obra
await page.click('text=Reforma casa Martínez');
await page.waitForSelector('.summary');
await page.screenshot({ path: S + '2-obra.png', fullPage: true });
const before = await page.$eval('.summary .big', (e) => e.textContent);
// parte de hoy
await page.click('.cta');
await page.waitForSelector('.btn-copy');
await page.click('.btn-copy');
await page.fill('#add-material', 'cem');
await page.waitForSelector('.ac-list');
console.log('sugerencias cem:', await page.$$eval('.ac-list li', (l) => l.map((x) => x.innerText.replace(/\n/g, ' '))));
await page.keyboard.press('Enter');
await page.keyboard.type('5');
await page.fill('#add-material', 'pla');
await page.waitForSelector('.ac-list');
console.log('sugerencias pla:', await page.$$eval('.ac-list li', (l) => l.map((x) => x.innerText.replace(/\n/g, ' '))));
await page.click('.ac-list li >> nth=0');
await page.keyboard.type('12');
// gasto frecuente
await page.click('.chips[aria-label="Gastos frecuentes"] .chip >> nth=0');
// cambiar precio de Juan para hoy
const rate = page.locator('input[aria-label="Precio por hora de Juan Pérez"]');
await rate.fill('20');
await page.waitForTimeout(200);
await page.screenshot({ path: S + '3-parte.png', fullPage: true });
console.log('total día:', await page.$eval('.savebar-total strong', (e) => e.textContent));
await page.click('text=Guardar parte');
await page.waitForSelector('.summary');
console.log('gastado antes', before, 'después', await page.$eval('.summary .big', (e) => e.textContent));
// partes tab
await page.click('.tabs >> text=Partes');
await page.screenshot({ path: S + '4-partes.png', fullPage: true });
await page.click('.report-row >> nth=0');
await page.waitForSelector('.day-total');
await page.screenshot({ path: S + '5-detalle.png', fullPage: true });
// worker habitual should remain 18
await page.goto('http://localhost:4173/#/catalogo');
await page.waitForSelector('.cat-row');
console.log('catálogo:', (await page.$$eval('.cat-row', (l) => l.map((x) => x.innerText.replace(/\n/g, ' ')))).slice(0, 5));
await page.goto('http://localhost:4173/#/buscar');
await page.fill('#search-q', 'pedro');
await page.waitForTimeout(400);
await page.screenshot({ path: S + '6-buscar.png', fullPage: true });
// informe
await page.goto('http://localhost:4173/');
await page.waitForSelector('.obra-card');
await page.click('text=Reforma casa Martínez');
await page.click('[aria-label="Informe"]');
await page.waitForSelector('.doc');
await page.screenshot({ path: S + '7-informe.png', fullPage: true });
await page.goto('http://localhost:4173/#/obra/x/editar'); 
console.log('errors:', errors);
await browser.close();
