// Focused shared-flow regression run. Keep one browser suite active at a time
// on machines where several Chromium instances exhaust available memory.
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const result=spawnSync(process.execPath,['--test',...(process.argv.includes('--audit-only')?['--test-name-pattern=all pages load']:[]),'tests/browser/storefront.test.cjs'],{
  cwd:path.resolve(__dirname,'..'),stdio:'inherit',
  env:{...process.env,AUDIT_PAGES:'index.html,shop.html,product.html,cart.html,checkout.html,login.html,contact.html,videos.html'},
});
process.exitCode=result.status??1;
