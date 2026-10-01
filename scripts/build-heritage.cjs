// The output is committed so the static host does not need a build step.
const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
esbuild.buildSync({
  entryPoints: [path.join(__dirname, 'heritage-renderer.mjs')],
  outfile: path.join(__dirname, '../Frontend/js/heritage/renderer.js'),
  bundle: true, minify: true, format: 'esm', target: ['es2020'],
  legalComments: 'eof',
});
fs.copyFileSync(path.join(__dirname, '../node_modules/three/LICENSE'), path.join(__dirname, '../Frontend/js/heritage/THREE-LICENSE.txt'));
const decoderDir = path.join(__dirname, '../Frontend/js/heritage/draco');
fs.mkdirSync(decoderDir, {recursive: true});
for (const name of ['draco_wasm_wrapper.js', 'draco_decoder.wasm', 'draco_decoder.js']) {
  fs.copyFileSync(path.join(__dirname, '../node_modules/three/examples/jsm/libs/draco/gltf', name), path.join(decoderDir, name));
}
console.log('Built local, deferred heritage renderer.');
