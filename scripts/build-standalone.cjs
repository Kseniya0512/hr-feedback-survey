const fs=require('node:fs');
const path=require('node:path');

function buildStandalone(root){
 let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const styles=fs.readFileSync(path.join(root,'styles.css'),'utf8');
 const scriptFiles=[...html.matchAll(/<script src="(js\/[^"]+)" defer><\/script>/g)].map(match=>match[1]);
 if(scriptFiles.length!==4)throw new Error('Unexpected entry-point scripts; review standalone build inputs.');
 html=html.replace(/^[ \t]*<script src="js\/[^"]+" defer><\/script>\r?\n/gm,'');
 html=html.replace('<link rel="stylesheet" href="styles.css">',()=>`<style>\n${styles}\n</style>`);
 const scripts=scriptFiles.map(file=>{
  const source=fs.readFileSync(path.join(root,file),'utf8');
  if(/<\/script/i.test(source))throw new Error('Escape closing script tags in '+file+' before embedding.');
  return `<script>\n${source}\n</script>`;
 }).join('\n');
 // Inline scripts run at the end of body: defer has no effect on inline JS.
 return html.replace('</body>',()=>scripts+'\n</body>');
}
if(require.main===module){
 const root=path.resolve(__dirname,'..');
 fs.writeFileSync(path.join(root,'HR-feedback.html'),buildStandalone(root));
 console.log('Built HR-feedback.html: all application code and styles included.');
}
module.exports={buildStandalone};
