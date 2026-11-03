// Football eligibility at the ET boundary. Never change the football replay to
// accommodate a shootout selection, and never rewrite historical penalty facts.
import {fieldState,disciplineKey} from './field-state.js';
import {completedDuration} from './periods.js';
import {rowId} from './identity.js';
const rosterFor=(m,t)=>(t==='our'?m.players:m.oppositionPlayers)||[];
function context(match,team){
 const end=completedDuration(match.clock,4);
 const football=end===null?match:{...match,events:match.events.filter(e=>e.half<4||e.half===4&&e.timeMs<=end),clock:{...match.clock,half:4,activeHalf:4,elapsedMs:end,startedAt:null}};
 const state=fieldState(football,{now:0}),roster=rosterFor(match,team);
 const starters=roster.filter(p=>p.role==='starter').length;
 const reliable=starters>0&&starters<=15&&!state.ambiguousTeams.has(team)||state.fieldChanges.some(c=>c.ref.team===team);
 return {match:football,state,roster,reliable,team};
}
function allowed(c,ref,role){
 if(!ref||ref.team!==c.team)return false;
 let person=null,row=null;
 if(ref.matchPlayerId){
  row=c.roster.find(p=>rowId(p)===ref.matchPlayerId);
  if(!row||ref.playerId&&row.playerId!==ref.playerId)return false;
  person=c.state.people.get(disciplineKey(ref,c.match));
 }else{
  // Anonymous/scouting references stay local. A known roster identity may not
  // be bypassed by omitting its ID or typing its jersey manually.
  if(c.roster.some(p=>p.number!==null&&p.number===ref.jerseyNumber))return false;
  const known=[...c.state.people.values()].filter(p=>p.ref.team===c.team&&p.ref.matchPlayerId===`number:${ref.jerseyNumber}`);
  person=known.length===1?known[0]:null;
 }
 if(person?.state==='SENT_OFF')return false;
 if(person?.state==='ACTIVE')return true;
 const code=c.match.setup.matchCode;
 const expired=code==='GAA'&&person?.state==='SIN_BIN'&&person.bin?.remainingMs===0;
 if(expired)return true;
 if(person?.state==='SIN_BIN')return false;
 if(role==='keeper'&&code==='GAA'&&row&&person?.state==='SUBSTITUTE/OFF'){
  // Keep the keeper-specific replacement path distinct. It never grants an
  // off-field player general kicker eligibility or a football appearance.
  return row.role==='substitute'||c.state.fieldChanges.some(change=>change.active&&change.ref.matchPlayerId===ref.matchPlayerId&&change.ref.team===ref.team);
 }
 if(c.reliable)return false;
 // Only legacy/anonymous matches without a reliable lineup retain the previous
 // unknown-lineup fallback. Known off-field history still wins over that fallback.
 if(person?.everRemoved||person?.invalidEntry)return false;
 return row?row.role!=='panel':!person;
}
export function eligibleShootoutRef(match,ref,role='kicker'){
 return !!ref&&allowed(context(match,ref.team),ref,role);
}
export function assertShootoutEligibility(match,ref,role='kicker'){
 if(!eligibleShootoutRef(match,ref,role))throw new Error(role==='keeper'?'Choose an eligible shootout goalkeeper.':'Player is not eligible to take a penalty at the end of Extra Time.');
}
export function shootoutPlayerChoices(match,team,role='kicker'){
 const c=context(match,team);
 const rows=c.roster.length?c.roster.map(p=>({key:rowId(p),number:p.number,name:p.name,ref:{team,matchPlayerId:rowId(p),playerId:p.playerId||null,jerseyNumber:p.number??null,nameSnapshot:p.name||''}})):
 [...c.state.people.values()].filter(p=>p.ref.team===team).map(p=>({key:String(p.ref.jerseyNumber),number:p.ref.jerseyNumber,name:'',ref:{...p.ref,matchPlayerId:null}}));
 return rows.filter(row=>allowed(c,row.ref,role));
}
