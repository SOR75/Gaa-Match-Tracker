import {test,expect} from '@playwright/test';
import {blankMatch,createEvent} from '../../src/domain.js';
import {withBlankMatchPlayers} from '../../src/match-squad-enrichment.js';
import {advancePeriod} from '../../src/periods.js';
const state=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('sideline.match.v1')));
const nav=(p,n)=>p.getByRole('button',{name:n,exact:true}).click();
function fixture(){const m=withBlankMatchPlayers(blankMatch());m.setup={...m.setup,ourTeam:'Start Home',opposition:'Start Away',matchCode:'LGFA'};for(const [team,rows]of [['our',m.players],['opposition',m.oppositionPlayers]])for(const p of rows)p.name=`${team} Player ${p.number}`;return m;}
async function load(p,m=fixture()){
 await p.clock.install({time:new Date('2026-11-10T12:00:00Z')});await p.clock.pauseAt(new Date('2026-11-10T12:00:01Z'));await p.setViewportSize({width:1024,height:768});
 await p.goto('/');await p.evaluate(m=>localStorage.setItem('sideline.match.v1',JSON.stringify(m)),m);await p.reload();await nav(p,'Live match');
}
async function start(p){await p.locator('[data-action=clock]').click();}
async function pausedStart(p){await start(p);await start(p);expect((await state(p)).clock.elapsedMs).toBe(0);}
async function blocked(p){for(const b of await p.locator('[data-event]').all())await expect(b).toBeDisabled();}
async function finishCapture(p,type){
 if(['goal','point','two-point','miss'].includes(type))await p.locator('[data-shot-close]').first().click();
 else if(type==='interception')await p.locator('[data-interception-close]').first().click();
 else if(type==='defensive-block')await p.locator('[data-defensive-close]').first().click();
 else if(type==='pass'){await p.locator('[data-pass-from="4"]').click();await p.locator('[data-pass-to="11"]').click();await p.locator('[data-pass-type="kick"]').click();}
 else if(type.startsWith('turnover')){await p.locator('[data-turnover-our="4"]').click();await p.locator('[data-turnover-opposition="5"]').click();await p.locator('[data-turnover-record]').click();}
 else if(type.includes('kickout')){await p.locator('[data-ko-result]').first().click();await p.locator('[data-kickout-close]').click();}
 else if(type==='substitution'){await p.locator('[data-sub-on="16"]').click();await p.locator('[data-sub-off="4"]').click();await nav(p,'Record substitution');}
 else if(type==='booked'){await p.locator('[data-booked-player="4"]').click();await p.locator('[data-card="yellow"]').click();}
}
for(const team of ['our','opposition'])for(const type of ['goal','point','two-point','miss','defensive-block','interception','our-kickout','opposition-kickout','turnover-won','turnover-lost','pass','substitution','booked'])test(`${team} ${type}: actual live button blocked before start, one save during zero-time manual pause`,async({page})=>{
 await load(page);await page.locator(`[data-team="${team}"]`).click();const button=page.locator(`[data-event="${type}"]`);await expect(button).toBeDisabled();expect((await state(page)).events).toHaveLength(0);
 await pausedStart(page);const before=await state(page);await expect(button).toBeEnabled();await button.click();await finishCapture(page,type);const after=await state(page);expect(after.events).toHaveLength(1);expect(after.events[0].event).toBe(type);expect(after.clock).toEqual(before.clock);
});
test('real H1 → half-time → H2 → ET1 → ET2 transitions lock intervals and start periods atomically',async({page})=>{
 await load(page);await blocked(page);await start(page);await expect(page.locator('[data-event=point]')).toBeEnabled();await page.clock.fastForward(120000);
 await nav(page,'END FIRST HALF');expect((await state(page)).clock.phase).toBe('INTERVAL');await nav(page,'Return to Live Match');await blocked(page);
 await nav(page,'Start second half');let m=await state(page);expect(m.clock.half).toBe(2);expect(m.clock.startedAt).not.toBeNull();expect(m.clock.periods.H2.hasStarted).toBe(true);await expect(page.locator('[data-event=point]')).toBeEnabled();
 await start(page);await expect(page.locator('[data-event=point]')).toBeEnabled();await nav(page,'END MATCH / FULL TIME');expect((await state(page)).clock.phase).toBe('INTERVAL');
 await nav(page,'Start Extra Time');m=await state(page);expect(m.clock.half).toBe(3);expect(m.clock.startedAt).not.toBeNull();await expect(page.locator('[data-event=point]')).toBeEnabled();await nav(page,'END ET1');await blocked(page);
 await nav(page,'Start ET2');m=await state(page);expect(m.clock.half).toBe(4);expect(m.clock.startedAt).not.toBeNull();await expect(page.locator('[data-event=point]')).toBeEnabled();
 await nav(page,'END MATCH / FULL TIME');await nav(page,'Finish as Draw');await nav(page,'Return to Match');await blocked(page);await expect(page.locator('[data-action=clock]')).toBeDisabled();
});
for(const half of [2,3,4])test(`prepared ${half} at 00:00 does not inherit a previous period start`,async({page})=>{
 const m=fixture();m.clock.elapsedMs=120000;for(let h=2;h<=half;h++)m.clock=advancePeriod(m.clock,h,0);await load(page,m);await blocked(page);await start(page);await expect(page.locator('[data-event=point]')).toBeEnabled();expect((await state(page)).clock.startedAt).not.toBeNull();
});
test('reload and analysis viewing preserve a started zero-time pause without ending the period',async({page})=>{
 await load(page);await pausedStart(page);const before=await state(page);await nav(page,'Match analysis');await nav(page,'Live match');expect((await state(page)).clock).toEqual(before.clock);await page.reload();await expect(page.locator('.scoreboard')).toBeVisible();await expect(page.locator('[data-event=point]')).toBeEnabled();await page.locator('[data-event=point]').click();await finishCapture(page,'point');expect((await state(page)).clock).toEqual(before.clock);
});
test('legacy completed match cannot capture or restart even with no recorded period boundary',async({page})=>{const m=fixture();m.clock.elapsedMs=1800000;m.lifecycle={status:'completed',completedAt:'2026-11-01T12:00:00Z'};await load(page,m);await blocked(page);await expect(page.locator('[data-action=clock]')).toBeDisabled();expect((await state(page)).events).toEqual([]);});
for(const type of ['pass','turnover-won','substitution','booked','our-kickout'])test(`stale ${type} submission after half-time cannot append an event`,async({page})=>{
 await load(page);await pausedStart(page);await page.locator(`[data-event="${type}"]`).click();let pending;
 if(type==='pass'){await page.locator('[data-pass-from="4"]').click();await page.locator('[data-pass-to="11"]').click();pending=await page.locator('[data-pass-type="kick"]').elementHandle();}
 else if(type==='turnover-won'){await page.locator('[data-turnover-our="4"]').click();pending=await page.locator('[data-turnover-record]').elementHandle();}
 else if(type==='substitution'){await page.locator('[data-sub-on="16"]').click();await page.locator('[data-sub-off="4"]').click();pending=await page.locator('#substitution-form').elementHandle();}
 else if(type==='booked'){await page.locator('[data-booked-player="4"]').click();pending=await page.locator('[data-card=yellow]').elementHandle();}
 else pending=await page.locator('[data-ko-result]').first().elementHandle();
 // An actual transition removes the dialog. Retain its old DOM callback to model
 // a delayed delivery; do not replace the renderer, ledger or save function.
 await page.locator('[data-action=half-time]').evaluate(b=>b.click());expect((await state(page)).clock.phase).toBe('INTERVAL');
 if(type==='substitution')await pending.evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 else await pending.evaluate(b=>b.click());
 expect((await state(page)).events).toHaveLength(0);
});
test('stale deleted-event editor cannot resurrect an event; corrections remain independent of capture permission',async({page})=>{
 await load(page);await pausedStart(page);await page.locator('[data-event=point]').click();await finishCapture(page,'point');await nav(page,'Edit last event');const form=await page.locator('#event-form').elementHandle();
 await page.locator('[data-action=undo]').evaluate(b=>b.click());expect((await state(page)).events).toHaveLength(0);await form.evaluate(f=>f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect((await state(page)).events).toHaveLength(0);await expect(page.locator('#toast')).toContainText('no longer exists');
});
test('already recorded shot attribution and Timeline correction/delete remain usable at half-time',async({page})=>{
 await load(page);await pausedStart(page);await page.locator('[data-event=point]').click();const captured=(await state(page)).events[0],credit=await page.locator('[data-shot-player="4"]').elementHandle();
 await page.locator('[data-action=half-time]').evaluate(b=>b.click());await credit.evaluate(b=>b.click());let m=await state(page);expect(m.events[0]).toMatchObject({id:captured.id,playerNumber:'4'});const clock=m.clock;
 await nav(page,'Return to Live Match');await nav(page,'Timeline');await page.locator('[data-edit-event]').click();await nav(page,'Save changes');expect((await state(page)).clock).toEqual(clock);
 await page.locator('[data-edit-event]').click();await page.locator('[data-delete-event]').click();await page.locator('[data-confirm-delete]').click();expect((await state(page)).events).toHaveLength(0);expect((await state(page)).clock).toEqual(clock);
});
test('LGFA ET entry holds the clock for explicit decisions, then requires Start before play or RETURNED',async({page})=>{
 const m=fixture();m.clock=advancePeriod({...m.clock,elapsedMs:1800000},2,0);m.clock.elapsedMs=1790000;await load(page,m);
 await page.locator('[data-event=booked]').click();await page.locator('[data-booked-player="8"]').click();await page.locator('[data-card=yellow]').click();await page.clock.fastForward(1000);
 await nav(page,'END MATCH / FULL TIME');await nav(page,'Start Extra Time');let saved=await state(page);expect(saved.clock.startedAt).toBeNull();expect(saved.clock.elapsedMs).toBe(0);await blocked(page);await expect(page.locator('[data-action=clock]')).toBeDisabled();
 await nav(page,'CONTINUE WITH 14');saved=await state(page);expect(saved.events.at(-1).event).toBe('discipline-et-choice');expect(saved.clock.startedAt).toBeNull();await blocked(page);
 await start(page);await expect(page.locator('[data-event=point]')).toBeEnabled();await start(page);await page.reload();await nav(page,'Live match');await expect(page.locator('[data-et-choice]')).toHaveCount(0);await expect(page.locator('[data-event=point]')).toBeEnabled();
});
test('paused zero-time start and original event IDs survive deliberate History Resume',async({page})=>{
 await load(page);await pausedStart(page);await page.locator('[data-event=point]').click();await finishCapture(page,'point');const original=await state(page);
 await nav(page,'Match setup');page.once('dialog',d=>d.accept());await nav(page,'Start a new blank match');await nav(page,'Match History');const row=page.locator(`[data-history-id="${original.id}"]`);await row.locator('summary').click();page.once('dialog',d=>d.accept());await row.getByRole('button',{name:'RESUME MATCH',exact:true}).click();
 await expect.poll(async()=>(await state(page)).id).toBe(original.id);
 const resumed=await state(page);expect(resumed.id).toBe(original.id);expect(resumed.events).toEqual(original.events);expect(resumed.clock.startedAt).toBeNull();expect(resumed.clock.periods.H1.hasStarted).toBe(true);await expect(page.locator('[data-event=point]')).toBeEnabled();
});
for(const team of ['our','opposition'])test(`${team} Mark capture shares the period gate and preserves one kickout event`,async({page})=>{
 await load(page);const type=team==='our'?'our-kickout':'opposition-kickout';await expect(page.locator(`[data-event="${type}"]`)).toBeDisabled();await pausedStart(page);const clock=(await state(page)).clock;
 await page.locator(`[data-event="${type}"]`).click();await page.locator('[data-ko-result=mark-won]').click();await page.locator('[data-ko-player="4"]').click();const m=await state(page);expect(m.events).toHaveLength(1);expect(m.events[0]).toMatchObject({event:type,mark:true,markPlayerNumber:'4'});expect(m.clock).toEqual(clock);
});
test('current completed match permits explicit edit/delete/Undo without enabling new play',async({page})=>{
 await load(page);await pausedStart(page);await page.locator('[data-event=point]').click();await finishCapture(page,'point');await nav(page,'Start second half');await nav(page,'END MATCH / FULL TIME');const completed=await state(page);await nav(page,'Return to Match');await blocked(page);
 await nav(page,'Edit last event');await nav(page,'Save changes');expect((await state(page)).clock).toEqual(completed.clock);expect((await state(page)).lifecycle).toEqual(completed.lifecycle);await blocked(page);
 await nav(page,'Undo last event');expect((await state(page)).events).toHaveLength(0);expect((await state(page)).clock).toEqual(completed.clock);await blocked(page);
});
test('legacy positive paused time permits capture without rewriting or starting the clock',async({page})=>{const m=fixture();m.clock.elapsedMs=120000;await load(page,m);const before=await state(page);await expect(page.locator('[data-event=point]')).toBeEnabled();await page.locator('[data-event=point]').click();await finishCapture(page,'point');expect((await state(page)).clock).toEqual(before.clock);});
for(const transition of ['period','match'])test(`pending Pass cannot be reassigned after a ${transition} change`,async({page})=>{
 await load(page);await pausedStart(page);await page.locator('[data-event=pass]').click();await page.locator('[data-pass-from="4"]').click();await page.locator('[data-pass-to="11"]').click();const submit=await page.locator('[data-pass-type=kick]').elementHandle();
 if(transition==='period')await page.locator('[data-action=half]').evaluate(b=>b.click());
 else{await page.locator('[data-view=setup]').evaluate(b=>b.click());page.once('dialog',d=>d.accept());await nav(page,'Start a new blank match');await expect.poll(async()=>(await state(page)).setup.ourTeam).toBe('');}
 const before=await state(page);await submit.evaluate(b=>b.click());expect(await state(page)).toEqual(before);expect(before.events).toHaveLength(0);
});
test('legacy zero-time events do not unlock an ambiguous unstarted clock or change historical scores',async({page})=>{const m=fixture();m.events=[createEvent(m,'point','our',0)];await load(page,m);const before=await state(page);await blocked(page);await expect(page.locator('.score-team.our .score-calculated')).toHaveText('(1)');expect(await state(page)).toEqual(before);});
test('an LGFA RETURNED picker delivered after ET1 ends neither appends nor throws',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const m=fixture();m.clock=advancePeriod({...m.clock,elapsedMs:1800000},2,0);m.clock.elapsedMs=1790000;await load(page,m);
 async function card(n){await page.locator('[data-event=booked]').click();await page.locator(`[data-booked-player="${n}"]`).click();await page.locator('[data-card=yellow]').click();}
 await card(8);await nav(page,'END MATCH / FULL TIME');await nav(page,'Start Extra Time');await nav(page,'REPLACE FOR EXTRA TIME');await page.locator(`[data-et-player="${m.players.find(p=>p.number===18).id}"]`).click();await start(page);
 await page.clock.fastForward(10000);await card(18);await page.clock.fastForward(590000);const original=(await state(page)).events.find(e=>e.event==='booked'&&e.playerNumber==='8');await page.locator(`[data-discipline-return="${original.id}"]`).click();await expect(page.getByRole('heading',{name:'Who comes off?',exact:true})).toBeVisible();const pending=await page.locator('[data-return-off]').first().elementHandle();
 await page.locator('[data-action=et-interval]').evaluate(b=>b.click());const before=await state(page);expect(before.clock.phase).toBe('INTERVAL');await pending.evaluate(b=>b.click());expect(await state(page)).toEqual(before);expect(errors).toEqual([]);
});
test('opening Half-Time Analysis is view-only; explicit END FIRST HALF establishes the interval',async({page})=>{
 await load(page);await start(page);await page.clock.fastForward(20000);const before=await state(page);
 await nav(page,'HALF-TIME ANALYSIS');expect((await state(page)).clock).toEqual(before.clock);await nav(page,'Return to Live Match');await expect(page.locator('[data-event=point]')).toBeEnabled();
 await nav(page,'END FIRST HALF');const ended=await state(page);expect(ended.clock.phase).toBe('INTERVAL');expect(ended.clock.startedAt).toBeNull();await nav(page,'Return to Live Match');await blocked(page);
 await nav(page,'HALF-TIME ANALYSIS');expect((await state(page)).clock).toEqual(ended.clock);
});
