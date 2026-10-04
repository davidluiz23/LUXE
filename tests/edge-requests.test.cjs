const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const { root } = require('./helpers.cjs');

test('payment alerts report resolved transport failures without failing the payment flow', async () => {
  const errors=[];
  let background;
  const source=fs.readFileSync(path.join(root,'supabase/functions/payment-gateway/index.ts'),'utf8')
    .replace(/^import\s+[\s\S]*?;\s*/gm,'');
  const context=vm.createContext({
    Request,Response,URL,TextEncoder,crypto:globalThis.crypto,AbortSignal,
    console:{error(...args){errors.push(args);},log(){},warn(){}},
    Deno:{env:{get(key){return key==='WHATSAPP_ADMIN_NUMBER'?'2348012345678':undefined;}},serve(){}},
    EdgeRuntime:{waitUntil(promise){background=promise;}},
    sendWhatsAppMessage:async()=>({sent:false,status:'failed',reason:'Disconnected'}),
  });
  vm.runInContext(stripTypeScriptTypes(source),context);
  context.notifyAdminInBackground({order_number:'TEST-1',total:25,currency:'USD'},'test-reference');
  await background;
  assert.equal(errors.length,1);
  assert.match(errors[0][0],/not delivered/);
  assert.equal(errors[0][1],'failed');
});

for (const name of ['payment-gateway', 'push-notifications', 'order-notifications']) {
  test(`${name} returns a controlled 400 for non-object JSON bodies`, async () => {
    let handler;
    const env = { LUXE_SITE_URL: 'https://store.example', SUPABASE_URL: 'https://db.example' };
    const source = fs.readFileSync(path.join(root, 'supabase/functions', name, 'index.ts'), 'utf8')
      .replace(/^import\s+[\s\S]*?;\s*/gm, '');
    const context = vm.createContext({
      Request, Response, URL, TextEncoder, crypto: globalThis.crypto, AbortSignal,
      console: { error() {}, log() {}, warn() {} },
      Deno: { env: { get: key => env[key] }, serve(fn) { handler = fn; } },
      getSupabaseServiceKey: () => 'test-key',
      createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'test-user' } }, error: null }) } }),
    });
    vm.runInContext(stripTypeScriptTypes(source), context);
    for (const body of ['null', '[]', '"text"', '42', 'true', '{']) {
      const response = await handler(new Request('https://db.example/functions/v1/' + name, {
        method: 'POST', headers: { origin: env.LUXE_SITE_URL, authorization: 'Bearer test-token' }, body,
      }));
      assert.equal(response.status, 400, body);
      assert.equal((await response.json()).error, 'invalid_json');
    }
  });
}
