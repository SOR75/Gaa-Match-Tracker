import {assertShootoutEligibility} from './shootout-eligibility.js';
import {uid} from './ids.js';
import {rowId,validPlayerId} from './identity.js';
export const SHOOTOUT_OUTCOMES=['scored','saved','post','wide'];
export const otherTeam=team=>team==='our'?'opposition':'our';
export const shootoutTeam=(match,team)=>team==='our'?match.setup.ourTeam||'Our team':match.setup.opposition||'Opposition';
const roster=(match,team)=>(team==='our'?match.players:match.oppositionPlayers)||[];
export function shootoutRef(match,team,key) {
 const players=roster(match,team),numbered=players.filter(p=>p.number!==null&&String(p.number)===String(key));
 const p=players.find(p=>rowId(p)===key)||(numbered.length===1?numbered[0]:null);
 if(p)return {team,matchPlayerId:rowId(p),playerId:validPlayerId(p.playerId)?p.playerId:null,nameSnapshot:p.name||'',jerseyNumber:p.number??null};
 if(/^[1-9]\d?$/.test(String(key)))return {team,matchPlayerId:null,playerId:null,nameSnapshot:'',jerseyNumber:+key};
 return null;
}
export function resolveShootoutRef(match,ref) {
 if(!ref)return null;
 const players=roster(match,ref.team),found=ref.matchPlayerId?players.find(p=>rowId(p)===ref.matchPlayerId):null;
 // Jersey-only display can acquire a name later, but never invent a permanent ID.
 const numbered=ref.matchPlayerId?[]:players.filter(p=>ref.jerseyNumber!==null&&p.number===ref.jerseyNumber);
 const p=found||(numbered.length===1?numbered[0]:null);
 return {...ref,name:p?.name||ref.nameSnapshot||'',playerId:ref.playerId||(found&&validPlayerId(found.playerId)?found.playerId:null)};
}
export function initialShootout(footballScore,keepers={}) {
 return {version:1,phase:'SHOOTOUT',firstKickingTeam:null,started:false,nextTeamOverride:null,footballScore:structuredClone(footballScore),keepers:{our:keepers.our?structuredClone(keepers.our):null,opposition:keepers.opposition?structuredClone(keepers.opposition):null},attempts:[]};
}
export function shootoutStatus(s) {
 const attempts=s?.attempts||[],counts={our:0,opposition:0},score={our:0,opposition:0};
 for(const a of attempts){counts[a.team]++;if(a.outcome==='scored')score[a.team]++;}
 let winner=null;
 if(counts.our<=5&&counts.opposition<=5){
  if(score.our>score.opposition+5-counts.opposition)winner='our';
  if(score.opposition>score.our+5-counts.our)winner='opposition';
 }else if(counts.our>=5&&counts.opposition>=5&&counts.our===counts.opposition&&score.our!==score.opposition)winner=score.our>score.opposition?'our':'opposition';
 const stage=counts.our>=5&&counts.opposition>=5&&!winner?'SUDDEN_DEATH':counts.our>5||counts.opposition>5?'SUDDEN_DEATH':'FIRST_5';
 const expected=counts.our===counts.opposition?(attempts.length?otherTeam(attempts.at(-1).team):(s?.firstKickingTeam||'our')):counts.our<counts.opposition?'our':'opposition';
 const next=s?.nextTeamOverride||expected;
 const canTake=team=>!winner&&(stage==='SUDDEN_DEATH'||counts[team]<5);
 return {counts,score,winner,stage,next,expected,complete:!!winner,attemptNumber:counts[next]+1,suddenDeathRound:Math.max(1,counts[next]-4),canSwitch:canTake(otherTeam(next)),canTake};
}
export function selectFirstTeam(s,team) {
 if(!['our','opposition'].includes(team)||s.started||s.attempts.length)throw Error('First kicking team is already established.');
 return {...s,firstKickingTeam:team};
}
export function startShootout(s) {
 if(!s.firstKickingTeam)throw Error('Choose who takes the first penalty.');
 return {...s,started:true};
}
export function switchShootoutTeam(s) {
 const status=shootoutStatus(s);
 if(!s.started||!status.canSwitch)throw Error('The other team must complete its available attempts.');
 const team=otherTeam(status.next);
 return {...s,nextTeamOverride:team===status.expected?null:team};
}
export function changeShootoutKeeper(s,team,ref,match=null) {
 if(!validShootoutRef(ref)||ref.team!==team)throw Error('Choose a goalkeeper.');
 if(match)assertShootoutEligibility(match,ref,'keeper');
 return {...s,keepers:{...s.keepers,[team]:structuredClone(ref)}};
}
export function recordPenalty(s,kicker,outcome,now=Date.now(),match=null) {
 const state=shootoutStatus(s);
 if(!s.started||state.complete||!state.canTake(state.next))throw Error('Penalty entry is closed.');
 if(!validShootoutRef(kicker)||kicker.team!==state.next)throw Error('Choose the kicker for the expected team.');
 if(!SHOOTOUT_OUTCOMES.includes(outcome))throw Error('Choose Scored, Saved, Post or Wide.');
 if(match){assertShootoutEligibility(match,kicker);const keeper=s.keepers[otherTeam(state.next)];if(keeper)assertShootoutEligibility(match,keeper,'keeper');}
 const team=state.next,number=state.counts[team]+1;
 const attempt={id:uid(),phase:'SHOOTOUT',order:s.attempts.length+1,team,teamAttempt:number,stage:number>5?'SUDDEN_DEATH':'FIRST_5',suddenDeathRound:number>5?number-5:null,kicker:structuredClone(kicker),defendingTeam:otherTeam(team),goalkeeper:s.keepers[otherTeam(team)]?structuredClone(s.keepers[otherTeam(team)]):null,outcome,createdAt:new Date(now).toISOString(),sequenceOverrideBefore:s.nextTeamOverride||null};
 return {...s,nextTeamOverride:null,attempts:[...s.attempts,attempt]};
}
export function undoPenalty(s) {
 const last=s.attempts.at(-1);return last?{...s,nextTeamOverride:last.sequenceOverrideBefore||null,attempts:s.attempts.slice(0,-1)}:s;
}
export function editPenalty(s,id,fields,match=null) {
 const old=s.attempts.find(a=>a.id===id);if(!old)throw Error('Penalty not found.');
 const next={...old,...fields,id:old.id,team:old.team,order:old.order,teamAttempt:old.teamAttempt,stage:old.stage,suddenDeathRound:old.suddenDeathRound};
 if(!SHOOTOUT_OUTCOMES.includes(next.outcome)||!validShootoutRef(next.kicker)||next.kicker.team!==old.team||(next.goalkeeper&&(!validShootoutRef(next.goalkeeper)||next.goalkeeper.team!==old.defendingTeam)))throw Error('Review penalty details.');
 if(match&&JSON.stringify(next.kicker)!==JSON.stringify(old.kicker))assertShootoutEligibility(match,next.kicker);
 if(match&&next.goalkeeper&&JSON.stringify(next.goalkeeper)!==JSON.stringify(old.goalkeeper))assertShootoutEligibility(match,next.goalkeeper,'keeper');
 return {...s,attempts:s.attempts.map(a=>a.id===id?next:a)};
}
export function validShootoutRef(r) {
 return !!r&&['our','opposition'].includes(r.team)&&(r.matchPlayerId===null||typeof r.matchPlayerId==='string'&&r.matchPlayerId.length>0)&&(r.playerId===null||validPlayerId(r.playerId))&&typeof r.nameSnapshot==='string'&&(r.jerseyNumber===null||Number.isInteger(r.jerseyNumber)&&r.jerseyNumber>=1&&r.jerseyNumber<=99)&&!!(r.matchPlayerId||r.jerseyNumber);
}
export function validShootout(s) {
 if(s===undefined)return true;
 return !!s&&s.version===1&&s.phase==='SHOOTOUT'&&[null,'our','opposition'].includes(s.firstKickingTeam)&&typeof s.started==='boolean'&&(!s.started||s.firstKickingTeam!==null)&&[null,'our','opposition'].includes(s.nextTeamOverride)&&s.footballScore&&['our','opposition'].every(t=>s.footballScore[t]&&['goals','points','twoPointers','total'].every(k=>Number.isFinite(s.footballScore[t][k])&&s.footballScore[t][k]>=0)&&(s.keepers?.[t]===null||validShootoutRef(s.keepers?.[t])&&s.keepers[t].team===t))&&Array.isArray(s.attempts)&&(!s.attempts.length||s.started)&&new Set(s.attempts.map(a=>a.id)).size===s.attempts.length&&s.attempts.every((a,i)=>typeof a.id==='string'&&a.phase==='SHOOTOUT'&&a.order===i+1&&['our','opposition'].includes(a.team)&&a.teamAttempt===s.attempts.slice(0,i+1).filter(p=>p.team===a.team).length&&validShootoutRef(a.kicker)&&a.kicker.team===a.team&&a.defendingTeam===otherTeam(a.team)&&(a.goalkeeper===null||validShootoutRef(a.goalkeeper)&&a.goalkeeper.team===a.defendingTeam)&&SHOOTOUT_OUTCOMES.includes(a.outcome)&&a.stage===(a.teamAttempt>5?'SUDDEN_DEATH':'FIRST_5')&&a.suddenDeathRound===(a.teamAttempt>5?a.teamAttempt-5:null)&&typeof a.createdAt==='string'&&Number.isFinite(Date.parse(a.createdAt)));
}
export function penaltyResult(s) {
 const status=shootoutStatus(s);return status.winner?{decidedBy:'penalties',winner:status.winner,football:structuredClone(s.footballScore),shootout:{...status.score}}:null;
}
export function resetShootoutResult(match,shootout) {
 const result=penaltyResult(shootout),next={...match,shootout};
 if(match.result?.decidedBy==='penalties'){
  if(result)next.result=result;
  else {delete next.result;next.lifecycle={...match.lifecycle,status:'live'};delete next.lifecycle.completedAt;}
 }
 return next;
}
export const blankShootoutStats=()=>({attempts:0,scored:0,saved:0,post:0,wide:0,gkFaced:0,gkSaved:0,gkConceded:0,saveRate:null});
export function mergeShootoutStats(rows) {
 const out=blankShootoutStats();for(const r of rows)for(const key of Object.keys(out))if(key!=='saveRate')out[key]+=r?.[key]||0;
 out.saveRate=out.gkFaced?Math.round(out.gkSaved/out.gkFaced*1000)/10:null;return out;
}
export function shootoutPlayerStatistics(match) {
 const groups=new Map();
 const group=ref=>{const p=resolveShootoutRef(match,ref);if(!p)return null;const key=`${p.team}:${p.playerId||p.matchPlayerId||'number:'+p.jerseyNumber}`;if(!groups.has(key))groups.set(key,{...p,...blankShootoutStats()});return groups.get(key);};
 for(const a of match.shootout?.attempts||[]){const k=group(a.kicker);if(k){k.attempts++;k[a.outcome]++;}const g=group(a.goalkeeper);if(g){g.gkFaced++;if(a.outcome==='scored')g.gkConceded++;if(a.outcome==='saved')g.gkSaved++;}}
 return [...groups.values()].map(g=>({...g,saveRate:g.gkFaced?Math.round(g.gkSaved/g.gkFaced*1000)/10:null}));
}
