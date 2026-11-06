import test from 'node:test';
import assert from 'node:assert/strict';
import {timelineCSV,canonicalAnalysisStream} from '../src/analysis-stream.js';
import {analysisScreen} from '../src/analysis-ui.js';
import {reportMatch} from './helpers/report-match.js';
import {reportCases0312} from './helpers/reports0312.js';
import {parseCSV} from './helpers/csv.js';
import {completeMatch,historySnapshot} from '../src/history.js';
for(const [name,make]of Object.entries({normal:reportMatch,...Object.fromEntries(Object.entries(reportCases0312()).map(([k,v])=>[k,()=>v]))}))test(`${name}: every original event and arbitrary metadata survives CSV exactly, without a PDF ledger`,()=>{
 const m=make();if(m.events.length)m.events[0].futureMetadata={flag:false,numbers:[0,99],text:'Unicode Áine, "quote"\nnewline',nullable:null};const before=JSON.stringify(m),stream=canonicalAnalysisStream(m),csv=timelineCSV(m),rows=parseCSV(csv).rows;
 assert.equal(rows.length,m.events.length);for(let i=0;i<rows.length;i++){const e=m.events[stream[i].recordingIndex];assert.deepEqual(JSON.parse(rows[i]['Original Event JSON']),e);assert.equal(rows[i]['Event ID'],e.id);}
 const html=analysisScreen(m,{},true);assert.doesNotMatch(html,/data-report-ledger|data-report-event|Recorded match events|Event ID:/);assert.match(html,/Download Timeline CSV/);assert.equal(JSON.stringify(m),before);
});
test('historical snapshot export uses the archived ledger, leaves source data unchanged and never invents fields',()=>{
 const m=reportMatch();delete m.events[0].shotSource;delete m.events[0].scoreOrigin;m.events[0].legacyUnknownField='untouched';const record={id:m.id,match:completeMatch(m,1)},before=JSON.stringify(record),snapshot=historySnapshot(record),rows=parseCSV(timelineCSV(snapshot)).rows;
 assert.equal(rows.length,m.events.length);const original=JSON.parse(rows.find(r=>r['Event ID']===m.events[0].id)['Original Event JSON']);assert.deepEqual(original,snapshot.events.find(e=>e.id===m.events[0].id));assert.equal(original.shotSource,undefined);assert.equal(original.legacyUnknownField,'untouched');assert.equal(JSON.stringify(record),before);
});
test('CSV remains safe for spreadsheet formula text while original JSON preserves exact author-entered metadata',()=>{
 const m=reportMatch();m.events[0].notes='=not_a_formula, "quoted"\nsecond line';const r=parseCSV(timelineCSV(m)).rows.find(r=>r['Event ID']===m.events[0].id);assert.equal(r.Notes,"'"+m.events[0].notes);assert.equal(JSON.parse(r['Original Event JSON']).notes,m.events[0].notes);
});

test('Full Match Report always includes all recorded periods despite an on-screen H1 or shot-map filter',()=>{
 const m=reportMatch();const whole=analysisScreen(m,{},true),fromH1=analysisScreen(m,{team:'our',half:'1',result:'miss'},true,1);assert.equal(fromH1,whole);assert.doesNotMatch(fromH1,/FIRST HALF ONLY/);assert.match(analysisScreen(m,{},false,1),/FIRST HALF ONLY/);
});
