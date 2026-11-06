// Factual replacements for the retired Coach Report export regressions.
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {fullMatchReportModel} from '../src/full-match-report-data.js';
import {timelineCSV} from '../src/analysis-stream.js';
import {parseCSV} from './helpers/csv.js';
import {analysisScreen} from '../src/analysis-ui.js';import {blankMatch,createEvent} from '../src/domain.js';import {reportMatch} from './helpers/report-match.js';
for(const pattern of ['balanced','uneven'])test(`full report ${pattern}: factual analytics with the complete event ledger in CSV, not PDF`,()=>{
 const m=reportMatch(pattern),before=JSON.stringify(m),d=fullMatchReportModel(m),html=analysisScreen(m,{},true);
 assert.ok(!d.players.some(p=>Number(p.number)>=16));assert.equal(m.players.length,26);assert.ok(d.players.some(p=>p.number==='7'&&p.passesReceived));assert.match(html,/Full Match Report/);assert.doesNotMatch(html,/Coach Report|data-coach-page|data-observation|data-flow-story/);assert.equal(parseCSV(timelineCSV(m)).rows.length,m.events.length);assert.doesNotMatch(html,/Recorded match events|Event ID:/);assert.match(html,/ATTACKS ↑ TOP/);assert.equal(JSON.stringify(m),before);
 for(const t of ['our','opposition']){assert.equal(d.stats[t].total,d.halves[t].reduce((a,h)=>a+h.total,0));assert.equal(d.sources[t].reduce((a,s)=>a+s.attempts,0),d.stats[t].attempts);}
});
test('blank and legacy reports invent no players, keepers, minutes or recommendations',()=>{const m=blankMatch(),d=fullMatchReportModel(m),html=analysisScreen(m,{},true);assert.equal(d.keepers.length,0);assert.equal(d.players.length,0);assert.equal(d.minutes.length,0);assert.equal(d.observations,undefined);assert.match(html,/No scores recorded/);assert.match(html,/No player participation can be established/);assert.doesNotMatch(html,/Coach Report/);});
for(const slug of ['sml','rynaghs'])test(`${slug}: retained immutable source-PDF snapshot facts are not manufactured into an event ledger`,()=>{
 const d=JSON.parse(readFileSync(`tests/fixtures/coach-report/${slug}-pdf-snapshot.json`));assert.equal(createHash('sha256').update(readFileSync(`tests/fixtures/coach-report/${slug}-source.pdf`)).digest('hex'),d.sourcePdfSha256);assert.deepEqual([d.stats.our.total,d.stats.opposition.total],slug==='sml'?[16,32]:[21,14]);assert.equal(d.shots.length,0);assert.equal(d.location.our,null);assert.ok(d.mapUnavailable);assert.equal(d.players.length,27);
 for(const t of ['our','opposition']){assert.equal(d.stats[t].total,d.halves[t].reduce((a,h)=>a+h.total,0));assert.ok(d.players.filter(p=>p.team===t).reduce((a,p)=>a+p.total,0)<=d.stats[t].total);}
});
test('full report escapes supplied metadata, event text and names without inventing shot locations',()=>{const m=blankMatch();m.setup.ourTeam='<script>alert(1)</script>';m.events=[{...createEvent(m,'two-point','our'),notes:'<script>bad()</script>'}];const d=fullMatchReportModel(m),html=analysisScreen(m,{},true);assert.equal(d.location.our.zones.unknown.attempts,1);assert.equal(d.stats.our.total,2);assert.ok(!html.includes('<script>'));assert.match(html,/&lt;script&gt;/);});
