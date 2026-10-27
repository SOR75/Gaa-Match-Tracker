import { numberedPlayerRows, playerNumberToken } from "./numbered-rows.js";
import { candidate, POSITIONS } from './import-parser.js';
const median=xs=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];

// Image evidence: repeated rings, not a template of jersey values or player names.
// Work at a bounded resolution; sample inner/outer rings to reject filled shapes.
export function findNumberRings(source) {
 const scale=Math.max(source.width,source.height)/1024;
 const w=Math.floor(source.width/scale),h=Math.floor(source.height/scale);
 const small=document.createElement('canvas');small.width=w;small.height=h;
 small.getContext('2d').drawImage(source,0,0,w,h);
 const pixels=small.getContext('2d').getImageData(0,0,w,h).data;
 const ink=new Uint8Array(w*h),thick=new Uint8Array(w*h);
 for(let i=0;i<ink.length;i++)ink[i]=(pixels[i*4]+pixels[i*4+1]+pixels[i*4+2])/3<110?1:0;
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
  let yes=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)yes|=ink[(y+dy)*w+x+dx];thick[y*w+x]=yes;
 }
 const found=[];
 for(let r=8;r<=15;r++){
  const offsets=Array.from({length:48},(_,i)=>{const a=i*Math.PI/24;return [Math.round(Math.cos(a)*r),Math.round(Math.sin(a)*r),Math.round(Math.cos(a)*r*1.4),Math.round(Math.sin(a)*r*1.4)];});
  const scores=new Float32Array(w*h);
  for(let y=22;y<h-22;y++)for(let x=22;x<w-22;x++){
   let ring=0,outer=0;for(const [dx,dy,ox,oy] of offsets){ring+=thick[(y+dy)*w+x+dx];outer+=thick[(y+oy)*w+x+ox];}
   if(ring>=36 && outer<30)scores[y*w+x]=(ring-outer*.5)/48;
  }
  for(let y=22;y<h-22;y++)for(let x=22;x<w-22;x++){
   const value=scores[y*w+x];if(value<.75)continue;
   let peak=true;for(let dy=-6;dy<=6 && peak;dy++)for(let dx=-6;dx<=6;dx++)if(scores[(y+dy)*w+x+dx]>value){peak=false;break;}
   if(peak)found.push({x:x*scale,y:y*scale,r:r*scale,score:value});
  }
 }
 found.sort((a,b)=>b.score-a.score || a.y-b.y || a.x-b.x);
 const unique=[];
 for(const p of found)if(!unique.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<p.r*.95))unique.push(p);
 return unique;
}
const turnPoint=(p,turn,w,h)=>turn===0?{...p}:turn===1?{...p,x:h-p.y,y:p.x}:turn===2?{...p,x:w-p.x,y:h-p.y}:{...p,x:p.y,y:w-p.x};
export function numberColumns(points) {
 const groups=[];const seen=new Set();
 for(let i=0;i<points.length;i++){
  if(seen.has(i))continue;const queue=[i],group=[];seen.add(i);
  for(let k=0;k<queue.length;k++){
   const a=points[queue[k]];group.push(a);
   for(let j=0;j<points.length;j++)if(!seen.has(j)){
    const b=points[j],r=(a.r+b.r)/2,dy=Math.abs(a.y-b.y);
    if(Math.abs(a.x-b.x)<r*2.1 && dy>r*1.2 && dy<r*4){seen.add(j);queue.push(j);}
   }
  }
  if(group.length>=6 && Math.max(...group.map(p=>p.y))-Math.min(...group.map(p=>p.y))>median(group.map(p=>p.r))*8)groups.push(group.sort((a,b)=>a.y-b.y));
 }
 return groups.sort((a,b)=>median(a.map(p=>p.x))-median(b.map(p=>p.x)));
}
export function rotateCanvas(source,turn) {
 if(!turn)return source;
 const canvas=document.createElement('canvas');canvas.width=turn%2?source.height:source.width;canvas.height=turn%2?source.width:source.height;
 const c=canvas.getContext('2d');if(turn===1)c.translate(canvas.width,0);if(turn===2)c.translate(canvas.width,canvas.height);if(turn===3)c.translate(0,canvas.height);c.rotate(turn*Math.PI/2);c.drawImage(source,0,0);return canvas;
}
// Handwriting may be unreadable to the bundled printed-text model. Geometry can
// retain a row; it never supplies its number or a guessed spelling.
export function usefulHandwriting(text,words=[]) {
 const cleaned=text.replace(/[’‘]/g,"'").replace(/^[^\p{L}]+|[^\p{L}' .-]+$/gu,'').replace(/\s+/g,' ').trim();
 const tokens=cleaned.split(' ');
 if(tokens.length<1 || tokens.length>6 || /[\d{}|\\<>]/.test(cleaned) || !/^[\p{L}' .-]+$/u.test(cleaned))return '';
 if(tokens.filter(t=>/\p{L}{2}/u.test(t)).length<1 || !/[aeiouáéíóúy]/i.test(cleaned))return '';
 const letters=words.filter(w=>/\p{L}{2}/u.test(w.text));
 if(!letters.length || Math.min(...letters.map(w=>w.confidence))<(tokens.length===1?85:45))return '';
 return cleaned;
}
export function notebookCandidate(reads,numberReads,anchor) {
 const trusted=anchor && playerNumberToken(anchor.text) && anchor.confidence>=85;
 const allReads=trusted?[...numberReads,{text:playerNumberToken(anchor.text),words:[anchor]}]:numberReads;
 const confident=allReads.filter(r=>playerNumberToken(r.text) && r.words.length && Math.min(...r.words.map(w=>w.confidence))>=85);
 const distinct=[...new Set(confident.map(r=>playerNumberToken(r.text)))];
 const number=distinct.length===1 && (trusted || confident.length>=(anchor?2:3))?distinct[0]:'';
 const scored=reads.map(r=>({...r,name:usefulHandwriting(r.text,r.words),score:r.words.filter(w=>/\p{L}{2}/u.test(w.text)).length?Math.min(...r.words.filter(w=>/\p{L}{2}/u.test(w.text)).map(w=>w.confidence)):0})).filter(r=>r.name).sort((a,b)=>b.score-a.score);
 const name=scored[0]?.name || '';
 // A supported number region can remain blank when neither field is readable.
 const role=number ? +number<=15?'starter':'substitute':'panel';
 return candidate(number,name,role,number && +number<=15?POSITIONS[+number-1]:'',`Number/name row · Review name · Review jersey${!number?' and Starter/Sub':''} · name OCR ${Math.round(scored[0]?.score||0)}/100${number?' · jersey OCR '+Math.round(Math.max(...confident.map(r=>Math.min(...r.words.map(w=>w.confidence)))))+'/100':''}${!name?' · no useful name transcription; left blank':''} · number/name row; verify photograph`);
}
export async function detectNotebook(source, words=[], alternateWords=[]) {
 const primary=numberedPlayerRows(words), alternate=numberedPlayerRows(alternateWords);
 const count=columns=>columns.reduce((n,c)=>n+c.length,0);
 const numbered=count(alternate)>count(primary)?alternate:primary;
 if(numbered.length)return {turn:0,canvas:source,columns:numbered,evidence:'ocr-number'};
 const points=findNumberRings(source);if(points.length<6)return null;
 const options=[];
 for(let turn=0;turn<4;turn++){
  const columns=numberColumns(points.map(p=>turnPoint(p,turn,source.width,source.height)));if(!columns.length)continue;
  const canvas=rotateCanvas(source,turn),ctx=canvas.getContext('2d');let direction=0;
  // Compare adjacent paper fields, not the angle of a whole-page OCR sentence.
  for(const column of columns)for(const p of column){
   const r=p.r,width=Math.round(r*6),height=Math.round(r*1.4),y=Math.max(0,Math.round(p.y-height/2));
   const rightX=Math.round(p.x+r*1.6),leftX=Math.round(p.x-r*1.6-width);
   if(leftX<0||rightX+width>canvas.width||y+height>canvas.height)continue;
   const right=ctx.getImageData(rightX,y,width,height).data,left=ctx.getImageData(leftX,y,width,height).data;
   for(let i=0;i<right.length;i+=4)direction+=(right[i+2]-left[i+2])/(width*height);
  }
  options.push({turn,columns,direction,canvas});
 }
 options.sort((a,b)=>b.direction-a.direction);if(!options.length)return null;
 const best=options[0];
 // Refit on the canonical pixels so 90-degree input copies use the same crop geometry.
 const columns=best.turn?numberColumns(findNumberRings(best.canvas)):best.columns;
 return {...best,columns,evidence:'visual-number-region'};
}
export async function readNotebook({layout,crop,read,worker,onProgress}) {
 const scanWords=[],players=[],regions=[];const source=layout.canvas;
 for(const [ci,column] of layout.columns.entries()){
  const nextX=layout.columns[ci+1]?Math.min(...layout.columns[ci+1].map(p=>p.x-p.r*1.5)):source.width;
  for(const [ri,p] of column.entries()){
   onProgress(`Reading handwritten row ${players.length+1}`);
   const gap=Math.min(ri? p.y-column[ri-1].y : p.r*2.4, column[ri+1]?column[ri+1].y-p.y:p.r*2.4);
   const start=p.nameStart ?? p.x+p.r*1.4;
   const right=Math.min(p.nameRight ?? nextX,nextX);
   const box=[start,p.y-gap*.45,Math.max(p.r*2,Math.min(gap*14,right-start-p.r*.4)),gap*.9];
   const numberBox=p.numberBox ?? [p.x-p.r,p.y-p.r,p.r*2,p.r*2];
   await worker.setParameters({tessedit_char_whitelist:'0123456789'});
   // Ring masking applies only to a visual ring hint, never a plain number.
   const numberCanvas=p.kind?.startsWith('ocr-number')?crop(source,...numberBox):notebookNumberCrop(crop(source,...numberBox));
   const numberClean=cleanNotebookCrop(numberCanvas);
   const numberReads=[await read(numberCanvas,'7'),await read(numberCanvas,'13'),await read(numberClean,'7'),await read(numberClean,'13')];
   await worker.setParameters({tessedit_char_whitelist:''});
   const nameCanvas=cleanNotebookCrop(crop(source,...box));
   const reads=[...(p.names?[{text:p.names.map(w=>w.text).join(' '),words:p.names}]:[]),await read(nameCanvas,'7'),await read(nameCanvas,'13')];
   const player=notebookCandidate(reads,numberReads,p.word);
   player.confidence+=` · Source column ${ci+1}, row ${ri+1}`;
   players.push(player);regions.push({column:ci,row:ri,anchor:p,box,numberBox,reads,numberReads});
  }
 }
 return {text:'',words:scanWords,players,diagnostics:{layout:'number-anchored-player-list',evidence:layout.evidence,rotation:layout.turn*90,regions}};
}

export function cleanNotebookCrop(source) {
 const w=source.width,h=source.height,ctx=source.getContext('2d'),image=ctx.getImageData(0,0,w,h);
 const gray=new Float32Array(w*h),sum=new Float64Array((w+1)*(h+1));
 for(let y=0;y<h;y++){let row=0;for(let x=0;x<w;x++){const i=y*w+x;gray[i]=(image.data[i*4]+image.data[i*4+1]+image.data[i*4+2])/3;row+=gray[i];sum[(y+1)*(w+1)+x+1]=sum[y*(w+1)+x+1]+row;}}
 const radius=Math.max(8,Math.round(h*.4)),bits=new Uint8Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const x1=Math.max(0,x-radius),x2=Math.min(w,x+radius+1),y1=Math.max(0,y-radius),y2=Math.min(h,y+radius+1);
  const mean=(sum[y2*(w+1)+x2]-sum[y1*(w+1)+x2]-sum[y2*(w+1)+x1]+sum[y1*(w+1)+x1])/((x2-x1)*(y2-y1));bits[y*w+x]=gray[y*w+x]<mean*.78?1:0;
 }
 // Remove long notebook ruling, without deleting connected name strokes.
 for(let y=0;y<h;y++){let start=0;for(let x=0;x<=w;x++)if(x===w||!bits[y*w+x]){if(x-start>Math.max(50,w*.22))for(let j=start;j<x;j++)bits[y*w+j]=0;start=x+1;}}
 for(let i=0;i<bits.length;i++)image.data[i*4]=image.data[i*4+1]=image.data[i*4+2]=bits[i]?0:255;
 const pad=Math.ceil(h*.3),canvas=document.createElement('canvas');canvas.width=w+pad*2;canvas.height=h+pad*2;const c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,canvas.width,canvas.height);
 const clean=document.createElement('canvas');clean.width=w;clean.height=h;clean.getContext('2d').putImageData(image,0,0);c.drawImage(clean,pad,pad);return canvas;
}

export function notebookNumberCrop(source) {
 const c=document.createElement('canvas');c.width=source.width;c.height=source.height;const ctx=c.getContext('2d');ctx.drawImage(source,0,0);
 const image=ctx.getImageData(0,0,c.width,c.height);
 for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(Math.hypot((x-c.width/2)/(c.width*.43),(y-c.height/2)/(c.height*.43))>1){const i=(y*c.width+x)*4;image.data[i]=image.data[i+1]=image.data[i+2]=255;}
 ctx.putImageData(image,0,0);return c;
}

