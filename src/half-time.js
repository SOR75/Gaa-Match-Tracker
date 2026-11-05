import {validAnalysisEvents} from './analysis-evidence.js';
import {periodNumber} from "./periods.js";
import {coachingInsights} from "./coaching-insights.js";
import { summarize, playerStatistics } from "./analysis.js";
import { isShot } from "./domain.js";
import { shotLocationAnalysis } from "./shot-location-analysis.js";

export const ANALYSIS_SCOPES = ["H1", "H2", "ET1", "ET2", "FULL_MATCH"];
export function analysisForScope(match, scope = "H1") {
  if (!ANALYSIS_SCOPES.includes(scope))
    throw new Error("Unknown analysis scope");
  const events = validAnalysisEvents(match).filter(
    (event) =>
      scope === "FULL_MATCH" || event.half === periodNumber(scope),
  );
  const shots = events.filter((e) => e.team === "our" && isShot(e));
  const { zones, invalidTwoPointers } = shotLocationAnalysis(events);
  const data = {
    events,
    shots,
    zones,
    invalidTwoPointers,
    our: summarize(events, "our"),
    opposition: summarize(events, "opposition"),
    contributors: playerStatistics(match, "our", {events}).filter(
      (p) =>
        p.successful ||
        p.defensiveBlocks ||
        p.kickoutMarks ||
        p.kickoutPossessionsWon ||
        p.turnoversWon ||
        p.turnoversLost ||
        p.interceptions,
    ),
  };
  const insights=coachingInsights(match,{scope});
  const contributors=data.contributors.map(p=>({...p}));
  for(const g of insights.players.filter(g=>g.ref.team==="our")){
    const saves=g.categories.get('saves')?.size||0,retained=g.categories.get('retained goalkeeper kickouts')?.size||0,wins=g.categories.get('kickout wins')?.size||0;
    if(!saves&&!retained&&!wins)continue;
    let p=contributors.find(p=>g.ref.matchPlayerId?p.matchPlayerId===g.ref.matchPlayerId:p.number===String(g.ref.jerseyNumber));
    if(!p){p={...summarize([],"our"),number:String(g.ref.jerseyNumber??'—'),name:g.ref.name||g.ref.nameSnapshot||'',matchPlayerId:g.ref.matchPlayerId};if(g.ref.team==='our')contributors.push(p);}
    if(g.ref.team==='our'){p.recordedSaves=saves;p.retainedKeeperKickouts=retained;p.recordedKickoutWins=wins;}
  }
  return {...data,contributors,coachingInsights:insights,observations:insights.observations.filter(o=>o.presentation==='summary')};
}

// Compatibility wrapper: existing H1 callers keep the same event-derived results.
export function halfTimeAnalysis(match) {
  return analysisForScope(match, "H1");
}
export function periodComparison(match) {
  return Object.fromEntries(
    ANALYSIS_SCOPES.map((scope) => [scope, analysisForScope(match, scope)]),
  );
}
