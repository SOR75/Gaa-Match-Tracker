import {test,expect} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {blankMatch} from '../../src/domain.js';
import {createMatchPlayer,createSquadPlayer} from '../../src/identity.js';
const root='/workspace/sideline-v039-field-review';
const nav=(p,name)=>p.getByRole('button',{name,exact:true}).click();
const state=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('sideline.match.v1')));
async function seed(page){
 await page.setViewportSize({width:1024,height:768});await page.clock.install({time:new Date('2026-10-31T12:00:00Z')});
 const m=blankMatch();m.setup.ourTeam='Home';m.setup.opposition='Away';
 const roster=()=>Array.from({length:19},(_,i)=>createMatchPlayer({...createSquadPlayer({number:i+1,name:`Member ${i+1}`,role:i<15?'starter':i===18?'panel':'substitute'}),id:undefined}));
 m.players=roster();m.oppositionPlayers=roster();
 await page.goto('/');await page.evaluate(m=>localStorage.setItem('sideline.match.v1',JSON.stringify(m)),m);await page.reload();await nav(page,'Live match');return m;
}
async function sub(page,on,off){await page.clock.fastForward(1000);await page.locator('[data-event="substitution"]').click();await page.locator(`[data-sub-on="${on}"]`).click();await page.locator(`[data-sub-off="${off}"]`).click();await nav(page,'Record substitution');}
async function picks(page,attribute,on=18,off=6){
 await expect(page.locator(`[${attribute}="${on}"]`)).toBeVisible();await expect(page.locator(`[${attribute}="${off}"]`)).toHaveCount(0);await expect(page.locator(`button[${attribute}]`)).toHaveCount(15);
}
for(const team of ['our','opposition'])test(`${team}: kickout/Mark, shots, actions, blocks and Pass use independent live XV; re-entry restores choices; historical edit stays broad`,async({page})=>{
 await mkdir(root,{recursive:true});await seed(page);await page.locator(`[data-team="${team}"]`).click();await sub(page,18,6);
 // Winner roster follows the credited team, regardless of which team kicked.
 for(const type of ['our-kickout','opposition-kickout'])for(const mark of [false,true]){
  await page.clock.fastForward(1000);const before=(await state(page)).events.length;await page.locator(`[data-event="${type}"]`).click();
  const label=mark?(team==='our'?'Mark won by us':'Mark won by opposition'):(team==='our'?'Won by us':type==='our-kickout'?'Won by opposition':'Retained by opposition');
  await nav(page,label);await picks(page,'data-ko-player');
  if(team==='opposition'&&type==='opposition-kickout'&&!mark)await page.screenshot({path:`${root}/01-opposition-active-xv.png`});
  await page.locator('[data-ko-player="18"]').click();const saved=await state(page);expect(saved.events).toHaveLength(before+1);expect(saved.events.at(-1).kickoutWinnerNumber).toBe('18');expect(saved.events.at(-1).participants.kickoutWinner.team).toBe(team);
 }
 await page.locator('[data-event="point"]').click();await picks(page,'data-shot-player');await page.keyboard.press('Escape');
 for(const type of ['turnover-won','turnover-lost','interception']){
  await page.locator(`[data-event="${type}"]`).click();
  if(type.startsWith('turnover-')){
   await picks(page,`data-turnover-${team}`);await picks(page,`data-turnover-${team==='our'?'opposition':'our'}`,6,18);
   await page.locator(`[data-turnover-${team}="18"]`).click();
   if(team==='opposition')await page.locator('[data-turnover-our="6"]').click();
   await nav(page,'Record turnover');
   const e=(await state(page)).events.at(-1);expect(e.playerNumber).toBe(team==='our'?'18':'6');
   expect(type==='turnover-won'?e.turnoverLoserNumber:e.turnoverWinnerNumber).toBe(team==='opposition'?'18':'');
  }else{
   await page.locator('[data-action-credit] summary').click();await picks(page,'data-action-player');await page.locator('[data-action-player="18"]').click();expect((await state(page)).events.at(-1).playerNumber).toBe('18');
  }
 }
 await page.locator('[data-event="defensive-block"]').click();await picks(page,'data-defensive-player',team==='our'?18:6,team==='our'?6:18);await page.keyboard.press('Escape');
 await page.locator('[data-event="pass"]').click();await picks(page,'data-pass-from');await picks(page,'data-pass-to');await page.locator('[data-pass-from="18"]').click();await page.locator('[data-pass-to="11"]').click();await nav(page,'Hand Pass');const passEvent=(await state(page)).events.at(-1);
 const other=team==='our'?'opposition':'our';await page.locator(`[data-team="${other}"]`).click();await page.locator('[data-event="point"]').click();await picks(page,'data-shot-player',6,18);await page.keyboard.press('Escape');
 // A blocked opposition attempt credits OUR defender from OUR independent XV.
 await page.locator('[data-team="opposition"]').click();await page.locator('[data-event="miss"]').click();await page.getByLabel('Miss reason',{exact:true}).selectOption('blocked');await picks(page,'data-block-player',team==='our'?18:6,team==='our'?6:18);await page.keyboard.press('Escape');
 await page.locator(`[data-team="${team}"]`).click();await sub(page,6,18);await page.locator('[data-event="point"]').click();await picks(page,'data-shot-player',6,18);await page.keyboard.press('Escape');
 await nav(page,'Timeline');await page.locator(`[data-edit-event="${passEvent.id}"]`).click();await expect(page.getByLabel('Passer',{exact:true}).locator('option[value="18"]')).toHaveCount(1);await expect(page.getByLabel('Passer',{exact:true}).locator('option[value="6"]')).toHaveCount(1);await nav(page,'Cancel');
 await page.reload();await nav(page,'Live match');await page.locator('[data-event="point"]').click();await picks(page,'data-shot-player',6,18);
});
const readRows=p=>p.locator('[data-review-row]').evaluateAll(rows=>rows.map(row=>({...Object.fromEntries([...row.querySelectorAll('input,select')].map(n=>[n.name,n.value])),confidence:row.querySelector('.uncertain').textContent})));
for(const name of ['st-manchans','st-manchans-camera','naomh-ciaran','shamrocks'])test(`actual ${name} photograph: formation/Subs integrity and honest uncertain-field review`,async({page},info)=>{
 test.setTimeout(120000);await mkdir(root,{recursive:true});await page.setViewportSize({width:1024,height:768});
 const file=`tests/fixtures/field-programmes/${name}.png`,manifest=JSON.parse(await readFile('tests/fixtures/field-programmes/provenance.json','utf8'));expect(createHash('sha256').update(await readFile(file)).digest('hex')).toBe(manifest.find(x=>x.file===name+'.png').sha256);
 await page.goto('/');await nav(page,'Squad');await page.locator('#team-sheet-photo').setInputFiles(file);await expect(page.getByRole('heading',{name:'Review & confirm',exact:true})).toBeVisible({timeout:95000});
 const rows=await readRows(page);const starters=rows.filter(p=>p.role==='starter'),subs=rows.filter(p=>p.role==='substitute');expect(starters).toHaveLength(15);expect(starters.map(p=>p.number)).toEqual(Array.from({length:15},(_,i)=>String(i+1)));expect(rows.some(p=>/\b(?:Subs|Management|FLO|sponsor|^pat$)\b/i.test(p.name))).toBe(false);
 if(name.startsWith('st-manchans')){
  expect(subs).toHaveLength(11);expect(subs.filter(p=>p.number)).toHaveLength(9);expect(subs.filter(p=>!p.number)).toHaveLength(2);
  expect(rows.find(p=>p.number==='15').name).toBe('Lucy McManus');expect(subs.find(p=>p.number==='26').name).toBe('Ellen Lehane');expect(subs.find(p=>p.number==='24').name).toBe('Mila Fralkova');
  expect(subs.some(p=>!p.number&&/Tracey$/.test(p.name))).toBe(true);expect(subs.some(p=>!p.number&&/Madden$/.test(p.name))).toBe(true);expect(subs.filter(p=>!p.number).every(p=>/Review jersey/.test(p.confidence))).toBe(true);
  await expect(page.locator('[data-import-checks]')).toContainText('2 rows need attention');await expect(page.locator('[data-import-checks]')).toContainText('no number inferred');
  await expect(page.locator('[data-review-attention="true"]')).toHaveCount(2);
  for(const number of ['16','17','18','19','21','22','23','24','26']) {
    const row=page.locator('[data-review-row]').filter({has:page.locator(`input[name="number"][value="${number}"]`)});
    await expect(row).toHaveAttribute('data-review-attention','false');await expect(row.locator('.uncertain')).not.toContainText('Review required');
  }
  if(name==='st-manchans-camera') {
    expect(subs.find(p=>!p.number&&p.name==='Niamh Tracey')).toBeTruthy();expect(subs.find(p=>!p.number&&p.name==='Amy Madden')).toBeTruthy();
    expect(rows).toHaveLength(26);expect(rows.some(p=>p.number==='20'||p.number==='25')).toBe(false); // Those digits are absent in the supplied original, not filled from the expected sequence.
  }
  await page.locator('[data-review-row]').last().scrollIntoViewIfNeeded();
  await page.screenshot({path:`${root}/${name==='st-manchans-camera'?'04-full-st-manchans-review':'05-cropped-st-manchans-review'}.png`});
 }else if(name==='naomh-ciaran'){
  expect(subs).toHaveLength(15);expect(subs.map(p=>p.number)).toEqual(Array.from({length:15},(_,i)=>String(i+16)));expect(starters[12].name).toBe('Aimee Fitzgerald');expect(rows.find(p=>p.number==='30').name).toBe('Freya Flynn');
  await expect(page.locator('[data-import-checks]')).toBeHidden();await page.locator('.review-table').scrollIntoViewIfNeeded();await page.screenshot({path:`${root}/02-clean-programme-review.png`});
 }else{
  expect(subs).toHaveLength(11);expect(subs.map(p=>p.number)).toEqual(Array.from({length:11},(_,i)=>String(i+16)));expect(starters[14].name).toBe('Sarah Minnock');expect(rows.filter(p=>p.name==='Sarah Smith')).toHaveLength(1);expect(rows.find(p=>p.name==='Sarah Smith').number).toBe('23');expect(rows.find(p=>p.number==='25').name).toBe('Emily Kavanagh');

 }
 await writeFile(`${root}/${name}-rows.json`,JSON.stringify(rows,null,2));await info.attach('real-photo-rows.json',{body:JSON.stringify(rows,null,2),contentType:'application/json'});
});
test('suspicious import is visibly flagged before confirmation; rows stay editable and duplicate names are not silently merged',async({page})=>{
 await mkdir(root,{recursive:true});await page.setViewportSize({width:1024,height:768});await page.goto('/');await nav(page,'Squad');await page.locator('#import-layout').selectOption('programme');await nav(page,'Paste team-sheet text');
 const names=['Ava Quinn','Beth Quinn','Subs Aimee Aoife Fitzgerald','Dara Quinn','Ella Quinn','Fia Quinn','Grace Quinn','Hana Quinn','Isla Quinn','Jane Quinn','Kate Quinn','Lara Quinn','Maya Quinn','Nora Quinn','Sarah h'];
 const rows=names.map((s,i)=>`${i===1?1:i+1},${s},starter`);rows.push(',Sarah Smith,starter','23,Sarah Smith,substitute');
 await page.getByLabel('Team-sheet text',{exact:true}).fill('Jersey,Name,Role\n'+rows.join('\n'));await nav(page,'Extract & review text');
 const checks=page.locator('[data-import-checks]');await expect(checks).toBeVisible();for(const word of ['Duplicate jersey','duplicate name','section text','starter jersey missing','truncated'])await expect(checks).toContainText(word);
 await page.screenshot({path:`${root}/03-suspicious-programme-review.png`});expect(await page.locator('[data-review-row]').count()).toBe(17);expect((await state(page))?.players || []).toHaveLength(0);
 await page.getByLabel('Jersey number row 2',{exact:true}).fill('2');await expect(checks).not.toContainText('Duplicate jersey');await page.getByLabel('Player name row 3',{exact:true}).fill('Cara Quinn');await expect(checks).not.toContainText('section text');
 const blank=page.getByLabel('Jersey number row 16',{exact:true});await blank.fill('16');await page.getByLabel('Role row 16',{exact:true}).selectOption('substitute');await expect(checks).not.toContainText('starter jersey missing');
 await page.locator('[data-review-row]').nth(15).getByRole('button',{name:'Remove row 16',exact:true}).click();await expect(checks).not.toContainText('duplicate name');await page.getByLabel('Player name row 15',{exact:true}).fill('Orla Quinn');await expect(checks).toBeHidden();
});

test('match-day imports cap at 30 named players, show excluded evidence, and cannot confirm an added 31st selection',async({page})=>{
 await page.setViewportSize({width:1024,height:768});await page.goto('/');await nav(page,'Squad');
 const text=Array.from({length:32},(_,i)=>`${i+1} Member Surname${i+1}`).join('\n')+'\nManagement: Coach Person\n33 Staff Person';
 await page.locator('#team-sheet-file').setInputFiles({name:'match-day.txt',mimeType:'text/plain',buffer:Buffer.from(text)});
 await expect(page.getByRole('heading',{name:'Review & confirm',exact:true})).toBeVisible();
 await expect(page.locator('[data-review-row]')).toHaveCount(30);await expect(page.locator('[data-import-capacity]')).toContainText('2 extra candidate(s) excluded');
 await expect(page.locator('[data-import-capacity]')).toContainText('31 Member Surname31');await expect(page.locator('[data-import-capacity]')).not.toContainText('Staff Person');
 await nav(page,'+ Add row');await page.getByLabel('Jersey number row 31',{exact:true}).fill('99');await page.getByLabel('Player name row 31',{exact:true}).fill('Extra Member');await nav(page,'Confirm & add to squad');
 await expect(page.locator('[data-squad-error]')).toContainText('Maximum 30 named match-day players');expect((await state(page))?.players || []).toHaveLength(0);
 await nav(page,'Remove row 31');await nav(page,'Confirm & add to squad');expect((await state(page)).players).toHaveLength(30);
});

test('skipped and higher jerseys remain legal; missing numeric sequence alone creates neither players nor prominent warnings',async({page})=>{
 await page.goto('/');await nav(page,'Squad');await page.locator('#import-layout').selectOption('programme');await nav(page,'Paste team-sheet text');
 await page.getByLabel('Team-sheet text',{exact:true}).fill('1 Ava Quinn\nSubs: 16 Beth Quinn 18 Cara Quinn 26 Dara Quinn 44 Ella Quinn\nManagement: Coach Person');await nav(page,'Extract & review text');
 await expect(page.locator('[data-review-row]')).toHaveCount(5);await expect(page.locator('[data-import-checks]')).toBeHidden();await nav(page,'Confirm & add to squad');
 expect((await state(page)).players.map(p=>p.number)).toEqual([1,16,18,26,44]);
});
