import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {retiredAssetsServer} from '../helpers/retired-assets-server.js';
import {snapshotSquad} from '../../src/squads.js';
import {onFieldPlayers} from '../../src/participation.js';
const nav=(p,name)=>p.getByRole('button',{name,exact:true}).click();
const state=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('sideline.match.v1')));
const fixture=JSON.parse(readFileSync('tests/fixtures/programme-structure/vincents-style-ordered.json','utf8'));
const readRows=p=>p.locator('[data-review-row]').evaluateAll(rs=>rs.map(r=>Object.fromEntries([...r.querySelectorAll('input,select')].map(e=>[e.name,e.value]))));
async function setup(page,url='/') {await page.goto(url);await page.getByLabel('Our team',{exact:true}).fill('Import Home');await page.getByLabel('Opposition',{exact:true}).fill('Import Away');await nav(page,'Continue to squad');}
test.describe('immutable asset retirement',()=>{
 test.use({serviceWorkers:'block'});
 test('real production photo OCR needs no deferred app chunk, starts its worker only on import and preserves all match stores',async({page})=>{
  test.setTimeout(120000);const server=await retiredAssetsServer();
  try{
   await page.addInitScript(()=>{window.ocrWorkerStarts=[];const Original=window.Worker;window.Worker=class extends Original{constructor(url,options){super(url,options);window.ocrWorkerStarts.push(String(url));}};});
   await setup(page,server.url);await nav(page,'Live match');await page.locator('[data-event=point]').click();await nav(page,'Close shot details');await nav(page,'Squad');
   expect(await page.evaluate(()=>window.ocrWorkerStarts)).toEqual([]);
   const squad=snapshotSquad('Retained Saved Squad',[{number:8,name:'Saved Player',role:'starter'}]);
   await page.evaluate(async squad=>{
    localStorage.setItem('sideline.squads.v2',JSON.stringify({version:2,squads:[squad]}));
    const match=JSON.parse(localStorage.getItem('sideline.match.v1'));
    localStorage.setItem('sideline.match.archive.keep',JSON.stringify({...match,id:'keep'}));
    await new Promise((resolve,reject)=>{const r=indexedDB.open('sideline.history',1);r.onupgradeneeded=()=>r.result.createObjectStore('matches',{keyPath:'id'});r.onsuccess=()=>{const db=r.result,t=db.transaction('matches','readwrite');t.objectStore('matches').put({id:'ocr-regression-history',match:{...match,id:'ocr-regression-history'}});t.oncomplete=()=>{db.close();resolve();};t.onerror=()=>reject(t.error);};r.onerror=()=>reject(r.error);});
   },squad);
   const saved=()=>page.evaluate(async()=>({local:Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)])),history:await new Promise((resolve,reject)=>{const r=indexedDB.open('sideline.history',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('matches').objectStore('matches').getAll();q.onsuccess=()=>{db.close();resolve(q.result);};q.onerror=()=>reject(q.error);};})}));
   const before=await saved();await page.evaluate(()=>document.fonts.ready);server.retire();const at=server.requests.length;
   await page.locator('#team-sheet-photo').setInputFiles('tests/fixtures/programme.jpg');await expect(page.getByRole('heading',{name:'Review & confirm',exact:true})).toBeVisible({timeout:95000});
   expect((await readRows(page)).length).toBeGreaterThan(1);expect(await page.evaluate(()=>window.ocrWorkerStarts.length)).toBeGreaterThan(0);expect(server.requests.slice(at).filter(p=>/^\/assets\/.*\.js$/.test(p))).toEqual([]);expect(await saved()).toEqual(before);await nav(page,'Cancel import');expect((await state(page)).events).toHaveLength(1);
  }finally{await server.close();}
 });
});
test('real OCR of controlled ordered-list raster imports all 29 with XV/sub roles and no metadata rows',async({page},info)=>{
 test.setTimeout(120000);await setup(page);
 const bytes=await page.evaluate(words=>{const c=document.createElement('canvas');c.width=1180;c.height=1400;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,c.width,c.height);x.fillStyle='black';x.font='26px Arial';for(const w of words)x.fillText(w.text,w.x+20,w.y+30);return c.toDataURL('image/png').split(',')[1];},fixture.words);
 await page.locator('#team-sheet-photo').setInputFiles({name:'controlled-ordered-list.png',mimeType:'image/png',buffer:Buffer.from(bytes,'base64')});await expect(page.getByRole('heading',{name:'Review & confirm',exact:true})).toBeVisible({timeout:95000});const rows=await readRows(page);expect(rows.map(({number,name,role})=>({number,name,role}))).toEqual(fixture.expected);await info.attach('controlled-raster.png',{body:Buffer.from(bytes,'base64'),contentType:'image/png'});
});
test('ordered 29-player text/table import enriches the real current match and preserves events/substitutions while new high jerseys stay bench',async({page})=>{
 await setup(page);await nav(page,'Live match');await page.locator('[data-event=point]').click();await page.locator('[data-shot-player="2"]').click();await nav(page,'Close shot details');await page.locator('[data-event=substitution]').click();await page.locator('[data-sub-on="18"]').click();await page.locator('[data-sub-off="2"]').click();await nav(page,'Record substitution');const before=await state(page),active=onFieldPlayers(before,'our').map(p=>p.id);
 await nav(page,'Squad');await page.locator('#team-sheet-file').setInputFiles({name:'ordered-team.csv',mimeType:'text/csv',buffer:Buffer.from('Jersey,Player Name\n'+fixture.expected.map(p=>`${p.number},${p.name}`).join('\n'))});await expect(page.getByRole('heading',{name:'Review & confirm',exact:true})).toBeVisible();const rows=await readRows(page);expect(rows.map(({number,name,role})=>({number,name,role}))).toEqual(fixture.expected);await expect(page.locator('[data-import-starters]')).toBeHidden();await nav(page,'Confirm & add to squad');const after=await state(page);expect(after.events).toEqual(before.events);expect(onFieldPlayers(after,'our').map(p=>p.id)).toEqual(active);expect(after.players.find(p=>p.number===2).id).toBe(before.players.find(p=>p.number===2).id);expect(after.players.filter(p=>p.name)).toHaveLength(29);for(const n of [24,25,26,27,28,29])expect(after.players.find(p=>p.number===n).role).toBe('substitute');await nav(page,'Timeline');await expect(page.locator('.event-row').filter({hasText:'Point'})).toContainText('Nora Quinn');
});
test.describe('original programme on scalar OCR core',()=>{
 test.use({serviceWorkers:'block'});
 test('exact St Manchans camera original retains #1, all fifteen starters and eleven substitute candidates',async({page},info)=>{
  test.setTimeout(120000);
  await page.route('**/ocr/tesseract-core-*.wasm.js',r=>r.fulfill({contentType:'application/javascript',body:readFileSync('node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js')}));
  await setup(page);await page.locator('#team-sheet-photo').setInputFiles('tests/fixtures/field-programmes/st-manchans-camera.png');await expect(page.getByRole('heading',{name:'Review & confirm',exact:true})).toBeVisible({timeout:95000});const rows=await readRows(page);expect(rows.filter(p=>p.role==='starter')).toHaveLength(15);expect(rows.filter(p=>p.role==='substitute')).toHaveLength(11);expect(rows.find(p=>p.number==='1').name).toBe('Cliona Molloy');expect(rows.some(p=>p.number==='20'||p.number==='25')).toBe(false);await info.attach('scalar-original-rows.json',{body:JSON.stringify(rows,null,2),contentType:'application/json'});
 });
});
