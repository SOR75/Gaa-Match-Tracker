import test from 'node:test';
import assert from 'node:assert/strict';
import {blankMatch,createEvent,saveEvent} from '../src/domain.js';
import {attributionRoster} from '../src/player-credit.js';
import {createMatchPlayer,createSquadPlayer} from '../src/identity.js';
import {parseTextPlayers,parseSpatialPlayers,POSITIONS} from '../src/import-parser.js';
import {snapshotSquad,loadSquadPlayers,validatePlayers} from '../src/squads.js';
import {slots} from '../src/programme-geometry.js';
import {programmeBounds,programmeReadQuality,completeSpatialRead,substitutePrefixes,programmeReviewWarnings,beforeProgrammeSection,programmeRowWarnings,programmeConfidence,completePrefixRead,limitMatchDayCandidates,assertMatchDayCapacity} from '../src/programme-integrity.js';
const roster=()=>Array.from({length:19},(_,i)=>createMatchPlayer({...createSquadPlayer({number:i+1,name:`Member ${i+1}`,role:i<15?'starter':i===18?'panel':'substitute'}),id:undefined}));
const numbers=(m,t,options)=>attributionRoster(m,t,options).players.map(p=>p.number);
const sub=(m,t,on,off)=>{m.events=saveEvent(m.events,{...createEvent(m,'substitution',t),playerOn:String(on),playerOff:String(off)},m);};
test('both live credit rosters independently filter substitutions, re-entry and active panel entrants; historical roster stays broad',()=>{
 const m=blankMatch();m.players=roster();m.oppositionPlayers=roster();
 assert.deepEqual(numbers(m,'our'),Array.from({length:15},(_,i)=>i+1));assert.deepEqual(numbers(m,'opposition'),numbers(m,'our'));
 sub(m,'opposition',18,6);assert.ok(numbers(m,'opposition').includes(18));assert.ok(!numbers(m,'opposition').includes(6));assert.ok(numbers(m,'our').includes(6));assert.ok(!numbers(m,'our').includes(18));
 sub(m,'our',19,7);assert.ok(numbers(m,'our',{includePanel:false}).includes(19));assert.ok(!numbers(m,'our').includes(7));assert.ok(numbers(m,'opposition').includes(7));
 sub(m,'opposition',6,18);assert.ok(numbers(m,'opposition').includes(6));assert.ok(!numbers(m,'opposition').includes(18));assert.ok(numbers(m,'our').includes(19));
 assert.equal(numbers(m,'opposition',{includeInactive:true}).length,19);assert.equal(numbers(m,'our',{includeInactive:true}).length,19);
});
test('no-squad anonymous defaults remain separate and do not create squad players',()=>{
 const m=blankMatch();for(const t of ['our','opposition']){assert.deepEqual(numbers(m,t),Array.from({length:15},(_,i)=>i+1));assert.equal(attributionRoster(m,t).fallback,true);}assert.equal(m.players.length,0);assert.equal(m.oppositionPlayers.length,0);
});
const firsts=['Ava','Beth','Cara','Dara','Ella','Fia','Grace','Hana','Isla','Jane','Kate','Lara','Maya','Nora','Orla'];
const formation=()=>slots.flatMap(([x,y],i)=>[{text:String(i+1),x:500+x*300,y:100+y*100,w:15,h:20,confidence:96},{text:`${firsts[i]} Quinn`,x:440+x*300,y:135+y*100,w:140,h:20,confidence:96}]);
const subNames=['Emily Lynam','Hallie Dunne','Aoife Cronin','Heather Touhey','Niamh Tracey','Faye Robinson','Megan Kelly','Muireann Phillips','Mila Fralkova','Amy Madden','Ellen Lehane'];
const text=()=>[...firsts.map((s,i)=>`${i+1} ${s} Quinn`),'Subs: '+subNames.slice(0,4).map((s,i)=>`${16+i} ${s}`).join(' '),subNames.slice(4,9).map((s,i)=>`${20+i} ${s}`).join(' '),`25 ${subNames[9]} 26 ${subNames[10]} Management: Staff Member`,'FLO: Another Person','27 Sponsor Company'].join('\n');
test('multi-line explicit Subs pairs retain intermediate #20/#25 and stop final name at Management without a colon dependency',()=>{
 const p=parseTextPlayers(text(),{layout:'programme'});assert.equal(p.filter(x=>x.role==='starter').length,15);assert.deepEqual(p.filter(x=>x.role==='substitute').map(x=>[x.number,x.name]),subNames.map((s,i)=>[String(i+16),s]));
 assert.equal(beforeProgrammeSection('Ellen Lehane Management Staff Member'),'Ellen Lehane');assert.equal(beforeProgrammeSection('Sarah Smith FLO: Staff'),'Sarah Smith');
});
test('spatial numbered formation admits no phantom unnumbered starters; Subs and staff never become names',()=>{
 const words=formation();words.push({text:'Subs: 16 Erin Quinn 17 Sarah Smith',x:100,y:720,w:700,h:20,confidence:96},{text:'Management: Staff Person',x:100,y:770,w:500,h:20,confidence:96},{text:'Sarah Smith',x:900,y:635,w:140,h:20,confidence:96});
 const p=parseSpatialPlayers(words,{ocr:true});const s=p.filter(x=>x.role==='starter');assert.equal(s.length,15);assert.deepEqual(s.map(x=>x.number),Array.from({length:15},(_,i)=>String(i+1)));assert.ok(!p.some(x=>/Subs|Management|FLO/.test(x.name)));assert.equal(p.filter(x=>x.name==='Sarah Smith').length,1);assert.deepEqual(s.map(x=>x.position),POSITIONS);
});
test('numberless formation remains supported, with blank jerseys rather than invented numbers',()=>{
 const p=parseSpatialPlayers(formation().filter(w=>!/^\d+$/.test(w.text)),{ocr:true,layout:'formation'});assert.equal(p.length,15);assert.ok(p.every(p=>p.number===''&&p.role==='starter'));
});
test('name-quality scoring penalises noise fragments instead of ignoring their confidence; compatible complete source words win',()=>{
 const bad={text:'B McManus',words:[{text:'B',confidence:0},{text:'McManus',confidence:96}]},good={text:'Lucy McManus',words:[{text:'Lucy',confidence:95},{text:'McManus',confidence:96}]};assert.ok(programmeReadQuality(good)>programmeReadQuality(bad));assert.equal(programmeReadQuality({...good,text:'Subs Lucy Aoife McManus'}),-1);
 const clipped={text:'Mila Fralkov',words:[]},full={text:'Mila Fralkova',words:[{text:'Mila',confidence:96},{text:'Fralkova',confidence:96}],spatial:true};assert.equal(completeSpatialRead(clipped,[full]),full);assert.equal(completeSpatialRead({text:'Different Name',words:[]},[full]).text,'Different Name');
});
test('cropped footer labels are supporting structure below the grid; footer slope is retained',()=>{
 const words=[{text:'Subs:',x:0,y:600,w:60,h:20},{text:'"agement:',x:0,y:800,w:130,h:25},{text:'Staff',x:200,y:805,w:80,h:20},{text:'Member',x:400,y:810,w:90,h:20}];const b=programmeBounds(words,{left:0,right:1000,after:500});assert.equal(b.subsY,600);assert.equal(b.footerY,800);assert.ok(b.footerSlope>0);assert.equal(programmeBounds(words,{left:0,right:1000,after:900}).footerY,Infinity);
});
test('cropped substitute line prefixes retain observed words without guessing numbers; sloping explicit rows do not duplicate a named player',()=>{
 const n=(text,x,y)=>({text,x,y,w:20,h:20});const anchors=[n('16',100,100),n('17',300,110),n('18',500,120),n('19',700,130),n('21',300,160),n('22',500,170),n('23',700,180),n('24',900,190),n('26',300,220)];
 const words=[{text:'Niamh',x:0,y:158,w:60,h:20},{text:'Tracey',x:70,y:158,w:70,h:20},{text:'Amy',x:0,y:218,w:45,h:20},{text:'Madden',x:60,y:218,w:90,h:20}];const result=substitutePrefixes(words,anchors,20);assert.equal(result.length,2);assert.deepEqual(result.map(p=>p.words.map(w=>w.text).join(' ')),['Niamh Tracey','Amy Madden']);assert.ok(result.every(p=>!('number' in p)));
 const tilted=[n('24',100,300),n('25',300,310),n('26',500,320),n('27',700,330),n('28',100,360),n('29',300,370),n('30',500,380)];assert.equal(substitutePrefixes([{text:'Lorna',x:130,y:362,w:50,h:20},{text:'Colclough',x:200,y:362,w:80,h:20}],tilted,20).length,0);
});
test('review warns for duplicates/metadata/truncation and evidence-based missing-jersey warnings; never modifies candidates or treats sparse numbering as an error',()=>{
 const clean=parseTextPlayers(text(),{layout:'programme'});const p=structuredClone(clean);p[0].number='2';p[1].name='Sarah h';p[2].name='Subs Aimee Aoife Fitzgerald';p.push({...p[3],number:'',name:'Sarah Smith'},{...p[4],number:'23',name:'Sarah Smith'});p.splice(p.findIndex(p=>p.number==='20'),1);p.splice(p.findIndex(p=>p.number==='25'),1);const raw=JSON.stringify(p);const warnings=programmeReviewWarnings(p,{programme:true});assert.ok(warnings.some(s=>/Duplicate jersey/.test(s)));assert.ok(warnings.some(s=>/duplicate name/.test(s)));assert.ok(warnings.some(s=>/starter jersey missing/.test(s)));assert.ok(warnings.some(s=>/section text/.test(s)));assert.ok(warnings.some(s=>/truncated/.test(s)));assert.ok(!warnings.some(s=>/gap/.test(s)));assert.equal(JSON.stringify(p),raw);assert.deepEqual(programmeReviewWarnings(clean,{programme:true}),[]);
 const sparse=[16,18,22,26].map(n=>({number:String(n),name:'Valid Person',role:'substitute',confidence:'OCR word score 96/100'}));assert.ok(!programmeReviewWarnings(sparse,{programme:true}).some(s=>/gap/.test(s)));
});
test('post-import match jersey 16→27 preserves permanent and match identity; duplicate names are never merged',()=>{
 const parsed=parseTextPlayers(text(),{layout:'programme'}),s=snapshotSquad('Season squad',parsed);const loaded=loadSquadPlayers(s);const p=loaded.find(p=>p.number===16),changed=createMatchPlayer({...p,number:27});assert.equal(changed.playerId,p.playerId);assert.equal(changed.matchPlayerId,p.matchPlayerId);assert.equal(changed.number,27);
 const twins=validatePlayers([{number:'1',name:'Same Name',role:'starter'},{number:'2',name:'Same Name',role:'starter'}]);assert.equal(twins.length,2);const saved=snapshotSquad('Twins',twins);assert.notEqual(saved.players[0].playerId,saved.players[1].playerId);
});

test('30 named match-day cap is a count limit, not a jersey sequence or permanent-panel limit',()=>{
 const rows=Array.from({length:32},(_,i)=>({number:String(i+1),name:`Player Name ${i}`,role:i<15?'starter':'substitute'}));
 rows[29].number='99';rows.push({number:'',name:'Extended Member',role:'panel'});
 const limited=limitMatchDayCandidates(rows);
 assert.equal(limited.players.filter(p=>p.role!=='panel').length,30);assert.equal(limited.excluded.length,2);assert.equal(limited.players.at(-1).role,'panel');assert.ok(limited.players.some(p=>p.number==='99'));assert.equal(rows.length,33);
});
test('confirmation rejects a 31st named selection including existing match players; unselected panel is independent',()=>{
 const row={number:'',name:'Player Name',role:'substitute'},thirty=Array.from({length:30},()=>({...row}));
 assert.doesNotThrow(()=>assertMatchDayCapacity(thirty));assert.throws(()=>assertMatchDayCapacity([row],thirty),/Maximum 30/);
 assert.doesNotThrow(()=>assertMatchDayCapacity([{...row,role:'panel'}],thirty));
});
test('clean numbered programme pairs are neutral; genuine field uncertainty stays prominent without changing jersey acceptance',()=>{
 const confidence=programmeConfidence('16','Emily Lynam',96);assert.ok(!/Review required/.test(confidence));assert.deepEqual(programmeRowWarnings([{number:'16',name:'Emily Lynam',role:'substitute',confidence}],{programme:true}),[[]]);
 const unclear=programmeConfidence('','Niamh Tracey',96);assert.match(unclear,/Review jersey/);assert.ok(!/Review name/.test(unclear));
 assert.match(programmeConfidence('25','Amy',90),/Review name/);assert.match(programmeConfidence('25','Amy Madden',70),/Review name/);
 const roster=[{number:'',name:'Niamh Tracey',role:'substitute',confidence:unclear},{number:'',name:'Amy Madden',role:'substitute',confidence:programmeConfidence('','Amy Madden',95)}];
 assert.equal(programmeRowWarnings(roster,{programme:true}).filter(x=>x.length).length,2);
});
test('a legitimate numeric gap alone produces no warning, candidate or guessed number',()=>{
 const rows=[16,17,18,19,21,22,23,24,26].map(n=>({number:String(n),name:`Name Surname${n}`,role:'substitute',confidence:programmeConfidence(String(n),`Name Surname${n}`,96)}));
 assert.deepEqual(programmeReviewWarnings(rows,{programme:true}),[]);assert.equal(rows.length,9);
});
test('readable unnumbered names in a structured Subs section are retained for review rather than discarded',()=>{
 const rows=parseTextPlayers('1 Ava Quinn\nSubs: 19 Heather Touhey\nNiamh Tracey\n21 Faye Robinson\n24 Mila Fralkova\nAmy Madden\n26 Ellen Lehane\nManagement: Staff Person',{layout:'programme'});
 assert.deepEqual(rows.filter(p=>!p.number).map(p=>[p.name,p.role]),[['Niamh Tracey','substitute'],['Amy Madden','substitute']]);
 assert.ok(!rows.some(p=>p.number==='20'||p.number==='25'));assert.equal(rows.at(-1).name,'Ellen Lehane');
});

test('bounded observed first-word recovery requires actual high-confidence letters and the same spatial surname',()=>{
 const partial={text:'My Madden',words:[{text:'My',confidence:89},{text:'Madden',confidence:96}],spatial:true};
 const full={text:'Amy Madden,',words:[{text:'Amy',confidence:91},{text:'Madden,',confidence:77}]};
 assert.equal(completePrefixRead(partial,[full]).text,'Amy Madden,');assert.equal(completePrefixRead(partial,[{...full,words:[{text:'Amy',confidence:70}]}]),partial);
 assert.equal(completePrefixRead(partial,[{...full,text:'Amy Different'}]),partial);assert.equal(completePrefixRead(partial,[{...full,text:'Alice Madden'}]),partial);
});
