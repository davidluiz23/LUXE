// Source the existing header's interface symbols from one licensed icon family.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
(async () => {
  const names = ['magnifer-linear', 'bag-4-linear', 'bell-linear', 'user-rounded-linear', 'close-circle-linear', 'arrow-right-up-linear'];
  const directory = path.join(root, 'Frontend/assets/icons');
  fs.mkdirSync(directory, {recursive: true});
  const icons = [];
  for (const name of names) {
    const response = await fetch('https://api.iconify.design/solar/' + name + '.svg');
    if (!response.ok) throw new Error('Icon unavailable: ' + name);
    const svg = await response.text();
    fs.writeFileSync(path.join(directory, name + '.svg'), svg);
    icons.push(svg.replace('<svg ', '<svg class="nav-svg-icon" aria-hidden="true" focusable="false" '));
  }
  fs.writeFileSync(path.join(directory, 'SOURCES.md'), '# Solar icons\n\nSolar outline icons by 480 Design, sourced through Iconify. License: CC BY 4.0.\n\n- https://github.com/480-Design/Solar-Icon-Set\n- https://creativecommons.org/licenses/by/4.0/\n- https://icon-sets.iconify.design/solar/\n\nThe ALKEBULAN brand mark is the existing project asset, not part of Solar.\n');
})().catch(error => {console.error(error);process.exit(1);});
