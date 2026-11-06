import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {blankMatch} from '../../src/domain.js';
const root='/workspace/sideline-v039-shot-location-review';
const nav=(p,name)=>p.getByRole('button',{name,exact:true}).click();
const state=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('sideline.match.v1')));
async function load(page,first='top'){
 await mkdir(root,{recursive:true});await page.setViewportSize({width:1024,height:768});await page.clock.install({time:new Date('2026-10-31T12:00:00Z')});
 const m=blankMatch();m.setup.ourTeam='Home';m.setup.opposition='Away';m.setup.ourFirstHalfAttacks=first;
 await page.goto('/');await page.evaluate(m=>localStorage.setItem('sideline.match.v1',JSON.stringify(m)),m);await page.reload();await nav(page,'Live match');
}
async function shot(page,team,half,type,first,canonicalY){
 await page.clock.fastForward(1000);await page.locator(`[data-team="${team}"]`).click();await page.locator(`[data-event="${type}"]`).click();
 const bottom=(first==='bottom')!==((team==='opposition')!==(half===2));
 const pitch=page.getByRole('button',{name:'Shot location pitch',exact:true});await expect(page.locator('dialog')).toContainText(`attacks the ${bottom?'BOTTOM':'TOP'} goal`);
 const box=await pitch.boundingBox();await pitch.click({position:{x:box.width*.5,y:box.height*(bottom?1-canonicalY:canonicalY)}});await nav(page,'Done');
 const e=(await state(page)).events.at(-1);expect(e.half).toBe(half);expect(e.team).toBe(team);expect(e.shotX).toBeCloseTo(.5,2);expect(e.shotY).toBeCloseTo(canonicalY,2);return e;
}
async function topMarkers(svg,count){await expect(svg).toContainText('ATTACKS ↑ TOP');await expect(svg.locator('.shot-marker')).toHaveCount(count);const ys=await svg.locator('.shot-marker > circle:first-of-type').evaluateAll(ns=>ns.map(n=>+n.getAttribute('cy')));expect(ys.every(y=>y<450)).toBe(true);}
for(const first of ['top','bottom'])test(`${first} first-half direction: real both-team H1/H2 capture overlays at attacking top in HT/FT, filters, report and offline History without coordinate rewrites`,async({page,context})=>{
 test.setTimeout(60000);await load(page,first);
 for(const team of ['our','opposition']){await shot(page,team,1,'point',first,.18);await shot(page,team,1,'two-point',first,.35);}
 await nav(page,'HALF-TIME ANALYSIS');await topMarkers(page.getByRole('img',{name:'First-half shot map',exact:true}),2);
 await expect(page.locator('[data-ht-zone="inside"]')).toContainText('1 / 1');await expect(page.locator('[data-ht-zone="outside"]')).toContainText('1 / 1');
 if(first==='top')await page.screenshot({path:`${root}/01-h1-map.png`});
 await nav(page,'Return to Live Match');page.once('dialog',d=>d.accept());await nav(page,'Start second half');
 let h2Two;for(const team of ['our','opposition']){await shot(page,team,2,'point',first,.18);const e=await shot(page,team,2,'two-point',first,.35);if(team==='our')h2Two=e;}
 const before=await state(page),raw=JSON.stringify(before.events);
 await nav(page,'Match analysis');await page.locator('#shot-team').selectOption('our');await page.locator('#shot-half').selectOption('2');const map=page.getByRole('img',{name:'Shot map',exact:true});await topMarkers(map,2);
 if(first==='top'){await page.locator('.analysis-map-layout').scrollIntoViewIfNeeded();await page.screenshot({path:`${root}/02-h2-map.png`});await map.screenshot({path:`${root}/05-h2-two-pointer.png`});}
 const two=map.locator(`[data-shot-id="${h2Two.id}"] > circle`).first();expect(+(await two.getAttribute('cy'))).toBeGreaterThan(260);expect(+(await two.getAttribute('cy'))).toBeLessThan(450);
 await page.locator('#shot-team').selectOption('opposition');await topMarkers(page.getByRole('img',{name:'Shot map',exact:true}),2);
 await nav(page,'Live match');await nav(page,'END MATCH / FULL TIME');await expect(page.getByRole('heading',{name:'Normal-Time Analysis',exact:true})).toBeVisible();await nav(page,'Finish as Draw');await topMarkers(page.getByRole('img',{name:'Full-match shot map',exact:true}),4);
 await expect(page.locator('[data-ht-zone="inside"]')).toContainText('2 / 2');await expect(page.locator('[data-ht-zone="outside"]')).toContainText('2 / 2');
 if(first==='top'){await page.screenshot({path:`${root}/03-full-match-overlay.png`});await page.locator('.ht-map').screenshot({path:`${root}/04-inside-outside-40m.png`});}
 expect(JSON.stringify((await state(page)).events)).toBe(raw);
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);await context.setOffline(true);
 await nav(page,'Match History');const card=page.locator(`[data-history-id="${before.id}"]`);await expect(card).toBeVisible();await card.getByRole('button',{name:'VIEW MATCH',exact:true}).click();await topMarkers(page.getByRole('img',{name:'Full-match shot map',exact:true}),4);
 await nav(page,'Half-Time Analysis');await topMarkers(page.getByRole('img',{name:'First-half shot map',exact:true}),2);
 await nav(page,'Full Match Report');await topMarkers(page.getByRole('img',{name:'Shot map',exact:true}),8);await expect(page.getByText('40m shooting locations',{exact:true})).toBeVisible();expect(JSON.stringify((await state(page)).events)).toBe(raw);
});
test('inside-arc two-pointer remains non-blocking and one scored event, with an explicit location-review warning instead of an invented outside location',async({page})=>{
 await load(page);await shot(page,'our',1,'two-point','top',.18);const before=await state(page);expect(before.events).toHaveLength(1);expect(before.events[0].outcome).toBe('scored');await nav(page,'HALF-TIME ANALYSIS');
 await expect(page.locator('[data-location-review]')).toContainText('1 two-point location(s) inside 40m require review');await expect(page.locator('[data-ht-zone="inside"]')).toContainText('0 / 0');await expect(page.locator('[data-ht-zone="outside"]')).toContainText('0 / 0');await expect(page.locator('[data-ht-kpi="shooting"]')).toContainText('1 / 1');expect((await state(page)).events).toEqual(before.events);
});
