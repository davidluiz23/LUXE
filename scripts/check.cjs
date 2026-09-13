const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../Frontend");
let scripts = 0;
let pages = 0;
for (const file of [
  ...fs.readdirSync(path.join(root, "js")).map((name) => `js/${name}`),
  "sw.js",
]) {
  if (!file.endsWith(".js")) continue;
  new vm.Script(fs.readFileSync(path.join(root, file), "utf8"), {
    filename: file,
  });
  scripts++;
}
for (const file of fs
  .readdirSync(root)
  .filter((name) => name.endsWith(".html"))) {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  assert.match(html, /<\/html>\s*$/i, `${file}: truncated HTML document`);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, `${file}: duplicate element IDs`);
  for (const [, , ref] of html.matchAll(/(?:src|href)=(["'])(.*?)\1/g)) {
    if (/^(?:https?:|\/\/|data:|mailto:|tel:|#)/.test(ref)) continue;
    const target = ref.split(/[?#]/)[0];
    assert.ok(
      fs.existsSync(path.join(root, target)),
      `${file}: missing local asset ${target}`,
    );
  }
  for (const [, attr, code] of html.matchAll(
    /<script\b([^>]*)>([\s\S]*?)<\/script>/g,
  )) {
    if (!code.trim()) continue;
    if (/type=["']application\/ld\+json["']/i.test(attr)) {
      JSON.parse(code);
    } else {
      new vm.Script(code, { filename: file });
    }
  }
  pages++;
}
console.log(
  `Checked ${scripts} scripts and ${pages} pages: syntax, duplicate IDs and local references pass.`,
);
