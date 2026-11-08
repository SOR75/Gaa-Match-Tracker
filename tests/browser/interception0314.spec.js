import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {flowMatch,addFlow} from '../helpers/match-flow-match.js';
import {syncPeriod} from '../../src/periods.js';
import {blankMatch} from '../../src/domain.js';
import {withBlankMatchPlayers} from '../../src/match-squad-enrichment.js';
import {summarize,playerStatistics} from '../../src/analysis.js';
const state=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('sideline.match.v1')));
async function seed(page,m){await page.setViewportSize({width:1024,height:768});await page.goto('/');await page.evaluate(m=>localStorage.setItem('sideline.match.v1',JSON.stringify(m)),m);await page.reload();await page.getByRole('button',{name:'Live match',exact:true}).click();}
function fixture(team='our'){const m=flowMatch({lineup:true});m.clock=syncPeriod({half:1,elapsedMs:120000,startedAt:null});m.recordingTeam=team;addFlow(m,'substitution',team,60,1,{playerOff:'10',playerOn:'18'});return m;}
for(const team of ['our','opposition'])test(`actual ${team} Interception opens eligible grid and credits exactly the captured event`,async({page})=>{
 await seed(page,fixture(team));const before=await state(page);await page.locator('[data-event="interception"]').click();const d=page.getByRole('dialog');await expect(d.getByRole('group',{name:'On-field interception player'})).toBeVisible();const captured=(await state(page)).events.at(-1);expect(captured).toMatchObject({event:'interception',team,playerNumber:''});expect((await state(page)).events).toHaveLength(before.events.length+1);
 await expect(d.locator('[data-interception-player="18"]')).toBeVisible();await expect(d.locator('[data-interception-player="10"]')).toHaveCount(0);await expect(d.locator('[data-interception-player="16"]')).toHaveCount(0);
 const bounds=await d.locator('[data-interception-player="18"]').boundingBox();expect(bounds.height).toBeGreaterThanOrEqual(44);expect(bounds.y+bounds.height).toBeLessThanOrEqual(768);
 if(team==='our'){await mkdir('/workspace/sideline-0314-review',{recursive:true});await page.screenshot({path:'/workspace/sideline-0314-review/Interception-ipad.png'});}
 await d.locator('[data-interception-player="18"]').click();await expect(d).not.toBeVisible();const after=await state(page);expect(after.events).toHaveLength(before.events.length+1);expect(after.events.at(-1)).toMatchObject({id:captured.id,team,timeMs:captured.timeMs,event:'interception',playerNumber:'18'});expect(after.events.slice(0,-1)).toEqual(before.events);
 expect(summarize(after.events,team).interceptions).toBe(1);expect(summarize(after.events,team).turnoversWon).toBe(0);expect(playerStatistics(after,team).find(p=>String(p.number)==='18').interceptions).toBe(1);await page.reload();expect((await state(page)).events).toEqual(after.events);
});
test('Skip and Escape retain one unattributed interception each',async({page})=>{
 await seed(page,fixture());await page.locator('[data-event="interception"]').click();await page.getByRole('dialog').getByRole('button',{name:'Skip / Close',exact:true}).click();await page.waitForTimeout(700);await page.locator('[data-event="interception"]').click();await page.keyboard.press('Escape');const events=(await state(page)).events.filter(e=>e.event==='interception');expect(events).toHaveLength(2);expect(events.every(e=>!e.playerNumber)).toBe(true);
});

test('sin-bin and sent-off players are absent from immediate interception choices',async({page})=>{
 const m=withBlankMatchPlayers(blankMatch());m.setup={...m.setup,ourTeam:'Home',opposition:'Away',matchCode:'LGFA',halfLength:30};await seed(page,m);
 for(const [number,card] of [[8,'yellow'],[9,'red']]){if(number===9)await page.waitForTimeout(700);await page.locator('[data-event="booked"]').click();await page.locator(`[data-booked-player="${number}"]`).click();await page.locator(`[data-card="${card}"]`).click();}
 await page.locator('[data-event="interception"]').click();const d=page.getByRole('dialog');for(const n of [8,9])await expect(d.locator(`[data-interception-player="${n}"]`)).toHaveCount(0);await expect(d.locator('[data-interception-player="4"]')).toBeVisible();await d.locator('[data-interception-player="4"]').click();expect((await state(page)).events.at(-1).playerNumber).toBe('4');
});
test('empty squad still offers fallback numbers and explicit Other number credit',async({page})=>{
 const m=blankMatch();m.setup={...m.setup,ourTeam:'Home',opposition:'Away'};await seed(page,m);await page.locator('[data-event="interception"]').click();const d=page.getByRole('dialog');await expect(d.locator('[data-interception-player]')).toHaveCount(15);await d.getByLabel('Other number',{exact:true}).fill('23');await d.getByLabel('Other number',{exact:true}).press('Tab');await expect(d).not.toBeVisible();const events=(await state(page)).events;expect(events).toHaveLength(1);expect(events[0].playerNumber).toBe('23');
});
