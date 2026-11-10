// One replay owns lawful field places, discipline, substitutions and attribution.
// Invalid downstream facts remain in the ledger but cannot change derived state.
import {continuousPlayingMs, completedDuration, playingEnd} from './periods.js';
import {participantRef, participantRoles, roleNumber, roleTeam, rowId} from './identity.js';
export const rosterFor=(m,t)=>(t==='our'?m.players:m.oppositionPlayers)||[];
export const cardOptions=code=>code==='GAA'?['yellow','black','red']:code==='LGFA'?['yellow','red']:[];
export const sinBinDuration=(match,half=match.clock?.half||1)=>match.setup.matchCode==='GAA'?600000:half>=3?(match.setup.halfLength<30?300000:600000):match.setup.halfLength<=15?180000:match.setup.halfLength<30?300000:600000;
export const disciplineKey=(ref,match=null)=>{
 if(!ref)return null;
 const p=match&&rosterFor(match,ref.team).find(p=>rowId(p)===ref.matchPlayerId);
 const id=ref.playerId||p?.playerId;
 return `${ref.team}:${id?'player:'+id:'row:'+ref.matchPlayerId}`;
};
export const disciplinePlayerKey=(p,t)=>disciplineKey({team:t,playerId:p.playerId,matchPlayerId:rowId(p)});
export const orderedFacts=m=>m.events.map((event,index)=>({event,index})).sort((a,b)=>a.event.half-b.event.half||a.event.timeMs-b.event.timeMs||a.index-b.index);
export const isDisciplineAction=e=>e.disciplineVersion===1;
export function validDisciplineEvent(e){
 if(e.disciplineVersion===undefined)return !['discipline-return','discipline-replacement','discipline-et-choice'].includes(e.event);
 if(e.disciplineVersion!==1)return false;
 if(e.event==='booked')return ['GAA','LGFA'].includes(e.matchCode)&&cardOptions(e.matchCode).includes(e.card)&&(e.sinBinDurationMs===undefined||[180000,300000,600000].includes(e.sinBinDurationMs))&&!!participantRef(e);
 return ['discipline-return','discipline-replacement','discipline-et-choice'].includes(e.event)&&typeof e.cardId==='string'&&!!participantRef(e)&&(e.event!=='discipline-et-choice'||e.etDecision==='continue');
}
function rowRef(p,team){return {team,matchPlayerId:rowId(p)||`number:${p.number}`,playerId:p.playerId||null,nameSnapshot:p.name||'',jerseyNumber:p.number??null};}
export function eventRef(match,e,role='player'){
 const explicit=participantRef(e,role);if(explicit)return explicit;
 const number=roleNumber(e,role),team=roleTeam(e,role);if(!number||!['our','opposition'].includes(team))return null;
 const rows=rosterFor(match,team).filter(p=>p.number!==null&&String(p.number)===number);
 if(rows.length===1)return rowRef(rows[0],team);
 return null;
}
export function fieldState(match,{now=Date.now(),beforeEvent=null}={}){
 const people=new Map(),players=new Map(),slots=new Map(),invalidEvents=new Map(),validEventIds=new Set(),fieldChanges=[],changes=[],history=[],substitutions=[],etDecisions=new Set();
 const ambiguousTeams=new Set(),baseCount={our:0,opposition:0};
 const ensure=ref=>{const key=disciplineKey(ref,match);if(!people.has(key))people.set(key,{key,ref,state:'SUBSTITUTE/OFF',slotId:null,cards:[],bin:null,dismissal:null,etReplaced:false});return people.get(key);};
 for(const team of ['our','opposition']){
  const rows=rosterFor(match,team),starters=rows.filter(p=>p.role==='starter');
  rows.forEach(p=>{const state=ensure(rowRef(p,team));state.scoutingUnknown=!!p.numberPlaceholder&&!p.name?.trim();});
  const knownKeeper=match.goalkeepers?.[team];
  if(knownKeeper&&!rows.some(p=>rowId(p)===knownKeeper.matchPlayerId)&&starters.length<15){const state=ensure(knownKeeper),id=`${team}:keeper-place`;state.state='ACTIVE';state.slotId=id;slots.set(id,{id,team,occupant:state.key});}
  if(starters.length>15){ambiguousTeams.add(team);for(const p of starters)people.get(disciplinePlayerKey(p,team)).uncertainLineup=true;continue;}
  baseCount[team]=rows.length?starters.length+(slots.has(`${team}:keeper-place`)?1:0):15;
  const initial=rows.length?starters:Array.from({length:15},(_,i)=>({id:`number:${i+1}`,number:i+1,name:'',playerId:null}));
  for(const p of initial){const s=ensure(rowRef(p,team)),slotId=`${team}:place:${slots.size}`;s.state='ACTIVE';s.slotId=slotId;slots.set(slotId,{id:slotId,team,occupant:s.key});}
 }
 const occupied=team=>[...slots.values()].filter(s=>s.team===team&&s.occupant);
 const allowance=team=>Math.max(0,Math.min(15,baseCount[team])-[...people.values()].filter(p=>p.ref.team===team&&['SIN_BIN','SENT_OFF'].includes(p.state)&&!p.etReplaced).length);
 const fail=(e,why)=>invalidEvents.set(e.id,why);
 const change=(e,p,active,discipline=false)=>{const c={event:e,ref:p.ref,active};fieldChanges.push(c);if(discipline)changes.push(c);};
 const remove=(e,p,discipline=false)=>{const slot=slots.get(p.slotId);if(slot?.occupant===p.key){slot.occupant=null;change(e,p,false,discipline);p.everRemoved=true;}if(p.state==='ACTIVE')p.state='SUBSTITUTE/OFF';};
 const place=(e,p,slot,discipline=false)=>{if(slot.occupant||p.state==='ACTIVE')return false;slot.occupant=p.key;p.slotId=slot.id;p.state='ACTIVE';change(e,p,true,discipline);return true;};
 const point=e=>continuousPlayingMs(match,e,now);
 const normalEnd=()=>{const h=completedDuration(match.clock,2);return h===null?null:point({half:2,timeMs:h});};
 const etEligible=p=>{const end=normalEnd();return end!==null&&(p.bin?.card.matchCode==='LGFA'&&p.bin.card.half<=2&&p.bin.eligibleAt!==null&&p.bin.eligibleAt>end||p.state==='SENT_OFF'&&p.dismissal?.reason==='two-yellows'&&p.dismissal.event.half<=2);};
 const boundary=beforeEvent?match.events.findIndex(e=>e.id===beforeEvent.id):-1;
 const facts=orderedFacts(match).filter(({event:e,index})=>!beforeEvent||e.half<beforeEvent.half||e.half===beforeEvent.half&&(e.timeMs<beforeEvent.timeMs||e.timeMs===beforeEvent.timeMs&&(boundary<0||index<boundary)));
 function lookup(e,role){const ref=eventRef(match,e,role);if(ref)return ensure(ref);const number=roleNumber(e,role),team=roleTeam(e,role);const known=[...people.values()].filter(p=>p.ref.team===team&&String(p.ref.jerseyNumber)===number);return known.length===1?known[0]:null;}
 function attributionError(e,strict=false){
  for(const role of participantRoles.filter(r=>!['playerOn','playerOff'].includes(r))){
   const n=roleNumber(e,role);if(!n)continue;
   const ref=eventRef(match,e,role),team=roleTeam(e,role);
   const duplicates=rosterFor(match,team).filter(p=>p.number!==null&&String(p.number)===n);
   if(!ref){if(duplicates.length>1)return 'Review conflicting jersey numbers before attributing this event.';const known=[...people.values()].filter(p=>p.ref.team===team&&String(p.ref.jerseyNumber)===n);if(known.length===1&&known[0].everRemoved&&known[0].state!=='ACTIVE')return `#${n} is not eligible/on field (${known[0].state}).`;continue;}
   const p=ensure(ref);
   if(p.state!=='ACTIVE'&&!((p.scoutingUnknown||p.uncertainLineup)&&!p.everRemoved&&!p.cards.length&&!p.invalidEntry)&&(strict||p.cards.length||p.invalidEntry))return `${ref.nameSnapshot||'#'+n} is not eligible/on field (${p.state}).`;
  }
  return '';
 }
 for(const {event:e} of facts){
  if(e.event==='substitution'){
   const on=lookup(e,'playerOn'),off=lookup(e,'playerOff');
   // Truly unlisted scouting numbers remain local, never permanent identities.
   const synthetic=(role)=>{const n=String(e[role]||'');return /^\d{1,2}$/.test(n)?ensure({team:e.team,matchPlayerId:`number:${+n}`,playerId:null,nameSnapshot:'',jerseyNumber:+n}):null;};
   const incoming=on||synthetic('playerOn'),outgoing=off||synthetic('playerOff');
   if(!incoming||!outgoing||incoming.key===outgoing.key||outgoing.state!=='ACTIVE'||incoming.state!=='SUBSTITUTE/OFF'){
    fail(e,'Substitution requires a current on-field player OFF and an eligible off-field player ON.');if(incoming&&incoming.state==='SUBSTITUTE/OFF')incoming.invalidEntry=true;continue;
   }
   const slot=slots.get(outgoing.slotId);if(!slot||slot.occupant!==outgoing.key){fail(e,'The outgoing player no longer occupies a field place.');incoming.invalidEntry=true;continue;}
   remove(e,outgoing);place(e,incoming,slot);substitutions.push({event:e,on:incoming.ref,off:outgoing.ref,reason:'normal'});
   for(const p of people.values())if(p.bin?.replacement&&disciplineKey(p.bin.replacement,match)===outgoing.key)p.bin.replacement=incoming.ref;
   validEventIds.add(e.id);continue;
  }
  if(e.disciplineVersion===1){
   if(!validDisciplineEvent(e)){fail(e,'Invalid discipline fact.');continue;}
   const ref=participantRef(e),p=ensure(ref),t=point(e);
   if(e.event==='booked'){
    if(!['ACTIVE','SIN_BIN'].includes(p.state)){fail(e,'Card has no eligible participant at this point.');continue;}
    p.ref=ref;p.cards.push(e);players.set(p.key,p);
    const dismissal=e.card==='red'||p.cards.filter(c=>c.card!=='red').length>=2;
    if(dismissal){remove(e,p,true);if(p.bin)p.bin.closed=e;p.bin=null;p.state='SENT_OFF';p.dismissal={event:e,reason:e.matchCode==='LGFA'&&e.card==='yellow'&&p.cards.filter(c=>c.card==='yellow').length===2?'two-yellows':'red'};validEventIds.add(e.id);continue;}
    if(e.card==='black'||e.matchCode==='LGFA'&&e.card==='yellow'){
     const durationMs=e.sinBinDurationMs??sinBinDuration({...match,setup:{...match.setup,matchCode:e.matchCode}},e.half);
     remove(e,p,true);p.state='SIN_BIN';p.bin={card:e,ref,start:t,durationMs,eligibleAt:t===null?null:t+durationMs,returnedAt:null,replacement:null,slotId:p.slotId,etReplaced:false};history.push(p.bin);
    }
    validEventIds.add(e.id);continue;
   }
   const original=[...people.values()].find(q=>q.bin?.card.id===e.cardId||q.dismissal?.event.id===e.cardId);
   if(!original){fail(e,'The linked card no longer establishes this discipline action.');continue;}
   if(e.event==='discipline-et-choice'||e.event==='discipline-replacement'){
    if(e.half!==3||e.timeMs!==0||!etEligible(original)||etDecisions.has(e.cardId)){fail(e,'This replacement/choice is only lawful at the Normal Time to ET transition.');continue;}
    if(e.event==='discipline-et-choice'){if(p.key!==original.key){fail(e,'Wrong player for ET choice.');continue;}etDecisions.add(e.cardId);validEventIds.add(e.id);continue;}
    const slot=slots.get(original.slotId);
    if(p.ref.team!==original.ref.team||p.state!=='SUBSTITUTE/OFF'||!slot||slot.occupant||occupied(p.ref.team).length>=Math.min(15,baseCount[p.ref.team])){fail(e,'Choose an eligible substitute for the available ET field place.');continue;}
    original.etReplaced=true;if(original.bin){original.bin.etReplaced=true;original.bin.replacement=p.ref;original.bin.replacementEvent=e;}
    p.ref=ref;place(e,p,slot,true);substitutions.push({event:e,on:p.ref,off:eventRef(match,e,'playerOff')||original.ref,reason:'lgfa-et-replacement'});etDecisions.add(e.cardId);validEventIds.add(e.id);continue;
   }
   if(e.event==='discipline-return'){
    const bin=original.bin;
    if(!bin||p.key!==original.key||p.state!=='SIN_BIN'||t===null||bin.eligibleAt===null||t<bin.eligibleAt){fail(e,'The player is not eligible to return from this card.');continue;}
    const slot=slots.get(bin.slotId),occupant=slot?.occupant?people.get(slot.occupant):null;
    const specified=lookup(e,'playerOff');
    const needsExchange=bin.etReplaced||!!occupant||!!specified;
    const outgoing=specified;
    if(needsExchange&&(!outgoing||outgoing.state!=='ACTIVE'||outgoing.ref.team!==p.ref.team||outgoing.key===p.key)){fail(e,'Returning after an ET replacement requires the current on-field player OFF.');continue;}
    const target=outgoing?slots.get(outgoing.slotId):slot;
    if(!target){fail(e,'No valid field place for this return.');continue;}
    const newCount=occupied(p.ref.team).length-(outgoing?1:0)+1;
    // The original penalty ends; an ET exemption ends with it. Other penalties remain.
    const newAllowance=allowance(p.ref.team)+(p.etReplaced?0:1);
    if(newCount>newAllowance||newCount>15){fail(e,'Return would exceed lawful team strength; select a player OFF.');continue;}
    if(outgoing)remove(e,outgoing,true);
    p.ref=ref;p.etReplaced=false;bin.returnedAt=t;bin.returnEvent=e;p.bin=null;p.state='SUBSTITUTE/OFF';place(e,p,target,true);
    if(needsExchange)substitutions.push({event:e,on:p.ref,off:outgoing.ref,reason:'lgfa-et-return'});
    validEventIds.add(e.id);continue;
   }
  }
  const error=attributionError(e);
  if(error){fail(e,error);continue;}
  validEventIds.add(e.id);
 }
 const current=continuousPlayingMs(match,null,now);
 const bins=[...people.values()].filter(p=>p.bin).map(p=>{
  const b=p.bin;b.remainingMs=current===null||b.eligibleAt===null?null:Math.max(0,b.eligibleAt-current);b.eligible=b.remainingMs===0;
  const occupant=slots.get(b.slotId)?.occupant;b.currentOccupant=occupant?people.get(occupant).ref:null;
  b.requiresExchange=b.etReplaced||!!occupant;b.replacementDismissed=!!(b.replacement&&people.get(disciplineKey(b.replacement,match))?.state==='SENT_OFF');return b;
 });
 const activeKeys=team=>new Set(occupied(team).map(slot=>{const ref=people.get(slot.occupant).ref;return ref.matchPlayerId.startsWith('number:')?ref.matchPlayerId:`id:${ref.matchPlayerId}`;}));
 for(const team of ['our','opposition'])if(occupied(team).length>allowance(team)||occupied(team).length>15)throw new Error('Invalid reconstructed field count.');
 return {people,players,slots,bins,changes,fieldChanges,history,substitutions,etDecisions,validEventIds,invalidEvents,ambiguousTeams,activeKeys,allowance,attributionError,etEligible};
}
export function etTransitionOpen(match){return match.setup.matchCode==='LGFA'&&!match.clock.periods?.ET1?.hasStarted&&match.clock.half===3&&match.clock.phase==='PLAY'&&match.clock.elapsedMs===0&&match.clock.startedAt===null&&!match.events.some(e=>e.half>=3&&!['discipline-et-choice','discipline-replacement'].includes(e.event));}
export function pendingETChoices(match){if(!etTransitionOpen(match))return[];const f=fieldState(match);return [...f.people.values()].filter(p=>f.etEligible(p)&&!f.etDecisions.has(p.bin?.card.id||p.dismissal?.event.id)).map(p=>({ref:p.ref,card:p.bin?.card||p.dismissal.event,reason:p.bin?'sin-bin':'two-yellows'}));}
export function assertEventEligibility(match,event){
 const prior=fieldState(match,{beforeEvent:event});
 const withoutCurrent={...match,events:match.events.filter(e=>e.id!==event.id)};
 if(event.half>=3&&!["discipline-et-choice","discipline-replacement"].includes(event.event)&&pendingETChoices(withoutCurrent).length)throw new Error("Complete Extra Time player choices before recording play.");
 if(event.disciplineVersion===1||event.event==='substitution'){
  const replay=fieldState(match);if(replay.invalidEvents.has(event.id))throw new Error(replay.invalidEvents.get(event.id));
  if(event.event==='discipline-replacement'||event.event==='discipline-et-choice'){
   if(match.clock.half!==3||match.clock.elapsedMs!==0||match.clock.startedAt!==null||!pendingETChoices(withoutCurrent).some(c=>c.card.id===event.cardId))throw new Error('Extra Time choices must be recorded at the Normal Time to ET transition.');
  }
 }else{const error=prior.attributionError(event,true);if(error)throw new Error(error);}
}
