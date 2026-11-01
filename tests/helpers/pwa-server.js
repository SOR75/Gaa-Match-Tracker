import {createServer} from 'node:http';
import {readFile,readdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const types={'.js':'application/javascript','.mjs':'application/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.woff':'font/woff','.woff2':'font/woff2'};
export async function updateServer() {
 const dist=resolve('dist'),html=await readFile(resolve(dist,'index.html'),'utf8'),sw=await readFile(resolve(dist,'sw.js'),'utf8');
 const legacySource=await readFile('tests/fixtures/pwa-update/legacy-cache-first-sw.js','utf8');
 const assets=[...(await readdir(resolve(dist,'assets'))).map(p=>'/assets/'+p),...(await readdir(resolve(dist,'ocr'))).map(p=>'/ocr/'+p)];
 const legacy=legacySource.replace('__BUILD_VERSION__','fixture-legacy').replace('/* __PRECACHE_ASSETS__ */',assets.map(p=>JSON.stringify(p)).join(',')+',"/assets/legacy-entry.js",');
 const entry=html.match(/src="(\/assets\/[^\"]+\.js)"/)[1];
 let phase='legacy',offlineServer=false,brokenInstall=false;
 const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  try {
   if(offlineServer && (path==='/'||path==='/index.html')){res.writeHead(503);res.end('server unavailable');return;}
   if(path==='/missing-update-asset.js'){res.writeHead(404);res.end('missing');return;}
   let body,kind=types[extname(path)]||'application/octet-stream';
   if(path==='/'||path==='/index.html'){
    kind='text/html';body=phase==='legacy'?html.replace(/<title>.*?<\/title>/,'<title>Legacy cached shell</title>').replace(entry,'/assets/legacy-entry.js'):phase==='A'?html.replace(/<title>.*?<\/title>/,'<title>Cached shell A</title>'):phase==='B'?html.replace(/<title>.*?<\/title>/,'<title>Network shell B</title>'):html;
   }else if(path==='/sw.js'){
    kind='application/javascript';body=phase==='legacy'?legacy:phase==='A'?sw.replace(/const CACHE = "[^"]+"/,'const CACHE = "sideline-test-A"'):phase==='B'?sw.replace(/const CACHE = "[^"]+"/,'const CACHE = "sideline-test-B"'):sw;
    if(brokenInstall)body=body.replace('const SHELL = [','const SHELL = ["/missing-update-asset.js",');
   }else{
    const file=path==='/assets/legacy-entry.js'?resolve(dist,entry.slice(1)):resolve(dist,'.'+path);
    if(!file.startsWith(dist+'/')){res.writeHead(403);res.end();return;}
    body=await readFile(file);
   }
   res.writeHead(200,{'Content-Type':kind,'Cache-Control':path==='/sw.js'?'no-store':'public, max-age=3600'});res.end(body);
  }catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {url:`http://127.0.0.1:${server.address().port}`,setPhase:p=>phase=p,setUnavailable:v=>offlineServer=v,setBroken:v=>brokenInstall=v,
  close:()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);})};
}
