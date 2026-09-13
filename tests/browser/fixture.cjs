const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const frontend = path.join(root, 'Frontend');
const fixture = Array.from({length: 16}, (_, i) => ({
  id: 1001 + i, name: `Audit ${i % 2 ? 'Linen Dress' : 'Cotton Shirt'} ${i + 1}`,
  category: i % 2 ? 'Women' : 'Men', subcategory: i % 2 ? 'Dresses' : 'Shirts',
  brand: 'ALKEBULAN', price: 40 + i * 10, price_ngn: 60000 + i * 15000,
  old_price: null, old_price_ngn: null, rating: 4.5, review_count: 2,
  image: 'assets/brand/product-placeholder.svg', hover_image: '',
  sizes: i === 0 ? ['M', 'L'] : [], colors: i === 0 ? ['Black', 'White'] : [],
  tags: [i % 2 ? 'women' : 'men'], in_stock: i !== 15, stock_quantity: i === 15 ? 0 : 5,
  created_at: `2026-09-${String(i+1).padStart(2,'0')}T00:00:00Z`, description: 'A comfortable, carefully selected piece.'
}));
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server = http.createServer((req,res) => {
  let url = new URL(req.url, 'http://localhost');
  let file = path.resolve(frontend, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(frontend + path.sep)) {res.writeHead(403).end();return;}
  try {const body=fs.readFileSync(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)] || 'application/octet-stream'});res.end(body);}
  catch {res.writeHead(404).end();}
});

function sdkMock() {
  window.__requests = [];
  const user = window.__auditUser || null;
  const resolve = async (table, single, operation) => {
    window.__requests.push({table,operation});
    if (table === 'products' && window.__holdProducts) {
      window.__productsGate ||= new Promise(release => { window.__releaseProducts = release; });
      await window.__productsGate;
    }
    if (window.__failProducts && table === 'products') return {data:null,error:{message:'Catalog offline'}};
    if (window.__failNotificationWrite && table === 'user_notifications' && operation === 'update') return {data:null,error:{message:'Could not save'}};
    if (window.__failOrders && table === 'orders') return {data:null,error:{message:'Temporary network error'}};
    let data = table === 'orders' ? (window.__auditOrders || []) : table === 'user_notifications' ? (window.__auditNotifications || []) : table === 'products' ? window.__fixture : table === 'profiles' ? {id:user?.id,full_name:'Audit Customer'} : [];
    if (single && Array.isArray(data)) data = data[0] || null;
    return {data,error:null,count:window.__auditNotifications?.filter(n=>!n.read_at).length || 0};
  };
  const client = {
    auth: {
      getSession: async () => ({data:{session:user ? {user} : null},error:null}),
      getUser: async () => ({data:{user},error:null}),
      onAuthStateChange: () => ({data:{subscription:{unsubscribe(){}}}}),
      signOut: async () => ({error:null}),
    },
    from(table) {
      let single=false,operation='read';
      const q=new Proxy({}, {get(_,key){
        if(key==='then')return (yes,no)=>Promise.resolve(resolve(table,single,operation)).then(yes,no);
        return ()=>{if(key==='single'||key==='maybeSingle')single=true;if(['update','insert','delete','upsert'].includes(key))operation=key;return q;};
      }});return q;
    },
    async rpc(name,args) {
      window.__requests.push({rpc:name,args});
      if(name==='current_admin_role')return {data:window.__auditRole||null,error:null};
      if(name==='is_admin'||name==='is_owner')return {data:!!window.__auditRole,error:null};
      if(name==='commerce_public_settings')return {data:{whatsappVerificationRequired:false,whatsappDefaultCountryCode:'234'},error:null};
      if(name==='get_storefront_content_v1') {
        if(window.__failSiteContent)return {data:null,error:{message:'Content service unavailable'}};
        const stored=JSON.parse(localStorage.getItem('__auditPublishedContent') || 'null');
        return {data:stored || window.__siteContent || {content:window.LuxeSiteContent.defaults(),revision:1,updatedAt:'2026-09-13T09:00:00Z'},error:null};
      }
      if(name==='admin_save_storefront_content_v1') {
        if(!window.__auditRole)return {data:null,error:{message:'Admin access required'}};
        if(window.__failContentSave)return {data:null,error:{message:window.__failContentSave}};
        const data={content:args.p_content,revision:args.p_expected_revision+1,updatedAt:'2026-09-13T10:00:00Z'};
        localStorage.setItem('__auditPublishedContent',JSON.stringify(data));
        return {data,error:null};
      }
      if(name==='admin_audience_metrics_v1') {
        if(!window.__auditRole)return {data:null,error:{message:'Admin access required'}};
        if(window.__failAudience)return {data:null,error:{message:'Analytics connection unavailable'}};
        const series=Array.from({length:args.p_days},(_,i)=>({date:new Date(Date.UTC(2026,8,13-args.p_days+1+i)).toISOString().slice(0,10),visitors:i<args.p_days-2?null:(i===args.p_days-1?8:30),registrations:i===args.p_days-1?2:0}));
        return {data:{days:args.p_days,timezone:'Africa/Lagos',generatedAt:'2026-09-13T10:00:00Z',trackingStartedAt:'2026-09-12T09:00:00Z',visitors:32,visitorsToday:8,onlineNow:3,registeredAccounts:1342,bannedAccounts:7,series},error:null};
      }
      if(name==='order_quote_secure_v1') {
        if(window.__holdQuote)await new Promise(r=>window.__releaseQuote=r);
        const subtotal=args.p_items.reduce((n,i)=>n+(window.__fixture.find(p=>p.id===i.product_id)?.price||0)*i.quantity,0);
        return {data:{subtotal,shipping:10,tax:0,discount:0,total:subtotal+10},error:null};
      }
      if(name==='admin_list_orders_v4')return {data:{orders:[],hasMore:false,nextCursor:null},error:null};
      if(name==='public_store_metrics_v1')return {data:{},error:null};
      return {data:[],error:null};
    },
    functions:{async invoke(name,options){
      window.__requests.push({function:name,body:options?.body});
      if(name==='payment-gateway' && options?.body?.action==='verify')return {data:{status:'paid'},error:null};
      if(name==='payment-gateway' && options?.body?.action==='initialize')return {data:null,error:{message:'Payment provider offline'}};
      if(name==='payment-gateway')return {data:{paymentConfig:{adminWhatsApp:'2348000000000',activeProvider:'whatsapp',providers:{whatsapp:{enabled:true},paystack:{enabled:false}}}},error:null};
      return {data:{},error:null};
    }},
    channel(){const c={on:()=>c,subscribe:()=>c,unsubscribe:()=>{}};return c;},
    removeChannel(){}, storage:{from(){return {getPublicUrl(){return {data:{publicUrl:''}}}}}}
  };
  window.supabase={createClient:()=>client};
}

async function startFixture() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find(file => fs.existsSync(file));
  // Headless Chromium normally hides the scrollbars these layout checks need to see.
  const browser = await chromium.launch({ executablePath, headless: true, ignoreDefaultArgs: ['--hide-scrollbars'] });
  async function openPage(name, {width = 390, state = {}, saved = {}} = {}) {
    const context = await browser.newContext({ viewport: {width, height: 900}, serviceWorkers: 'block', reducedMotion: 'reduce' });
    await context.addInitScript(({products, state, saved}) => {
      window.__fixture = products;
      Object.assign(window, state);
      for (const [key, value] of Object.entries(saved)) if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(value));
    }, {products: fixture, state, saved});
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === base) return route.continue();
      if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('supabase')) return route.fulfill({contentType: 'text/javascript', body: '(' + sdkMock.toString() + ')();'});
      if (request.resourceType() === 'image') return route.fulfill({contentType: 'image/svg+xml', body: fs.readFileSync(path.join(frontend, 'assets/brand/product-placeholder.svg'))});
      return route.fulfill({status: 200, body: ''});
    });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(60000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/' + name, {waitUntil: 'load'});
    return {page, context, errors};
  }
  return {base, openPage, pages: fs.readdirSync(frontend).filter(name => name.endsWith('.html')), async close() {await browser.close(); await new Promise(resolve => server.close(resolve));}};
}
module.exports = {startFixture};
