import { isMetadata, isFooter, isSubs } from './programme-parser.js';

// Normalise only visible numeric notation. No correction of letters to digits,
// positional jersey assignment, or expected player-number sequence is allowed.
export function playerNumberToken(text) {
 const value=String(text).trim().replace(/^_+|_+$/g,'').replace(/[①-⑳]/g,c=>String(c.codePointAt(0)-0x2460+1));
 const match=value.match(/^(?:\(|\[)?\s*(\d{1,2})\s*[.)\]:]?$/);
 const number=match && +match[1];
 return number>=1 && number<=99?String(number):'';
}
const cy=w=>w.y+w.h/2;
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];

export function numberedPlayerRows(words) {
 const headings=words.filter(w=>/^(?:extended|additional|unselected)$/i.test(w.text.replace(/[^\p{L}]/gu,''))).filter(w=>words.some(v=>/^panel$/i.test(v.text.replace(/[^\p{L}]/gu,'')) && Math.abs(cy(v)-cy(w))<Math.max(w.h,v.h) && v.x>w.x));
 const footer=Math.min(...headings.map(w=>w.y),...words.filter(w=>isFooter(w.text)).map(w=>w.y),Infinity);
 const anchors=[];
 for(const word of words){
  const number=playerNumberToken(word.text);
  if(!number || word.y>=footer)continue;
  // The name must be beside this number, never on a distant formation row.
  // Low-confidence letters are row evidence, not a trusted transcription.
  const names=words.filter(w=>w!==word && w.y<footer && w.x>=word.x+word.w && w.x<word.x+word.w+word.h*28 && Math.abs(cy(w)-cy(word))<Math.max(word.h,w.h)*.75 && /\p{L}/u.test(w.text));
  if(!names.length)continue;
  const text=names.sort((a,b)=>a.x-b.x).map(w=>w.text).join(' ');
  if(isMetadata(text)||isSubs(text)||/[\d/@]/.test(text))continue;
  anchors.push({number,word,names,x:word.x+word.w/2,y:cy(word),r:Math.max(word.h,word.w)/2,kind:'ocr-number',confidence:word.confidence});
 }
 // A repeated margin/number column establishes squad-list structure. Numbers
 // in an isolated date, heading, score or document footer do not establish it.
 const columns=[];
 for(const a of anchors.sort((a,b)=>a.x-b.x)){
  let column=columns.find(c=>Math.abs(median(c.map(p=>p.word.x))-a.word.x)<a.word.h*2.5);
  if(!column)columns.push(column=[]);column.push(a);
 }
 const credible=a=>a.confidence>=85 || (a.names.length>=2 && a.names.every(w=>w.confidence>=65)) || (a.names.length===1 && a.names[0].confidence>=85 && /\p{L}{3}/u.test(a.names[0].text));
 const established=columns.filter(c=>c.length>=2 && c.filter(credible).length>=2);
 return established.map(column=>{
  const ordered=column.sort((a,b)=>a.y-b.y);
  const height=median(ordered.map(a=>a.word.h)),left=median(ordered.map(a=>a.word.x)),width=median(ordered.map(a=>a.word.w));
  const nameLeft=median(ordered.map(a=>Math.min(...a.names.map(w=>w.x))));
  const gaps=ordered.slice(1).map((a,i)=>a.y-ordered[i].y).filter(n=>n>height);
  const gap=median(gaps)||height*3;
  // A name aligned with an established number column can survive when OCR
  // completely misses its jersey. Estimate only the search REGION, never its value.
  for(const word of words.filter(w=>w.y<footer && /\p{L}/u.test(w.text) && w.confidence>=85 && Math.abs(w.x-nameLeft)<height*1.5 && cy(w)>=ordered[0].y-gap*1.2 && cy(w)<=ordered.at(-1).y+gap*1.2)){
   if(column.some(a=>Math.abs(a.y-cy(word))<height))continue;
   const names=words.filter(w=>w.y<footer && w.x>=nameLeft-height*.5 && w.x<nameLeft+height*24 && Math.abs(cy(w)-cy(word))<height*.7 && /\p{L}/u.test(w.text)).sort((a,b)=>a.x-b.x);
   const text=names.map(w=>w.text).join(' ');
   if(!names.length || isMetadata(text)||isSubs(text)||/[\d/@]/.test(text))continue;
   column.push({number:'',word:{text:'',x:left,y:cy(word)-height/2,w:width,h:height,confidence:0},names,x:left+width/2,y:cy(word),r:Math.max(width,height)/2,kind:'ocr-number-region',confidence:0});
  }
  return column.sort((a,b)=>a.y-b.y).map(a=>{
   const nextNumber=anchors.filter(b=>b!==a && b.word.x>a.word.x && Math.abs(b.y-a.y)<a.word.h).sort((b,c)=>b.word.x-c.word.x)[0];
   const names=a.names.filter(w=>!nextNumber || w.x+w.w<nextNumber.word.x);
   return {...a,names,numberBox:numberSearchBox(a.word),nameStart:names[0]?.x ?? a.word.x+a.word.w+a.word.h*.2,nameRight:nextNumber?.word.x};
  });
 }).filter(c=>c.length>=3).sort((a,b)=>a[0].word.x-b[0].word.x);
}

export function numberSearchBox(word) {
 const digits=playerNumberToken(word.text),unit=word.w/(Math.max(1,digits.length)+.6);
 const before=/^[([]/.test(word.text)?unit*.5:0;
 const after=/[)\]]$/.test(word.text)?unit*.5:/[.:]$/.test(word.text)?unit*.3:0;
 return [word.x+before-word.h*.12,word.y-word.h*.2,Math.max(word.h*.4,word.w-before-after)+word.h*.24,word.h*1.4];
}
