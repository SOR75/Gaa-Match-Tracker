import {normalTimeMatch,normalTimePending,hasNormalTimeBoundary} from './normal-time.js';
import {matchFlowMarkup} from './match-flow-ui.js';
import {shootoutResultMarkup,shootoutTimeline,shootoutStatsMarkup} from "./shootout-ui.js";
import { goalkeeperCards } from "./goalkeeper-ui.js";
import { analysisForScope, periodComparison } from "./half-time.js";
import { coachingDashboard } from "./coaching-dashboard.js";

export function normalTimeScreen(match,{actions,historical=false}={}){
 const choices=normalTimePending(match)?[
  {label:'Start Extra Time',action:'start-et',primary:true},
  {label:'Finish as Draw',action:'finish-draw'},
 ]:[{label:'Return to Match',view:'live'},{label:'Full-Time Analysis',view:'fulltime'}];
 return fullTimeScreen(match,{normalTime:true,historical,actions:actions??choices});
}
export function fullTimeScreen(match, { actions, historical = false, normalTime=false } = {}) {
  if(normalTime)match=normalTimeMatch(match);
  return `<div class="full-time-view ${normalTime?'normal-time-view':''}" ${normalTime?'data-normal-time-analysis':''}>${shootoutResultMarkup(match)}${coachingDashboard({
    data: analysisForScope(match, "FULL_MATCH"),
    scope: normalTime?"NORMAL_TIME":"FULL_MATCH",
    comparison: periodComparison(match),
    ourTeam: match.setup.ourTeam || "Our team",
    oppositionTeam: match.setup.opposition || "Opposition",
    periodLabel: normalTime?"NORMAL TIME":historical ? "RECORDED MATCH" : "FULL TIME",
    scopeLabel: normalTime?"Normal time · H1 + H2":"Whole match",
    title: normalTime?"Normal-Time Analysis":"Full-Time Analysis",
    scoreLabel: normalTime?"Normal-time score":historical ? "Recorded score" : "Full-time score",
    mapHeading: normalTime?"NORMAL-TIME SHOT MAP":"FULL MATCH SHOT MAP",
    mapLabel: normalTime?"Normal-time shot map":"Full-match shot map",
    contributorsHeading: normalTime?"KEY CONTRIBUTORS — NORMAL TIME":"KEY CONTRIBUTORS — FULL MATCH",
    // All saved shots face their attacking goal at top, independent of half.
    direction: "top",
    actions: actions ?? [
      { label: "Return to Match", view: "live" },
      { label: "Return to Timeline", view: "timeline" },
      ...(hasNormalTimeBoundary(match)?[{label:"Normal-Time Analysis",view:"normaltime"}]:[]),
      {
        label: "VIEW DETAILED MATCH REPORT",
        action: "ft-detailed-report",
        primary: true,
      },
    ],
  })}${matchFlowMarkup(match)}${goalkeeperCards(match)}${match.shootout?shootoutStatsMarkup(match)+shootoutTimeline(match,true):""}</div>`;
}
