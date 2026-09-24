import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:3000/?mode=demo');
await page.waitForSelector('.product-card');
await page.evaluate(() => document.fonts.ready);
await page.locator('.product-card').last().scrollIntoViewIfNeeded();
await page.waitForTimeout(1500);
await page.evaluate(() => window.scrollTo(0, 0));
await mkdir('artifacts', { recursive: true });
await page.screenshot({ path: 'artifacts/desktop.png', fullPage: true });
const accessibility = await new AxeBuilder({ page })
  .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
  .analyze();
console.log(
  JSON.stringify({
    accessibility: accessibility.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  }),
);
console.log(
  JSON.stringify({
    errors,
    images: await page
      .locator('img')
      .evaluateAll((imgs) =>
        imgs.map((i) => ({ loaded: i.complete && i.naturalWidth > 0, alt: i.alt })),
      ),
    desktopOverflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
  }),
);
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: 'artifacts/mobile.png', fullPage: true });
console.log(
  JSON.stringify({
    mobileOverflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
  }),
);
await browser.close();
