import {fieldState,disciplineState,disciplinePlayerState,disciplinePlayerKey,disciplineKey,substitutionDisciplineConflict} from './discipline.js';
import {durationBetween, playingEnd} from "./periods.js";
import { rowId, participantRef } from "./identity.js";
const rosterFor = (match, team) =>
  (team === "our" ? match.players : match.oppositionPlayers) || [];
export const playerKey = player => rowId(player)?`id:${rowId(player)}`:`number:${player.number}`;
export function substitutionKey(match, event, role) {
  const team = event.team,
    roster = rosterFor(match, team),
    ref = participantRef(event, role);
  if (ref) return `id:${ref.matchPlayerId}`;
  const number = String(event[role] || "");
  if (!number) return null;
  const found = roster.filter(
    (p) => p.number !== null && String(p.number) === number,
  );
  return found.length === 1 ? playerKey(found[0]) : `number:${number}`;
}
export function onFieldKeys(match,team,options={}){return fieldState(match,options).activeKeys(team);}
export function onFieldPlayers(match, team, options) {
  const active = onFieldKeys(match, team, options);
  return rosterFor(match, team).filter((p) => active.has(playerKey(p)));
}
export function substitutionChoices(match, event) {
  const active = onFieldKeys(match, event.team, { beforeEvent: event }),
    roster = rosterFor(match, event.team).filter((p) =>
      Number.isInteger(p.number),
    );
  return {
    on: roster.filter((p) => !active.has(playerKey(p)) && !["SIN_BIN","SENT_OFF"].includes(disciplinePlayerState(match,p,event.team,{beforeEvent:event}))),
    off: roster.filter((p) => active.has(playerKey(p))),
  };
}
export function hasMatchEvidence(match) {
  return !!(
    match.events.length ||
    match.clock.startedAt !== null ||
    match.clock.elapsedMs > 0 ||
    match.lifecycle?.status === "completed"
  );
}
export function participationFor(match, player, team = "our") {
  const ambiguousLineup =
    rosterFor(match, team).filter((p) => p.role === "starter").length > 15;
  const started =
    player.role === "starter" && !ambiguousLineup && hasMatchEvidence(match);
  const reconstructed=fieldState(match);
  const entered = reconstructed.substitutions.some(({event})=>{const on=participantRef(event,'playerOn')||(event.event==='discipline-replacement'?participantRef(event):null);return on?.team===team&&on.matchPlayerId===rowId(player)&&(on.playerId||null)===(player.playerId||null);});
  const action = match.events.filter(e=>reconstructed.validEventIds.has(e.id)).some((e) =>
    [
      "player",
      "markWinner",
      "blocker",
      "receiver",
      "kickoutWinner",
      "turnoverWinner",
      "turnoverLoser",
    ].some((role) => {
      const ref = participantRef(e, role);
      return (
        ref?.team === team &&
        ref.matchPlayerId === rowId(player) &&
        ref.playerId === player.playerId
      );
    }),
  );
  const disciplineEntered=disciplineState(match).changes.some(c=>c.active&&c.ref.team===team&&c.ref.matchPlayerId===rowId(player)&&(c.ref.playerId||null)===(player.playerId||null));
  const appeared = started || entered || action || disciplineEntered;
  const substituteAppearance =
    appeared &&
    !started &&
    (entered || ["substitute", "panel"].includes(player.role));
  return {
    named: true,
    started,
    entered,
    appeared,
    substituteAppearance,
    appearanceRoleUnknown: appeared && !started && !substituteAppearance,
    didNotPlay:
      !appeared && !ambiguousLineup && match.lifecycle?.status === "completed",
    participationWarning: ambiguousLineup
      ? "Review starting lineup: more than 15 starters recorded"
      : "",
    evidence: started
      ? "Starting lineup"
      : entered
        ? "Recorded substitution"
        : action
          ? "Attributed event"
          : ambiguousLineup
            ? "Review starting lineup: more than 15 starters recorded"
            : "No appearance recorded",
  };
}

// Unknown legacy boundaries remain unknown; never substitute nominal half lengths.
export function playerPlayingTime(match,player,team='our',now=Date.now()) {
 const reconstructed=fieldState(match,{now});
 let active=player.role==='starter'&&!reconstructed.ambiguousTeams.has(team),from={half:1,timeMs:0},total=0,unknown=false;
 const add=to=>{const d=durationBetween(match,from,to);if(d===null)unknown=true;else total+=d;};
 for(const c of reconstructed.fieldChanges.filter(c=>disciplineKey(c.ref,match)===disciplinePlayerKey(player,team))){
  if(active&&!c.active){add(c.event);active=false;}if(!active&&c.active){from=c.event;active=true;}
 }
 if(active)add(playingEnd(match,now));return unknown?null:total;
}

export function playingStateFor(match,player,team='our'){const state=disciplinePlayerState(match,player,team);return ['SIN_BIN','SENT_OFF'].includes(state)?state:onFieldKeys(match,team).has(playerKey(player))?'ACTIVE':'SUBSTITUTE/OFF';}
