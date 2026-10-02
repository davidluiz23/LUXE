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
  const published = [{ id: 9001, name: 'Ijele graphic tee', brand: 'ALKEBULAN' }];
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
    LuxeProducts: { async getAll() { calls++; return { data: [{ id: 9001, name: 'Durbar', brand: 'ALKEBULAN' }], error: null }; } },
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

test('only the original ALKEBULAN tees reach every public catalog entry point', async () => {
  const intended = [
    { id: 1, name: 'Ijele graphic tee', brand: 'ALKEBULAN', category: 'Men', tags: ['art'] },
    { id: 2, name: 'Durbar T-shirt', brand: 'ALKEBULAN', category: 'Women' },
    { id: 3, name: 'Dùn Dùn', brand: 'ALKEBULAN', category: 'Men' },
  ];
  const legacy = [
    { id: 4, name: 'Cashmere sweater', brand: 'Prada', category: 'Men' },
    { id: 5, name: 'Ijele graphic tee', brand: 'Another brand', category: 'Men' },
    { id: 6, name: 'Durbar print trainers', brand: 'ALKEBULAN', category: 'Footwear' },
    { id: 7, name: 'Not Ijele', brand: 'ALKEBULAN', category: 'Men' },
    { id: 8, name: 'Another tee', brand: 'ALKEBULAN', tags: ['ijele', 'durbar', 'dun-dun'] },
    { id: 9, name: 'Ijelemore', brand: 'ALKEBULAN' },
    { id: 10, name: 'Dun Dunes', brand: 'ALKEBULAN' },
    { id: 11, name: 'Ijele', brand: 'ALKEBULAN Fine Jewelry' },
  ];
  const allRows = [...intended, ...legacy];
  const { context, run } = browserContext({
    isSupabaseConfigured: () => true,
    LuxeProducts: { async getAll() { return { data: allRows, error: null }; } },
  });
  run('Frontend/js/products.js');
  const ids = values => Array.from(values, value => value.id);
  assert.deepEqual(ids(await context.productsReady), [1, 2, 3]);
  for (const values of [context.getProducts(), context.products, context.getFeaturedProducts(), context.getNewArrivals(), context.searchProducts('')]) {
    assert.deepEqual(ids(values), [1, 2, 3]);
  }
  assert.deepEqual(ids(context.getMenProducts()), [1, 3]);
  assert.deepEqual(ids(context.getWomenProducts()), [2]);
  assert.deepEqual(ids(context.getProductsByCategory(' Footwear ')), []);
  assert.deepEqual(ids(context.searchProducts('prada')), []);
  assert.deepEqual(ids(context.searchProducts('ijele')), [1]);
  assert.equal(context.getProductById(6), undefined, 'direct legacy product links must not resolve');
  assert.equal(context.getProductById('2').name, intended[1].name);
  assert.equal(context.LuxeCatalogStatus.state, 'ready');
  assert.equal(allRows.length, 11, 'curation must not mutate backend rows');
});

test('collection identity tolerates Unicode accents, dash forms, spacing and tee labels without substring matches', async () => {
  const { context, run } = browserContext();
  run('Frontend/js/products.js');
  await context.productsReady;
  for (const [name, key] of [
    ['  ALKEBULAN   IJELE  ', 'ijele'],
    ['Durbar oversized graphic tee', 'durbar'],
    ['ALKEBULAN Dùn–Dùn T–shirt', 'dun-dun'],
    ['Du\u0300n Du\u0300n graphic tee', 'dun-dun'],
    ['DUN-DUN', 'dun-dun'],
  ]) {
    assert.equal(context.LuxeCollection.keyForProduct({ name, brand: ' alkebulan ' }), key, name);
  }
  for (const name of ['Ijele cap', 'Dun-dun sneakers', 'Durbar tribute jacket', 'Durbar / Ijele', 'Ijele tee collaboration', 'Dundun']) {
    assert.equal(context.LuxeCollection.keyForProduct({ name, brand: 'ALKEBULAN' }), null, name);
  }
  assert.equal(context.LuxeCollection.keyForProduct(null), null);
  assert.equal(context.LuxeCollection.keyForProduct({ name: 'Ijele' }), null);
});

test('a valid catalog containing only retired products is empty, not malformed or unavailable', async () => {
  let reads = 0;
  const { context, run } = browserContext({
    isSupabaseConfigured: () => true,
    LuxeProducts: { async getAll() { reads++; return { data: [{ id: 44, name: 'Old starter tee', brand: 'Other' }], error: null }; } },
  });
  run('Frontend/js/products.js');
  assert.equal((await context.productsReady).length, 0);
  assert.equal(context.LuxeCatalogStatus.state, 'empty');
  assert.equal((await context.ensureLiveCatalog()).length, 0);
  assert.equal(reads, 1, 'a successfully curated empty result is cached');
});

test('malformed responses remain unavailable and retry can recover a curated catalog', async () => {
  let response = [null, { id: 'broken', name: 'Ijele', brand: 'ALKEBULAN' }];
  const { context, run } = browserContext({
    isSupabaseConfigured: () => true,
    LuxeProducts: { async getAll() { return { data: response, error: null }; } },
  });
  run('Frontend/js/products.js');
  await context.productsReady;
  assert.equal(context.LuxeCatalogStatus.state, 'unavailable');
  assert.match(context.LuxeCatalogStatus.message, /invalid product data/);
  response = { id: 3, name: 'Durbar', brand: 'ALKEBULAN' };
  await context.ensureLiveCatalog();
  assert.equal(context.LuxeCatalogStatus.state, 'unavailable');
  assert.match(context.LuxeCatalogStatus.message, /invalid response/);
  response = [null, { id: 3, name: 'Durbar', brand: 'ALKEBULAN' }, { id: 44, name: 'Old stock', brand: 'Other' }];
  const recovered = await context.ensureLiveCatalog();
  assert.deepEqual(Array.from(recovered, item => item.id), [3]);
  assert.equal(context.LuxeCatalogStatus.state, 'ready');
});

test('admin backend access stays complete while writes and cache replacement cannot leak retired products publicly', async () => {
  const rows = [{ id: 1, name: 'Ijele', brand: 'ALKEBULAN' }, { id: 2, name: 'Old starter tee', brand: 'Other' }];
  const calls = [];
  const { context, run } = browserContext({
    location: { pathname: '/admin.html', href: 'https://store.example/admin.html' },
    isSupabaseConfigured: () => true,
    LuxeProducts: {
      async getAll() { return { data: rows, error: null }; },
      async create(value) { calls.push(['create', value.id]); return { data: value, error: null }; },
      async update(id, value) { calls.push(['update', id]); return { data: { ...value, id }, error: null }; },
      async remove(id) { calls.push(['remove', id]); return { error: null }; },
    },
  });
  run('Frontend/js/products.js');
  await context.productsReady;
  assert.equal((await context.LuxeProducts.getAll()).data.length, 2, 'admin retains every backend record');
  await context.addProduct({ id: 3, name: 'Legacy accessory', brand: 'Other' });
  assert.equal(context.getProductById(3), undefined);
  await context.updateProduct(2, { name: 'Durbar', brand: 'ALKEBULAN' });
  assert.equal(context.getProductById(2).name, 'Durbar');
  await context.updateProduct(1, { name: 'Old product renamed', brand: 'Other' });
  assert.equal(context.getProductById(1), undefined);
  await context.deleteProduct(3);
  assert.deepEqual(calls, [['create', 3], ['update', 2], ['update', 1], ['remove', 3]]);
  context.products = rows;
  assert.deepEqual(Array.from(context.products, item => item.id), [1]);
  context.products.push({ id: 55, name: 'Legacy accessory', brand: 'Other' });
  assert.equal(context.getProductById(55), undefined, 'the public array is a copy, not the raw cache');
  assert.equal((await context.LuxeProducts.getAll()).data.length, 2);
});
