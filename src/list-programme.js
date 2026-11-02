import { candidate, POSITIONS } from './import-parser.js';
import { isSubs, isFooter, isMetadata, plausibleName, numberedEntries } from './programme-parser.js';
import { beforeProgrammeSection } from './programme-integrity.js';

// A substantial column establishes an ordered list; it is not a filter that
// discards credible entries at another indentation or on the Subs heading line.
export function readNumberedList(words) {
  const lines = [];
  for (const word of [...words].sort((a,b)=>a.y+a.h/2-b.y-b.h/2)) {
    let line=lines.find(l=>Math.abs(l.cy-word.y-word.h/2)<Math.min(l.h,word.h)*0.45);
    if(!line) lines.push(line={cy:word.y+word.h/2,h:word.h,words:[]});
    line.words.push(word);
  }
  lines.sort((a,b)=>a.cy-b.cy);
  const numberToken = text => /^0?\d{1,2}[.)]?$/.test(text) && +text.replace(/[.)]/g,'')>=1 && +text.replace(/[.)]/g,'')<=99;
  const textOf = line => line.words.slice().sort((a,b)=>a.x-b.x).map(w=>w.text).join(' ');
  const entries=[];
  const usedNames=new Set();
  for (const line of lines) {
    const ws=line.words.sort((a,b)=>a.x-b.x),text=textOf(line),n=ws[0];
    if(isFooter(text))break;
    if(!numberToken(n.text))continue;
    const pairs=numberedEntries(text);
    if(pairs.length && ws.length>=3){entries.push({line,n,pairs,score:Math.min(...ws.map(w=>w.confidence))});continue;}
    // An isolated real number can sit above its name. Never reach across the
    // next numbered row or borrow from document metadata/another player.
    if(ws.length!==1 || n.confidence<85)continue;
    const next=lines.find(l=>l.cy>line.cy && l.cy-line.cy<=n.h*3.5);
    if(!next || usedNames.has(next))continue;
    const name=textOf(next),nw=next.words,first=nw[0],last=nw.at(-1);
    if(isMetadata(name)||!plausibleName(name)||nw.length<2||nw.some(w=>numberToken(w.text)))continue;
    const centered=Math.abs(n.x+n.w/2-(first.x+last.x+last.w)/2)<=Math.max(n.h*1.5,(last.x+last.w-first.x)*0.6);
    const beside=first.x>=n.x-n.h && first.x-n.x<=n.h*4;
    if(!centered&&!beside)continue;
    entries.push({line,n,pairs:[{number:n.text.replace(/[.)]/g,''),name}],score:Math.min(...nw.map(w=>w.confidence),n.confidence)});usedNames.add(next);
  }
  const column=entries.filter(e=>entries.filter(v=>Math.abs(v.n.x-e.n.x)<e.n.h).length>=5);
  if(column.length<5)return null;
  let sub=false;const players=[];
  for(const line of lines){
    let text=textOf(line);
    if(isFooter(text))break;
    if(isSubs(text)){
      sub=true;
      text=text.replace(/^(?:subs(?:titutes)?|replacements?|fir\s+ionaid)\b\s*[:.\-]?\s*/i,'');
      const pairs=numberedEntries(text);
      for(const p of pairs)players.push(candidate(p.number,p.name,'substitute','',`Review required · Number/name pair on Subs line`));
      continue;
    }
    const e=entries.find(e=>e.line===line);if(!e)continue;
    for(const pair of e.pairs){
      const number=String(+pair.number),role=sub||players.length>=15?'substitute':'starter';
      players.push(candidate(number,pair.name,role,role==='starter'?POSITIONS[+number-1]||'':'',`Review required · OCR word score ${Math.round(e.score)}/100${e.score<90?' · uncertain transcription: verify':''}${/^0/.test(e.n.text)?' · leading jersey zero normalized':''}`));
    }
    if(beforeProgrammeSection(text)!==text)break;
  }
  return players;
}
