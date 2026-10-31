import {test,expect} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {reportMatch} from '../helpers/report-match.js';
import {completeMatch} from '../../src/history.js';
import {blankMatch,createEvent,saveEvent} from '../../src/domain.js';
import {coachReportMarkup} from '../../src/coach-report-ui.js';
const root='/workspace/sideline-v039-coach-report-review';
const nav=(p,n)=>p.getByRole('button',{name:n,exact:true}).click();
const raw=p=>p.evaluate(()=>localStorage.getItem('sideline.match.v1'));
async function load(page,m){await page.goto('/');await page.evaluate(m=>localStorage.setItem('sideline.match.v1',JSON.stringify(m)),m);await page.reload();}
async function pdfCheck(page,path){const buffer=await page.pdf({path,format:'A4',preferCSSPageSize:true,printBackground:true});const task=getDocument({data:new Uint8Array(buffer),useSystemFonts:true});const doc=await task.promise;expect(doc.numPages).toBe(5);for(let i=1;i<=5;i++){const p=await doc.getPage(i);const content=await p.getTextContent();const text=content.items.map(x=>x.str).join(' ');expect(text.length).toBeGreaterThan(100);expect(text).toContain(['MATCH SUMMARY','SHOOTING ANALYSIS','KICKOUTS & GOALKEEPERS','PLAYER CONTRIBUTIONS','MATCH DEVELOPMENT'][i-1]);}await task.destroy();}
for(const pattern of ['balanced','uneven'])test(`${pattern}: actual Coach Report and retained Full Match Data, printed A4 and unchanged match`,async({page})=>{
 await mkdir(root,{recursive:true});await page.setViewportSize({width:1024,height:768});await load(page,reportMatch(pattern));await nav(page,'Match analysis');const before=await raw(page);
 await nav(page,'Coach Report');await expect(page.locator('.coach-page')).toHaveCount(5);await expect(page.locator('[data-coach-page="1"]')).toContainText('Match observations');await expect(page.locator('[data-coach-page="2"] .gaelic-pitch')).toContainText('ATTACKS ↑ TOP');await expect(page.locator('[data-coach-page="4"]')).not.toContainText('Player 26');await expect(page.locator('[data-coach-page="4"]')).toContainText('Player 7');await expect(page.locator('[data-coach-page="3"]')).toContainText('Out of Play / Sideline');
 await pdfCheck(page,`${root}/Coach-Report-${pattern}-Saved-Match-Example.pdf`);expect(await raw(page)).toBe(before);
 await nav(page,'Full Match Data');await expect(page.getByRole('heading',{name:'Full Match Data',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Scoring timeline',exact:true})).toBeVisible();await expect(page.locator('.report-view')).not.toContainText('Player 26');await page.pdf({path:`${root}/Full-Match-Data-${pattern}-Example.pdf`,format:'A4',preferCSSPageSize:true,printBackground:true});
 await nav(page,'Coach Report');await expect(page.locator('.coach-page')).toHaveCount(5);expect(await raw(page)).toBe(before);
});
for(const slug of ['sml','rynaghs'])test(`${slug}: exact source-PDF facts produce a five-page honest review, with legible grouped players and no invented locations`,async({page})=>{
 await mkdir(root,{recursive:true});const model=JSON.parse(await readFile(`tests/fixtures/coach-report/${slug}-pdf-snapshot.json`,'utf8'));await page.setViewportSize({width:1024,height:768});await page.goto('/');await page.evaluate(html=>document.querySelector('#main').innerHTML=html,coachReportMarkup(model));
 await expect(page.locator('.coach-report')).toContainText('PDF-snapshot review');await expect(page.locator('.coach-map-unavailable')).toContainText('saved event coordinates');await expect(page.locator('.coach-players tbody tr')).toHaveCount(25);
 await pdfCheck(page,`${root}/Coach-Report-${slug}-Validated-PDF-Snapshot.pdf`);
 await page.emulateMedia({media:'print'});const fonts=await page.locator('.coach-players').evaluateAll(ns=>ns.map(n=>parseFloat(getComputedStyle(n).fontSize)));expect(fonts.every(n=>n>=12)).toBe(true);await page.emulateMedia({media:'screen'});
});
test('offline History offers both reports, keeps active/archive bytes unchanged and never resumes or edits a match',async({page,context})=>{
 await page.setViewportSize({width:1024,height:768});const archived=completeMatch(reportMatch()),active=blankMatch();active.setup.ourTeam='Current';active.setup.opposition='Visitors';await load(page,active);const key='sideline.match.archive.'+archived.id;await page.evaluate(({key,m})=>localStorage.setItem(key,JSON.stringify(m)),{key,m:archived});
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);await context.setOffline(true);const before=await raw(page),archiveBefore=await page.evaluate(key=>localStorage.getItem(key),key);
 await nav(page,'Match History');await page.locator(`[data-history-id="${archived.id}"]`).getByRole('button',{name:'VIEW MATCH',exact:true}).click();await page.locator('.history-tabs').getByRole('button',{name:'Coach Report',exact:true}).click();await expect(page.locator('.coach-page')).toHaveCount(5);await page.locator('.report-actions').getByRole('button',{name:'Full Match Data',exact:true}).click();await expect(page.locator('.report-view')).toContainText('Player shooting analysis');await page.locator('.report-actions').getByRole('button',{name:'Coach Report',exact:true}).click();await expect(page.locator('.coach-report')).toBeVisible();
 expect(await raw(page)).toBe(before);expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBe(archiveBefore);await expect(page.getByRole('button',{name:'Undo last event',exact:true})).toHaveCount(0);
});
test('phone and landscape report controls remain reachable without altering live capture',async({page})=>{
 await load(page,reportMatch());await nav(page,'Match analysis');for(const size of [{width:390,height:844},{width:1024,height:768}]){await page.setViewportSize(size);await nav(page,'Coach Report');await expect(page.getByRole('button',{name:'Print / Save as PDF',exact:true})).toBeVisible();const b=await page.locator('.coach-report').boundingBox();expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(size.width+1);await nav(page,'Back to analysis');}
 await nav(page,'Live match');await page.locator('[data-event="pass"]').click();await expect(page.locator('[data-pass-from]')).not.toHaveCount(0);await expect(page.locator('[data-pass-to]')).not.toHaveCount(0);await expect(page.getByRole('button',{name:'Kick Pass',exact:true})).toBeVisible();
});

test('report-only player refinement: missed-shot players remain; KO-only rows are concise; keeper/roster-only rows disappear without data changes',async({page})=>{
 await page.setViewportSize({width:1024,height:768});const m=reportMatch();
 // Existing fixture has keeper-only #1, explicit KO winner #8 and unused #26.
 for(const team of ['our','opposition'])for(let i=0;i<3;i++)m.events=saveEvent(m.events,{...createEvent(m,'miss',team),playerNumber:'15',timeMs:1801000+i*1000},m);
 await load(page,m);await nav(page,'Match analysis');const before=await raw(page);await nav(page,'Coach Report');const page4=page.locator('[data-coach-page="4"]');
 await expect(page4).not.toContainText('Player 1 · GK');await expect(page4).not.toContainText('Player 26');await expect(page4).not.toContainText('other attributed event');await expect(page4).not.toContainText('0/0');
 const ko=page4.getByRole('row').filter({has:page.getByRole('rowheader',{name:'#8 Player 8',exact:true})});await expect(ko).toContainText('KO wins');await expect(ko).toContainText('Marks');await expect(ko).not.toContainText('Shots');await expect(ko).not.toContainText('Score');await expect(ko).not.toContainText('TO');
 const missed=page4.getByRole('row').filter({has:page.getByRole('rowheader',{name:'#15 Player 15',exact:true})});await expect(missed).toHaveCount(2);for(const row of await missed.all()){await expect(row).toContainText('Shots 0/3');await expect(row).not.toContainText('Score');}
 await nav(page,'Full Match Data');const shooters=page.locator('.player-shooting-section');const events=page.locator('.player-event-section');for(const number of [1,8,26])await expect(shooters.getByRole('rowheader',{name:`${m.setup.ourTeam} · #${number} Player ${number}`,exact:true})).toHaveCount(0);await expect(shooters).toContainText('Player 13');await expect(events).toContainText('Player 8');await expect(events).not.toContainText('Player 26');expect(await raw(page)).toBe(before);
 await nav(page,'Live match');await expect(page.locator('[data-event="turnover-won"]')).toBeVisible();await nav(page,'Squad');await expect(page.locator('[data-edit-player]')).toHaveCount(26);expect(await raw(page)).toBe(before);
});
