import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {baseline0311Matches,statistics0311} from './helpers/coaching0311-baseline.js';
import {analysisForScope} from '../src/half-time.js';
import {playerStatistics} from '../src/analysis.js';
const baseline=JSON.parse(readFileSync(new URL('./fixtures/coaching0311/baseline-statistics.json',import.meta.url)));
const matches=baseline0311Matches();
for(const [i,m]of matches.entries())test(`V0.3.10 golden statistics unchanged: ${baseline.cases[i].name}`,()=>{
 const raw=JSON.stringify(m);assert.equal(baseline.baselineCommit,'ec4678f095b6f9493cf8ee99544b0df194e1b3d8');
 assert.deepEqual(statistics0311(m,{analysisForScope,playerStatistics}),baseline.cases[i].statistics);
 assert.equal(JSON.stringify(m),raw);
});
