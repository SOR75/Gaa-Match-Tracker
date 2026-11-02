// Sparse score checkpoints are evidence, not invented events. Full match analysis
// uses the same detector. A small response need not end a broader scoring swing.
export function scoreTimelineWindows(points,{reversalPoints=3}={}){
 const valid=points.filter(p=>Number.isFinite(p.our)&&Number.isFinite(p.opposition));
 const windows=[];let anchor=0,extreme=0,direction=0;
 const margin=p=>p.our-p.opposition;
 const emit=(from,to)=>{
  if(to<=from)return;
  const group=valid.slice(from,to+1),first=group[0],last=group.at(-1),change=margin(last)-margin(first);
  if(Math.abs(change)<4)return;
  const team=change>0?'our':'opposition',other=team==='our'?'opposition':'our';
  const gained=last[team]-first[team],conceded=last[other]-first[other];
  if(gained<4||gained<conceded)return;
  windows.push({team,from:first,to:last,pointsFor:gained,pointsAgainst:conceded,marginSwing:Math.abs(change),
   unanswered:conceded===0,evidenceIds:group.map(p=>p.id).filter(Boolean),
   evidenceReferences:group.map(p=>p.evidenceReference).filter(Boolean),checkpoints:group,classification:'OBSERVED_SCORE_CHANGE'});
 };
 for(let i=1;i<valid.length;i++){
  if(valid[i].our<valid[i-1].our||valid[i].opposition<valid[i-1].opposition){emit(anchor,extreme);anchor=extreme=i;direction=0;continue;}
  const change=margin(valid[i])-margin(valid[extreme]);
  if(!direction){direction=Math.sign(change);if(direction)extreme=i;continue;}
  if(change*direction>=0){extreme=i;continue;}
  if(Math.abs(change)>=reversalPoints){emit(anchor,extreme);anchor=extreme;extreme=i;direction=-direction;}
 }emit(anchor,extreme);return windows;
}
export function scoreCheckpointAnalysis(points,names={our:'Our team',opposition:'Opposition'}){
 return scoreTimelineWindows(points).map(w=>({
  title:w.unanswered?`${names[w.team]} — ${w.pointsFor} unanswered points`:`${names[w.team]} — ${w.marginSwing}-point margin swing`,
  detail:w.unanswered?`${w.pointsFor} points scored with none conceded between the supplied checkpoints.`:
   `${w.pointsFor} points scored and ${w.pointsAgainst} conceded between the supplied checkpoints.`,
  significance:w.marginSwing*2+(w.unanswered?3:0),window:{from:w.from,to:w.to},
  evidenceIds:w.evidenceIds,evidenceReferences:w.evidenceReferences,metrics:{marginSwing:w.marginSwing,pointsFor:w.pointsFor,pointsAgainst:w.pointsAgainst},
  evidenceType:'SPARSE_SCORE_CHECKPOINTS',limitations:['No original event IDs or possession evidence supplied.'],
 })).sort((a,b)=>b.significance-a.significance);
}
