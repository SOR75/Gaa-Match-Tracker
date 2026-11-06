// Synthetic print fixtures. TT1/TT2 matches supplied aggregates only: event order,
// players other than #4, locations and TT2 half allocation are test choices,
// NOT a recovered original ledger. Missing source/length values stay blank.
import {flowMatch,addFlow} from './match-flow-match.js';
import {createMatchPlayer} from '../../src/identity.js';
import {completeMatch} from '../../src/history.js';
import {reportMatch} from './report-match.js';
export function ttReference0312(){
 const m=flowMatch({lineup:true});m.setup={...m.setup,ourTeam:'TT1',opposition:'TT2',competition:'Synthetic TT reference — not original',date:'2026-11-05'};
 for(const [half,n,scores]of [[1,9,4],[2,5,4]])for(let i=0;i<n;i++)addFlow(m,i<scores?'point':'miss','our',100+i*100,half,{playerNumber:String(i%2?10:11),shotSource:'',scoreOrigin:'',missReason:i<scores?'':['wide','short','saved','blocked','other'][i%5],shotX:.5,shotY:i%2?.2:.6});
 for(const half of [1,2])for(let i=0;i<2;i++)addFlow(m,'point','opposition',150+i*200,half,{shotSource:'',scoreOrigin:''});
 for(const [half,outcomes]of [[1,['won','won']],[2,['won','lost','lost']]])outcomes.forEach((outcome,i)=>addFlow(m,'our-kickout','our',50+i*400,half,{outcome,kickoutPerspective:'our',kickoutLength:i===0?'Short':i===1&&half===2?'Medium':''}));
 for(let i=0;i<3;i++){addFlow(m,'defensive-block','our',300+i*300,i===0?1:2,{playerNumber:'4'});addFlow(m,'interception','our',310+i*300,i===0?1:2,{playerNumber:'4'});}
 return completeMatch(m,0);
}
export function shortReport0312(){const m=flowMatch();m.setup.competition='Synthetic short report';addFlow(m,'point','our',60);addFlow(m,'point','opposition',120);return m;}
export function heavyReport0312(){
 const m=flowMatch();m.setup.competition='Synthetic data-heavy report';
 for(const team of ['our','opposition']){
  m[team==='our'?'players':'oppositionPlayers']=Array.from({length:30},(_,i)=>createMatchPlayer({number:i+1,name:`Synthetic ${team} Player ${i+1}`,role:i<15?'starter':'substitute',position:'',notes:''}));
  for(let i=1;i<=15;i++){
   addFlow(m,'point',team,60+i*30,1,{playerNumber:String(i),shotX:.25+(i%6)*.08,shotY:.1+(i%4)*.13});
   addFlow(m,'miss',team,65+i*30,1,{playerNumber:String(i),missReason:i%2?'wide':'blocked',shotX:.3+(i%5)*.08,shotY:.2+(i%3)*.16});
   addFlow(m,'substitution',team,20+i*20,2,{playerOn:String(i+15),playerOff:String(i)});
   addFlow(m,'point',team,600+i*30,2,{playerNumber:String(i+15),shotX:.5,shotY:.2,notes:i%5===0?'Synthetic coaching note: recorded evidence retained for the report.':''});
   addFlow(m,'interception',team,605+i*30,2,{playerNumber:String(i+15)});
  }
 }
 return completeMatch(m,0);
}
export const reportCases0312=()=>({short:shortReport0312(),tt:ttReference0312(),normal:reportMatch(),heavy:heavyReport0312()});
