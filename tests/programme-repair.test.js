import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readNumberedList} from '../src/list-programme.js';
import {parseTextPlayers,parseTablePlayers,parseSpatialPlayers} from '../src/import-parser.js';
import {programmeReviewWarnings} from '../src/programme-integrity.js';
import {blankMatch,createEvent,saveEvent} from '../src/domain.js';
import {withBlankMatchPlayers,acceptedEnrichment,importStarterWarning} from '../src/match-squad-enrichment.js';
import {onFieldPlayers} from '../src/participation.js';
const fixtures=Object.fromEntries(['st-manchans-style','vincents-style-ordered'].map(n=>[n,JSON.parse(readFileSync(new URL(`./fixtures/programme-structure/${n}.json`,import.meta.url),'utf8'))]));
const pairs=rows=>rows.map(({number,name,role})=>({number,name,role}));
for(const [name,f] of Object.entries(fixtures))test(`${name}: complete number-anchored OCR list with source-order XV, no staff or invented jerseys`,()=>{
 const rows=readNumberedList(f.words);assert.deepEqual(pairs(rows),f.expected);assert.equal(rows.filter(p=>p.role==='starter').length,15);assert.equal(importStarterWarning(rows),null);
});
test('a real isolated #1 anchor is retained; no first-XV cutoff drops inline Subs or later rows',()=>{
 const rows=readNumberedList(fixtures['st-manchans-style'].words);assert.equal(rows[0].number,'1');assert.equal(rows[0].name,'Nora Quinn');assert.equal(rows.length,25);assert.equal(rows.at(-1).number,'29');assert.equal(rows.find(p=>p.number==='16').role,'substitute');assert.equal(rows.some(p=>p.number==='17'),false);
});
test('an isolated unreadable/missing number is never completed from expected numbering',()=>{
 const f=fixtures['st-manchans-style'],ws=f.words.filter(w=>w.text!=='1');const rows=readNumberedList(ws);assert.equal(rows.some(p=>p.number==='1'),false);assert.equal(importStarterWarning(rows).count,14);
});
test('high starters and low substitutes follow ordered source and explicit Subs, not numeric range',()=>{
 const f=fixtures['vincents-style-ordered'];const rows=readNumberedList(f.words);assert.equal(rows.find(p=>p.number==='18').role,'starter');assert.equal(rows.find(p=>p.number==='7').role,'substitute');assert.equal(rows.some(p=>p.number==='1'),false);
 const text=f.expected.slice(0,15).map(p=>`${p.number} ${p.name}`).join('\n')+'\nSubs: 7 Paula Hart\nManagement: Staff Person\n90 Footer Person';const parsed=parseTextPlayers(text);assert.equal(parsed.find(p=>p.number==='18').role,'starter');assert.equal(parsed.at(-1).number,'7');assert.equal(parsed.at(-1).role,'substitute');
});
for(const format of ['text','table','spatial'])test(`${format}: non-sequential conventional programme keeps all 29 and designates first 15 entries, independent of jersey`,()=>{
 const f=fixtures['vincents-style-ordered'];const rows=format==='text'?parseTextPlayers(f.expected.map(p=>`${p.number} ${p.name}`).join('\n')):format==='table'?parseTablePlayers([['Jersey','Player Name'],...f.expected.map(p=>[p.number,p.name])]):parseSpatialPlayers(f.words,{ocr:true,layout:'programme'});
 assert.equal(rows.length,29);const roles=new Map(rows.map(p=>[p.number,p.role]));for(const p of f.expected)assert.equal(roles.get(p.number),p.role,`${format} #${p.number}`);
});
test('table Subs/footer rows are structure, not players, and explicit starter designation still warns rather than silently rewriting it',()=>{
 const f=fixtures['vincents-style-ordered'];const rows=parseTablePlayers([['Jersey','Player Name'],...f.expected.slice(0,15).map(p=>[p.number,p.name]),['Subs'],['7','Paula Hart'],['Manager','Staff Person'],['90','Footer Person']]);assert.equal(rows.length,16);assert.equal(rows.at(-1).role,'substitute');
 const explicit=parseTablePlayers([['Jersey','Player Name','Role'],...f.expected.map(p=>[p.number,p.name,'starter'])]);assert.equal(importStarterWarning(explicit).count,29);
});
test('duplicate source jerseys remain reviewable and cannot silently create or merge identities',()=>{
 const f=fixtures['vincents-style-ordered'];const rows=readNumberedList([...f.words.filter(w=>w.y<1230),{text:'2',x:20,y:1200,w:14,h:24,confidence:96},{text:'Other',x:105,y:1200,w:65,h:24,confidence:96},{text:'Person',x:240,y:1200,w:78,h:24,confidence:96}]);assert.equal(rows.filter(p=>p.number==='2').length,2);assert.ok(programmeReviewWarnings(rows).some(s=>s.includes('Duplicate jersey')));assert.throws(()=>acceptedEnrichment(withBlankMatchPlayers(blankMatch()).players,rows),/Duplicate imported jersey/);
});
test('complete imported programme enriches a live match while preserving every event and substituted current XV',()=>{
 const m=withBlankMatchPlayers(blankMatch());m.events=saveEvent([],{...createEvent(m,'point','our'),playerNumber:'2'},m);m.events=saveEvent(m.events,{...createEvent(m,'substitution','our'),playerOn:'18',playerOff:'2'},m);const events=JSON.stringify(m.events),active=onFieldPlayers(m,'our').map(p=>p.id),ids=new Map(m.players.map(p=>[p.number,p.id]));
 const rows=readNumberedList(fixtures['vincents-style-ordered'].words);m.players=acceptedEnrichment(m.players,rows,{live:true});assert.equal(JSON.stringify(m.events),events);assert.deepEqual(onFieldPlayers(m,'our').map(p=>p.id),active);for(const p of m.players.filter(p=>ids.has(p.number)))assert.equal(p.id,ids.get(p.number));for(const n of [24,25,26,27,28,29])assert.equal(m.players.find(p=>p.number===n).role,'substitute');
});
