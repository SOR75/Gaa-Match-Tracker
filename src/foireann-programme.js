import { candidate, POSITIONS } from "./import-parser.js";
import { plausibleName } from "./programme-parser.js";

const median = xs => [...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
const cy = w => w.y + w.h / 2;
const dateLike = text => /^\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4}$/.test(text) || /^\d{3,4}\/\d{4}$/.test(text);
const jersey = text => /^0?\d{1,2}[.)]?$/.test(text.trim()) && +text.replace(/[.)]/g, "") >= 1 && +text.replace(/[.)]/g, "") <= 99 ? String(+text.replace(/[.)]/g, "")) : "";
export const cleanFoireannName = text => text.replace(/[’‘]/g,"'").replace(/\b(\p{Lu}')\s+(?=\p{L})/gu,"$1").replace(/\s+[.,;|~{}\[\]\-]+\s*$/g, "").replace(/\s+/g," ").trim().replace(/(^|\s)(\p{Ll})/gu,(_,space,letter)=>space+letter.toUpperCase());
const nameWords = words => words.filter(w=>/\p{L}/u.test(w.text) && !/\d/.test(w.text));
const score = words => words.length ? Math.min(...words.map(w=>w.confidence)) : 0;

// Repeated DOB + member-ID rows establish this bilingual roster layout. Names,
// jersey order, team vocabulary and exact image coordinates are never templates.
export function detectFoireannRows(words) {
  const footer = Math.min(...words.filter(w=>/^(?:bainisteoiri?|management|coaches?|officials?|flo)$/i.test(w.text.normalize("NFD").replace(/\p{M}/gu,""))).map(w=>w.y),Infinity);
  const details = words.filter(w=>w.y<footer && dateLike(w.text)).map(date=>{
    const id=words.filter(w=>/^\d{5,10}$/.test(w.text) && w.x>date.x+date.w && w.x<date.x+date.w+date.h*4 && Math.abs(cy(w)-cy(date))<date.h).sort((a,b)=>a.x-b.x)[0];
    return id ? {date,id} : null;
  }).filter(Boolean);
  if(details.length<6)return null;
  const h=median(details.map(r=>r.date.h));
  const columns=[];
  for(const r of details.sort((a,b)=>a.date.x-b.date.x)){
    let column=columns.find(c=>Math.abs(c.x-r.date.x)<h*3);
    if(!column)columns.push(column={x:r.date.x,rows:[]});
    column.rows.push(r);column.x=median(column.rows.map(v=>v.date.x));
  }
  const selected=columns.filter(c=>c.rows.length>=3).sort((a,b)=>a.x-b.x);
  if(selected.length!==2 || selected[1].x-selected[0].x<h*12)return null;
  for(const c of selected)c.rows.sort((a,b)=>a.date.y-b.date.y);
  return {columns:selected,height:h};
}

export function redNumberCanvas(source, box) {
  const [x,y,w,h]=box;
  const raw=document.createElement('canvas');raw.width=Math.ceil(w);raw.height=Math.ceil(h);
  const ctx=raw.getContext('2d');ctx.drawImage(source,x,y,w,h,0,0,raw.width,raw.height);
  const image=ctx.getImageData(0,0,raw.width,raw.height);let ink=0;
  for(let i=0;i<image.data.length;i+=4){const r=image.data[i],g=image.data[i+1],b=image.data[i+2];const red=r-g>22 && r-b>20;const value=red?0:255;if(red)ink++;image.data[i]=image.data[i+1]=image.data[i+2]=value;}
  ctx.putImageData(image,0,0);
  const canvas=document.createElement('canvas');canvas.width=raw.width*4+40;canvas.height=raw.height*4+40;
  const context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(raw,20,20,raw.width*4,raw.height*4);
  return {canvas,ink};
}

export async function readFoireannProgramme({layout,scan,detailScan,source,normalized,crop,read,worker,onProgress}) {
  const players=[],regions=[];const h=layout.height;
  for(const [ci,column] of layout.columns.entries()) {
    const right=layout.columns[ci+1] ? layout.columns[ci+1].x-h*7 : source.width-h;
    for(const [ri,row] of column.rows.entries()) {
      onProgress(`Reading bilingual team-sheet player ${players.length+1}`);
      const {date,id}=row;
      const previous=column.rows[ri-1],next=column.rows[ri+1];
      const pitch=Math.min(date.y-(previous?.date.y ?? date.y-h*4), (next?.date.y ?? date.y+h*4)-date.y);
      const top=Math.max(0,date.y-Math.min(pitch*.65,h*2.3));
      const bottom=Math.min(next ? next.date.y-pitch*.55 : source.height,date.y+h*2.05);
      const nameX=id.x+id.w+h*.25;
      const nameBox=[nameX,date.y-h*.3,right-nameX,bottom-(date.y-h*.3)];
      const rawWords=scan.words.filter(w=>w.x>=nameX && w.x+w.w<=right && cy(w)>=date.y && cy(w)<=date.y+h*1.85);
      const reads=[{text:rawWords.sort((a,b)=>a.x-b.x).map(w=>w.text).join(' '),words:rawWords,kind:'full scan'},
        {...await read(crop(source,...nameBox),'7'),kind:'English detail crop'},
        {...await read(crop(normalized,...nameBox),'7'),kind:'normalized English detail crop'}];
      const valid=reads.filter(r=>plausibleName(cleanFoireannName(r.text)) && nameWords(r.words).length>=2 && !/[\d/]/.test(r.text));
      valid.sort((a,b)=>score(nameWords(b.words))-score(nameWords(a.words)));
      let chosen=valid[0], english=!!chosen && score(nameWords(chosen.words))>=65;
      if(!english){
        const registered=scan.words.filter(w=>w.x>=date.x-h && w.x+w.w<=right && cy(w)>=top && cy(w)<date.y-h*.3 && /\p{L}/u.test(w.text)).sort((a,b)=>a.x-b.x);
        const registeredBox=[date.x-h*.4,top,right-date.x+h*.4,date.y-top-h*.15];
        const fallback=[{text:registered.map(w=>w.text).join(' '),words:registered,kind:'registered name'}, {...await read(crop(source,...registeredBox),'7'),kind:'registered name crop'}].filter(r=>plausibleName(cleanFoireannName(r.text)));
        fallback.sort((a,b)=>score(nameWords(b.words))-score(nameWords(a.words)));chosen=fallback[0];
      }
      const numberBox=[Math.max(0,date.x-h*4.8),top,h*4.3, date.y+h*.3-top];
      const red=redNumberCanvas(source,numberBox);
      await worker.setParameters({tessedit_char_whitelist:'0123456789'});
      const anchorWords=[...scan.words,...(detailScan?.words || [])].filter(w=>jersey(w.text) && w.x>=numberBox[0] && w.x+w.w<=numberBox[0]+numberBox[2] && cy(w)>=top && cy(w)<=date.y+h*.4);
      const numberReads=anchorWords.map(w=>({text:w.text,words:[w],kind:'full-scan number in entry'}));
      if(red.ink>10)numberReads.push({...await read(red.canvas,'7'),kind:'red ink'});
      numberReads.push({...await read(crop(source,...numberBox),'7'),kind:'number crop'}, {...await read(crop(normalized,...numberBox),'7'),kind:'normalized number crop'});
      await worker.setParameters({tessedit_char_whitelist:''});
      const resolved=resolveFoireannJersey(numberReads);
      const number=resolved.number;
      const clear=numberReads.filter(r=>jersey(r.text)===number && score(r.words)>=85);
      const uncertain=numberReads.filter(r=>jersey(r.text));
      const numberScore=number ? Math.max(...clear.map(r=>score(r.words))) : 0;
      const name=chosen ? cleanFoireannName(chosen.text):'';
      const nameScore=chosen?score(nameWords(chosen.words)):0;
      players.push(foireannPlayer({number, name, nameScore, numberScore, english, possible:uncertain.map(r=>jersey(r.text))}));
      regions.push({column:ci,row:ri,nameBox,numberBox,reads,chosen,numberReads,number,nameScore,numberScore,english});
    }
  }
  for(const p of players) if(p.number && players.filter(other=>other.number===p.number).length>1)p.confidence+=' · duplicate jersey: verify both entries';
  return {...scan,players,diagnostics:{layout:'foireann-bilingual-two-column',regions}};
}

// A number needs a clear read. Corroborating local reads break disagreement;
// equally supported conflicting digits remain blank, never inferred from order.
export function resolveFoireannJersey(reads) {
  const candidates=[...new Set(reads.filter(r=>jersey(r.text) && score(r.words)>=85).map(r=>jersey(r.text)))].map(number=>({number,support:reads.filter(r=>jersey(r.text)===number && score(r.words)>=60).length})).sort((a,b)=>b.support-a.support);
  return candidates.length && (candidates.length===1 || candidates[0].support>candidates[1].support) ? candidates[0] : {number:'',support:0};
}

export function foireannPlayer({number,name,nameScore,numberScore,english,possible=[]}) {
  const role=number ? +number<=15?'starter':'substitute':'panel';
  const confidence=`Review required · ${english?'English detail name':'English name unresolved; registered name retained — verify'} · name OCR ${Math.round(nameScore)}/100 · ${number?`jersey OCR ${Math.round(numberScore)}/100`:'jersey blank/uncertain; verify number and Starter/Sub'}${nameScore<85?' · uncertain name transcription':''}${!number && possible.length?' · possible jersey '+[...new Set(possible)].join('/')+' (not assigned)':''}`;
  return candidate(number,name,role,number && +number<=15?POSITIONS[+number-1]:'',confidence);
}
