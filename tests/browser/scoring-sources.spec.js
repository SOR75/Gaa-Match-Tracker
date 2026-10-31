import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {scoringSourceExample,sourceSquad,sourceMatch,sourceEvent} from '../helpers/scoring-source-match.js';
import {completeMatch} from '../../src/history.js';
const root='/workspace/sideline-v039-scoring-sources-review';
const nav=(p,n)=>p.getByRole('button',{name:n,exact:true}).click();
const raw=p=>p.evaluate(()=>localStorage.getItem('sideline.match.v1'));
async function load(page,m,size={width:1024,height:768}){
 await mkdir(root,{recursive:true});await page.setViewportSize(size);await page.goto('/');await page.evaluate(m=>localStorage.setItem('sideline.match.v1',JSON.stringify(m)),m);await page.reload();
}
const contribution=(page,name)=>page.locator('[data-coach-page="4"] tbody tr').filter({hasText:name});
test('Coach Report inline Play/Free, goal and two-pointer rows are correct and compact with no zero-source clutter',async({page})=>{
 await load(page,scoringSourceExample());const before=await raw(page);await nav(page,'Match analysis');await nav(page,'Coach Report');
 await expect(contribution(page,'Mixed Source Player')).toContainText('Score 0-7 (7) · 5 Play, 2 Frees · Shots 7/11');
 await expect(contribution(page,'Goal and Free Player')).toContainText('Score 1-1 (4) · 1-0 Play, 0-1 Free · Shots 2/2');
 await expect(contribution(page,'Two Point Player')).toContainText('Score 0-2 (2) · 0-2 Play (1 × 2P) · Shots 1/1');
 await expect(contribution(page,'Penalty Player')).toContainText('1-0 Penalty');await expect(contribution(page,'45 Player')).toContainText('1 45');
 await expect(contribution(page,'Unknown Source Player')).toContainText('Score 0-1 (1) · 1 Unknown source · Shots 1/1');
 await expect(page.locator('[data-coach-page="4"]')).not.toContainText('0 Penalties');await expect(page.locator('[data-coach-page="4"]')).not.toContainText('0 Frees');
 await expect(page.locator('.coach-page')).toHaveCount(5);
 await page.locator('[data-coach-page="4"]').screenshot({path:`${root}/01-coach-player-contributions-mixed-sources.png`});
 await contribution(page,'Goal and Free Player').screenshot({path:`${root}/02-goal-and-free-source-breakdown.png`});
 await contribution(page,'Two Point Player').screenshot({path:`${root}/03-two-pointer-one-attempt.png`});
 expect(await raw(page)).toBe(before);
});
test('Full Match Data adds one populated scoring-source column, retains attempts/value and unknown scores',async({page})=>{
 await load(page,scoringSourceExample());const before=await raw(page);await nav(page,'Match analysis');await nav(page,'Full Match Data');
 const shooting=page.locator('.player-shooting-section');await expect(shooting.getByRole('columnheader',{name:'Scoring sources',exact:true})).toHaveCount(1);
 const mixed=shooting.getByRole('row').filter({hasText:'Mixed Source Player'});await expect(mixed).toContainText('5 Play, 2 Frees');
 const unknown=shooting.getByRole('row').filter({hasText:'Unknown Source Player'});await expect(unknown).toContainText('1 Unknown source');await expect(unknown.locator('td').last()).toHaveText('1 Unknown source');
 await expect(shooting.getByRole('row').filter({hasText:'Two Point Player'})).toContainText('0-2 Play (1 × 2P)');
 await expect(shooting.locator('tbody tr')).toHaveCount(6);expect(await raw(page)).toBe(before);
});
test('Player Review sources aggregate stable identity across #10/#23 with unknown score retained, one 2P attempt and unchanged saved records',async({page})=>{
 const squad=sourceSquad(),a=completeMatch(scoringSourceExample(squad)),b=sourceMatch(squad,23,'2026-10-08');
 sourceEvent(b,23,'two-point','open-play');sourceEvent(b,23,'point','free');sourceEvent(b,23,'point');
 await load(page,b);const key='sideline.match.archive.'+a.id;await page.evaluate(({key,m})=>localStorage.setItem(key,JSON.stringify(m)),{key,m:a});await page.reload();const before=await raw(page),archive=await page.evaluate(k=>localStorage.getItem(k),key);
 await nav(page,'Player Review');await page.locator('#review-player').selectOption(squad.players[0].playerId);
 const sources=page.locator('[data-review-sources]');await expect(sources).toContainText('Total: 0-11 (11)');await expect(sources).toContainText('10 scores / 14 attempts');
 await expect(sources).toContainText('Open play: 0-7 (7) (1 × 2P)');await expect(sources).toContainText('Frees: 0-3 (3)');await expect(sources).toContainText('Unknown/legacy source: 0-1 (1)');await expect(sources).toContainText('2-pointers: 0-2 (2) · 1 scoring attempt');
 await expect(sources).not.toContainText('Penalties:');await expect(sources).not.toContainText('45s:');
 await expect(page.locator('[data-review-match]')).toHaveCount(2);await expect(page.locator('[data-review-metric="attempts"]')).toHaveText('14');
 await expect(page.locator('[data-review-metric="conversion"]')).toHaveText('71.4%');
 await sources.screenshot({path:`${root}/04-player-review-scoring-composition.png`});
 expect(await raw(page)).toBe(before);expect(await page.evaluate(k=>localStorage.getItem(k),key)).toBe(archive);
});
test('offline archived report uses recorded sources without resuming or changing active/history events',async({page,context})=>{
 const archived=completeMatch(scoringSourceExample()),active=sourceMatch();await load(page,active);const key='sideline.match.archive.'+archived.id;
 await page.evaluate(({key,m})=>localStorage.setItem(key,JSON.stringify(m)),{key,m:archived});await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);await context.setOffline(true);
 const before=await raw(page),bytes=await page.evaluate(k=>localStorage.getItem(k),key);await nav(page,'Match History');await page.locator(`[data-history-id="${archived.id}"]`).getByRole('button',{name:'VIEW MATCH',exact:true}).click();await page.locator('.history-tabs').getByRole('button',{name:'Coach Report',exact:true}).click();
 await expect(contribution(page,'Mixed Source Player')).toContainText('5 Play, 2 Frees');await expect(contribution(page,'Unknown Source Player')).toContainText('1 Unknown source');
 expect(await raw(page)).toBe(before);expect(await page.evaluate(k=>localStorage.getItem(k),key)).toBe(bytes);
});
test('unlinked legacy score with absent source remains a goal in reports and is never silently classified as Open Play',async({page})=>{
 const m=sourceMatch();const e=sourceEvent(m,10,'goal');delete e.identityVersion;delete e.participants;
 await load(page,m);const before=await raw(page);await nav(page,'Match analysis');await nav(page,'Coach Report');
 const row=contribution(page,'Mixed Source Player');await expect(row).toContainText('Score 1-0 (3) · 1-0 Unknown source · Shots 1/1');await expect(row.getByRole('cell')).not.toContainText(/\bPlay\b/);expect(await raw(page)).toBe(before);
});
test('phone/landscape source reporting stays within scrollable tables and leaves live shot-source capture unchanged',async({page})=>{
 await load(page,scoringSourceExample());await nav(page,'Match analysis');await nav(page,'Coach Report');
 for(const size of [{width:390,height:844},{width:1024,height:768}]){
  await page.setViewportSize(size);const box=await page.locator('.coach-report').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(size.width+1);await expect(contribution(page,'Mixed Source Player')).toContainText('5 Play, 2 Frees');
 }
 await nav(page,'Live match');await page.locator('[data-event="point"]').click();await expect(page.getByLabel('Shot source',{exact:true})).toHaveValue('open-play');
 await expect(page.getByLabel('Shot source',{exact:true}).locator('option')).toHaveText(['Not recorded','Open Play','Free','Penalty','45']);
});
