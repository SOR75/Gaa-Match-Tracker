import {mkdir} from 'node:fs/promises';
import {test,expect} from '@playwright/test';
import {attacking0311,kickout0311,defence0311} from '../helpers/coaching0311.js';
import {addFlow} from '../helpers/match-flow-match.js';
const state=p=>p.evaluate(()=>localStorage.getItem('sideline.match.v1'));
async function open(page,m){await page.goto('/');await page.evaluate(m=>localStorage.setItem('sideline.match.v1',JSON.stringify(m)),m);await page.reload();const before=await state(page);await page.getByRole('button',{name:'Match History',exact:true}).click();await page.locator('[data-history-action="view"]').first().click();await expect(page.getByRole('heading',{name:'Full-Time Analysis',exact:true})).toBeVisible();return before;}
test('actual Full-Time explains volume/conversion with a single global limit and auditable evidence',async({page})=>{
 const m=attacking0311(),before=await open(page,m);const findings=page.locator('[data-observation], [data-flow-story]');
 expect(await findings.count()).toBeLessThanOrEqual(5);await expect(page.locator('.ht-observations')).toContainText('12 in H1 to 7 in H2');await expect(page.locator('.ht-observations')).toContainText('50% → 71.4%');
 await page.locator('.ht-observations summary').first().click();const ids=await page.locator('[data-insight-evidence]').evaluateAll(ns=>ns.map(n=>n.dataset.insightEvidence));expect(ids.length).toBeGreaterThan(0);expect(ids.every(id=>m.events.some(e=>e.id===id))).toBe(true);
 expect(await state(page)).toBe(before);
});
test('Full-Time retains interpreted findings while the sole report is factual and preserves current/history data',async({page})=>{
 const m=attacking0311(),before=await open(page,m);const titles=await page.locator('[data-observation] h3, [data-flow-story] h3').allTextContents();
 await page.locator('.history-tabs').getByRole('button',{name:'Full Match Report',exact:true}).click();await expect(page.locator('.report-view')).toBeVisible();
 for(const title of titles)await expect(page.locator('.report-view')).not.toContainText(title);await expect(page.locator('[data-report-ledger]')).toHaveCount(0);await expect(page.getByRole('button',{name:'Download Timeline CSV',exact:true})).toBeVisible();
 expect(await state(page)).toBe(before);
});
test('kickout evidence shows known denominators, unknown exclusion and length contrast',async({page})=>{
 const m=kickout0311(),before=await open(page,m);await expect(page.locator('.ht-observations')).toContainText('5/5 (100%)');await expect(page.locator('.ht-observations')).toContainText('1/5 (20%)');await expect(page.locator('.ht-observations')).toContainText('1 unknown excluded');expect(await state(page)).toBe(before);
});
test('non-scoring defender is recognised without creating attempts or turnovers',async({page})=>{
 const m=defence0311(),before=await open(page,m);await expect(page.locator('.ht-observations')).toContainText('#4');await expect(page.locator('.ht-observations')).toContainText('3 of 4');await expect(page.locator('.ht-observations')).toContainText('without a recorded score');await expect(page.locator('[data-ht-kpi="shooting"]')).toContainText('0 / 0');await expect(page.locator('.ht-contributors')).toContainText('3 Blocks');expect(await state(page)).toBe(before);
});
test('half-time keeps its existing workflow with at most three findings across both sections',async({page})=>{
 await page.goto('/');const m=attacking0311();await page.evaluate(m=>localStorage.setItem('sideline.match.v1',JSON.stringify(m)),m);await page.reload();const before=await state(page);
 await page.getByRole('button',{name:'Live match',exact:true}).click();await page.getByRole('button',{name:'HALF-TIME ANALYSIS',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Half-Time Analysis',exact:true})).toBeVisible();expect(await page.locator('[data-observation], [data-flow-story]').count()).toBeLessThanOrEqual(3);await expect(page.getByRole('button',{name:'Return to Live Match',exact:true})).toBeVisible();expect(await state(page)).toBe(before);
});
test('shared coaching findings remain usable offline after shell installation and reload',async({page,context})=>{
 const m=attacking0311();await open(page,m);await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);const before=await state(page);await context.setOffline(true);await page.reload();await page.getByRole('button',{name:'Match History',exact:true}).click();await page.locator('[data-history-action="view"]').first().click();await expect(page.locator('.ht-observations')).toContainText('12 in H1 to 7 in H2');expect(await state(page)).toBe(before);await context.setOffline(false);
});
for(const size of [{width:1024,height:768},{width:1366,height:1024},{width:390,height:844}])test(`combined insights stay within viewport ${size.width}x${size.height}`,async({page})=>{
 await page.setViewportSize(size);await open(page,attacking0311());await page.locator('.ht-observations summary').first().click();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width+1);const control=await page.locator('.ht-observations summary').first().boundingBox();expect(control.width).toBeGreaterThan(120);expect(control.height).toBeGreaterThanOrEqual(44);await mkdir('/workspace/sideline-0311-review',{recursive:true});await page.locator('.full-time-view').screenshot({path:`/workspace/sideline-0311-review/Full-Time-${size.width}x${size.height}.png`});
});
