const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {root, browserContext} = require('./helpers.cjs');
const source = fs.readFileSync(path.join(root, 'Frontend/js/supabase-client.js'), 'utf8');

function mediaAt(base) {
  const {context} = browserContext({LuxeUtils: {escapeAttr: value => String(value)}});
  context.document.baseURI = base;
  context.location.href = base;
  vm.runInContext(source.slice(source.indexOf('const LuxeMedia = {'), source.indexOf('const LuxeStorage = {')) + '\nwindow.LuxeMedia = LuxeMedia;', context);
  return context.LuxeMedia;
}

test('bundled images keep their source in file, local HTTP, and hosted previews', () => {
  for (const base of ['file:///C:/store/Frontend/men.html', 'http://127.0.0.1:5500/men.html', 'http://192.168.1.5:5500/Frontend/men.html', 'https://store.example/men.html']) {
    const media = mediaAt(base);
    const expected = new URL('assets/products/ijele.jpg', base).href;
    assert.equal(media.safeImageUrl('assets/products/ijele.jpg'), expected, base);
    assert.equal(media.responsive('assets/products/ijele.jpg').original, expected, base);
    assert.ok(media.attributes('assets/products/ijele.jpg').includes('src="' + expected + '"'), base);
    assert.equal(media.safeImageUrl(expected), expected, 'saved absolute bundled URLs');
  }
});

test('local asset support does not admit other files or unsafe remote sources', () => {
  for (const base of ['file:///C:/store/Frontend/shop.html', 'http://store.example/shop.html', 'https://store.example/shop.html']) {
    const media = mediaAt(base);
    for (const value of ['', 'javascript:alert(1)', 'data:text/html,test', 'file:///C:/private/photo.jpg', 'file://other-host/share/photo.jpg', 'assets/../private.jpg', 'assets/%2e%2e%2fprivate.jpg', 'http://other.example/assets/product.jpg']) {
      // HTTPS store URLs still follow the established HTTPS image policy.
      if (base.startsWith('https:') && value.startsWith('assets/')) continue;
      assert.equal(media.safeImageUrl(value), '', base + ': ' + value);
    }
    assert.equal(media.safeImageUrl('https://res.cloudinary.com/demo/image/upload/v1/tee.jpg'), 'https://res.cloudinary.com/demo/image/upload/v1/tee.jpg');
  }
});
