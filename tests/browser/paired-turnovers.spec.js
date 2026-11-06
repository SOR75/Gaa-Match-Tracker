import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {blankMatch,createEvent,saveEvent} from '../../src/domain.js';
import {createMatchPlayer,createSquadPlayer} from '../../src/identity.js';
import {summarize,playerStatistics} from '../../src/analysis.js';
import {fullMatchReportModel} from '../../src/full-match-report-data.js';
const root='/workspace/sideline-v039-turnover-review';
const nav=(p,n)=>p.getByRole('button',{name:n,exact:true}).click();
const state=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('sideline.match.v1')));
async function seed(page,viewport={width:1024,height:768},fallback=false){
 await mkdir(root,{recursive:true});await page.setViewportSize(viewport);await page.clock.install({time:new Date('2026-10-31T12:00:00Z')});
 const m=blankMatch();m.setup.ourTeam='Home Club';m.setup.opposition='Visitors';
 const roster=team=>Array.from({length:18},(_,i)=>createMatchPlayer({...createSquadPlayer({number:i+1,name:`${team} Player ${i+1}`,role:i<15?'starter':'substitute'}),id:undefined}));
 m.players=fallback?[]:roster('Home');m.oppositionPlayers=fallback?[]:roster('Away');
 await page.goto('/');await page.evaluate(m=>localStorage.setItem('sideline.match.v1',JSON.stringify(m)),m);await page.reload();await nav(page,'Live match');return m;
}
const pick=(p,team,n)=>p.locator(`[data-turnover-${team}="${n}"]`);
async function capture(page,type,ours,theirs){
 await page.clock.fastForward(1000);await page.locator(`[data-event="${type}"]`).click();
 await pick(page,'our',ours).click();if(theirs)await pick(page,'opposition',theirs).click();await nav(page,'Record turnover');
}
async function panel(page,type){
 const d=page.getByRole('dialog');await expect(d.getByRole('heading',{name:type==='turnover-won'?'Turnover Won':'Turnover Lost',exact:true})).toBeVisible();
 await expect(d.locator('select')).toHaveCount(0);
 for(const team of ['our','opposition']){
  await expect(d.locator(`[data-turnover-${team}]`)).toHaveCount(15);
  const rectangles=await d.locator(`[data-turnover-${team}]`).evaluateAll(ns=>ns.map(n=>{const r=n.getBoundingClientRect();return {w:r.width,h:r.height,y:r.y,bottom:r.bottom};}));
  for(const r of rectangles){expect(r.w).toBeGreaterThanOrEqual(44);expect(r.h).toBeGreaterThanOrEqual(44);expect(r.y).toBeGreaterThanOrEqual(0);expect(r.bottom).toBeLessThanOrEqual(768);}
 }
 expect(await d.evaluate(n=>n.scrollHeight<=n.clientHeight)).toBe(true);
 await expect(d.getByRole('button',{name:'Record turnover',exact:true})).toBeVisible();
}
for(const type of ['turnover-won','turnover-lost'])for(const opponent of [true,false])test(`${type}: both grids, ${opponent?'both credits':'opposition unknown'}, one event and reconciled totals despite opposition active selection`,async({page})=>{
 const original=await seed(page);await page.locator('[data-team="opposition"]').click();const ours=type==='turnover-won'?8:10,theirs=type==='turnover-won'?12:8;
 await page.locator(`[data-event="${type}"]`).click();await panel(page,type);
 await expect(page.getByRole('button',{name:'Record turnover',exact:true})).toBeDisabled();
 expect((await state(page)).events).toHaveLength(0);
 if(opponent)await pick(page,'opposition',theirs).click();
 await expect(page.getByRole('button',{name:'Record turnover',exact:true})).toBeDisabled();
 await pick(page,'our',ours).click();
 if(opponent)await page.screenshot({path:`${root}/${type==='turnover-won'?'01-to-won':'02-to-lost'}-both-grids.png`});
 await nav(page,'Record turnover');await expect(page.getByRole('dialog')).not.toBeVisible();
 const m=await state(page),e=m.events[0],win=type==='turnover-won';expect(m.events).toHaveLength(1);expect(m.recordingTeam).toBe('opposition');
 expect(e).toMatchObject({event:type,pairedTurnoverVersion:1,team:'our',playerNumber:String(ours),winningTeam:win?'our':'opposition',losingTeam:win?'opposition':'our'});
 const field=win?'turnoversWon':'turnoversLost',other=win?'turnoversLost':'turnoversWon';
 expect(summarize(m.events,'our')[field]).toBe(1);expect(summarize(m.events,'opposition')[other]).toBe(1);
 expect(playerStatistics(m,'our').find(p=>p.number===String(ours))[field]).toBe(1);
 expect(playerStatistics(m,'opposition').reduce((n,p)=>n+p[other],0)).toBe(opponent?1:0);
 expect(e.participants[win?'turnoverWinner':'turnoverLoser'].playerId).toBe(original.players[ours-1].playerId);
 if(!opponent)expect(e.participants[win?'turnoverLoser':'turnoverWinner']).toBeNull();
 await expect(page.locator('.score-team.our .score-total')).toHaveText('0-0');await expect(page.locator('.score-team.opposition .score-total')).toHaveText('0-0');
 await page.reload();expect((await state(page)).events).toEqual(m.events);
});
test('selection changes, optional clearing, cancel and rapid completion never fabricate/double-record',async({page})=>{
 await seed(page);const before=await state(page);await page.locator('[data-event="turnover-won"]').click();await pick(page,'our',8).click();await pick(page,'opposition',12).click();await nav(page,'Close turnover');expect(await state(page)).toEqual(before);
 await page.clock.fastForward(1000);await page.locator('[data-event="turnover-won"]').click();await pick(page,'our',10).click();await pick(page,'our',8).click();await pick(page,'opposition',12).click();await nav(page,'Clear opposition player');
 await expect(pick(page,'our',8)).toHaveAttribute('aria-pressed','true');await expect(pick(page,'our',10)).toHaveAttribute('aria-pressed','false');
 await page.locator('[data-turnover-record]').evaluate(n=>{n.click();n.click();});const m=await state(page);expect(m.events).toHaveLength(1);expect(m.events[0].turnoverLoserNumber).toBe('');
});
test('both independent Active XV grids reflect substitutions/re-entry; current team never changes',async({page})=>{
 await seed(page);
 for(const [team,on,off] of [['our',18,10],['opposition',16,12]]){
  await page.locator(`[data-team="${team}"]`).click();await page.locator('[data-event="substitution"]').click();await page.locator(`[data-sub-on="${on}"]`).click();await page.locator(`[data-sub-off="${off}"]`).click();await nav(page,'Record substitution');
 }
 await page.locator('[data-event="turnover-won"]').click();await panel(page,'turnover-won');
 await expect(pick(page,'our',18)).toBeVisible();await expect(pick(page,'our',10)).toHaveCount(0);await expect(pick(page,'opposition',16)).toBeVisible();await expect(pick(page,'opposition',12)).toHaveCount(0);
 await page.screenshot({path:`${root}/03-turnover-after-independent-substitutions.png`});await pick(page,'our',18).click();await pick(page,'opposition',16).click();await nav(page,'Record turnover');
 expect((await state(page)).events).toHaveLength(3);expect((await state(page)).recordingTeam).toBe('opposition');
 for(const [team,on,off] of [['our',10,18],['opposition',12,16]]){
  await page.locator(`[data-team="${team}"]`).click();await page.clock.fastForward(1000);await page.locator('[data-event="substitution"]').click();await page.locator(`[data-sub-on="${on}"]`).click();await page.locator(`[data-sub-off="${off}"]`).click();await nav(page,'Record substitution');
 }
 await page.locator('[data-event="turnover-lost"]').click();await panel(page,'turnover-lost');await expect(pick(page,'our',10)).toBeVisible();await expect(pick(page,'our',18)).toHaveCount(0);await expect(pick(page,'opposition',12)).toBeVisible();await expect(pick(page,'opposition',16)).toHaveCount(0);
});
test('edit counterpart/primary and clear optional credit recalculates analysis without changing active team',async({page})=>{
 await seed(page);await page.locator('[data-team="opposition"]').click();await capture(page,'turnover-won',8,12);await nav(page,'Edit last event');
 await page.getByLabel('Player who won possession',{exact:true}).selectOption('10');await page.getByLabel('Player who lost possession',{exact:true}).selectOption('8');await nav(page,'Save changes');
 let m=await state(page);expect(m.events).toHaveLength(1);expect(m.recordingTeam).toBe('opposition');expect(playerStatistics(m,'our').find(p=>p.number==='10').turnoversWon).toBe(1);expect(playerStatistics(m,'opposition').find(p=>p.number==='8').turnoversLost).toBe(1);
 await nav(page,'Edit last event');await page.getByLabel('Player who lost possession',{exact:true}).selectOption('');await nav(page,'Save changes');m=await state(page);expect(m.events[0].participants.turnoverLoser).toBeNull();expect(summarize(m.events,'opposition').turnoversLost).toBe(1);expect(playerStatistics(m,'opposition').reduce((n,p)=>n+p.turnoversLost,0)).toBe(0);
 await nav(page,'Undo last event');expect((await state(page)).events).toHaveLength(0);
});
test('HT/Full Analysis, Full Match Report, Player Review and native History render paired attribution without a second event',async({page})=>{
 const original=await seed(page);await capture(page,'turnover-won',8,12);await capture(page,'turnover-lost',10,8);await page.clock.fastForward(4000);
 const m=await state(page);expect(m.events).toHaveLength(2);const before=JSON.stringify(m);
 await nav(page,'HALF-TIME ANALYSIS');await expect(page.locator('[data-ht-kpi="turnovers"]')).toContainText('Won 1');await expect(page.locator('[data-ht-kpi="turnovers"]')).toContainText('Lost 1');await expect(page.locator('.ht-contributors')).toContainText('1 turnovers lost');
 await nav(page,'Return to Live Match');await nav(page,'Match analysis');await nav(page,'Full Match Report');
 for(const label of ['Turnovers won','Turnovers lost']){const row=page.locator('.report-view tr').filter({has:page.getByRole('rowheader',{name:label,exact:true})}).first();await expect(row.locator('td')).toHaveText(['1','1']);}
 const model=fullMatchReportModel(m);expect(model.stats.our.turnoversWon).toBe(model.stats.opposition.turnoversLost);
 const eventSection=page.locator('.player-event-section');await expect(eventSection).toContainText('Home Player 8');await expect(eventSection).toContainText('Away Player 12');await expect(eventSection).toContainText('TO won');await expect(eventSection).toContainText('TO lost');
 await nav(page,'Player Review');await page.locator('#review-player').selectOption(original.players[7].playerId);await expect(page.locator('[data-review-match]')).toContainText('1 TO won');await expect(page.locator('[data-review-metric="contributions"]')).toHaveText('0 / 1 / 0');
 expect(JSON.stringify(await state(page))).toBe(before);
 await page.evaluate(m=>{localStorage.setItem('sideline.match.archive.'+m.id,JSON.stringify(m));localStorage.setItem('sideline.match.v1',JSON.stringify({...m,id:'turnover-review-current',events:[]}));},m);await page.reload();await nav(page,'Match History');const card=page.locator(`[data-history-id="${m.id}"]`);await card.getByRole('button',{name:'VIEW MATCH',exact:true}).click();await page.locator('.history-tabs').getByRole('button',{name:'Full Match Report',exact:true}).click();await expect(page.locator('.report-view tr').filter({has:page.getByRole('rowheader',{name:'Turnovers won',exact:true})}).first().locator('td')).toHaveText(['1','1']);
 expect((await state(page)).events).toHaveLength(0);
});
test('no squad numbers plus Other number are optional away and required home without artificial squad records',async({page})=>{
 await seed(page,{width:1024,height:768},true);await page.locator('[data-event="turnover-lost"]').click();await expect(pick(page,'our',1)).toBeVisible();await expect(pick(page,'opposition',15)).toBeVisible();
 await page.locator('[data-credit-other="data-turnover-our"]').fill('23');await nav(page,'Record turnover');const m=await state(page);expect(m.players).toEqual([]);expect(m.oppositionPlayers).toEqual([]);expect(m.events).toHaveLength(1);expect(m.events[0].turnoverLoserNumber).toBe('23');expect(m.events[0].turnoverWinnerNumber).toBe('');
});
for(const [name,size] of [['phone',{width:390,height:844}],['portrait',{width:768,height:1024}],['desktop',{width:1440,height:900}]])test(`${name}: both selectors reachable without horizontal clipping`,async({page})=>{
 await seed(page,size);await page.locator('[data-event="turnover-lost"]').click();const d=page.getByRole('dialog');expect(await d.evaluate(n=>n.scrollWidth<=n.clientWidth)).toBe(true);await pick(page,'our',10).click();await pick(page,'opposition',8).click();await nav(page,'Record turnover');expect((await state(page)).events).toHaveLength(1);
});
test('timestamp is captured on opening; closing is harmless and running clock continues normally',async({page})=>{
 await seed(page);await nav(page,'Start clock');await page.clock.fastForward(2000);await page.locator('[data-event="turnover-won"]').click();
 await page.clock.fastForward(5000);expect((await state(page)).events).toHaveLength(0);await pick(page,'our',8).click();await nav(page,'Record turnover');
 const m=await state(page);expect(m.events).toHaveLength(1);expect(m.events[0].timeMs).toBe(2000);expect(m.clock.startedAt).not.toBeNull();await expect(page.locator('.clock-digits')).toHaveText('00:07');
});
test('unmarked historical 3/0 versus 2/1 survives generic editing, report and reload without automatic pairing',async({page})=>{
 const m=await seed(page);for(const [team,type,count,n] of [['our','turnover-won',3,'8'],['opposition','turnover-won',2,'8'],['opposition','turnover-lost',1,'12']])for(let i=0;i<count;i++)m.events=saveEvent(m.events,{...createEvent(m,type,team),playerNumber:n},m);
 await page.evaluate(m=>localStorage.setItem('sideline.match.v1',JSON.stringify(m)),m);await page.reload();await nav(page,'Live match');const before=(await state(page)).events;
 await nav(page,'Edit last event');await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();await nav(page,'Match analysis');await nav(page,'Full Match Report');
 for(const [label,values]of [['Turnovers won',['3','2']],['Turnovers lost',['0','1']]])await expect(page.locator('.report-view tr').filter({has:page.getByRole('rowheader',{name:label,exact:true})}).first().locator('td')).toHaveText(values);expect((await state(page)).events).toEqual(before);expect(before.every(e=>e.pairedTurnoverVersion===undefined)).toBe(true);
 await page.reload();expect((await state(page)).events).toEqual(before);
});
