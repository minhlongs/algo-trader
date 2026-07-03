import playwright from 'playwright';
const { chromium } = playwright;

const pages = [
  { name: 'landing', path: '/dashboard/' },
  { name: 'pricing', path: '/dashboard/pricing' },
  { name: 'enterprise', path: '/dashboard/enterprise' },
  { name: 'manifesto', path: '/dashboard/manifesto' },
  { name: 'methodology', path: '/dashboard/methodology' },
];

const dir = '/Users/macbook/algo-trader/tests/visual/baseline';
import { mkdirSync } from 'fs';
mkdirSync(dir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const results = [];

for (const { name, path } of pages) {
  try {
    console.log(`Navigating to http://localhost:5174${path} ...`);
    await page.goto(`http://localhost:5174${path}`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
    console.log(`OK ${name}`);
    results.push({ name, status: 'ok' });
  } catch (e) {
    console.log(`FAIL ${name}: ${e.message}`);
    results.push({ name, status: 'fail', error: e.message });
  }
}

await browser.close();
console.log('\n=== SUMMARY ===');
for (const r of results) {
  console.log(`${r.status === 'ok' ? 'OK' : 'FAIL'}: ${r.name}`);
}
