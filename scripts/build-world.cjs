// Committed, local runtime bundles for the existing static hosting contract.
const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
require('./world/assemble-home.cjs');
const output = path.join(root, 'Frontend/js/world');
const result = esbuild.buildSync({
  entryPoints: { experience: path.join(__dirname, 'world/experience.mjs') },
  outdir: path.join(root, 'Frontend/js/world'), bundle: true, splitting: true,
  minify: true, format: 'esm', target: ['es2020'], legalComments: 'eof',
  chunkNames: '[name]-[hash]', metafile: true,
  write: true,
});
// Remove only superseded chunks from this build's own output directory.
const current = new Set(Object.keys(result.metafile.outputs).map(file => path.resolve(file)));
for (const file of fs.readdirSync(output)) {
  if (!/^(?:renderer|chunk)-[A-Z0-9]+\.js$/.test(file)) continue;
  const target = path.resolve(output, file);
  if (path.dirname(target) === output && !current.has(target)) fs.unlinkSync(target);
}
const licenses = path.join(root, 'Frontend/js/world/LICENSES');
fs.mkdirSync(licenses, {recursive: true});
for (const name of ['three', 'gsap', 'lenis']) {
  const directory = path.join(root, 'node_modules', name);
  const license = fs.readdirSync(directory).find(file => /^license(?:\.md|\.txt)?$/i.test(file));
  if (license) fs.copyFileSync(path.join(directory, license), path.join(licenses, name + '.txt'));
}
console.log('Built ALKEBULAN gallery: local motion shell + deferred Three.js world.');
