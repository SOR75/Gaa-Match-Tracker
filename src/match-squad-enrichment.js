import { createMatchPlayer, rowId, validPlayerId, participantRoles, roleNumber, roleTeam } from './identity.js';
import { hasMatchEvidence } from './participation.js';

const key = name => String(name || '').trim().normalize('NFC').toLocaleLowerCase().replace(/\s+/g, ' ');
const number = value => value === '' || value === null || value === undefined ? null : Number(value);
const rosterKey = team => team === 'our' ? 'players' : 'oppositionPlayers';
export function numberedMatchPlayer(jersey) {
  return createMatchPlayer({number:jersey,name:'',role:jersey<=15?'starter':'substitute',position:'',notes:'',numberPlaceholder:true});
}
// Opt in only when creating a genuinely new user match. Never run on recovery,
// migration, archive viewing or an existing stored match.
export function withBlankMatchPlayers(match) {
  if(match.events.length || match.players.length || match.oppositionPlayers.length || match.clock.elapsedMs || match.clock.startedAt!==null)
    throw Error('Only a new empty match can receive default numbered identities.');
  return {...match,matchDayPlayersVersion:1,
    players:Array.from({length:23},(_,i)=>numberedMatchPlayer(i+1)),
    oppositionPlayers:Array.from({length:23},(_,i)=>numberedMatchPlayer(i+1))};
}
export function withNumberedEventPlayers(match,event) {
  if(match.matchDayPlayersVersion!==1 || event.identityVersion!==1)return match;
  let next=match;
  const previous=match.events.find(e=>e.id===event.id);
  for(const role of participantRoles){
    const n=roleNumber(event,role),team=roleTeam(event,role);
    if(!/^[1-9]\d?$/.test(n)||!['our','opposition'].includes(team))continue;
    if(previous && roleNumber(previous,role)===n && roleTeam(previous,role)===team)continue;
    const field=rosterKey(team);
    if(next[field].some(p=>p.number===+n))continue;
    if(next===match)next={...match};
    next[field]=[...next[field],{...numberedMatchPlayer(+n),role:'substitute'}];
  }
  return next;
}
export function compatibleNameExtension(oldName,newName) {
  const a=key(oldName),b=key(newName);
  if(!a||a===b)return true;
  const old=a.split(' '),full=b.split(' ');
  if(old.length===1)return full.length>1 && old[0]===full[0];
  if(old.length!==full.length)return false;
  const last=old.at(-1),abbreviation=last.length===1 || last.endsWith('.');
  return abbreviation && old.slice(0,-1).every((t,i)=>t===full[i]) && full.at(-1).startsWith(last.replace(/\.$/,''));
}
export function importStarterWarning(players) {
  const count=players.filter(p=>p.role==='starter').length;
  return count===15 ? null : {count,message:`${count} starters detected. A starting Gaelic football team normally has 15. Review team; you may deliberately continue after checking the source.`};
}
export function rosterIdentityWarnings(players) {
  const ids=new Set(),numbers=new Set(),warnings=[];
  for(const p of players){
    const id=rowId(p);
    if(id && ids.has(id))warnings.push('Existing duplicate match-player identity — review the roster; no automatic repair.');
    if(id)ids.add(id);
    if(p.number!==null && numbers.has(p.number))warnings.push(`Existing duplicate jersey #${p.number} — review the roster; no automatic repair.`);
    if(p.number!==null)numbers.add(p.number);
  }
  return [...new Set(warnings)];
}
// The planner is pure and never edits events. Decisions are per imported row:
// skip = retain roster, same = coach-confirmed name correction, new = distinct person.
export function planSquadEnrichment(existing,imported,{live=false,mode='import',decisions={}}={}) {
  const players=existing.map(p=>({...p})),rows=[],conflicts=[],used=new Set();
  const issues=rosterIdentityWarnings(existing),incomingNumbers=new Set(),incomingIds=new Set();
  for(const [index,candidate] of imported.entries()){
    const n=number(candidate.number),name=String(candidate.name||'').trim(),choice=decisions[index]||'';
    let reason='',target=null;
    if(!name || (n!==null && (!Number.isInteger(n)||n<1||n>99)))reason='Enter a readable name and a blank jersey or number 1–99.';
    if(n!==null && incomingNumbers.has(n))reason=`Duplicate imported jersey #${n}; correct or remove this row.`;
    if(n!==null)incomingNumbers.add(n);
    if(rowId(candidate) && incomingIds.has(rowId(candidate)))reason='Duplicate imported match identity; correct or remove this row.';
    if(rowId(candidate))incomingIds.add(rowId(candidate));
    const matches=n===null?[]:existing.filter(p=>p.number===n);
    if(matches.length>1)reason=`Jersey #${n} belongs to multiple existing identities. Review the roster first.`;
    if(matches.length===1)target=matches[0];
    if(target && existing.filter(p=>rowId(p)===rowId(target)).length>1)reason='Existing match identity is duplicated; review the roster first.';
    const identityConflict=target && validPlayerId(candidate.playerId) && candidate.playerId!==target.playerId;
    if(identityConflict)reason='Permanent player IDs conflict. Jersey alone cannot link these people.';
    if(target && !compatibleNameExtension(target.name,name) && choice!=='same')reason=`#${n} is ${target.name}; imported name is ${name}. Confirm a correction for the SAME person, or skip.`;
    if(target && validPlayerId(target.playerId) && !key(target.name) && choice!=='same')reason='This slot already has a permanent ID. Confirm the name for the same person; jersey alone is insufficient.';
    if(target && key(target.name)!==key(name) && existing.some(p=>rowId(p)!==rowId(target) && key(p.name) && key(p.name)===key(name)) && choice!=='same')reason='This name already belongs to another match identity. Review the jersey/name; no automatic linking.';
    if(!target && existing.some(p=>key(p.name) && key(p.name)===key(name)) && choice!=='new')reason='This name already exists at another/unknown jersey. Review the jersey, or explicitly identify a different person.';
    if(choice==='skip'){rows.push({index,action:'skip',targetId:target?rowId(target):null,reason});continue;}
    if(reason){conflicts.push({index,reason});rows.push({index,action:'review',targetId:target?rowId(target):null,reason});continue;}
    if(target){
      const id=rowId(target);
      if(used.has(id)){const reason='Two imported rows target the same match identity.';conflicts.push({index,reason});rows.push({index,action:'review',reason});continue;}
      used.add(id);
      const at=players.findIndex(p=>rowId(p)===id);
      players[at]={...target,name,nameSnapshot:name,numberPlaceholder:false,
        ...(live?{position:target.position||candidate.position||''}:{role:candidate.role||target.role,position:candidate.position||target.position||''}),
        notes:target.notes||candidate.notes||''};
      rows.push({index,action:'enrich',targetId:id,reason:`Update #${n} ${target.name||'unnamed'} → ${name}; keep its match identity${live?' and live lineup':''}.`});
    }else{
      const p=createMatchPlayer({...candidate,id:undefined,matchPlayerId:undefined,number:n,name,
        role:live && mode!=='manual'?(candidate.role==='panel'?'panel':'substitute'):(candidate.role||'substitute'),numberPlaceholder:false});
      players.push(p);rows.push({index,action:'add',targetId:rowId(p),reason:live?'New player added to bench/panel; live starters are unchanged.':'New match player.'});
    }
  }
  if(!live && mode==='import')for(const p of players){
    if(p.numberPlaceholder && p.role==='starter' && !used.has(rowId(p)))p.role='substitute';
  }
  return {players,rows,conflicts,warnings:issues,starterWarning:importStarterWarning(imported)};
}
export function acceptedEnrichment(existing,imported,options={}) {
  const plan=planSquadEnrichment(existing,imported,options);
  if(plan.conflicts.length)throw Error(`Review identity: ${plan.conflicts.map(c=>`row ${c.index+1}: ${c.reason}`).join(' ')}`);
  return plan.players;
}
export const enrichmentOptions = (match,decisions={}) => ({live:hasMatchEvidence(match),decisions});

// Saved sources may supply permanent IDs, but may not replace a live roster or
// link an unlinked match player merely through a jersey/name resemblance.
export function retainLiveRoster(existing,incoming,live) {
  if(!live)return incoming;
  const merged=existing.map(old=>{
    const next=incoming.find(p=>rowId(p)===rowId(old) && (p.playerId||null)===(old.playerId||null));
    return next?{...next,...old,name:next.name||old.name,nameSnapshot:next.name||old.name}:old;
  });
  for(const p of incoming){
    if(existing.some(old=>rowId(old)===rowId(p) && (old.playerId||null)===(p.playerId||null)))continue;
    if(existing.some(old=>key(old.name)&&key(old.name)===key(p.name)))throw Error('Review identity: a Saved Squad name already exists under another match identity. No automatic link was made.');
    merged.push({...p,number:null,jerseyNumber:null,role:'panel'});
  }
  return merged;
}
