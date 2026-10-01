const test = require('node:test');
const assert = require('node:assert/strict');
const { browserContext } = require('./helpers.cjs');

test('retired starter inventory stays empty and importing it never writes to the backend', async () => {
  let writes = 0;
  const {context, run} = browserContext({
    isSupabaseConfigured: () => false,
    LuxeProducts: {async importStarterCatalog() { writes++; return {imported:1}; }},
  });
  run('Frontend/js/products.js');
  await context.productsReady;
  assert.equal(context.getProducts().length, 0);
  assert.equal(context.getStarterProducts().length, 0);
  assert.equal((await context.importStarterCatalog()).imported, 0);
  assert.equal(writes, 0);
});

test('retired starter import leaves already published inventory intact', async () => {
  let imports = 0;
  let reads = 0;
  const published = [{ id: 9001, name: 'Published tee', brand: 'ALKEBULAN' }];
  const { context, run } = browserContext({
    isSupabaseConfigured: () => true,
    LuxeProducts: {
      async getAll() { reads++; return { data: published, error: null }; },
      async importStarterCatalog() { imports++; return { imported: 1, error: null }; },
    },
  });
  run('Frontend/js/products.js');
  await context.productsReady;
  assert.equal((await context.importStarterCatalog()).imported, 0);
  assert.equal(imports, 0);
  assert.equal(reads, 1, 'the empty import must not refetch or replace live inventory');
  assert.equal(context.getProducts()[0].id, 9001);
  assert.equal(context.LuxeCatalogStatus.state, 'ready');
});

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
