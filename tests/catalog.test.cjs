const test = require('node:test');
const assert = require('node:assert/strict');
const { browserContext } = require('./helpers.cjs');

test('informational pages load live inventory on demand and share concurrent requests', async () => {
  let calls = 0;
  const { context, run } = browserContext({
    location: { pathname: '/about.html', href: 'https://store.example/about.html' },
    isSupabaseConfigured: () => true,
    LuxeProducts: { async getAll() { calls++; return { data: [{ id: 9001, name: 'Live product' }], error: null }; } },
  });
  run('Frontend/js/products.js');
  await context.productsReady;
  assert.equal(calls, 0, 'informational pages should remain lightweight');
  assert.equal(context.getProducts().length, 0, 'starter inventory must not masquerade as live products');
  const first = context.ensureLiveCatalog();
  assert.equal(context.ensureLiveCatalog(), first);
  await first;
  assert.equal(calls, 1);
  assert.equal(context.getProducts()[0].id, 9001);
  assert.equal(context.LuxeCatalogStatus.source, 'supabase');
});

test('catalog failures remain unavailable and can be retried from search', async () => {
  let fail = true;
  const { context, run } = browserContext({
    isSupabaseConfigured: () => true,
    LuxeProducts: { async getAll() { return fail ? { error: { message: 'Offline' } } : { data: [], error: null }; } },
  });
  run('Frontend/js/products.js');
  await context.productsReady;
  assert.equal(context.LuxeCatalogStatus.state, 'unavailable');
  assert.equal(context.getProducts().length, 0);
  fail = false;
  await context.ensureLiveCatalog();
  assert.equal(context.LuxeCatalogStatus.state, 'empty');
});
