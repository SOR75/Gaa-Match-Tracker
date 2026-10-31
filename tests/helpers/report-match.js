import {blankMatch,createEvent,saveEvent} from '../../src/domain.js';
import {createMatchPlayer} from '../../src/identity.js';
import {startingGoalkeepers} from '../../src/goalkeepers.js';
export function reportMatch(pattern='balanced') {
 const m=blankMatch();m.setup={...m.setup,ourTeam:'Harbour Athletic',opposition:'Mountain Rovers',competition:'Review fixture',venue:'Test pitch',date:'2026-10-31',coach:'Review coach'};
 const roster=()=>Array.from({length:26},(_,i)=>createMatchPlayer({number:i+1,name:`Player ${i+1}`,role:i<15?'starter':'substitute',position:'',notes:''}));m.players=roster();m.oppositionPlayers=roster();m.goalkeepers=startingGoalkeepers(m);
 let n=0;const add=(half,type,team='our',patch={})=>{m.clock.half=half;const e={...createEvent(m,type,team),timeMs:(++n%27+1)*60000,...patch};m.events=saveEvent(m.events,e,m);};
 for(const half of [1,2])for(const team of ['our','opposition']){
  for(let i=0;i<10;i++){const scored=pattern==='uneven'?(team==='our'?i<3:i<8):i<6;const type=scored?(i===0?'goal':i===1?'two-point':'point'):'miss';add(half,type,team,{playerNumber:String(10+i%5),shotX:.2+i*.055,shotY:type==='two-point'?.35:i%2?.2:.4,shotSource:i%3===0?'free':'open-play',...(type==='miss'?{missReason:i===8?'blocked':'wide'}:{})});}
  for(let i=0;i<8;i++)add(half,team==='our'?'our-kickout':'opposition-kickout',team,{outcome:i===7?'out-of-play':i<5?'won':'lost',kickoutLength:i%2?'Long':'Short',kickoutPerspective:'our',...(i===1?{mark:true,markPlayerNumber:'8'}:{}),...(i<5?{kickoutWinnerNumber:'8'}:{})});
  add(half,'turnover-won',team,{playerNumber:'4'});add(half,'interception',team,{playerNumber:'6'});
 }
 add(2,'defensive-block','our',{playerNumber:'3'});add(2,'pass','our',{playerNumber:'5',receiverNumber:'7',passType:'kick'});
 m.clock={half:2,elapsedMs:1800000,startedAt:null,completedHalves:{1:1800000}};return m;
}
