const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const frontend = path.resolve(__dirname, '../Frontend');

test('public templates ship the finished navigation without a blocking page spinner', () => {
  for (const name of fs.readdirSync(frontend).filter(name => name.endsWith('.html') && name !== 'admin.html')) {
    const html = fs.readFileSync(path.join(frontend, name), 'utf8');
    const body = html.match(/<body\b[^>]*>/)[0];
    assert.ok(body.includes(`page-${name.slice(0, -5)}`), name);
    assert.doesNotMatch(html, /id=["']loader["']/, name);
    if (name === 'auth-callback.html') continue;
    const header = html.match(/<header\b[^>]*id=["']navbar["'][\s\S]*?<\/header>/)[0];
    assert.match(header, /class=["']luxury-navbar["']/, name);
    assert.match(header, /class=["']brand-mark["']/, name);
    if (name !== 'verify-signup.html') {
      const search = header.match(/<(\w+)\b[^>]*id=["']searchToggle["'][\s\S]*?<\/\1\s*>/);
      assert.ok(search, `${name}: missing search control`);
      assert.match(search[0], /class=["']nav-svg-icon["']/, name);
    }
    const nav = header.match(/<nav\b[\s\S]*?<\/nav>/)[0];
    assert.equal([...nav.matchAll(/<a\b/g)].length, 6, name);
  }
});

test('styles and fonts resolve locally without duplicate font CSS or missing font files', () => {
  for (const name of fs.readdirSync(frontend).filter(name => name.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(frontend, name), 'utf8');
    const styles = [...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/g)].map(([tag]) => tag.match(/href=["']([^"']+)/)[1]);
    assert.ok(styles.every(href => !href.startsWith('http')), name);
    assert.equal(new Set(styles.map(href => href.split('?')[0])).size, styles.length, name);
  }
  for (const name of ['variables.css', 'icons.css']) {
    const css = fs.readFileSync(path.join(frontend, 'css', name), 'utf8');
    assert.equal(/@import\s/.test(css), false, `${name}: font imports must not return`);
    for (const [, font] of css.matchAll(/url\(([^)]+\.woff2)\)/g)) {
      assert.equal(fs.readFileSync(path.resolve(frontend, 'css', font)).subarray(0, 4).toString(), 'wOF2', font);
    }
  }
});
