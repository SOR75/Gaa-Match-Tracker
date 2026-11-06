import {test,expect} from '@playwright/test';
import {flowMatch,addFlow,swingMatch} from '../helpers/match-flow-match.js';
import {bindEventParticipants} from '../../src/identity.js';
const raw=p=>p.evaluate(()=>localStorage.getItem('sideline.match.v1'));
async function openFull(page,m){
 await page.goto('/');await page.evaluate(m=>localStorage.setItem('sideline.match.v1',JSON.stringify(m)),m);await page.reload();
 const before=await raw(page);
 await page.getByRole('button',{name:'Match History',exact:true}).click();
 await page.locator('[data-history-action="view"]').first().click();
 await expect(page.locator('[data-match-flow="FULL_MATCH"]')).toBeVisible();return before;
}
test('historical Full-Time preserves cross-half scoring and long-gap factual restart order without claiming possession',async({page})=>{
 const m=swingMatch();const before=await openFull(page,m);
 const flow=page.locator('[data-match-flow="FULL_MATCH"]');
 await expect(flow).toContainText('unanswered');await expect(flow).toContainText('H1');await expect(flow).toContainText('H2');
 expect(await flow.locator('[data-flow-story]').count()).toBeLessThanOrEqual(5);
 await flow.locator('summary').first().click();await expect(flow.locator('[data-flow-evidence]').first()).toBeVisible();
 expect(await raw(page)).toBe(before);
 const n=flowMatch();addFlow(n,'point','our',10);addFlow(n,'opposition-kickout','opposition',20,1,{outcome:'won',kickoutPerspective:'our'});addFlow(n,'goal','our',600);
 const original=await openFull(page,n);
 await expect(page.locator('[data-match-flow]')).toContainText('score, restart win, score');
 await expect(page.locator('[data-match-flow]')).toContainText('Recorded sequence:');
 await expect(page.locator('[data-match-flow]')).toContainText('not continuous possession or tactical causation');
 expect(await raw(page)).toBe(original);
});
test('real Full-Time and Full Match Report exclude invalid scoring facts without rewriting the historical ledger',async({page})=>{
 const m=flowMatch({lineup:true});
 let e=addFlow(m,'booked','our',1,1,{playerNumber:'8',disciplineVersion:1,matchCode:'LGFA',card:'red'});m.events[0]=bindEventParticipants(e,null,m);
 e=addFlow(m,'goal','our',10,1,{playerNumber:'8'});m.events[1]=bindEventParticipants(e,null,m);
 addFlow(m,'point','our',30);
 const before=await openFull(page,m);
 await expect(page.locator('[data-ht-score="our"]')).toHaveText('0-01 (1)');
 await expect(page.locator('[data-ht-kpi="shooting"]')).toContainText('1 / 1');
 await page.locator('.history-tabs').getByRole('button',{name:'Full Match Report',exact:true}).click();
 await expect(page.locator('.analysis-scores')).toContainText('0-1');
 await expect(page.locator('.analysis-scores')).not.toContainText('1-1');
 await expect(page.locator('.player-shooting-section')).not.toContainText('Score 1-0');
 expect(await raw(page)).toBe(before);
});
test('incidental recording leaves the actual ranked Full-Time story order unchanged',async({page})=>{
 const sparse=swingMatch();await openFull(page,sparse);
 const before=await page.locator('[data-flow-story] h3').allTextContents();
 const dense=structuredClone(sparse);addFlow(dense,'booked','our',1400);addFlow(dense,'goalkeeper-change','our',1420);
 await openFull(page,dense);
 expect(await page.locator('[data-flow-story] h3').allTextContents()).toEqual(before);
});
test('Full-Time ET evidence cannot produce a restart sequence across ET1/ET2',async({page})=>{
 const m=flowMatch();addFlow(m,'point','our',500,3);
 addFlow(m,'opposition-kickout','opposition',510,3,{outcome:'won',kickoutPerspective:'our'});
 addFlow(m,'goal','our',10,4);
 const before=await openFull(page,m);
 await expect(page.locator('[data-match-flow]')).not.toContainText('score, restart win, score');
 await expect(page.locator('[data-ht-score="our"]')).toHaveText('1-01 (4)');
 expect(await raw(page)).toBe(before);
});

test('actual Full-Time evidence includes the ten-minute post-substitution team advantage',async({page})=>{
 const m=flowMatch({lineup:true});addFlow(m,'substitution','our',600,2,{playerOn:'18',playerOff:'8'});
 addFlow(m,'goal','our',720,2);addFlow(m,'point','our',960,2);addFlow(m,'point','our',1200,2);
 const before=await openFull(page,m),flow=page.locator('[data-match-flow]');
 await expect(flow).toContainText('Following the substitution');await expect(flow).toContainText('+5-point net scoring advantage');
 await expect(flow).toContainText('does not establish that the substitution caused');await expect(flow).not.toContainText("#18's introduction");
 await flow.locator('summary').first().click();await expect(flow.locator('[data-flow-evidence]').first()).toBeVisible();
 expect(await raw(page)).toBe(before);
});

test('actual analysis retains factual restart sequences in additional time of every period',async({page})=>{
 for(const half of [1,2,3,4]){
  const m=flowMatch(),reference=half<=2?1800:600;
  addFlow(m,'point','our',reference+10,half);addFlow(m,'opposition-kickout','opposition',reference+200,half,{outcome:'won',kickoutPerspective:'our'});addFlow(m,'goal','our',reference+500,half);
  const before=await openFull(page,m),flow=page.locator('[data-match-flow]');
  await expect(flow).toContainText('score, restart win, score');await expect(flow).toContainText('490 seconds');
  await expect(flow).toContainText('not continuous possession or tactical causation');expect(await raw(page)).toBe(before);
 }
});

test('known opposing possession blocks a restart-score claim despite long-gap evidence',async({page})=>{
 const m=flowMatch();addFlow(m,'point','our',10);addFlow(m,'opposition-kickout','opposition',90,1,{outcome:'won',kickoutPerspective:'our'});
 addFlow(m,'interception','opposition',100);addFlow(m,'goal','our',1200);
 const before=await openFull(page,m);await expect(page.locator('[data-match-flow]')).not.toContainText('score, restart win, score');expect(await raw(page)).toBe(before);
});
