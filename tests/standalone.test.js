const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {buildStandalone}=require('../scripts/build-standalone.cjs');
const root=path.resolve(__dirname,'..');
test('portable HTML embeds current sources in executable order after the DOM',()=>{
 const output=buildStandalone(root);
 assert.equal(fs.readFileSync(path.join(root,'HR-feedback.html'),'utf8'),output,'committed download matches current sources');
 assert.ok(!/<script[^>]+src=/i.test(output));
 assert.ok(!/<link[^>]+href="styles.css"/i.test(output));
 const dom=output.indexOf('<div id="app">');
 let previous=dom;
 for(const file of ['surveys.js','core.js','storage.js','app.js']){
  const source=fs.readFileSync(path.join(root,'js',file),'utf8');
  const position=output.indexOf(source);
  assert.ok(position>previous,file+' executes after dependencies and DOM');
  previous=position;
 }
 assert.ok(output.includes(fs.readFileSync(path.join(root,'styles.css'),'utf8')));
});
