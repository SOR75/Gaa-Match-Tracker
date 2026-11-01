import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {registerOfflineApp} from '../src/pwa-updates.js';
const origin='https://sideline.test';
function worker(fetcher, {timeout=false}={}) {
 const handlers={},stores=new Map(),calls=[];
 const key=x=>new URL(typeof x==='string'?x:x.url,origin).href;
 const caches={
  async open(name){
   if(!stores.has(name))stores.set(name,new Map());const entries=stores.get(name);
   return {async match(req){return entries.get(key(req))?.clone();},async put(req,response){entries.set(key(req),response.clone());},async addAll(requests){
    const ready=[];for(const req of requests){calls.push(req);const res=await fetcher(req);if(!res.ok)throw Error('Incomplete shell');ready.push([key(req),res]);}
    for(const [url,res] of ready)entries.set(url,res);
   }};
  },async keys(){return [...stores.keys()];},async delete(name){return stores.delete(name);},
 };
 class BrowserRequest extends Request {constructor(url,options){super(new URL(url,origin),options);}}
 const sandbox={URL,self:{location:{origin},addEventListener:(type,fn)=>handlers[type]=fn},caches,fetch:fetcher,Request:BrowserRequest,AbortController,
  setTimeout:timeout?(fn=>{queueMicrotask(fn);return 0;}):setTimeout,clearTimeout};
 for(const field of ['localStorage','indexedDB'])Object.defineProperty(sandbox,field,{get(){throw Error('Business storage accessed');}});
 vm.runInNewContext(readFileSync('public/sw.js','utf8').replace('__BUILD_VERSION__','test').replace('/* __PRECACHE_ASSETS__ */','"/assets/current.js",'),sandbox);
 return {stores,caches,calls,async cache(name,path,response){await(await caches.open(name)).put(path,response);},
  dispatch(type,request){let promise;handlers[type]({request,respondWith:p=>promise=p,waitUntil:p=>promise=p});return promise;}};
}
const html=text=>new Response(text,{headers:{'content-type':'text/html'}});
const nav={method:'GET',mode:'navigate',url:origin+'/'};
test('online navigation gets fresh HTML with no-store and never overwrites the complete cached offline shell',async()=>{
 let options;const w=worker(async(req,opts)=>{options=opts;return html('new online shell');});await w.cache('sideline-test','/index.html',html('offline shell'));
 assert.equal(await(await w.dispatch('fetch',nav)).text(),'new online shell');assert.equal(options.cache,'no-store');
 assert.equal(await(await(await w.caches.open('sideline-test')).match('/index.html')).text(),'offline shell');
});
test('offline navigation retains the cached shell',async()=>{
 const w=worker(async()=>{throw Error('offline');});await w.cache('sideline-test','/index.html',html('complete shell'));
 assert.equal(await(await w.dispatch('fetch',nav)).text(),'complete shell');
});
test('server error does not poison a working offline shell',async()=>{
 const w=worker(async()=>new Response('unavailable',{status:503}));await w.cache('sideline-test','/index.html',html('good shell'));
 assert.equal(await(await w.dispatch('fetch',nav)).text(),'good shell');
});
test('navigation timeout falls back instead of indefinitely hanging a pitch-side launch',async()=>{
 const w=worker(async(req,{signal})=>{if(signal.aborted)throw Error('aborted');return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))));},{timeout:true});
 await w.cache('sideline-test','/index.html',html('cached'));assert.equal(await(await w.dispatch('fetch',nav)).text(),'cached');
});
test('non-HTML network errors cannot replace the offline app document',async()=>{
 const w=worker(async()=>new Response('proxy response',{headers:{'content-type':'text/plain'}}));await w.cache('sideline-test','/index.html',html('cached'));assert.equal(await(await w.dispatch('fetch',nav)).text(),'cached');
});
test('hashed assets stay cache-first and do not require internet',async()=>{
 const w=worker(async()=>{throw Error('network should not be used');});await w.cache('sideline-test','/assets/current.js',new Response('immutable JS'));
 assert.equal(await(await w.dispatch('fetch',{...nav,mode:'cors',url:origin+'/assets/current.js'})).text(),'immutable JS');
});
test('waiting-worker immutable chunks are usable offline without activating it or reloading the live app',async()=>{
 const w=worker(async()=>{throw Error('offline');});await w.cache('sideline-waiting','/assets/new-hash.js',new Response('new immutable chunk'));
 assert.equal(await(await w.dispatch('fetch',{...nav,mode:'cors',url:origin+'/assets/new-hash.js'})).text(),'new immutable chunk');
});
test('install precaches the entire shell using reload requests',async()=>{
 const w=worker(async()=>new Response('asset'));await w.dispatch('install');assert.ok(w.calls.length>8);assert.ok(w.calls.every(r=>r.cache==='reload'));
});
test('failed installation leaves the previous complete app cache intact',async()=>{
 const w=worker(async req=>req.url.endsWith('current.js')?new Response('',{status:404}):html('new'));await w.cache('sideline-previous','/index.html',html('previous'));
 await assert.rejects(w.dispatch('install'));assert.equal(await(await(await w.caches.open('sideline-previous')).match('/index.html')).text(),'previous');
});
test('activation retires application caches only, without accessing Local Storage or IndexedDB',async()=>{
 const w=worker(async()=>html('new'));await w.cache('sideline-old','/',html('old'));await w.cache('other-app','/',html('other'));await w.cache('sideline-test','/',html('new'));
 await w.dispatch('activate');assert.deepEqual(await w.caches.keys(),['other-app','sideline-test']);
});
test('worker ignores writes and cross-origin requests',()=>{
 const w=worker(async()=>{throw Error('unexpected fetch');});assert.equal(w.dispatch('fetch',{...nav,method:'POST'}),undefined);assert.equal(w.dispatch('fetch',{...nav,url:'https://elsewhere.test/'}),undefined);
});
test('update discovery bypasses HTTP cache, checks on reconnection, announces waiting worker and never forces activation/reload',async()=>{
 const registration=new EventTarget(),online=new EventTarget();let updates=0,status='',notices=[];
 Object.assign(registration,{waiting:null,installing:null,update:async()=>{updates++;}});
 const sw={controller:{},ready:Promise.resolve(),register:async(path,options)=>{assert.equal(path,'/sw.js');assert.deepEqual(options,{updateViaCache:'none'});return registration;}};
 await registerOfflineApp({serviceWorker:sw,onlineTarget:online,isOnline:()=>true,onStatus:s=>status=s,onUpdate:m=>notices.push(m)});
 assert.equal(status,'Offline app ready');assert.equal(updates,1);
 registration.waiting={};registration.dispatchEvent(new Event('updatefound'));online.dispatchEvent(new Event('online'));await new Promise(r=>setImmediate(r));
 assert.equal(updates,2);assert.equal(notices.length,1);assert.match(notices[0],/after the match/);
});
test('failed/offline update checks do not prevent an already installed tracker reporting offline readiness',async()=>{
 const registration=new EventTarget();registration.update=async()=>{throw Error('offline');};
 let status;await registerOfflineApp({serviceWorker:{controller:{},ready:Promise.resolve(),register:async()=>registration},onlineTarget:new EventTarget(),isOnline:()=>true,onStatus:s=>status=s});
 assert.equal(status,'Offline app ready');
});
test('fresh online build metadata does not overwrite the offline build snapshot',async()=>{
 const w=worker(async()=>new Response('{"version":"new"}',{headers:{'content-type':'application/json'}}));await w.cache('sideline-test','/build-info.json',new Response('{"version":"cached"}'));
 const r=await w.dispatch('fetch',{...nav,url:origin+'/build-info.json'});assert.equal((await r.json()).version,'new');assert.equal((await(await(await w.caches.open('sideline-test')).match('/build-info.json')).json()).version,'cached');
});
test('installed-worker state announces safely even before registration.waiting becomes visible',async()=>{
 const registration=new EventTarget(),installing=new EventTarget();let notices=0;
 Object.assign(registration,{installing,waiting:null,update:async()=>{}});installing.state='installing';
 await registerOfflineApp({serviceWorker:{controller:{},ready:Promise.resolve(),register:async()=>registration},onlineTarget:new EventTarget(),isOnline:()=>false,onUpdate:()=>notices++});
 installing.state='installed';installing.dispatchEvent(new Event('statechange'));assert.equal(notices,1);
});
