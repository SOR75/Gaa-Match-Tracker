import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
// Models an open page whose deployment's hashed assets have been retired.
// No application code, OCR result or worker implementation is replaced.
export async function retiredAssetsServer() {
 const root=resolve('dist'),requests=[];let retired=false;
 const types={'.js':'application/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.woff':'font/woff','.woff2':'font/woff2'};
 const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname,filePath=path==='/'?'/index.html':path;
  requests.push(path);
  if(retired&&path.startsWith('/assets/')){res.writeHead(404);res.end('Retired deployment asset');return;}
  const file=resolve(root,'.'+filePath);if(!file.startsWith(root+'/')){res.writeHead(403);res.end();return;}
  try{const bytes=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(filePath)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);}catch{res.writeHead(404);res.end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 return {url:`http://127.0.0.1:${server.address().port}`,retire:()=>{retired=true;},requests,close:()=>new Promise(r=>{server.closeAllConnections();server.close(r);})};
}
