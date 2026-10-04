const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {startFixture}=require('./fixture.cjs');
let app;
before(async()=>{app=await startFixture();});
after(async()=>{await app?.close();});
const user={id:'flow-customer',email:'customer@example.com',user_metadata:{full_name:'Test Customer'}};
const key='luxe_cart_user_flow-customer';
async function fillCheckout(page){
  await page.waitForFunction(()=>!document.querySelector('.checkout-btn').disabled);
  for(const [id,value] of Object.entries({firstName:'Test',lastName:'Customer',email:user.email,phone:'2348012345678',address:'10 Test Street',city:'Lagos',state:'Lagos',zip:'100001'}))await page.locator('#'+id).fill(value);
}

test('a selected tee travels through the cart, secure order creation and WhatsApp order handoff',async()=>{
 const {page,context,errors}=await app.openPage('product.html?piece=ijele',{width:390,state:{__auditUser:user},saved:{luxe_logged_in:true,luxe_user:user}});
 try{
  await page.waitForSelector('#productAddToCart:not(:disabled)');
  const action=await page.locator('#productAddToCart').boundingBox();
  assert.ok(action.y>=0 && action.y+action.height<=900,'mobile Add to cart must be visible before scrolling');
  await page.locator('[data-size="L"]').click();
  await page.locator('[data-quantity-delta="1"]').click();
  await page.locator('#productAddToCart').click();
  await page.waitForFunction(()=>document.querySelector('.cart-count').textContent==='2');
  await page.goto(app.base+'/cart.html');
  await page.waitForFunction(()=>window.loadCart().some(item=>item.size==='L' && item.quantity===2));
  await page.locator('a.checkout-btn').click();
  await page.waitForURL('**/checkout.html');
  await fillCheckout(page);
  await page.check('#whatsappConsent');
  // Block only the manual external chat popup; the real checkout still saves
  // its order and requests server notifications. No real customer is contacted.
  await page.evaluate(()=>{window.open=()=>null;});
  await page.locator('.checkout-btn').click();
  await page.waitForSelector('.checkout-success');
  const requests=await page.evaluate(()=>__requests);
  const order=requests.find(request=>request.rpc==='create_order_secure_v3');
  assert.deepEqual(order.args.p_items,[{product_id:1001,quantity:2,size:'L',color:'Black'}]);
  assert.equal(order.args.p_contact.whatsappOptIn,true);
  assert.equal(requests.filter(request=>request.function==='order-notifications').length,1);
  assert.equal(await page.evaluate(()=>Object.keys(JSON.parse(sessionStorage.getItem('__fixtureOrders'))).length),1);
  assert.equal(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)||'[]').length,key),0);
  assert.match(await page.locator('.checkout-success').innerText(),/ALK-TEST-001/);
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('payment failure keeps the bag and retries the same order before redirecting',async()=>{
 const paymentConfig={adminWhatsApp:'2348000000000',activeProvider:'paystack',providers:{whatsapp:{enabled:true},paystack:{enabled:true}}};
 const selected=[{id:1002,quantity:1}];
 const {page,context,errors}=await app.openPage('checkout.html',{state:{__auditUser:user,__paymentConfig:paymentConfig},saved:{[key]:selected}});
 try{
  await fillCheckout(page);
  await page.locator('.checkout-btn').click();
  await page.waitForFunction(()=>document.querySelector('.checkout-error')?.textContent.includes('saved, but payment could not start'));
  assert.equal(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).length,key),1);
  const first=await page.evaluate(()=>__requests.find(r=>r.rpc==='create_order_secure_v3').args.p_idempotency_key);
  await page.locator('.checkout-btn').click();
  await page.waitForFunction(()=>__requests.filter(r=>r.rpc==='create_order_secure_v3').length===2);
  assert.equal(await page.evaluate(()=>__requests.filter(r=>r.rpc==='create_order_secure_v3')[1].args.p_idempotency_key),first);
  assert.equal(await page.evaluate(()=>Object.keys(JSON.parse(sessionStorage.getItem('__fixtureOrders'))).length),1);
  await page.waitForFunction(()=>!document.querySelector('.checkout-btn').disabled);
  await page.evaluate(()=>{window.__paymentAuthorizationUrl='https://checkout.paystack.com/fixture-only';});
  await page.locator('.checkout-btn').click();
  await page.waitForURL('https://checkout.paystack.com/fixture-only');
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('admin original tee setup keeps real prices and stock mandatory and shows the local photo',async()=>{
 const {page,context,errors}=await app.openPage('admin.html',{width:1440,state:{__auditUser:user,__auditRole:'owner',__fixture:[]}});
 try{
  await page.waitForSelector('#adminLayout.visible');
  await page.click('[data-panel="productsPanel"]');
  await page.selectOption('#addOriginalProduct','ijele');
  await page.waitForSelector('#productModalOverlay.visible');
  assert.equal(await page.inputValue('#pName'),'Ijele graphic tee');
  for(const id of ['pPrice','pPriceNGN','pStockQuantity'])assert.equal(await page.inputValue('#'+id),'');
  assert.equal(await page.inputValue('#pImage'),'assets/products/ijele.jpg');
  assert.equal(await page.locator('#pImagePreview').evaluate(async image=>{await image.decode();return image.naturalWidth>0;}),true);
  await page.click('#saveProductBtn');
  assert.equal(await page.evaluate(()=>__requests.some(r=>r.table==='products' && r.operation==='insert')),false);
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
