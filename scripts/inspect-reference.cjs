// Read-only visual reference capture. No forms, accounts, or writes to the site.
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
  const directory=path.resolve(__dirname,'../artifacts/reference');fs.mkdirSync(directory,{recursive:true});
  const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(file=>fs.existsSync(file));
  const browser=await chromium.launch({executablePath,headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900},ignoreHTTPSErrors:false});
    const response=await page.goto(process.argv[2]||'https://black-balance.shop/',{waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForTimeout(5000);
    const report=await page.evaluate(()=>({title:document.title,url:location.href,height:document.documentElement.scrollHeight,text:document.body.innerText.slice(0,12000),scripts:[...document.scripts].map(script=>script.src).filter(Boolean),canvas:document.querySelectorAll('canvas').length}));
    report.status=response?.status();
    fs.writeFileSync(path.join(directory,'site.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
    for(const [index,offset] of [0,650,1500,2500,3800,5200].entries()){
      await page.evaluate(y=>window.scrollTo(0,y),offset);await page.waitForTimeout(1300);
      await page.screenshot({path:path.join(directory,'reference-'+index+'.png')});
      console.log(JSON.stringify({index,scroll:await page.evaluate(()=>scrollY)}));
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
