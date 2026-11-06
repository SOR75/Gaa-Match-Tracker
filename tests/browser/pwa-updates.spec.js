import {readFileSync} from 'node:fs';
const RELEASE_VERSION=JSON.parse(readFileSync('public/build-info.json','utf8')).version;
import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {updateServer} from '../helpers/pwa-server.js';
import {blankMatch,createEvent,saveEvent} from '../../src/domain.js';
import {snapshotSquad,loadSquadPlayers} from '../../src/squads.js';
import {HISTORY_DB,HISTORY_STORE} from '../../src/history.js';
const nav=(page,name)=>page.getByRole('button',{name,exact:true}).click();
const state=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('sideline.match.v1')));
const root='/workspace/sideline-v0393-review';
async function installed(page){await page.evaluate(()=>navigator.serviceWorker.ready);}
async function controlled(page,url){await installed(page);await page.goto(url);await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));}
async function waiting(page){await expect.poll(()=>page.evaluate(async()=>Boolean((await navigator.serviceWorker.getRegistration())?.waiting)),{timeout:20000}).toBe(true);}
async function storage(page){return page.evaluate(async({dbName,storeName})=>{
 const local=Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]));
 const rows=await new Promise((resolve,reject)=>{const r=indexedDB.open(dbName,1);r.onupgradeneeded=()=>r.result.createObjectStore(storeName,{keyPath:'id'});r.onerror=()=>reject(r.error);r.onsuccess=()=>{const d=r.result;const tx=d.transaction(storeName,'readonly');const get=tx.objectStore(storeName).getAll();get.onsuccess=()=>resolve(get.result);tx.oncomplete=()=>d.close();};});return {local,rows};
 },{dbName:HISTORY_DB,storeName:HISTORY_STORE});}
async function seed(page){
 const squad=snapshotSquad('Persistent test squad',Array.from({length:15},(_,i)=>({name:`Review ${i+1}`,number:i+1,role:'starter'})));
 const m=blankMatch();m.setup.ourTeam='PWA Home';m.setup.opposition='PWA Away';m.players=loadSquadPlayers(squad);
 const archived=blankMatch();archived.setup.ourTeam='History Home';archived.setup.opposition='History Away';archived.players=loadSquadPlayers(squad);archived.events=saveEvent([],{...createEvent(archived,'point','our'),playerNumber:'8'},archived);
 await page.evaluate(async({m,squad,archived,dbName,storeName})=>{
  localStorage.setItem('sideline.match.v1',JSON.stringify(m));localStorage.setItem('sideline.squads.v2',JSON.stringify({version:2,squads:[squad]}));localStorage.setItem('sideline.match.archive.'+archived.id,JSON.stringify(archived));localStorage.setItem('unrelated-device-key','preserve');
  await new Promise((resolve,reject)=>{const r=indexedDB.open(dbName,1);r.onupgradeneeded=()=>r.result.createObjectStore(storeName,{keyPath:'id'});r.onerror=()=>reject(r.error);r.onsuccess=()=>{const d=r.result;const tx=d.transaction(storeName,'readwrite');tx.objectStore(storeName).put({repositoryVersion:1,id:archived.id,match:archived,origin:'test'});tx.oncomplete=()=>{d.close();resolve();};};});
 },{m,squad,archived,dbName:HISTORY_DB,storeName:HISTORY_STORE});
 await page.reload();await nav(page,'Live match');return m;
}
test('legacy cache-first bootstrap upgrades without clearing stores, forcing a live reload or losing offline paired capture',async({page,context})=>{
 test.setTimeout(60000);const server=await updateServer();
 try{
  await page.goto(server.url);await controlled(page,server.url);await seed(page);await expect(page).toHaveTitle('Legacy cached shell');
  await nav(page,'Start clock');await page.locator('[data-event="point"]').click();await nav(page,'Close shot details');const before=await storage(page);let navigations=0;page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
  server.setPhase('new');const fresh=await context.newPage();
  // A unique same-origin query bypasses the legacy worker's exact cached '/' key.
  await fresh.goto(server.url+'/?sideline-update=0393');await expect(fresh).toHaveTitle(`Sideline V${RELEASE_VERSION}`);await waiting(fresh);
  expect(navigations).toBe(0);await expect(page).toHaveTitle('Legacy cached shell');expect(await storage(page)).toEqual(before);expect((await state(page)).clock.startedAt).not.toBeNull();
  await page.waitForTimeout(800);await page.locator('[data-event="point"]').click();await nav(page,'Close shot details');expect((await state(page)).events).toHaveLength(2);
  const saved=await storage(page);await fresh.close();await page.close();await context.setOffline(true);
  const reopened=await context.newPage();await reopened.goto(server.url);await expect(reopened).toHaveTitle(`Sideline V${RELEASE_VERSION}`);await expect(reopened.locator('.topbar .build-tag')).toHaveText(`V${RELEASE_VERSION}`);expect(await storage(reopened)).toEqual(saved);
  await nav(reopened,'Live match');await reopened.getByRole('button',{name:'Turnover Won',exact:true}).click();expect((await state(reopened)).events).toHaveLength(2);await expect(reopened.locator('[data-turnover-form]')).toBeVisible();await reopened.locator('[data-turnover-our="8"]').click();await nav(reopened,'Record turnover');expect((await state(reopened)).events).toHaveLength(3);
  await nav(reopened,'Match History');await expect(reopened.locator('[data-history-id]')).toHaveCount(2);
 }finally{await server.close();}
});
test('online navigation receives new HTML while an older open client stays uninterrupted; offline retains complete shell',async({page,context})=>{
 test.setTimeout(60000);const server=await updateServer();server.setPhase('A');
 try{
  await page.goto(server.url);await controlled(page,server.url);await seed(page);await expect(page).toHaveTitle('Cached shell A');const before=await storage(page);
  server.setPhase('B');await context.setOffline(true);await context.setOffline(false);await waiting(page);await expect(page.locator('#toast')).toContainText('An app update is ready');
  const next=await context.newPage();await next.goto(server.url);await expect(next).toHaveTitle('Network shell B');await expect(page).toHaveTitle('Cached shell A');expect(await storage(page)).toEqual(before);
  const cached=await page.evaluate(async()=>await(await(await caches.open('sideline-test-A')).match('/index.html')).text());expect(cached).toContain('Cached shell A');expect(cached).not.toContain('Network shell B');
  await context.setOffline(true);await next.reload();await expect(next).toHaveTitle('Cached shell A');expect(await storage(next)).toEqual(before);
 }finally{await server.close();}
});
test('failed candidate precache/server failure keep the previous app offline and preserve Local Storage/IndexedDB',async({page,context})=>{
 test.setTimeout(60000);const server=await updateServer();server.setPhase('A');
 try{
  await page.goto(server.url);await controlled(page,server.url);await seed(page);const before=await storage(page);
  server.setPhase('B');server.setBroken(true);await page.evaluate(async()=>{try{await(await navigator.serviceWorker.getRegistration()).update();}catch{}});
  await expect.poll(()=>page.evaluate(async()=>(await caches.keys()).includes('sideline-test-B'))).toBe(true);
  server.setUnavailable(true);await page.reload();await expect(page).toHaveTitle('Cached shell A');expect(await storage(page)).toEqual(before);
  await context.setOffline(true);await page.reload();await expect(page).toHaveTitle('Cached shell A');expect(await storage(page)).toEqual(before);await nav(page,'Live match');await page.locator('[data-event="point"]').click();await nav(page,'Close shot details');expect((await state(page)).events).toHaveLength(1);
 }finally{await server.close();}
});
test('V0.3.9.3 visible production identity and both real Live Match buttons preserve paired capture unchanged',async({page,request})=>{
 await mkdir(root,{recursive:true});await page.setViewportSize({width:1024,height:768});await page.goto('/');
 await page.getByLabel('Our team',{exact:true}).fill('Candidate Home');await page.getByLabel('Opposition',{exact:true}).fill('Candidate Away');await nav(page,'Continue to squad');
 for(const team of ['our','opposition']){
  await page.locator(`[data-squad-team="${team}"]`).click();
  for(const n of [8,10,12]){await page.getByLabel('Jersey number',{exact:true}).fill(String(n));await page.getByLabel('Player name',{exact:true}).fill(`${team} Candidate ${n}`);await nav(page,'Add player');}
 }
 await nav(page,'Live match');await expect(page.locator('.matchday-toolbar .build-tag')).toHaveText(`V${RELEASE_VERSION}`);await page.screenshot({path:`${root}/0393-visible-version.png`});
 const info=await(await request.get('/build-info.json')).json();expect((await page.evaluate(()=>window.__SIDELINE_BUILD__)).sourceCommit).toBe(info.sourceCommit);
 for(const [label,ours,theirs,count] of [['Won',8,12,0],['Lost',10,8,1]]){
  await page.getByRole('button',{name:`Turnover ${label}`,exact:true}).click();expect((await state(page)).events).toHaveLength(count);await expect(page.locator('[data-turnover-form]')).toBeVisible();await expect(page.getByRole('button',{name:'Record turnover',exact:true})).toBeDisabled();
  await page.locator(`[data-turnover-our="${ours}"]`).click();await page.locator(`[data-turnover-opposition="${theirs}"]`).click();await page.screenshot({path:`${root}/0393-turnover-${label.toLowerCase()}.png`});await nav(page,'Record turnover');const m=await state(page);expect(m.events).toHaveLength(count+1);expect(m.events.at(-1).pairedTurnoverVersion).toBe(1);
 }
 await nav(page,'Match analysis');await nav(page,'Full Match Report');for(const label of ['Turnovers won','Turnovers lost'])await expect(page.locator('.report-view tr').filter({has:page.getByRole('rowheader',{name:label,exact:true})}).first().locator('td')).toHaveText(['1','1']);
});
