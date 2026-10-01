const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root, storage, browserContext } = require('./helpers.cjs');

const cacheKey = 'alkebulan_storefront_content_v1';
const legacySeed = JSON.parse(fs.readFileSync(path.join(root, 'supabase/migrations/20260913000031_storefront_content_and_audience.sql'), 'utf8').split('$json$')[1]);
const plain = value => JSON.parse(JSON.stringify(value));
const publication = (content = legacySeed, revision = 1) => ({ content: plain(content), revision, updatedAt: '2026-09-13T09:00:00Z' });

function contentContext(cached, service = {}) {
  const setup = browserContext({
    localStorage: storage(cached ? { [cacheKey]: JSON.stringify(cached) } : {}),
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    LuxeStorefront: service,
  });
  // Admin loads content explicitly; no network or image work is needed here.
  setup.context.document.body = { classList: { contains: () => true } };
  setup.run('Frontend/js/site-content.js');
  return { ...setup, api: setup.context.LuxeSiteContent };
}

test('untouched legacy cache uses branded defaults without changing its revision or source document', () => {
  const cached = publication();
  const { api } = contentContext(cached);
  const current = plain(api.snapshot());
  assert.deepEqual(current.content, plain(api.defaults()));
  assert.deepEqual(current.content.slides, legacySeed.slides, 'the three genuine artwork previews survive retirement');
  assert.equal(current.revision, cached.revision);
  assert.equal(current.updatedAt, cached.updatedAt);
  assert.deepEqual(cached.content, legacySeed);
});

test('live legacy seed is retired only in presentation and cached without backend writes', async () => {
  let saves = 0;
  const data = publication();
  // PostgreSQL jsonb does not preserve insertion order.
  data.content = { detail: data.content.detail, collections: data.content.collections, slides: data.content.slides };
  const { api, context } = contentContext(null, {
    getContent: async () => ({ data, error: null }),
    saveContent: async () => { saves++; },
  });
  const result = await api.load();
  assert.equal(result.error, null);
  assert.deepEqual(plain(result.data.content), plain(api.defaults()));
  assert.deepEqual(JSON.parse(context.localStorage.getItem(cacheKey)), plain(api.snapshot()));
  assert.equal(saves, 0);
  assert.match(data.content.collections.men.image, /images\.unsplash\.com/);
});

test('published revisions and edited legacy documents keep their actual imagery through cache and refresh', async () => {
  const edited = publication();
  edited.content.slides[0].title = 'Published campaign';
  edited.content.collections.men.image = 'https://images.example.com/commissioned.jpg';
  edited.content.collections.men.focusY = 72;
  edited.content.detail.productId = 9001;
  const explicitStockChoice = publication(legacySeed, 8);
  for (const data of [edited, explicitStockChoice]) {
    const { api } = contentContext(data, { getContent: async () => ({ data, error: null }) });
    assert.deepEqual(plain(api.snapshot()), data, 'cache must preserve legitimate published content');
    const result = await api.load();
    assert.equal(result.error, null);
    assert.deepEqual(plain(api.snapshot()), data, 'refresh must preserve legitimate published content');
  }
});

test('admin saves retain authored content and revision contracts after seed retirement', async () => {
  const calls = [];
  const { api } = contentContext(publication(), {
    saveContent: async (content, revision) => {
      calls.push({ content: plain(content), revision });
      return { data: publication(content, revision + 1), error: null };
    },
  });
  const authored = plain(legacySeed);
  authored.slides[0].productId = 9001;
  authored.detail.linkLabel = 'View the published tee';
  const result = await api.save(authored, 1);
  assert.equal(result.error, null);
  assert.deepEqual(calls, [{ content: authored, revision: 1 }]);
  assert.deepEqual(plain(api.snapshot().content), authored);
  assert.equal(api.snapshot().revision, 2);
});

test('failed content refresh retains the last legitimate published cache', async () => {
  const cached = publication(legacySeed, 4);
  cached.content.collections.women.image = 'https://images.example.com/published-women.jpg';
  const { api } = contentContext(cached, { getContent: async () => ({ data: null, error: { message: 'Offline' } }) });
  assert.equal((await api.load()).error.message, 'Offline');
  assert.deepEqual(plain(api.snapshot()), cached);
});
