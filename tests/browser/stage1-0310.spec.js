import {clickCapture,startCaptureFixture} from '../helpers/live-capture.js';
import {snapshotSquad} from "../../src/squads.js";
import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {onFieldPlayers} from '../../src/participation.js';
import {playerStatistics} from '../../src/analysis.js';
const root=process.env.SIDELINE_REVIEW_DIR || 'test-results/stage1-review';
const nav=async(p,name)=>{await p.getByRole('button',{name,exact:true}).click();if(name==='Live match')await startCaptureFixture(p);};
const state=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('sideline.match.v1')));
const knownName=n=>n===6?'Cathal Murphy':n===8?'Tomas Carroll':`Named Member ${n}`;
const sheet=(count=29,allStarters=false)=>'Jersey,Player Name,Role\n'+Array.from({length:count},(_,i)=>`${i+1},${knownName(i+1)},${allStarters||i<15?'starter':'substitute'}`).join('\n');
async function start(page){
 await mkdir(root,{recursive:true});await page.setViewportSize({width:1024,height:768});await page.clock.install({time:new Date('2026-11-01T12:00:00Z')});
 await page.goto('/');await page.getByLabel('Our team',{exact:true}).fill('Stage Home');await page.getByLabel('Opposition',{exact:true}).fill('Stage Away');await nav(page,'Continue to squad');
}
async function paste(page,text){await nav(page,'Paste team-sheet text');await page.getByLabel('Team-sheet text',{exact:true}).fill(text);await nav(page,'Extract & review text');await expect(page.getByRole('heading',{name:'Review & confirm',exact:true})).toBeVisible();}
async function sub(page,on,off){await page.clock.fastForward(1000);await clickCapture(page, '[data-event="substitution"]');await page.locator(`[data-sub-on="${on}"]`).click();await page.locator(`[data-sub-off="${off}"]`).click();await nav(page,'Record substitution');}
async function pass(page,from,to){await page.clock.fastForward(1000);await clickCapture(page, '[data-event="pass"]');await page.locator(`[data-pass-from="${from}"]`).click();await page.locator(`[data-pass-to="${to}"]`).click();await nav(page,'Hand Pass');}
async function manual(page,n,name,role='substitute'){await page.getByLabel('Jersey number',{exact:true}).fill(String(n));await page.getByLabel('Player name',{exact:true}).fill(name);await page.locator('#player-form select[name=role]').selectOption(role);await nav(page,'Add player');}
test('real new-match path has 23 stable numbered identities per team, active 1–15, bench 16–23 and independent re-entry',async({page})=>{
 await start(page);const initial=await state(page);for(const team of ['players','oppositionPlayers']){expect(initial[team]).toHaveLength(23);expect(initial[team].filter(p=>p.role==='starter')).toHaveLength(15);expect(initial[team].filter(p=>p.role==='substitute')).toHaveLength(8);expect(initial[team].every(p=>!p.name&&!p.playerId&&p.matchPlayerId===p.id)).toBe(true);}
 await nav(page,'Live match');await clickCapture(page, '[data-event="substitution"]');await expect(page.locator('[data-sub-on]')).toHaveCount(8);await expect(page.locator('[data-sub-off]')).toHaveCount(15);await page.screenshot({path:`${root}/01-blank-team-substitutes.png`});await nav(page,'Cancel substitution');await sub(page,18,6);
 let m=await state(page);expect(onFieldPlayers(m,'our').some(p=>p.number===18)).toBe(true);expect(onFieldPlayers(m,'our').some(p=>p.number===6)).toBe(false);expect(onFieldPlayers(m,'opposition').some(p=>p.number===6)).toBe(true);
 await sub(page,6,18);await page.reload();m=await state(page);expect(onFieldPlayers(m,'our').some(p=>p.number===6)).toBe(true);expect(m.players.map(p=>p.id)).toEqual(initial.players.map(p=>p.id));
});
test('real pre-name actions, substitution, mid-match 29-player import and re-entry keep all credits on one identity',async({page,context})=>{
 await start(page);await nav(page,'Live match');const initial=await state(page),six=initial.players[5].id;
 await page.getByRole('button',{name:'Turnover Won',exact:true}).click();await page.locator('[data-turnover-our="6"]').click();await nav(page,'Record turnover');
 await clickCapture(page, '[data-event="defensive-block"]');await page.locator('[data-defensive-player="6"]').click();await pass(page,6,8);
 await clickCapture(page, '[data-event="our-kickout"]');await nav(page,'Won by us');await page.locator('[data-ko-player="8"]').click();
 await clickCapture(page, '[data-event="point"]');await page.locator('[data-shot-player="11"]').click();await nav(page,'Close shot details');await sub(page,18,6);
 const before=await state(page),events=JSON.stringify(before.events);expect(before.events).toHaveLength(6);for(const e of before.events.slice(0,3))expect(e.participants.player.matchPlayerId).toBe(six);
 await nav(page,'Squad');await paste(page,sheet());await expect(page.locator('[data-import-starters]')).toBeHidden();await expect(page.locator('[data-identity-review]')).toContainText('23 existing identities updated');await page.screenshot({path:`${root}/02-live-import-enrichment-review.png`});await nav(page,'Confirm & add to squad');
 let m=await state(page);expect(m.players).toHaveLength(29);expect(m.players[5]).toMatchObject({id:six,name:'Cathal Murphy',playerId:null});expect(JSON.stringify(m.events)).toBe(events);expect(m.players.filter(p=>p.role==='starter')).toHaveLength(15);expect(onFieldPlayers(m,'our').some(p=>p.number===18)).toBe(true);expect(onFieldPlayers(m,'our').some(p=>p.number===6)).toBe(false);
 await nav(page,'Live match');await clickCapture(page, '[data-event="pass"]');await expect(page.locator('[data-pass-from="18"]')).toBeVisible();await expect(page.locator('[data-pass-from="6"]')).toHaveCount(0);await nav(page,'Close Pass');await sub(page,6,18);
 await page.clock.fastForward(1000);await clickCapture(page, '[data-event="point"]');await page.locator('[data-shot-player="6"]').click();await nav(page,'Close shot details');await pass(page,6,8);
 m=await state(page);expect(m.events).toHaveLength(9);const rows=playerStatistics(m,'our').filter(p=>p.matchPlayerId===six);expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({name:'Cathal Murphy',turnoversWon:1,defensiveBlocks:1,passes:2,total:1});expect(JSON.stringify(m.events.slice(0,6))).toBe(events);
 await nav(page,'Timeline');await expect(page.locator('.event-row').filter({hasText:'Cathal Murphy'})).toHaveCount(5);
 await nav(page,'Player Review');await page.locator('#review-player').selectOption(`match:${m.id}:${six}`);await expect(page.locator('[data-review-name]')).toHaveText('Cathal Murphy');await expect(page.locator('[data-review-metric="recordedEvents"]')).toHaveText('5');await expect(page.getByText('Match-only identity · permanent player unlinked',{exact:true})).toBeVisible();await page.screenshot({path:`${root}/03-one-identity-five-events.png`});
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));await context.setOffline(true);await page.reload();expect((await state(page)).events).toEqual(m.events);expect((await state(page)).players[5].id).toBe(six);
});
test('partial manual first names and surname initials enrich the same live identities, including jersey outside the default 23',async({page})=>{
 await start(page);await manual(page,20,'Oran');await manual(page,25,'Sean M');let m=await state(page);const ids=[20,25].map(n=>m.players.find(p=>p.number===n).id);await nav(page,'Live match');await sub(page,20,6);await sub(page,25,7);await pass(page,20,8);await pass(page,25,8);const events=JSON.stringify((await state(page)).events);
 await nav(page,'Squad');await paste(page,'Jersey,Player Name,Role\n20,Oran Murphy,substitute\n25,Sean McCarthy,substitute');await nav(page,'Confirm & add to squad');m=await state(page);expect([20,25].map(n=>m.players.find(p=>p.number===n).id)).toEqual(ids);expect(m.players.filter(p=>[20,25].includes(p.number)).map(p=>p.name)).toEqual(['Oran Murphy','Sean McCarthy']);expect(JSON.stringify(m.events)).toBe(events);expect(onFieldPlayers(m,'our').filter(p=>[20,25].includes(p.number))).toHaveLength(2);
});
test('conflicting names require explicit review; skip is non-destructive and confirmed correction never creates another match ID',async({page})=>{
 await start(page);await manual(page,6,'John Ryan','starter');await nav(page,'Live match');await pass(page,6,8);const before=await state(page),id=before.players[5].id;await nav(page,'Squad');await paste(page,'Jersey,Player Name,Role\n6,Cathal Murphy,starter');await expect(page.locator('[data-identity-review]')).toContainText('John Ryan');await nav(page,'Confirm & add to squad');await expect(page.locator('[data-squad-error]')).toContainText('Review identity');expect((await state(page)).players).toEqual(before.players);
 await page.getByLabel('Identity resolution row 1',{exact:true}).selectOption('skip');await nav(page,'Confirm & add to squad');expect((await state(page)).players).toEqual(before.players);
 await paste(page,'Jersey,Player Name,Role\n6,Cathal Murphy,starter');await page.getByLabel('Identity resolution row 1',{exact:true}).selectOption('same');await nav(page,'Confirm & add to squad');const m=await state(page);expect(m.players.filter(p=>p.number===6)).toHaveLength(1);expect(m.players[5]).toMatchObject({id,name:'Cathal Murphy'});expect(m.events).toEqual(before.events);
});
test('normal 29-player source gives fifteen starters/fourteen subs; repeat import is idempotent and does not double-count capacity',async({page})=>{
 await start(page);const text='Jersey,Player Name\n'+Array.from({length:29},(_,i)=>`${i+1},${knownName(i+1)}`).join('\n');await paste(page,text);await expect(page.locator('[data-import-starters]')).toBeHidden();await expect(page.getByLabel('Role row 16',{exact:true})).toHaveValue('substitute');await nav(page,'Confirm & add to squad');const original=await state(page);expect(original.players).toHaveLength(29);expect(original.players.filter(p=>p.role==='starter')).toHaveLength(15);
 await paste(page,text);await nav(page,'Confirm & add to squad');expect((await state(page)).players.map(p=>p.id)).toEqual(original.players.map(p=>p.id));await nav(page,'Live match');await clickCapture(page, '[data-event="pass"]');await expect(page.locator('[data-pass-from]')).toHaveCount(15);
});
test('14 starters are clearly warned without inventing a name, and the coach can add the missing row; malformed 29 starters also warns',async({page})=>{
 await start(page);await paste(page,'Jersey,Player Name,Role\n'+Array.from({length:14},(_,i)=>`${i+2},${knownName(i+2)},starter`).join('\n'));await expect(page.locator('[data-import-starters]')).toContainText('14 starters detected');await expect(page.locator('[data-review-row]')).toHaveCount(14);await page.screenshot({path:`${root}/04-missing-starter-review-warning.png`});
 await nav(page,'+ Add row');await page.getByLabel('Jersey number row 15',{exact:true}).fill('1');await page.getByLabel('Player name row 15',{exact:true}).fill('Confirmed Keeper');await expect(page.locator('[data-import-starters]')).toBeHidden();await nav(page,'Confirm & add to squad');expect((await state(page)).players.filter(p=>p.name)).toHaveLength(15);
 await paste(page,sheet(29,true));await expect(page.locator('[data-import-starters]')).toContainText('29 starters detected');await expect(page.getByRole('button',{name:'Confirm & add to squad',exact:true})).toBeEnabled();await nav(page,'Cancel import');
});
test('opposition import preserves their independent substitution state and original event identity',async({page})=>{
 await start(page);await nav(page,'Live match');await page.locator('[data-team="opposition"]').click();await pass(page,6,8);await sub(page,18,6);const before=await state(page);await nav(page,'Squad');await page.locator('[data-squad-team="opposition"]').click();await paste(page,sheet());await nav(page,'Confirm & add to squad');const m=await state(page);expect(m.oppositionPlayers[5].id).toBe(before.oppositionPlayers[5].id);expect(m.oppositionPlayers[5].name).toBe('Cathal Murphy');expect(m.events).toEqual(before.events);expect(onFieldPlayers(m,'opposition').some(p=>p.number===18)).toBe(true);expect(onFieldPlayers(m,'opposition').some(p=>p.number===6)).toBe(false);expect(m.players.every(p=>!p.name)).toBe(true);
});
test('photo/text file acceptance follows the same identity enrichment path and preserves stored event snapshots',async({page})=>{
 await start(page);await nav(page,'Live match');await pass(page,6,8);const before=await state(page);await nav(page,'Squad');await page.locator('#team-sheet-file').setInputFiles({name:'stage1-reviewed-team.csv',mimeType:'text/csv',buffer:Buffer.from(sheet())});await expect(page.getByRole('heading',{name:'Review & confirm',exact:true})).toBeVisible();await nav(page,'Confirm & add to squad');const m=await state(page);expect(m.events).toEqual(before.events);expect(m.players[5].id).toBe(before.players[5].id);expect(m.players[5].name).toBe('Cathal Murphy');
});

test('saved team setups warn for 14 and 29 source starters without blocking deliberate use or linking by jersey',async({page})=>{
 await start(page);
 const squad=snapshotSquad('Controlled review squad',Array.from({length:29},(_,i)=>({number:i+1,name:knownName(i+1),role:'starter'})));
 await page.evaluate(squad=>{
  localStorage.setItem('sideline.squads.v2',JSON.stringify({version:2,squads:[squad]}));
  const make=count=>({id:crypto.randomUUID(),name:`Source ${count}`,squadId:squad.id,players:squad.players.slice(0,count).map(p=>({playerId:p.playerId,number:p.number,role:'starter'}))});
  localStorage.setItem('sideline.team-setups.v1',JSON.stringify({version:1,setups:[make(14),make(29)]}));
 },squad);
 await page.reload();await nav(page,'Squad');await nav(page,'Use saved team setup');
 await expect(page.getByRole('dialog')).toContainText('14 starters detected');await expect(page.getByRole('dialog')).toContainText('29 starters detected');
 await page.locator('[data-use-team-setup]').first().click();
 const m=await state(page);expect(m.players).toHaveLength(29);expect(m.players.filter(p=>p.role==='starter')).toHaveLength(14);expect(m.players.filter(p=>p.role==='panel').every(p=>p.number===null)).toBe(true);expect(m.players.every(p=>p.playerId)).toBe(true);expect(m.events).toHaveLength(0);
});
