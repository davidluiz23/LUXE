const port = Number(process.argv[2] || 9333);
const tabs = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
const tab = tabs.find((entry) => entry.type === 'page');
if (!tab?.webSocketDebuggerUrl) throw new Error('No debuggable Chrome page found');

const socket = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

function send(method, params = {}) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 320,
  height: 900,
  deviceScaleFactor: 1,
  mobile: true,
  screenWidth: 320,
  screenHeight: 900,
});
await send('Page.navigate', {
  url: 'file:///C:/Users/OWNER/OneDrive/Desktop/LUXE/LUXE/Frontend/shop.html',
});
await new Promise((resolve) => setTimeout(resolve, 15000));

for (const width of [320, 390, 430]) {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height: 900,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: width,
    screenHeight: 900,
  });
  await new Promise((resolve) => setTimeout(resolve, 250));
  const result = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const rect = (selector) => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width, height: box.height };
      };
      const css = (selector) => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const style = getComputedStyle(node);
        return {
          display: style.display,
          gridTemplateColumns: style.gridTemplateColumns,
          border: style.border,
          borderRadius: style.borderRadius,
          width: style.width,
          height: style.height,
          aspectRatio: style.aspectRatio,
        };
      };
      const visibleOverflow = [...document.querySelectorAll('body *')]
        .filter((node) => {
          if (node.closest('.mobile-menu:not(.active)')) return false;
          const style = getComputedStyle(node);
          if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
          const box = node.getBoundingClientRect();
          if (box.width < 1 || box.height < 1) return false;
          return box.left < -0.5 || box.right > innerWidth + 0.5;
        })
        .slice(0, 12)
        .map((node) => ({
          tag: node.tagName.toLowerCase(),
          id: node.id,
          className: typeof node.className === 'string' ? node.className : '',
          rect: rect(node.id ? '#' + CSS.escape(node.id) : '.' + [...node.classList].map(CSS.escape).join('.')),
        }));
      return {
        innerWidth,
        rootScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        nav: rect('.nav-container'),
        navIcons: rect('.nav-icons'),
        hamburger: { rect: rect('.hamburger'), css: css('.hamburger') },
        productGrid: { rect: rect('#productGrid'), css: css('#productGrid') },
        firstCard: rect('#productGrid .product-card'),
        secondCard: rect('#productGrid .product-card:nth-of-type(2)'),
        heart: { rect: rect('#productGrid .wishlist-btn'), css: css('#productGrid .wishlist-btn') },
        footer: css('.luxury-footer-grid'),
        visibleOverflow,
      };
    })()`,
  });
  console.log(JSON.stringify({ width, ...result.result.value }));
}

socket.close();
