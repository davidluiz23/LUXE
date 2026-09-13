// Transactional integration checks against the linked database. Nothing is committed.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'alkebulan-db-check-'));
const file = path.join(directory, 'check.sql');
try {
  let sql = 'begin;\n';
  if (process.argv.includes('--with-migration')) {
    sql += fs.readFileSync(path.join(root, 'supabase/migrations/20260913000031_storefront_content_and_audience.sql'), 'utf8')
      .replace(/^begin;\s*/i, '').replace(/commit;\s*$/i, '');
  }
  sql += fs.readFileSync(path.join(root, 'tests/storefront-database.sql'), 'utf8');
  sql += "\nrollback;\nselect 'Storefront permissions, saves, conflicts and audience accuracy checks passed; all test changes rolled back.' as result;\n";
  fs.writeFileSync(file, sql);
  const cli = path.join(root, 'node_modules/supabase/dist/supabase.js');
  const result = spawnSync(process.execPath, [cli, 'db', 'query', '--linked', '--file', file], { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(file, { force: true });
  fs.rmdirSync(directory);
}
