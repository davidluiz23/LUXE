const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const token = 'test-bridge-token-with-more-than-32-characters';
const message = { to: '+2348000000001', text: 'Order ALK-1 received.', idempotencyKey: 'order:1:created:customer' };

async function transport(env, fetchImpl = fetch) {
  const source = (await fs.readFile(path.join(root, 'supabase/functions/_shared/whatsapp.ts'), 'utf8')).replace(/^export /gm, '');
  const context = vm.createContext({ Deno: { env: { get: key => env[key] } }, URL, AbortSignal, fetch: fetchImpl });
  vm.runInContext(stripTypeScriptTypes(source), context);
  return context;
}

async function fixture(t, send = async () => ({ key: { id: 'message-1' } })) {
  const { createBaileysBridge } = await import(pathToFileURL(path.join(root, 'integrations/whatsapp/baileys-bridge.mjs')).href);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'alkebulan-whatsapp-test-'));
  const state = { connected: true, calls: [], server: null };
  async function start() {
    state.server = createBaileysBridge({
      token, receiptDirectory: directory, isConnected: () => state.connected,
      getSocket: () => ({ sendMessage: async (...args) => { state.calls.push(args); return send(...args); } }),
    });
    await new Promise(resolve => state.server.listen(0, '127.0.0.1', resolve));
    state.base = `http://127.0.0.1:${state.server.address().port}`;
    state.client = await transport({ WHATSAPP_PROVIDER: 'baileys', WHATSAPP_BRIDGE_URL: state.base, WHATSAPP_BRIDGE_TOKEN: token });
  }
  async function stop() { await new Promise(resolve => state.server.close(resolve)); }
  t.after(async () => {
    await stop();
    const target = path.resolve(directory);
    assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
    assert.ok(path.basename(target).startsWith('alkebulan-whatsapp-test-'));
    await fs.rm(target, { recursive: true, force: true });
  });
  await start();
  return Object.assign(state, { directory, restart: async () => { await stop(); await start(); } });
}

test('unconfigured or unsafe bridge settings never send a request', async () => {
  for (const env of [{}, { WHATSAPP_BRIDGE_URL: 'http://public.example', WHATSAPP_BRIDGE_TOKEN: token },
    { WHATSAPP_BRIDGE_URL: 'https://bot.example', WHATSAPP_BRIDGE_TOKEN: 'short' },
    { WHATSAPP_PROVIDER: 'unknown', WHATSAPP_BRIDGE_URL: 'https://bot.example', WHATSAPP_BRIDGE_TOKEN: token }]) {
    const client = await transport(env, () => { throw new Error('Must not fetch'); });
    assert.equal((await client.sendWhatsAppMessage(message)).status, 'not_configured');
  }
});

test('Baileys transport sends through the existing socket and deduplicates concurrently and after restart', async t => {
  const f = await fixture(t);
  const deliveries = await Promise.all(Array.from({ length: 3 }, () => f.client.sendWhatsAppMessage(message)));
  assert.ok(deliveries.every(result => result.sent && result.messageId === 'message-1'));
  assert.deepEqual(f.calls, [['2348000000001@s.whatsapp.net', { text: message.text }]]);
  await f.restart();
  assert.equal((await f.client.sendWhatsAppMessage(message)).sent, true);
  assert.equal(f.calls.length, 1);
  const files = await fs.readdir(f.directory);
  const receipt = await fs.readFile(path.join(f.directory, files[0]), 'utf8');
  assert.ok(!receipt.includes(message.text) && !receipt.includes('2348000000001'));
  const conflict = await f.client.sendWhatsAppMessage({ ...message, text: 'Different order' });
  assert.equal(conflict.sent, false);
  assert.match(conflict.reason, /409/);
  assert.equal(f.calls.length, 1);
});

test('disconnected bots fail honestly and a later connection can deliver the same key', async t => {
  const f = await fixture(t);
  f.connected = false;
  const health = await fetch(`${f.base}/health`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(health.status, 503);
  assert.equal((await health.json()).connected, false);
  assert.equal((await f.client.sendWhatsAppMessage(message)).sent, false);
  assert.equal(f.calls.length, 0);
  f.connected = true;
  assert.equal((await f.client.sendWhatsAppMessage(message)).sent, true);
  assert.equal(f.calls.length, 1);
});

test('a failed or unconfirmed socket send is not marked delivered or blindly repeated', async t => {
  const f = await fixture(t, async () => { throw new Error('Connection lost after send'); });
  assert.equal((await f.client.sendWhatsAppMessage(message)).sent, false);
  await f.restart();
  const retry = await f.client.sendWhatsAppMessage(message);
  assert.equal(retry.sent, false);
  assert.match(retry.reason, /409/);
  assert.equal(f.calls.length, 1);
});

test('the bot endpoint rejects unauthorized, malformed and group-addressed messages', async t => {
  const f = await fixture(t);
  assert.equal((await fetch(`${f.base}/health`)).status, 401);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': 'test:message' };
  for (const body of ['null', '{', JSON.stringify({ to: '123@g.us', text: 'Hello' }), JSON.stringify({ to: '2348000000001', text: 'x'.repeat(4097) })]) {
    assert.equal((await fetch(`${f.base}/v1/messages`, { method: 'POST', headers, body })).status, 400);
  }
  assert.equal((await fetch(`${f.base}/v1/messages`, { method: 'POST', headers, body: 'x'.repeat(30_000) })).status, 413);
  assert.equal(f.calls.length, 0);
});

test('transport requires a confirmed message ID and never follows credential-bearing redirects', async () => {
  const env = { WHATSAPP_BRIDGE_URL: 'https://bot.example', WHATSAPP_BRIDGE_TOKEN: token };
  for (const payload of [{}, { ok: false }, { ok: true }, { ok: true, messageId: '' }]) {
    const client = await transport(env, async (_, options) => {
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers['Idempotency-Key'], message.idempotencyKey);
      return Response.json(payload);
    });
    assert.equal((await client.sendWhatsAppMessage(message)).sent, false);
  }
  const offline = await transport(env, async () => { throw new Error('Network timeout'); });
  assert.equal((await offline.sendWhatsAppMessage(message)).status, 'failed');
});

test('Meta remains an explicit transport with its template payload intact', async () => {
  const env = { WHATSAPP_PROVIDER: 'meta', WHATSAPP_ACCESS_TOKEN: 'meta-test', WHATSAPP_PHONE_NUMBER_ID: '12345' };
  const client = await transport(env, async (url, options) => {
    assert.match(url, /^https:\/\/graph\.facebook\.com\/v23\.0\/12345\/messages$/);
    const body = JSON.parse(options.body);
    assert.equal(body.to, '2348000000001');
    assert.equal(body.template.name, 'order_received');
    assert.equal(body.template.components[0].parameters[0].text, 'ALK-1');
    return Response.json({ messages: [{ id: 'meta-message' }] });
  });
  const result = await client.sendWhatsAppMessage({ ...message, template: { name: 'order_received', parameters: ['ALK-1'] } });
  assert.equal(result.sent, true);
});

async function edge(name, sent) {
  const env = { WHATSAPP_ADMIN_NUMBER: '2348000000002', BRAND_NAME: 'ALKEBULAN' };
  const source = (await fs.readFile(path.join(root, 'supabase/functions', name, 'index.ts'), 'utf8')).replace(/^import\s+[\s\S]*?;\s*/gm, '');
  const context = vm.createContext({
    Deno: { env: { get: key => env[key] }, serve() {} },
    sendWhatsAppMessage: async message => { sent.push(message); return { sent: true, status: 'sent', messageId: 'receipt-1' }; },
    whatsAppProvider: () => 'baileys', isWhatsAppConfigured: () => true,
  });
  vm.runInContext(stripTypeScriptTypes(source), context);
  return context;
}

test('order, payment, admin and OTP hooks use the bot transport without requiring Meta credentials', async () => {
  const sent = [];
  const orders = await edge('order-notifications', sent);
  await orders.sendWhatsApp('2348000000001', null, [], 'Order update', 'order:1:updated:customer');
  const payment = await edge('payment-gateway', sent);
  await payment.notifyAdminOfPayment({ order_number: 'ALK-1', currency: 'NGN', total: 25000 }, 'reference-1');
  const admin = await edge('admin-messaging', sent);
  assert.equal((await admin.sendWhatsApp('2348000000001', false, 'Customer', 'Order', 'Update', 'delivery-1')).status, 'not_opted_in');
  assert.equal((await admin.sendWhatsApp(null, true, 'Customer', 'Order', 'Update', 'delivery-1')).status, 'unavailable');
  assert.equal(sent.length, 2);
  await admin.sendWhatsApp('2348000000001', true, 'Customer', 'Order', 'Update', 'delivery-1');
  const verification = await edge('whatsapp-verification', sent);
  assert.equal(await verification.sendOtp('+2348000000001', '123456', 'challenge-1'), true);
  assert.deepEqual(sent.map(item => item.idempotencyKey), ['order:1:updated:customer', 'payment:reference-1:paid', 'admin-message:delivery-1', 'verification:challenge-1']);
  assert.match(sent[3].text, /123456.*10 minutes/);
});
