import {shootoutPlayerStatistics,mergeShootoutStats} from "./shootout.js";
import { scoringSourceTotals, mergeScoringSources } from './scoring-sources.js';
import {
  goalkeeperStatistics,
  goalkeeperMetrics,
  keeperPercent,
} from "./goalkeepers.js";
import { validPlayerId, participantRef } from "./identity.js";
import { playerStatistics, percentage } from "./analysis.js";
import { participationFor, hasMatchEvidence } from "./participation.js";
const metrics = [
  ...goalkeeperMetrics,
  "goals",
  "points",
  "twoPointers",
  "total",
  "attempts",
  "successful",
  "misses",
  "wides",
  "blockedAttempts",
  "defensiveBlocks",
  "interceptions",
  "turnoversWon",
  "turnoversLost",
  "passes",
  "passesReceived",
  "recordedEvents",
  "kickoutMarks",
  "kickoutPossessionsWon",
  "otherKickoutPossessionsWon",
  "possessions",
  "kickoutInvolvement",
];
function dateValue(record) {
  return (
    Date.parse(
      record.match.setup.date ||
        record.match.lifecycle?.completedAt ||
        record.archivedAt ||
        "",
    ) || 0
  );
}
function recordedTime(record) {
  const m = record.match;
  return (
    Date.parse(m.lifecycle?.completedAt || record.archivedAt || "") ||
    Math.max(0, ...m.events.map((e) => Date.parse(e.createdAt || "") || 0))
  );
}
export function playerReviews(records, squads = [], active = null) {
  const matches = new Map(records.map((r) => [r.match.id, r]));
  if (active)
    matches.set(active.id, { id: active.id, match: active, current: true });
  const profiles = new Map();
  function profile(id, name) {
    if (!validPlayerId(id)) return null;
    if (!profiles.has(id))
      profiles.set(id, { playerId: id, name, squads: new Set(), matches: [] });
    return profiles.get(id);
  }
  for (const s of squads)
    for (const p of s.players) {
      const q = profile(p.playerId, p.name);
      if (q) q.squads.add(s.name);
    }
  for (const record of [...matches.values()].sort(
    (a, b) =>
      dateValue(b) - dateValue(a) ||
      recordedTime(b) - recordedTime(a) ||
      b.match.id.localeCompare(a.match.id),
  )) {
    const m = record.match;
    if (!hasMatchEvidence(m)&&!m.shootout?.attempts?.length) continue;
    const roster = new Map();
    for (const p of m.players)
      if (validPlayerId(p.playerId)) roster.set(p.playerId, p);
    for (const e of m.events)
      for (const role of [
        "player",
        "blocker",
        "markWinner",
        "receiver",
        "kickoutWinner",
        "turnoverWinner",
        "turnoverLoser",
      ]) {
        const ref = participantRef(e, role);
        if (
          ref?.team === "our" &&
          validPlayerId(ref.playerId) &&
          !roster.has(ref.playerId)
        )
          roster.set(ref.playerId, {
            id: ref.matchPlayerId,
            matchPlayerId: ref.matchPlayerId,
            playerId: ref.playerId,
            name: ref.nameSnapshot,
            number: ref.jerseyNumber,
            role: "unknown",
            eventOnly: true,
          });
      }
    const penaltyPlayers=shootoutPlayerStatistics(m).filter(p=>p.team==='our');
    for(const p of penaltyPlayers)if(validPlayerId(p.playerId)&&!roster.has(p.playerId))roster.set(p.playerId,{id:p.matchPlayerId,matchPlayerId:p.matchPlayerId,playerId:p.playerId,name:p.name,number:p.jerseyNumber,role:'unknown',eventOnly:true});
    const stats = playerStatistics(m, "our");
    const keepers = goalkeeperStatistics(m).filter((g) => g.team === "our");
    for (const [id, p] of roster) {
      const q = profile(id, p.name),
        participation = participationFor(m, p);
      const total = Object.fromEntries(
        metrics.map((key) => [
          key,
          stats
            .filter((s) => s.playerId === id)
            .reduce((n, s) => n + (s[key] || 0), 0),
        ]),
      );
      for (const key of goalkeeperMetrics)
        total[key] = keepers
          .filter((g) => g.playerId === id)
          .reduce((n, g) => n + g[key], 0);
      total.recordedEvents = new Set(m.events.filter(e => !["substitution","goalkeeper-change"].includes(e.event) && ["player","blocker","markWinner","receiver","kickoutWinner","turnoverWinner","turnoverLoser","playerOn","playerOff"].some(role => {
        const ref=participantRef(e,role);return ref?.team==="our" && ref.playerId===id;
      })).map(e=>e.id)).size;
      q.matches.push({
        matchId: m.id,
        seasonId: m.seasonId || null,
        nameSnapshot: p.name,
        opponent: m.setup.opposition || "Opposition",
        date: m.setup.date || "",
        jersey: p.number,
        role: p.role,
        ...participation,
        named: !p.eventOnly,
        ...total,
        scoringSources: scoringSourceTotals(m.events.filter(e=>{
          const ref=participantRef(e, "player");
          return ref?.team === "our" && ref.playerId === id;
        })),
        ...(penaltyPlayers.some(s=>s.playerId===id)?{shootout:mergeShootoutStats(penaltyPlayers.filter(s=>s.playerId===id))}:{}),
        current: !!record.current,
      });
      // No name/number matching: historical source Squad is shown only by stored ID.
      const source = squads.find(
        (s) => s.id === (p.sourceSquadId || m.squadId),
      );
      if (source) q.squads.add(source.name);
    }
    if(m.matchDayPlayersVersion===1)for(const s of stats.filter(s=>!s.playerId && s.matchPlayerId)){
      const events=m.events.filter(e=>["player","blocker","markWinner","receiver","kickoutWinner","turnoverWinner","turnoverLoser","playerOn","playerOff"].some(role=>{
        const ref=participantRef(e,role);return ref?.team==="our" && ref.matchPlayerId===s.matchPlayerId;
      }));
      if(!events.length)continue;
      const p=m.players.find(p=>(p.matchPlayerId||p.id)===s.matchPlayerId);
      if(!p)continue;
      const profileKey=`match:${m.id}:${s.matchPlayerId}`;
      const total=Object.fromEntries(metrics.map(k=>[k,s[k]||0]));
      total.recordedEvents=new Set(events.filter(e=>!["substitution","goalkeeper-change"].includes(e.event)).map(e=>e.id)).size;
      for(const k of goalkeeperMetrics)total[k]=keepers.filter(g=>g.matchPlayerId===s.matchPlayerId).reduce((n,g)=>n+g[k],0);
      profiles.set(profileKey,{playerId:null,profileKey,unlinked:true,name:p.name||`#${p.number} · unnamed`,squads:new Set(),matches:[{
        matchId:m.id,seasonId:m.seasonId||null,nameSnapshot:p.name,opponent:m.setup.opposition||"Opposition",date:m.setup.date||"",jersey:p.number,role:p.role,
        ...participationFor(m,p),named:true,...total,
        scoringSources:scoringSourceTotals(events.filter(e=>participantRef(e)?.matchPlayerId===s.matchPlayerId && e.team==="our")),current:!!record.current,
      }]});
    }
    for(const penalty of penaltyPlayers.filter(p=>!p.playerId)){
      const key=`match:${m.id}:${penalty.matchPlayerId||'shootout-number:'+penalty.jerseyNumber}`;
      const existing=profiles.get(key);
      if(existing){const entry=existing.matches.find(r=>r.matchId===m.id);if(entry)entry.shootout=mergeShootoutStats([entry.shootout,penalty]);continue;}
      const p=m.players.find(p=>(p.matchPlayerId||p.id)===penalty.matchPlayerId);
      const normal=Object.fromEntries(metrics.map(k=>[k,stats.filter(s=>s.matchPlayerId===penalty.matchPlayerId).reduce((n,s)=>n+(s[k]||0),0)]));
      for(const k of goalkeeperMetrics)normal[k]=keepers.filter(g=>g.matchPlayerId===penalty.matchPlayerId).reduce((n,g)=>n+g[k],0);
      profiles.set(key,{playerId:null,profileKey:key,unlinked:true,name:penalty.name||`#${penalty.jerseyNumber} · number only`,squads:new Set(),matches:[{
       matchId:m.id,seasonId:m.seasonId||null,nameSnapshot:penalty.name,opponent:m.setup.opposition||'Opposition',date:m.setup.date||'',jersey:penalty.jerseyNumber,role:p?.role||'unknown',
       ...(p?participationFor(m,p):{appeared:false,started:false,substituteAppearance:false,didNotPlay:false,evidence:'Shootout only'}),named:!!p,...normal,shootout:mergeShootoutStats([penalty]),current:!!record.current,
      }]});
    }
  }
  return [...profiles.values()]
    .map((q) => {
      const total = Object.fromEntries(
          metrics.map((key) => [
            key,
            q.matches.reduce((n, m) => n + m[key], 0),
          ]),
        ),
        recent = q.matches.slice(0, 6);
      return {
        ...q,
        squads: [...q.squads],
        goalkeeperSeasons: [
          ...new Set(
            q.matches
              .filter((m) => m.goalkeeperAppearances)
              .map((m) => m.seasonId),
          ),
        ].map((seasonId) => {
          const entries = q.matches.filter((m) => m.seasonId === seasonId);
          const counters = Object.fromEntries(
            goalkeeperMetrics.map((k) => [
              k,
              entries.reduce((n, m) => n + m[k], 0),
            ]),
          );
          return {
            seasonId,
            label: seasonId
              ? squads.find((s) => s.seasonId === seasonId)?.seasonLabel ||
                seasonId
              : "Season not recorded",
            ...counters,
            gkRetention: keeperPercent(
              counters.gkRetained,
              counters.gkKickouts,
            ),
            gkShortRetention: keeperPercent(
              counters.gkShortRetained,
              counters.gkShort,
            ),
            gkLongRetention: keeperPercent(
              counters.gkLongRetained,
              counters.gkLong,
            ),
          };
        }),
        ...total,
        ...(q.matches.some(m=>m.shootout)?{shootout:mergeShootoutStats(q.matches.map(m=>m.shootout))}:{}),
        scoringSources: mergeScoringSources(q.matches.map(m=>m.scoringSources)),
        conversion: percentage(total.successful, total.attempts),
        gkRetention: keeperPercent(total.gkRetained, total.gkKickouts),
        gkShortRetention: keeperPercent(total.gkShortRetained, total.gkShort),
        gkLongRetention: keeperPercent(total.gkLongRetained, total.gkLong),
        named: q.matches.filter((m) => m.named).length,
        appearances: q.matches.filter((m) => m.appeared).length,
        starts: q.matches.filter((m) => m.started).length,
        substituteAppearances: q.matches.filter((m) => m.substituteAppearance)
          .length,
        didNotPlay: q.matches.filter((m) => m.didNotPlay).length,
        recent: {
          sample: recent.length,
          played: recent.filter((m) => m.appeared).length,
          started: recent.filter((m) => m.started).length,
        },
      };
    })
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name) || (a.profileKey || a.playerId).localeCompare(b.profileKey || b.playerId),
    );
}
