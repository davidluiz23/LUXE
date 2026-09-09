// Local review server; no build step is required for this static storefront.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../Frontend');
const port = Number(process.env.PORT || 4173);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
http.createServer((request, response) => {
    try {
        const url = new URL(request.url, 'http://localhost');
        const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
        if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
        const body = fs.readFileSync(file);
        response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        response.end(body);
    } catch (_) { response.writeHead(404).end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`ALKEBULAN preview: http://127.0.0.1:${port}`));
