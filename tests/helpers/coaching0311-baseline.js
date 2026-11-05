import {readFileSync} from 'node:fs';
import {swingMatch} from './match-flow-match.js';
import {coachingMatch} from './coaching-match.js';
import {reportMatch} from './report-match.js';
import {uiMatch} from '../fixtures/ui-match.js';
import {normal03108,finishET03108,shootout03108} from './refinement03108.js';
import {createEvent} from '../../src/domain.js';
export function baseline0311Matches(){
 const et=finishET03108(normal03108());et.events.push({...createEvent(et,'goal','our',0),id:'synthetic-review-et-goal'});
 return [swingMatch(),coachingMatch(),reportMatch(),reportMatch('uneven'),uiMatch(),JSON.parse(readFileSync(new URL('../fixtures/History_V037_Archive.json',import.meta.url))),normal03108(),et,shootout03108(structuredClone(et))];
}
export function statistics0311(match,{analysisForScope,playerStatistics}){
 const metrics=['goals','points','twoPointers','total','attempts','successful','wides','blockedAttempts','defensiveBlocks','turnoversWon','turnoversLost','interceptions','kickoutPossessionsWon','kickoutMarks'];
 return {periods:Object.fromEntries(['H1','H2','ET1','ET2','FULL_MATCH'].map(scope=>{const d=analysisForScope(match,scope);return [scope,{our:d.our,opposition:d.opposition}];})),players:['our','opposition'].flatMap(team=>playerStatistics(match,team).map(p=>({team,number:p.number,...Object.fromEntries(metrics.map(k=>[k,p[k]??0]))}))).sort((a,b)=>(a.team+':'+a.number).localeCompare(b.team+':'+b.number))};
}
