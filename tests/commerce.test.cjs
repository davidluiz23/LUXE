const test = require('node:test');
const assert = require('node:assert/strict');
const { browserContext, storage } = require('./helpers.cjs');
const customer = { id: 'customer-1', email: 'customer@example.com' };
const cartKey = 'luxe_cart_user_customer-1';
const cart = [
  { id: 1001, quantity: 4, size: 'M', color: 'Black' },
  { id: 1001, quantity: 1, size: 'L', color: 'Black' },
  { id: 1002, quantity: 2 },
];

test('payment completion preserves other variants, new items and additional quantities', () => {
  const { context, run } = browserContext({ localStorage: storage({ [cartKey]: JSON.stringify(cart), luxe_cart: '[{"id":9,"quantity":1}]' }) });
  run('Frontend/js/cart.js');
  assert.equal(context.completeCartOrder('order-1', [
    { id: 'order-line-uuid', product_id: 1001, quantity: 2, selected_size: 'M', selected_color: 'Black' },
  ], customer), true);
  assert.deepEqual(JSON.parse(context.localStorage.getItem(cartKey)).map(({ id, quantity, size }) => ({ id, quantity, size })), [
    { id: 1001, quantity: 2, size: 'M' }, { id: 1001, quantity: 1, size: 'L' }, { id: 1002, quantity: 2, size: '' },
  ]);
  assert.equal(context.localStorage.getItem('luxe_cart'), '[{"id":9,"quantity":1}]');
  const remaining = context.localStorage.getItem(cartKey);
  assert.equal(context.completeCartOrder('order-1', [{ id: 1001, quantity: 2, size: 'M', color: 'Black' }], customer), true);
  assert.equal(context.localStorage.getItem(cartKey), remaining, 'reloading a paid order must not consume the cart twice');
});

test('completing one account order does not alter another account cart', () => {
  const otherKey = 'luxe_cart_user_customer-2';
  const { context, run } = browserContext({ localStorage: storage({ [cartKey]: JSON.stringify(cart), [otherKey]: JSON.stringify(cart) }) });
  run('Frontend/js/cart.js');
  context.completeCartOrder('order-1', [{ id: 1002, quantity: 2 }], customer);
  assert.equal(context.localStorage.getItem(otherKey), JSON.stringify(cart));
});

test('failed cart storage writes preserve contents and allow completion to be retried', () => {
  const localStorage = storage({ [cartKey]: JSON.stringify(cart) });
  const write = localStorage.setItem;
  localStorage.setItem = (key, value) => { if (key === cartKey) throw new Error('Storage unavailable'); return write(key, value); };
  const { context, run } = browserContext({ localStorage });
  run('Frontend/js/cart.js');
  assert.equal(context.completeCartOrder('order-1', [{ id: 1002, quantity: 2 }], customer), false);
  assert.equal(localStorage.getItem(cartKey), JSON.stringify(cart));
  localStorage.setItem = write;
  assert.equal(context.completeCartOrder('order-1', [{ id: 1002, quantity: 2 }], customer), true);
  assert.equal(JSON.parse(localStorage.getItem(cartKey)).some(item => item.id === 1002), false);
});

test('stock is shared across variants and failed catalog requests retain the stored cart', () => {
  const localStorage = storage({ luxe_cart: JSON.stringify(cart) });
  const { context, run } = browserContext({ localStorage, products: [], LuxeCatalogStatus: { state: 'unavailable' } });
  run('Frontend/js/cart.js');
  context.getAvailableCartItems({ purge: true });
  assert.equal(localStorage.getItem('luxe_cart'), JSON.stringify(cart));
  context.products = [{ id: 1001, inStock: true, stockQuantity: 3, sizes: ['M', 'L'], colors: ['Black'] }];
  context.LuxeCatalogStatus.state = 'ready';
  const available = context.getAvailableCartItems({ purge: true });
  assert.equal(available.reduce((sum, item) => sum + item.quantity, 0), 3);
});

test('reloading checkout restores its existing idempotency key', () => {
  const payload = { items: [{ id: 1001, quantity: 1 }], provider: 'paystack' };
  const saved = { fingerprint: JSON.stringify(payload), key: 'previous-key', orderId: 'order-1' };
  const { context, run } = browserContext({ sessionStorage: storage({ luxe_checkout_attempt: JSON.stringify(saved) }) });
  run('Frontend/js/checkout.js');
  assert.equal(context.getCheckoutIdempotencyKey(payload), 'previous-key');
  assert.equal(context.getCheckoutIdempotencyKey(payload), 'previous-key');
  assert.notEqual(context.getCheckoutIdempotencyKey({ ...payload, provider: 'whatsapp' }), 'previous-key');
});

test('checkout blocks native form submission while initialization is pending', async () => {
  const { context, run } = browserContext();
  run('Frontend/js/checkout.js');
  let prevented = false;
  await context.handleCheckoutSubmit({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
});

test('only unexpired pending online orders offer payment recovery', () => {
  const { context, run } = browserContext({ LuxeUtils: { escapeHtml: value => String(value ?? '') } });
  run('Frontend/js/dashboard.js');
  const order = { id: 'order-1', payment_provider: 'paystack', payment_status: 'pending', status: 'awaiting_payment', total: 50, created_at: '2026-01-01', order_items: [] };
  assert.match(context.renderOrderCard(order), /data-resume-payment="order-1"/);
  for (const fields of [{ payment_status: 'paid' }, { status: 'cancelled' }, { inventory_released_at: '2026-01-01' }, { inventory_reservation_expires_at: '2000-01-01' }]) {
    assert.doesNotMatch(context.renderOrderCard({ ...order, ...fields }), /data-resume-payment/);
  }
});

test('missing order images use the placeholder instead of requesting /undefined or /null', () => {
  const {context,run} = browserContext({LuxeUtils:{escapeHtml:value=>String(value??'')}});
  context.document.baseURI='https://store.example/dashboard.html';
  run('Frontend/js/dashboard.js');
  for(const value of [undefined,null,'','  ']) assert.equal(context.safeImageUrl(value),'');
  assert.equal(context.safeImageUrl('assets/brand/product-placeholder.svg'),'https://store.example/assets/brand/product-placeholder.svg');
});
