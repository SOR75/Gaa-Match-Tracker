import {test, expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {blankMatch, createEvent} from '../../src/domain.js';
import {makeBackup} from '../../src/match-backup.js';
import {startPeriod} from '../../src/periods.js';
import {history0313} from '../helpers/history0313.js';
const root = '/workspace/sideline-0316-review', date = '2026-11-11T12:00:00.000Z';
const nav = (p,n) => p.getByRole('button',{name:n,exact:true}).click();
const storage = p => p.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
const card = (p,id) => p.locator(`[data-history-id="${id}"]`);
function incoming(id='Incoming match') {
  const m=history0313().a; m.id=id; m.setup.ourTeam='Áine’s Rovers'; m.setup.opposition='Synthetic United';
  m.events[0].extraEvidence={unknown:null,unicode:'✓ Éire',originalEventId:'preserved'};
  return m;
}
function backup(matches=[incoming()]) {return makeBackup(matches.map(m=>({id:m.id,match:m,archivedAt:date})),date);}
function fullFixture() {
  const d=history0313();d.squad.name='Restored permanent squad';d.squad.clubName='Éire Óg';d.squad.extraRecordedMetadata={original:true};d.setup.name='Restored match-day setup';d.a.id='Restored library fixture';
  return {d, value:makeBackup([{id:d.a.id,match:d.a,archivedAt:date}],date,{squads:{version:2,squads:[d.squad]},teamSetups:{version:1,setups:[d.setup]}})};
}
async function rows(page) {
  return page.evaluate(()=>new Promise((resolve,reject)=>{
    const r=indexedDB.open('sideline.history',1);
    r.onsuccess=()=>{const db=r.result,tx=db.transaction('matches','readonly'),q=tx.objectStore('matches').getAll();let data;q.onsuccess=()=>data=q.result;tx.oncomplete=()=>{db.close();resolve(data);};tx.onerror=()=>reject(tx.error);};r.onerror=()=>reject(r.error);
  }));
}
async function seed(page) {
  const d=history0313(); await page.setViewportSize({width:1024,height:768});await page.goto('/');
  await page.evaluate(async d=>{
    localStorage.setItem('sideline.match.v1',JSON.stringify(d.active));
    localStorage.setItem('sideline.squads.v2',JSON.stringify({version:2,squads:[d.squad]}));
    localStorage.setItem('sideline.team-setups.v1',JSON.stringify({version:1,setups:[d.setup]}));
    localStorage.setItem('sideline.match.archive.'+d.a.id,JSON.stringify(d.a));
    await new Promise((resolve,reject)=>{const r=indexedDB.open('sideline.history',1);
      r.onupgradeneeded=()=>r.result.createObjectStore('matches',{keyPath:'id'});
      r.onsuccess=()=>{const db=r.result,tx=db.transaction('matches','readwrite');
        tx.objectStore('matches').put({repositoryVersion:1,id:d.b.id,origin:'native',match:d.b});
        tx.objectStore('matches').put({repositoryVersion:1,id:'Deleted match',deleted:true,deletedAt:'2026-11-01T12:00:00Z'});
        tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};r.onerror=()=>reject(r.error);});
  },d);
  await page.reload(); await nav(page,'Match History');await expect(page.getByText('Loading saved matches…')).toHaveCount(0);
  await page.locator('[data-match-backup] > summary').click();return d;
}
async function upload(page,b) {
  await page.locator('[data-match-backup-file]').setInputFiles({name:'Sideline-test-backup.json',mimeType:'application/json',buffer:Buffer.from(typeof b==='string'?b:JSON.stringify(b))});
}
async function download(page) {
  const pending=page.waitForEvent('download'); await nav(page,'Download Sideline backup'); const file=await pending;
  const stream=await file.createReadStream();let text='';for await(const chunk of stream)text+=chunk;
  return {file,value:JSON.parse(text)};
}
test('download includes raw active, native and legacy archives, IDs and all event metadata, with no storage writes',async({page})=>{
  const d=await seed(page),before=await storage(page),originals=await rows(page);
  const {file,value}=await download(page);expect(file.suggestedFilename()).toMatch(/^Sideline-Backup-.*\.json$/);
  expect(value.matches).toHaveLength(3);for(const m of [d.active,d.a,d.b])expect(value.matches.find(r=>r.id===m.id).match).toEqual(m);
  expect(value.version).toBe(2);expect(value.libraries.squads.squads).toEqual([d.squad]);expect(value.libraries.teamSetups.setups).toEqual([d.setup]);
  expect(value.matches.some(r=>r.id==='Deleted match')).toBe(false);
  expect(await storage(page)).toEqual(before);expect(await rows(page)).toEqual(originals);
});
test('restore preview and Cancel write nothing; confirmation adds exactly one immutable snapshot without touching active/squads/other archives',async({page})=>{
  await seed(page);const before=await storage(page),originals=await rows(page),m=incoming();await upload(page,backup([m]));
  await expect(page.locator('[data-backup-review]')).toContainText('1 new matches to restore');expect(await rows(page)).toEqual(originals);
  await nav(page,'Cancel restore');expect(await rows(page)).toEqual(originals);expect(await storage(page)).toEqual(before);
  await upload(page,backup([m]));await mkdir(root,{recursive:true});await page.screenshot({path:root+'/Restore-review-iPad.png',fullPage:true});
  await nav(page,'Confirm restore');await expect(page.locator('[data-backup-notice]')).toContainText('1 match restored');
  const after=await rows(page);expect(after.find(r=>r.id===m.id).match).toEqual(m);
  for(const r of originals)expect(after.find(n=>n.id===r.id)).toEqual(r);expect(await storage(page)).toEqual(before);await expect(card(page,m.id)).toBeVisible();
  await page.reload();await nav(page,'Match History');expect((await rows(page)).find(r=>r.id===m.id).match).toEqual(m);
});
test('active, existing and deleted IDs are skipped even when backup content differs; only new IDs can be restored',async({page})=>{
  const d=await seed(page),before=await storage(page),originals=await rows(page);
  const matches=[d.active,d.a,d.b,incoming('Deleted match'),incoming()];matches[0].setup.ourTeam='Must not overwrite active';matches[1].events=[];
  await upload(page,backup(matches));const panel=page.locator('[data-backup-review]');await expect(panel).toContainText('1 new matches to restore; 4 skipped');
  await expect(panel).toContainText('Active match — preserved');await expect(panel).toContainText('Previously deleted — preserved');await expect(panel).toContainText('Already stored — preserved');
  await nav(page,'Confirm restore');await expect(page.locator('[data-backup-notice]')).toContainText('1 match restored; 4 skipped');
  expect(await storage(page)).toEqual(before);for(const r of originals)expect((await rows(page)).find(n=>n.id===r.id)).toEqual(r);
  await upload(page,backup(matches));await expect(page.getByRole('button',{name:'Confirm restore',exact:true})).toBeDisabled();
});
for(const invalid of ['malformed','future','invalid match','duplicate IDs'])test(`${invalid} backup rejected before writes`,async({page})=>{
  await seed(page);const before=await storage(page),originals=await rows(page);let b=backup();
  if(invalid==='malformed')b='{';if(invalid==='future')b.version=99;if(invalid==='invalid match')b.matches.push({id:'broken',match:{}});if(invalid==='duplicate IDs')b.matches.push(b.matches[0]);
  await upload(page,b);await expect(page.locator('[data-match-backup] [role=alert]')).toBeVisible();await expect(page.locator('[data-backup-review]')).toHaveCount(0);
  expect(await storage(page)).toEqual(before);expect(await rows(page)).toEqual(originals);
});
test('late IndexedDB quota failure rolls back the whole batch and reports failure',async({page})=>{
  await seed(page);const before=await storage(page),originals=await rows(page);await upload(page,backup([incoming('new1'),incoming('new2')]));
  await page.evaluate(()=>{const add=IDBObjectStore.prototype.add;let n=0;IDBObjectStore.prototype.add=function(...args){if(this.name==='matches'&&++n===2)throw new DOMException('Synthetic quota failure','QuotaExceededError');return add.apply(this,args);};});
  await nav(page,'Confirm restore');await expect(page.locator('[data-match-backup] [role=alert]')).toContainText('Synthetic quota failure');
  expect(await rows(page)).toEqual(originals);expect(await storage(page)).toEqual(before);
});
test('changed active match and new conflicting archives between preview and confirm are rechecked without overwriting',async({page})=>{
  await seed(page);const a=incoming('incoming-active'),b=incoming('new-legacy'),c=incoming('still-new');await upload(page,backup([a,b,c]));
  await page.evaluate(({a,b})=>{localStorage.setItem('sideline.match.v1',JSON.stringify(a));localStorage.setItem('sideline.match.archive.'+b.id,JSON.stringify(b));},{a,b});
  const before=await storage(page);await nav(page,'Confirm restore');await expect(page.locator('[data-backup-notice]')).toContainText('1 match restored; 2 skipped');expect(await storage(page)).toEqual(before);
  expect((await rows(page)).some(r=>r.id===a.id)).toBe(false);expect((await rows(page)).find(r=>r.id===c.id).match).toEqual(c);
});
test('legacy schema one backup is retained verbatim on disk and remains viewable/exportable through History',async({page})=>{
  await seed(page);const m=blankMatch();m.id='legacy imported';m.schemaVersion=1;delete m.oppositionPlayers;m.setup.ourTeam='Legacy Home';m.setup.opposition='Legacy Away';m.events=[createEvent(m,'point','our')];
  await upload(page,backup([m]));await nav(page,'Confirm restore');await expect(card(page,m.id)).toBeVisible();expect((await rows(page)).find(r=>r.id===m.id).match).toEqual(m);
  await card(page,m.id).getByRole('button',{name:'VIEW MATCH',exact:true}).click();await page.locator('.history-tabs').getByRole('button',{name:'Timeline',exact:true}).click();
  await expect(page.locator('.event-row')).toHaveCount(1);const pending=page.waitForEvent('download');await nav(page,'Download Timeline CSV');const csv=await pending,stream=await csv.createReadStream();let text='';for await(const chunk of stream)text+=chunk;expect(text).toContain(m.events[0].id);
  expect((await rows(page)).find(r=>r.id===m.id).match).toEqual(m);
});
test('restored running snapshot resumes with clock frozen at backup time, preserving original event and player IDs',async({page})=>{
  await seed(page);const m=incoming('running snapshot');m.lifecycle={status:'live'};m.clock=startPeriod(blankMatch().clock,Date.parse(date)-120000);m.clock.elapsedMs=1000;
  await upload(page,backup([m]));await nav(page,'Confirm restore');await expect(card(page,m.id)).toBeVisible();const record=(await rows(page)).find(r=>r.id===m.id);expect(record.match.clock).toEqual(m.clock);
  await card(page,m.id).locator('summary').click();page.once('dialog',d=>d.accept());await card(page,m.id).getByRole('button',{name:'RESUME MATCH',exact:true}).click();
  await expect.poll(async()=>JSON.parse((await storage(page))['sideline.match.v1']).id).toBe(m.id);
  const active=JSON.parse((await storage(page))['sideline.match.v1']);expect(active.clock.startedAt).toBeNull();expect(active.clock.elapsedMs).toBe(121000);expect(active.events).toEqual(m.events);expect(active.players).toEqual(m.players);
});
test('offline backup download and restore work using the installed app shell without changing unrelated storage',async({page,context})=>{
  await seed(page);await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);await context.setOffline(true);await page.reload();await nav(page,'Match History');await page.locator('[data-match-backup] > summary').click();
  const before=await storage(page),m=incoming('offline import');await download(page);await upload(page,backup([m]));await nav(page,'Confirm restore');await expect(card(page,m.id)).toBeVisible();expect(await storage(page)).toEqual(before);await context.setOffline(false);
});
test('unavailable IndexedDB reports incomplete backup and restore failure instead of silently exporting only legacy data',async({page})=>{
  await seed(page);await page.addInitScript(()=>Object.defineProperty(window,'indexedDB',{value:undefined,configurable:true}));await page.reload();await nav(page,'Match History');await page.locator('[data-match-backup] > summary').click();const before=await storage(page);
  await nav(page,'Download Sideline backup');await expect(page.locator('[data-match-backup] [role=alert]')).toContainText('IndexedDB is unavailable');
  await upload(page,backup());await expect(page.locator('[data-match-backup] [role=alert]')).toContainText('IndexedDB is unavailable');expect(await storage(page)).toEqual(before);
});
for(const viewport of [{width:1024,height:768},{width:390,height:844}])test(`build details identify the actual running bundle without changing match data at ${viewport.width}`,async({page,request})=>{
  await seed(page);await page.setViewportSize(viewport);await nav(page,'Live match');const before=await storage(page),info=await (await request.get('/build-info.json')).json();
  await page.getByRole('button',{name:'Build information',exact:true}).click();await expect(page.locator('[data-build-commit]')).toHaveText(info.sourceCommit);
  await expect(page.getByRole('dialog')).toContainText('V0.3.16-dev');await expect(page.locator('[data-build-dirty]')).toContainText(info.sourceDirty?'Local changes included':'sourceDirty=false');expect(await storage(page)).toEqual(before);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);await mkdir(root,{recursive:true});await page.screenshot({path:`${root}/Build-information-${viewport.width}.png`});await nav(page,'Close build information');expect(await storage(page)).toEqual(before);
});
test('a downloaded backup restores on an isolated device context with exact snapshots and no active-match replacement',async({page,browser})=>{
  const d=await seed(page),{value}=await download(page),other=await browser.newContext();
  try {
    const p=await other.newPage();await p.goto(page.url());await nav(p,'Match History');await p.locator('[data-match-backup] > summary').click();const before=await storage(p);
    await upload(p,value);await expect(p.locator('[data-backup-review]')).toContainText('3 new matches to restore');await nav(p,'Confirm restore');await expect(p.locator('[data-backup-notice]')).toContainText('3 matches restored');
    for(const m of [d.active,d.a,d.b])expect((await rows(p)).find(r=>r.id===m.id).match).toEqual(m);const after=await storage(p);expect(after['sideline.match.v1']).toBe(before['sideline.match.v1']);expect(JSON.parse(after['sideline.squads.v2']).squads).toEqual(value.libraries.squads.squads);expect(JSON.parse(after['sideline.team-setups.v1']).setups).toEqual(value.libraries.teamSetups.setups);
  } finally {await other.close();}
});
test('rapid confirm clicks import once and duplicate imports remain no-ops',async({page})=>{
  await seed(page);const m=incoming();await upload(page,backup([m]));await page.locator('[data-backup-action=confirm]').evaluate(b=>{b.click();b.click();});
  await expect(page.locator('[data-backup-notice]')).toContainText('1 match restored');expect((await rows(page)).filter(r=>r.id===m.id)).toHaveLength(1);
  const before=await rows(page);await upload(page,backup([m]));await expect(page.getByRole('button',{name:'Confirm restore',exact:true})).toBeDisabled();expect(await rows(page)).toEqual(before);
});
test('oversized backup file is rejected without parsing or writing records',async({page})=>{
  await seed(page);const before=await storage(page),originals=await rows(page);await upload(page,' '.repeat(25*1024*1024+1));
  await expect(page.locator('[data-match-backup] [role=alert]')).toContainText('25 MB');expect(await storage(page)).toEqual(before);expect(await rows(page)).toEqual(originals);
});
test('restoring a new match updates Player Review by UUID across a different jersey without creating squad members',async({page})=>{
  const d=await seed(page),m=structuredClone(d.a);m.id='Same player new jersey';m.players[0].number=23;m.players[0].jerseyNumber=23;m.events[0].playerNumber='23';m.events[0].participants.player.jerseyNumber=23;
  const before=await storage(page);await upload(page,backup([m]));await nav(page,'Confirm restore');await expect(page.locator('[data-backup-notice]')).toContainText('1 match restored');
  await nav(page,'Player Review');await page.locator('#review-player').selectOption(d.squad.players[0].playerId);await expect(page.locator('[data-review-metric=appearances]')).toHaveText('3');await expect(page.locator('[data-review-metric=attempts]')).toHaveText('3');await expect(page.locator('[data-review-match]')).toHaveCount(3);for(const jersey of ['#23','#11','#6'])await expect(page.locator('[data-review-match]').filter({hasText:jersey})).toHaveCount(1);expect(await storage(page)).toEqual(before);
});
test('an unreadable non-deleted legacy archive blocks a complete export, while tombstoned sources are excluded',async({page})=>{
  await seed(page);await page.evaluate(()=>localStorage.setItem('sideline.match.archive.Deleted match','not JSON'));const before=await storage(page);
  const {value}=await download(page);expect(value.matches).toHaveLength(3);expect(await storage(page)).toEqual(before);
  await page.evaluate(()=>localStorage.setItem('sideline.match.archive.broken','not JSON'));const withBroken=await storage(page);let downloads=0;page.on('download',()=>downloads++);
  await nav(page,'Download Sideline backup');await expect(page.locator('[data-match-backup] [role=alert]')).toBeVisible();expect(downloads).toBe(0);expect(await storage(page)).toEqual(withBroken);
});
test('concurrent restore confirmations in two tabs cannot overwrite or duplicate a match',async({page,context})=>{
  await seed(page);const m=incoming('concurrent import'),other=await context.newPage();await other.goto(page.url());await nav(other,'Match History');await other.locator('[data-match-backup] > summary').click();
  await upload(page,backup([m]));await upload(other,backup([m]));await expect(page.locator('[data-backup-review]')).toBeVisible();await expect(other.locator('[data-backup-review]')).toBeVisible();
  const before=await storage(page);await Promise.all([nav(page,'Confirm restore'),nav(other,'Confirm restore')]);await expect(page.locator('[data-backup-review]')).toHaveCount(0);await expect(other.locator('[data-backup-review]')).toHaveCount(0);
  const stored=await rows(page);expect(stored.filter(r=>r.id===m.id)).toHaveLength(1);expect(stored.find(r=>r.id===m.id).match).toEqual(m);expect(await storage(page)).toEqual(before);await other.close();
});
test('full restore preview counts matches/squads/setups and Cancel leaves every store untouched',async({page})=>{
  await seed(page);const before=await storage(page),originals=await rows(page),{value}=fullFixture();await upload(page,value);
  await expect(page.locator('[data-backup-library-counts]')).toHaveText('Saved Squads: 1 new, 0 skipped. Saved Team Setups: 1 new, 0 skipped.');
  await expect(page.locator('[data-backup-review]')).toContainText('Restored permanent squad');await expect(page.locator('[data-backup-review]')).toContainText('Restored match-day setup');
  await mkdir(root,{recursive:true});await page.screenshot({path:root+'/Combined-restore-review-iPad.png',fullPage:true});await nav(page,'Cancel restore');expect(await storage(page)).toEqual(before);expect(await rows(page)).toEqual(originals);
});
test('full restore appends libraries with exact IDs/metadata and existing squads, setups, matches and active snapshot preserved',async({page})=>{
  const original=await seed(page),before=await storage(page),{d,value}=fullFixture();await upload(page,value);await nav(page,'Confirm restore');await expect(page.locator('[data-backup-notice]')).toContainText('Saved Squads: 1 restored, 0 skipped. Saved Team Setups: 1 restored, 0 skipped.');
  const after=await storage(page),squads=JSON.parse(after['sideline.squads.v2']).squads,setups=JSON.parse(after['sideline.team-setups.v1']).setups;
  expect(after['sideline.match.v1']).toBe(before['sideline.match.v1']);expect(squads).toEqual([original.squad,d.squad]);expect(setups).toEqual([original.setup,d.setup]);expect((await rows(page)).find(r=>r.id===d.a.id).match).toEqual(d.a);
  await page.reload();await nav(page,'Match History');await page.locator('[data-match-backup] > summary').click();await upload(page,value);await expect(page.getByRole('button',{name:'Confirm restore',exact:true})).toBeDisabled();
});
test('restored Saved Squad and Team Setup load into a deliberately created new match with original permanent IDs and match-specific defaults',async({page})=>{
  await seed(page);const {d,value}=fullFixture();await upload(page,value);await nav(page,'Confirm restore');await expect(card(page,d.a.id)).toBeVisible();const archiveBefore=(await rows(page)).find(r=>r.id===d.a.id).match;
  await nav(page,'Match setup');page.once('dialog',x=>x.accept());await nav(page,'Start a new blank match');await nav(page,'Squad');await nav(page,'Saved squads');await page.locator(`[data-load-squad="${d.squad.id}"]`).click();
  let m=JSON.parse((await storage(page))['sideline.match.v1']);expect(m.players.map(p=>p.playerId)).toEqual(d.squad.players.map(p=>p.playerId));expect(m.players.every(p=>p.number===null&&p.role==='panel')).toBe(true);
  await nav(page,'Use saved team setup');page.once('dialog',x=>x.accept());await page.locator(`[data-use-team-setup="${d.setup.id}"]`).click();m=JSON.parse((await storage(page))['sideline.match.v1']);
  expect(m.players.map(p=>({playerId:p.playerId,number:p.number,role:p.role}))).toEqual(d.setup.players);expect(m.squadId).toBe(d.squad.id);expect(m.players[0].id).not.toBe(d.a.players[0].id);expect((await rows(page)).find(r=>r.id===d.a.id).match).toEqual(archiveBefore);
});
test('a backup with all matches already stored still enables confirmation for new reusable libraries',async({page})=>{
  const d=await seed(page),f=fullFixture();f.value.matches=[{id:d.a.id,match:d.a}];await upload(page,f.value);await expect(page.locator('[data-backup-review]')).toContainText('0 new matches to restore; 1 skipped');await expect(page.getByRole('button',{name:'Confirm restore',exact:true})).toBeEnabled();const originals=await rows(page);
  await nav(page,'Confirm restore');await expect(page.locator('[data-backup-notice]')).toContainText('0 matches restored; 1 skipped');expect(await rows(page)).toEqual(originals);expect(JSON.parse((await storage(page))['sideline.squads.v2']).squads.some(s=>s.id===f.d.squad.id)).toBe(true);
});
test('same-ID conflicting libraries remain byte-for-byte unchanged and incompatible dependent setup is skipped',async({page})=>{
  const d=await seed(page),f=fullFixture();f.d.squad.id=d.squad.id;f.d.setup.squadId=d.squad.id;f.value.libraries.squads.squads=[f.d.squad];f.value.libraries.teamSetups.setups=[f.d.setup];
  const before=await storage(page);await upload(page,f.value);await expect(page.locator('[data-backup-review]')).toContainText('Original player IDs unavailable');await nav(page,'Confirm restore');await expect(page.locator('[data-backup-notice]')).toContainText('Saved Squads: 0 restored, 1 skipped. Saved Team Setups: 0 restored, 1 skipped.');expect(await storage(page)).toEqual(before);
});
test('same names with distinct IDs are reviewed as separate records and never merged',async({page})=>{
  const d=await seed(page),f=fullFixture();f.value.libraries.squads.squads[0].name=d.squad.name;f.value.libraries.teamSetups.setups[0].name=d.setup.name;await upload(page,f.value);await expect(page.locator('[data-backup-review]')).toContainText('Separate record: this display name already exists');await nav(page,'Confirm restore');await expect(page.locator('[data-backup-notice]')).toContainText('Saved Squads: 1 restored');
  const squads=JSON.parse((await storage(page))['sideline.squads.v2']).squads;expect(squads).toHaveLength(2);expect(squads[0].name).toBe(squads[1].name);expect(squads[0].players[0].playerId).not.toBe(squads[1].players[0].playerId);
});
test('orphaned source setup is reported as skipped, without inventing a squad or player link',async({page})=>{
  await seed(page);const f=fullFixture();f.value.libraries.teamSetups.setups[0].squadId='unavailable original squad';await upload(page,f.value);await expect(page.locator('[data-backup-review]')).toContainText('Original Saved Squad unavailable');const before=(await storage(page))['sideline.team-setups.v1'];await nav(page,'Confirm restore');await expect(page.locator('[data-backup-notice]')).toContainText('Saved Team Setups: 0 restored, 1 skipped');expect((await storage(page))['sideline.team-setups.v1']).toBe(before);
});
test('failed second localStorage write rolls back library additions and aborts every new match write',async({page})=>{
  await seed(page);const before=await storage(page),originals=await rows(page),f=fullFixture();await upload(page,f.value);
  await page.evaluate(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='sideline.team-setups.v1')throw new DOMException('Synthetic library quota failure','QuotaExceededError');return set.call(this,k,v);};});
  await nav(page,'Confirm restore');await expect(page.locator('[data-match-backup] [role=alert]')).toContainText('Synthetic library quota failure');expect(await storage(page)).toEqual(before);expect(await rows(page)).toEqual(originals);
});
test('asynchronous IndexedDB abort after library writes restores the exact original localStorage libraries',async({page})=>{
  await seed(page);const before=await storage(page),originals=await rows(page),f=fullFixture();await upload(page,f.value);
  await page.evaluate(()=>{const add=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(...args){const tx=this.transaction,r=add.apply(this,args);r.addEventListener('success',()=>tx.abort(),{once:true});return r;};});
  await nav(page,'Confirm restore');await expect(page.locator('[data-match-backup] [role=alert]')).toContainText('No matches were restored');expect(await storage(page)).toEqual(before);expect(await rows(page)).toEqual(originals);
});
test('blocked rollback is reported truthfully, retains old library entries and retry safely completes the remaining additions',async({page})=>{
  const original=await seed(page),before=await storage(page),originals=await rows(page),f=fullFixture();await upload(page,f.value);
  await page.evaluate(()=>{const set=Storage.prototype.setItem;window.__restoreRealSet=set;let written=false;Storage.prototype.setItem=function(k,v){if(k==='sideline.team-setups.v1')throw Error('Synthetic setup write blocked');if(k==='sideline.squads.v2'&&written)throw Error('Synthetic rollback blocked');if(k==='sideline.squads.v2')written=true;return set.call(this,k,v);};});
  await nav(page,'Confirm restore');await expect(page.locator('[data-match-backup] [role=alert]')).toContainText('Some added library records may remain');const partial=await storage(page);expect(partial['sideline.match.v1']).toBe(before['sideline.match.v1']);expect(JSON.parse(partial['sideline.squads.v2']).squads[0]).toEqual(original.squad);expect(await rows(page)).toEqual(originals);
  await page.evaluate(()=>Storage.prototype.setItem=window.__restoreRealSet);await upload(page,f.value);await nav(page,'Confirm restore');await expect(page.locator('[data-backup-notice]')).toContainText('Saved Squads: 0 restored, 1 skipped. Saved Team Setups: 1 restored, 0 skipped.');expect((await rows(page)).find(r=>r.id===f.d.a.id).match).toEqual(f.d.a);
});
test('corrupt backup library rejects the entire file, including otherwise valid matches',async({page})=>{
  await seed(page);const before=await storage(page),originals=await rows(page),f=fullFixture();f.value.libraries.squads.squads[0].players[0].playerId='not a permanent UUID';await upload(page,f.value);await expect(page.locator('[data-match-backup] [role=alert]')).toContainText('invalid or unsupported');expect(await storage(page)).toEqual(before);expect(await rows(page)).toEqual(originals);
});
test('unreadable destination library blocks full restore rather than replacing or repairing it',async({page})=>{
  await seed(page);await page.evaluate(()=>localStorage.setItem('sideline.squads.v2','{corrupt original'));const before=await storage(page),originals=await rows(page),f=fullFixture();await upload(page,f.value);await expect(page.locator('[data-match-backup] [role=alert]')).toContainText('Original library data is unchanged');expect(await storage(page)).toEqual(before);expect(await rows(page)).toEqual(originals);
});
test('library dependencies and skip decisions are rechecked against changes since preview',async({page})=>{
  await seed(page);const f=fullFixture();await upload(page,f.value);await page.evaluate(s=>{const lib=JSON.parse(localStorage.getItem('sideline.squads.v2'));lib.squads.push({...s,players:[],notes:'Saved by another tab'});localStorage.setItem('sideline.squads.v2',JSON.stringify(lib));},f.d.squad);const before=await storage(page);
  await nav(page,'Confirm restore');await expect(page.locator('[data-backup-notice]')).toContainText('Saved Squads: 0 restored, 1 skipped. Saved Team Setups: 0 restored, 1 skipped.');expect(await storage(page)).toEqual(before);
});
test('full library restore works offline and persists through reload with original IDs',async({page,context})=>{
  await seed(page);await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);await context.setOffline(true);await page.reload();await nav(page,'Match History');await page.locator('[data-match-backup] > summary').click();const f=fullFixture(),before=await storage(page);await upload(page,f.value);await nav(page,'Confirm restore');await expect(page.locator('[data-backup-notice]')).toContainText('Saved Squads: 1 restored');await page.reload();
  const saved=await storage(page);expect(saved['sideline.match.v1']).toBe(before['sideline.match.v1']);expect(JSON.parse(saved['sideline.squads.v2']).squads.find(s=>s.id===f.d.squad.id)).toEqual(f.d.squad);expect(JSON.parse(saved['sideline.team-setups.v1']).setups.find(s=>s.id===f.d.setup.id)).toEqual(f.d.setup);await context.setOffline(false);
});
test('two simultaneous full restores serialize library additions and preserve every original entry',async({page,context})=>{
  const original=await seed(page),f=fullFixture(),other=await context.newPage();await other.goto(page.url());await nav(other,'Match History');await other.locator('[data-match-backup] > summary').click();
  await upload(page,f.value);await upload(other,f.value);await expect(page.locator('[data-backup-review]')).toBeVisible();await expect(other.locator('[data-backup-review]')).toBeVisible();const before=await storage(page);
  await Promise.all([nav(page,'Confirm restore'),nav(other,'Confirm restore')]);await expect(page.locator('[data-backup-review]')).toHaveCount(0);await expect(other.locator('[data-backup-review]')).toHaveCount(0);
  const after=await storage(page);expect(after['sideline.match.v1']).toBe(before['sideline.match.v1']);expect(JSON.parse(after['sideline.squads.v2']).squads).toEqual([original.squad,f.d.squad]);expect(JSON.parse(after['sideline.team-setups.v1']).setups).toEqual([original.setup,f.d.setup]);expect((await rows(page)).filter(r=>r.id===f.d.a.id)).toHaveLength(1);await other.close();
});
test('an old match-only backup does not silently upgrade a legacy squad library through background Player Review refresh',async({page})=>{
  const d=await seed(page);await page.evaluate(s=>{localStorage.removeItem('sideline.squads.v2');localStorage.setItem('sideline.squads.v1',JSON.stringify({version:1,squads:[s]}));},d.squad);const before=await storage(page),m=incoming('legacy library untouched');
  await upload(page,backup([m]));await expect(page.locator('[data-backup-review]')).toContainText('Older match-only backup');await nav(page,'Confirm restore');await expect(page.locator('[data-backup-notice]')).toContainText('1 match restored');expect(await storage(page)).toEqual(before);expect((await rows(page)).find(r=>r.id===m.id).match).toEqual(m);
});
