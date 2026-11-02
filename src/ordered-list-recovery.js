import {candidate,POSITIONS} from './import-parser.js';
import {cleanPlayerText} from './programme-geometry.js';
import {readNumberedList} from './list-programme.js';
import {plausibleName,isSubs,isFooter} from './programme-parser.js';
import {programmeBounds} from './programme-integrity.js';
const median=values=>{const s=values.slice().sort((a,b)=>a-b);return s[Math.floor(s.length/2)];};
const digitPrefix=w=>/^\d{1,2}(?:[.)]|$)/.test(w.text);

// Called only after the ordinary list route is established (never a formation
// or Foireann classifier). Low-scoring glyphs locate a reread, not a jersey.
export function orderedRowAnchors(scans) {
 const words=scans.flatMap(s=>s.words),footer=Math.min(programmeBounds(words).footerY,...words.filter(w=>isFooter(w.text)).map(w=>w.y));
 const credible=words.filter(w=>/^\d{1,2}[.)]?$/.test(w.text)&&w.confidence>=85&&+w.text.replace(/\D/g,'')>0&&w.y<footer);
 if(credible.length<8)return [];
 const column=credible.filter(w=>credible.filter(v=>Math.abs(v.x-w.x)<Math.max(w.h,v.h)*2).length>=8);
 if(column.length<8)return [];
 const near=w=>column.slice().sort((a,b)=>Math.abs(a.y-w.y)-Math.abs(b.y-w.y)).slice(0,5);
 const first=Math.min(...column.map(w=>w.y)),last=Math.max(...column.map(w=>w.y)),height=median(column.map(w=>w.h));
 const possible=words.filter(w=>digitPrefix(w)&&w.y>=first-height&&w.y<=last+height*3&&w.y<footer&&Math.abs(w.x-median(near(w).map(v=>v.x)))<median(near(w).map(v=>v.h))*1.3).sort((a,b)=>a.y+a.h/2-b.y-b.h/2);
 const rows=[];
 for(const w of possible){const cy=w.y+w.h/2;const old=rows.find(r=>Math.abs(r.cy-cy)<Math.min(r.h,w.h)*.4);if(!old)rows.push({...w,cy});else if(w.confidence>old.confidence)Object.assign(old,w,{cy});}
 return rows.sort((a,b)=>a.cy-b.cy);
}

// Estimate the local text slope from the actual ink, not a numbered sequence.
// Each bounded strip is independent: the page can bend or slope more at its foot.
function rowGeometry(pixels,width,height,anchor,gap,right) {
 const points=[],left=Math.round(anchor.x+Math.min(anchor.w,anchor.h*2.1)+anchor.h*.2);
 for(let y=Math.max(0,Math.floor(anchor.y-gap*1.7));y<Math.min(height,anchor.y+gap*1.7);y+=3)
  for(let x=Math.round(anchor.x+anchor.h*2.5);x<Math.min(right,anchor.x+anchor.h*15);x+=3)if(pixels[(y*width+x)*4]<100)points.push([x,y]);
 let best={score:0,slope:0};
 for(let step=-30;step<=10;step++){
  const slope=step/100,bins=new Map();
  for(const[x,y]of points){const bin=Math.round((y-slope*(x-anchor.x))/3);bins.set(bin,(bins.get(bin)||0)+1);}
  const score=[...bins.values()].reduce((s,n)=>s+n*n,0);if(score>best.score)best={score,slope};
 }
 return {...best,left};
}
function strip(source,{x,y,w,h,slope=0,origin=x}) {
 const canvas=document.createElement('canvas');canvas.width=Math.ceil(w*2);canvas.height=Math.ceil(h*2);
 const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
 const image=source,scale=1;
 ctx.setTransform(2*scale,-2*slope*scale,0,2*scale,-2*x,2*(-y+slope*origin));ctx.drawImage(image,0,0);return canvas;
}
function lineRead(read,expected,center) {
 const numbers=read.words.filter(w=>/^\d{1,2}[.)]?$/.test(w.text)&&+w.text.replace(/\D/g,'')>=1&&+w.text.replace(/\D/g,'')<=99);
 numbers.sort((u,v)=>Math.abs(u.y+u.h/2-center)-Math.abs(v.y+v.h/2-center));
 const n=numbers[0],number=n?.confidence>=85?String(+n.text.replace(/\D/g,'')):expected;
 const line=read.text.split('\n').find(t=>{const m=t.trim().match(/^(\d{1,2})[.)]?\s+/);return m&&String(+m[1])===number;});
 const name=cleanPlayerText((line||'').replace(/^\s*\d{1,2}[.)]?\s+/,''));
 const tokens=name.toLowerCase().split(/\s+/);
 const named=read.words.filter(w=>tokens.includes(cleanPlayerText(w.text).toLowerCase())&&/\p{L}{2}/u.test(w.text));
 return {number,name,score:named.length?Math.min(...named.map(w=>w.confidence)):0};
}
// Complete a clipped regional surname from a spatially coherent source pair.
// The first name must already be observed in that row: this is exact token/
// suffix agreement, not fuzzy matching or a player-name dictionary.
export function completeAnchoredNames(anchor,geometry,scans,regional) {
 const completed=[];
 for(const r of regional){
  const first=cleanPlayerText(r.text).replace(/^\d+[.)]?\s*/,'').split(/\s+/)[0];
  if(!first||first.length<3)continue;
  const firstWord=r.words.find(w=>cleanPlayerText(w.text).toLowerCase()===first.toLowerCase());
  if(!firstWord||firstWord.confidence<85)continue;
  for(const scan of scans){
   const ws=scan.words.filter(w=>/^\p{L}[\p{L}'’-]*$/u.test(w.text));
   for(const w of ws){
    if(w.text.length<3||!first.toLowerCase().endsWith(w.text.toLowerCase())||w.x<anchor.x+Math.min(anchor.w,anchor.h*1.9)||w.x>anchor.x+anchor.h*6||Math.abs(w.y+w.h/2-geometry.slope*(w.x-anchor.x)-anchor.cy)>anchor.h)continue;
    const following=ws.filter(v=>v.x>=w.x+w.w&&v.x-w.x-w.w<anchor.h*2&&Math.abs(v.y+v.h/2-w.y-w.h/2)<Math.max(v.h,w.h)*.75).sort((a,b)=>a.x-b.x);
    if(!following.length)continue;
    const chain=[following[0]];
    for(const next of ws.filter(v=>v.x>chain[0].x).sort((a,b)=>a.x-b.x)){
     const previous=chain.at(-1),distance=next.x-previous.x-previous.w;
     if(distance<0)continue;
     if(distance>anchor.h*2||Math.abs(next.y+next.h/2-previous.y-previous.h/2)>Math.max(next.h,previous.h)*.75)break;
     chain.push(next);
    }
    completed.push({name:[first,...chain.map(v=>v.text)].join(' '),score:Math.min(firstWord.confidence,w.confidence,...chain.map(v=>v.confidence))});
   }
  }
 }
 return completed;
}
export async function recoverOrderedList({scans,source,normalized,read,onProgress}) {
 const anchors=orderedRowAnchors(scans);if(anchors.length<8||anchors.length<=Math.max(...scans.map(s=>readNumberedList(s.words)?.length||0)))return null;
 const words=scans.flatMap(s=>s.words),pixels=normalized.getContext('2d').getImageData(0,0,source.width,source.height).data;
 const right=Math.min(source.width,Math.max(...words.filter(w=>w.y>=anchors[0].y&&/\p{L}/u.test(w.text)).map(w=>w.x+w.w))+median(anchors.map(a=>a.h))*.5);
 const gaps=anchors.slice(1).map((a,i)=>a.cy-anchors[i].cy),typical=median(gaps),players=[],regions=[];
 // The block pass's already coherent pairs are retained as independent evidence;
 // a damaged normalized page must not replace them just because it has more rows.
 const blockPairs=readNumberedList(scans.at(-1).words)||[];
 for(let i=0;i<anchors.length;i++){
  onProgress(`Checking ordered player row ${i+1}/${anchors.length}`);
  const a=anchors[i],gap=median(gaps.slice(Math.max(0,i-2),i+2))||typical;
  const geometry=rowGeometry(pixels,source.width,source.height,a,gap,right);
  const box={x:a.x-10,y:a.y-a.h*.55,w:Math.min(source.width-a.x+10,right-a.x+20),h:a.h*1.95,slope:geometry.slope,origin:a.x-10};
  const whole=strip(source,box),single=await read(whole,'7'),block=await read(whole,'6');
  const expected=/^\d{1,2}[.)]?$/.test(a.text)&&a.confidence>=85?String(+a.text.replace(/\D/g,'')):'';
  const center=(a.cy-box.y)*2;
  const lineReads=[lineRead(single,expected,center),lineRead(block,expected,center)];
  const number=expected||lineReads.find(r=>r.number)?.number||'';
  const left=a.x+Math.min(a.w,a.h*1.9)+5;
  const nameRead=await read(strip(source,{x:left,y:a.y-a.h*.7,w:right-left,h:a.h*1.8,slope:geometry.slope,origin:a.x}),'7');
  const evidence=lineReads.filter(r=>r.number===number&&plausibleName(r.name));
  const directMatches=blockPairs.filter(p=>p.number===number),direct=directMatches.length===1?directMatches[0]:null;
  if(direct){const score=+(direct.confidence.match(/score (\d+)/)?.[1]||0);evidence.push({name:direct.name,score});}
  const name=cleanPlayerText(nameRead.text);if(plausibleName(name))evidence.push({name,score:Math.min(...nameRead.words.map(w=>w.confidence))});
  evidence.push(...completeAnchoredNames(a,geometry,scans,[single,block,nameRead]));
  const useful=evidence.filter(r=>r.name.split(/\s+/).length>=2&&Number.isFinite(r.score));
  useful.sort((a,b)=>b.score-a.score);
  let best=useful[0];
  // An isolated, confidently observed number is still a row even when there
  // is no usable name. Never borrow the following row's name to fill a blank.
  const nearbyLetters=scans.flatMap(s=>s.words).filter(w=>/\p{L}{2}/u.test(w.text)&&w.x>a.x+Math.min(a.w,a.h*2)&&Math.abs(w.y+w.h/2-geometry.slope*(w.x+w.w/2-a.x)-(a.cy-a.h*.2))<a.h*.65);
  if(!nearbyLetters.length&&(!best||best.score<85))best=null;
  if(!number&&!best)continue;
  const subHeading=words.some(w=>isSubs(w.text)&&w.y<a.y&&w.y>=anchors[0].y);
  const role=subHeading||players.length>=15?'substitute':'starter',different=new Set(useful.map(r=>r.name.toLowerCase())).size>1;
  players.push(candidate(number,best?.name||'',role,role==='starter'&&number?POSITIONS[+number-1]||'':'',`Review required · bounded ordered row · OCR word score ${Math.round(best?.score||0)}/100${!number?' · Review jersey':''}${!best||best.score<85||different?' · Review name':''}`));
  regions.push({anchor:a,single,block,nameRead,geometry});
 }
 return {players,diagnostics:{layout:'numbered-list',recovery:'bounded-row-reads',regions}};
}
