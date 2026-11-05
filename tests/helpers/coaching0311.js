// Deterministic fictional evidence. Never a reconstruction of a field match.
import {flowMatch,addFlow} from './match-flow-match.js';
export function attacking0311(a=12,as=6,b=7,bs=5){
 const m=flowMatch();
 for(const [half,n,scored]of [[1,a,as],[2,b,bs]])for(let i=0;i<n;i++)addFlow(m,i<scored?'point':'miss','our',100+i*100,half,{missReason:i<scored?'':'wide'});
 return m;
}
export function kickout0311(){
 const m=flowMatch();
 for(const [half,length,wins]of [[1,'Short',5],[2,'Long',1]])for(let i=0;i<5;i++)addFlow(m,'our-kickout','our',100+i*100,half,{outcome:i<wins?'won':'lost',kickoutLength:length,kickoutPerspective:'our'});
 addFlow(m,'our-kickout','our',800,2,{outcome:'unknown',kickoutLength:'Long',kickoutPerspective:'our'});return m;
}
export function defence0311(){
 const m=flowMatch({lineup:true});
 for(let i=0;i<4;i++)addFlow(m,'defensive-block','our',100+i*100,1,{playerNumber:String(i<3?4:5)});
 return m;
}
