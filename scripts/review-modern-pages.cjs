// Render public route states with the isolated browser fixture; never writes orders.
const fs = require('node:fs');
const path = require('node:path');
const { startFixture } = require('../tests/browser/fixture.cjs');
const AxeBuilder = require('@axe-core/playwright').default;

(async () => {
  const output = path.resolve(__dirname, '../artifacts/african-modern/pages');
  fs.mkdirSync(output, { recursive: true });
  const fixture = await startFixture();
  const report = [];
  const routes = ['shop', 'men', 'women', 'product', 'cart', 'checkout', 'login', 'signup', 'contact', 'shipping', 'faq', 'dashboard', 'wishlist', 'videos'];
  try {
    for (const width of [1440, 390]) {
      for (const name of routes) {
        const { page, context, errors } = await fixture.openPage(`${name}.html${name === 'product' ? '?id=1001' : ''}`, { width, height: 1000 });
        try {
          await page.evaluate(() => Promise.all([document.fonts.ready, window.productsReady]));
          await page.locator('img').evaluateAll(images => images.forEach(img => img.loading = 'eager'));
          await page.evaluate(() => Promise.allSettled([...document.images].map(img => img.decode())));
          const details = await page.evaluate(() => ({
            modernTheme: document.body.classList.contains('african-modern-site'),
            footerPreserved: Boolean(document.querySelector('footer[data-modern-footer] .modern-footer-main')),
            overflow: document.documentElement.scrollWidth > innerWidth,
            brokenImages: [...document.images].filter(img => !img.naturalWidth).map(img => img.getAttribute('src')),
            h1: document.querySelector('h1')?.textContent.trim(),
            headingFont: document.querySelector('h1') ? getComputedStyle(document.querySelector('h1')).fontFamily : null,
            bodyFont: getComputedStyle(document.body).fontFamily,
            overflowingElements: [...document.querySelectorAll('main *')].filter(el => { const rect = el.getBoundingClientRect(); return rect.width > 0 && (rect.right > innerWidth + 1 || rect.left < -1) && getComputedStyle(el).position !== 'fixed'; }).slice(0, 8).map(el => `${el.tagName}.${el.className}`)
          }));
          if (['shop', 'product', 'login', 'contact', 'shipping', 'dashboard'].includes(name)) {
            await page.screenshot({ path: path.join(output, `${name}-${width}.png`), fullPage: true });
          }
          const accessibility = ['shop', 'product', 'login', 'shipping'].includes(name)
            ? (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))
            : [];
          report.push({ name, width, errors, ...details, accessibility });
          console.log(JSON.stringify(report.at(-1)));
        } finally { await context.close(); }
      }
    }
    const { page, context } = await fixture.openPage('shop.html', { width: 390, height: 900 });
    try {
      await page.locator('#hamburger').click();
      await page.locator('#mobileMenu').waitFor({ state: 'visible' });
      const menuOpen = await page.locator('#hamburger').getAttribute('aria-expanded');
      await page.keyboard.press('Escape');
      const menuRestoredFocus = await page.evaluate(() => document.activeElement?.id === 'hamburger');
      await page.locator('#searchToggle').click();
      await page.locator('#headerSearchInput').fill('Ijele');
      await page.locator('.search-result-item').first().waitFor();
      await page.screenshot({ path: path.join(output, 'search-390.png') });
      await page.keyboard.press('Escape');
      const searchRestoredFocus = await page.evaluate(() => document.activeElement?.id === 'searchToggle');
      await page.locator('#filterToggle').click();
      const filterOpen = await page.locator('#filterToggle').getAttribute('aria-expanded');
      await page.keyboard.press('Escape');
      report.push({ interactions: { menuOpen, menuRestoredFocus, searchRestoredFocus, filterOpen } });
    } finally { await context.close(); }
  } finally {
    fs.writeFileSync(path.join(output, 'review.json'), JSON.stringify(report, null, 2));
    await fixture.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
