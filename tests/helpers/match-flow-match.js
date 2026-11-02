import {blankMatch,createEvent} from '../../src/domain.js';
import {syncPeriod} from '../../src/periods.js';
export function flowMatch({lineup=false}={}){
 const m=blankMatch();m.id='synthetic-flow-match';m.setup={...m.setup,ourTeam:'Harbour',opposition:'Mountain',halfLength:30,matchCode:'LGFA'};
 m.clock=syncPeriod({half:2,elapsedMs:1800000,startedAt:null,completedHalves:{1:1800000,2:1800000}});
 if(lineup)for(const team of ['our','opposition'])m[team==='our'?'players':'oppositionPlayers']=Array.from({length:18},(_,i)=>({id:`${team}-${i+1}`,matchPlayerId:`${team}-${i+1}`,number:i+1,name:`${team} Player ${i+1}`,role:i<15?'starter':'substitute',position:'',notes:'',playerId:null}));
 return m;
}
export function addFlow(m,event,team='our',seconds=1,half=1,extra={}){
 const base=createEvent({...m,clock:{half,elapsedMs:seconds*1000,startedAt:null}},event,team,0);
 const e={...base,id:`synthetic-${m.events.length+1}`,timeMs:seconds*1000,periodElapsedMs:seconds*1000,...extra};m.events.push(e);return e;
}
export function swingMatch(){
 const m=flowMatch();
 for(let i=0;i<6;i++)addFlow(m,'point','our',i*100+10);
 addFlow(m,'point','opposition',1250);
 for(let i=0;i<4;i++){
  addFlow(m,'our-kickout','our',1330+i*50,1,{outcome:'lost',kickoutPerspective:'our',kickoutLength:'Long'});
  addFlow(m,'point','opposition',1350+i*50);
 }
 addFlow(m,'point','opposition',1580); // level at HT
 for(let i=0;i<5;i++)addFlow(m,'point','opposition',30+i*50,2);
 for(let i=0;i<6;i++)addFlow(m,'point','our',640+i*60,2);
 return m;
}
