import { candidate, POSITIONS } from './import-parser.js';
import { isSubs, isFooter, plausibleName } from './programme-parser.js';
// Only a substantial column of number-led, same-baseline names establishes a list.
export function readNumberedList(words) {
  const lines = [];
  for (const word of [...words].sort((a,b)=>a.y+a.h/2-b.y-b.h/2)) {
    let line=lines.find(l=>Math.abs(l.cy-word.y-word.h/2)<Math.min(l.h,word.h)*0.45);
    if(!line) lines.push(line={cy:word.y+word.h/2,h:word.h,words:[]});
    line.words.push(word);
  }
  lines.sort((a,b)=>a.cy-b.cy);
  const entries=lines.map(line=>{
    const ws=line.words.sort((a,b)=>a.x-b.x);
    const n=ws[0];
    if(!/^0?\d{1,2}[.)]?$/.test(n.text)||+n.text.replace(/[.)]/g,'')<1||+n.text.replace(/[.)]/g,'')>99)return null;
    const name=ws.slice(1).map(w=>w.text).join(' ').trim();
    return plausibleName(name)&&ws.length>=3?{line,n,name,ws}:null;
  }).filter(Boolean);
  const column=entries.filter(e=>entries.filter(v=>Math.abs(v.n.x-e.n.x)<e.n.h).length>=5);
  if(column.length<5)return null;
  let sub=false;const players=[];
  for(const line of lines){
    const text=line.words.map(w=>w.text).join(' ');
    if(isFooter(text))break;
    if(isSubs(text)){sub=true;continue;}
    const e=column.find(e=>e.line===line);if(!e)continue;
    const number=String(+e.n.text.replace(/[.)]/g,''));
    const score=Math.min(...e.ws.map(w=>w.confidence));
    players.push(candidate(number,e.name,sub?'substitute':'starter',sub?'':POSITIONS[+number-1]||'',`Review required · OCR word score ${Math.round(score)}/100${score<90?' · uncertain transcription: verify':''}${/^0/.test(e.n.text)?' · leading jersey zero normalized':''}`));
  }
  return players;
}
