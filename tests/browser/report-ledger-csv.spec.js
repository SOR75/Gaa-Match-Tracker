import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {reportMatch} from '../helpers/report-match.js';
import {flowMatch,addFlow} from '../helpers/match-flow-match.js';
import {completeMatch,HISTORY_DB,HISTORY_STORE} from '../../src/history.js';
import {parseCSV} from '../helpers/csv.js';
const nav=(p,n)=>p.getByRole('button',{name:n,exact:true}).click();
const raw=p=>p.evaluate(()=>localStorage.getItem('sideline.match.v1'));
async function load(p,m){await p.goto('/');await p.evaluate(m=>localStorage.setItem('sideline.match.v1',JSON.stringify(m)),m);await p.reload();}
async function csv(p){const wait=p.waitForEvent('download');await nav(p,'Download Timeline CSV');const d=await wait;return {name:d.suggestedFilename(),...parseCSV(await readFile(await d.path(),'utf8'))};}
function check(rows,m){expect(rows).toHaveLength(m.events.length);for(const e of m.events){const row=rows.find(r=>r['Event ID']===e.id);expect(row).toBeTruthy();expect(JSON.parse(row['Original Event JSON'])).toEqual(e);}}
test('actual current Timeline and report CSV buttons both retain all 82 original events and arbitrary metadata',async({page})=>{
 const m=reportMatch();m.events[0].customMetadata={zero:0,flag:false,missing:null,text:'Áine "quote",\nsecond line'};await load(page,m);const before=await raw(page);await nav(page,'Timeline');check((await csv(page)).rows,m);await nav(page,'Match analysis');await nav(page,'Full Match Report');await expect(page.locator('[data-report-event]')).toHaveCount(0);check((await csv(page)).rows,m);expect(await raw(page)).toBe(before);
});
for(const storage of ['legacy archive','native IndexedDB'])test(`${storage}: offline History exports selected archived ledger rather than active match, without editing or resuming`,async({page,context})=>{
 const active=flowMatch();active.id='active-csv-must-stay';addFlow(active,'point','our',1);const archived=completeMatch(reportMatch(),1);archived.id='archived-csv-'+(storage==='legacy archive'?'legacy':'native');archived.setup.ourTeam='Archived Team';archived.events[0].customMetadata={archive:storage,untouched:['one',0,false]};delete archived.events[0].shotSource;delete archived.events[0].scoreOrigin;
 await load(page,active);const key='sideline.match.archive.'+archived.id;
 if(storage==='legacy archive')await page.evaluate(({key,m})=>localStorage.setItem(key,JSON.stringify(m)),{key,m:archived});
 else await page.evaluate(async({m,dbName,store})=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(dbName,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(store))r.result.createObjectStore(store,{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});await new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put({repositoryVersion:1,id:m.id,match:m,origin:'app',archivedAt:'2026-11-06T12:00:00.000Z'});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();},{m:archived,dbName:HISTORY_DB,store:HISTORY_STORE});
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);const before=await raw(page),legacyBefore=await page.evaluate(key=>localStorage.getItem(key),key);await context.setOffline(true);
 await nav(page,'Match History');await page.locator(`[data-history-id="${archived.id}"]`).getByRole('button',{name:'VIEW MATCH',exact:true}).click();await page.locator('.history-tabs').getByRole('button',{name:'Full Match Report',exact:true}).click();const downloaded=await csv(page);expect(downloaded.name).toContain(archived.id);check(downloaded.rows,archived);expect(downloaded.rows.some(r=>r.Team==='Archived Team')).toBe(true);expect(await raw(page)).toBe(before);expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBe(legacyBefore);
 const stored=await page.evaluate(async({dbName,store,id})=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(dbName,1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const record=await new Promise((resolve,reject)=>{const r=db.transaction(store,'readonly').objectStore(store).get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});db.close();return record;},{dbName:HISTORY_DB,store:HISTORY_STORE,id:archived.id});expect(stored.match).toEqual(archived);await context.setOffline(false);
});
