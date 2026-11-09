const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..');
 // Reproduce opening an HTML file on its own: no sibling CSS or JS is served.
 const portable=path.join(root,'HR-feedback.html');
 const html=fs.readFileSync(fs.existsSync(portable)?portable:path.join(root,'index.html'));
 const resources=[];
 const server=http.createServer((req,res)=>{if(req.url!=='/HR-feedback.html'){resources.push(req.url);res.writeHead(404).end();return;}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 const page=await browser.newPage({reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(`http://127.0.0.1:${server.address().port}/HR-feedback.html`);
  await page.waitForFunction(()=>document.querySelectorAll('[data-start]').length===2,{},{timeout:5000});
  assert.deepEqual(errors,[],'no startup JavaScript errors');
  assert.deepEqual(resources,[],'no companion files required');
  await page.locator('[data-start="implementer"]').click();
  await page.getByRole('button',{name:'Начать опрос',exact:true}).click();
  await page.getByLabel('Инициатор изменения',{exact:true}).check();
  await page.getByLabel('Подготовка плана внедрения',{exact:true}).check();
  await page.getByRole('button',{name:'Далее',exact:true}).click();
  await page.getByRole('heading',{name:'Понятность процесса',exact:true}).waitFor();
  await page.reload();await page.locator('[data-start="implementer"]').click();
  await page.getByRole('heading',{name:'Понятность процесса',exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  console.log('PASS: single HTML starts and restores draft with no sibling CSS/JS available');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
