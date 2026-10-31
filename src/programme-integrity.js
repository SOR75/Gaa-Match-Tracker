// Programme-only structure and review checks. No player/team vocabulary.
const sectionPattern = /\b(?:subs(?:titutes)?|replacements?|fir\s+ionaid|management|managers?|coaches?|coaching|flo|first\s*aid|sponsors?|selectors?|mentors?|physio(?:therapist)?|medical|backroom|officials?|extended\s+panel|programme\s+sponsored)\b\s*[:.\-]?/i;
export const programmeSectionWord = text => sectionPattern.test(String(text));
export function beforeProgrammeSection(text) {
  return String(text).split(sectionPattern)[0].trim();
}
export function programmeBounds(words, { left = -Infinity, right = Infinity, after = -Infinity } = {}) {
  const local = words.filter(w => w.x >= left && w.x < right && w.y > after);
  const sub = local.filter(w => /^(?:subs(?:titutes)?|replacements?|fir\s+ionaid)\b/i.test(w.text));
  // A clipped heading is supporting evidence only inside an established grid's
  // lower block; do not promote arbitrary OCR fragments into document metadata.
  const footer = local.filter(w => /^(?:[\W_]*(?:management|managers?|coaches?|coaching|flo|first\s*aid|sponsors?|selectors?|mentors?|medical|backroom|officials?|extended\s+panel)|programme\s+sponsored)\b/i.test(w.text) || (w.x < left + (right-left)*0.12 && /^[^\p{L}]*[a-z]*agement\s*:/iu.test(w.text)));
  const subsY = Math.min(...sub.map(w => w.y), Infinity);
  const footerY = Math.min(...footer.filter(w => w.y >= subsY || !Number.isFinite(subsY)).map(w => w.y), Infinity);
  const label=footer.filter(w=>w.y===footerY).sort((a,b)=>a.x-b.x)[0];
  let footerSlope=0,footerX=label?.x||0;
  if(label){
    const line=local.filter(w=>w.x>=label.x && w.y>=label.y && w.y<label.y+label.h*0.85 && /\p{L}/u.test(w.text));
    if(line.length>=3){
      const meanX=line.reduce((s,w)=>s+w.x,0)/line.length,meanY=line.reduce((s,w)=>s+w.y,0)/line.length;
      const den=line.reduce((s,w)=>s+(w.x-meanX)**2,0);
      if(den>label.h**2*20)footerSlope=Math.max(-0.12,Math.min(0.12,line.reduce((s,w)=>s+(w.x-meanX)*(w.y-meanY),0)/den));
    }
  }
  return { subsY, footerY, footerSlope, footerX };
}
export function programmeReadQuality(read) {
  const text = read.text || "";
  if (programmeSectionWord(text)) return -1;
  const words = read.words.filter(w => /\p{L}/u.test(w.text) && !/^\((?:C|VC)\)$/i.test(w.text));
  if (!words.length) return -1;
  const meaningful = words.filter(w => /\p{L}{2}/u.test(w.text)).length;
  return words.reduce((s,w)=>s+w.confidence*w.text.length,0)/words.reduce((s,w)=>s+w.text.length,0) - (meaningful<2 ? 20 : 0);
}
// Preserve an observed complete word over a compatible clipped regional read.
// Never fuzzy-merge or supply letters not present in the source word boxes.
export function completeSpatialRead(best, reads) {
  const tokens = s => beforeProgrammeSection(s).trim().split(/\s+/);
  return reads.find(r => r.spatial && r.words.every(w=>w.confidence>=85) && tokens(r.text).length === tokens(best.text).length && tokens(r.text).every((t,i)=>t.toLowerCase().startsWith(tokens(best.text)[i].toLowerCase())) && r.text.length>best.text.length) || best;
}
// A bounded crop can recover the beginning of a word missed at a page edge.
// Require that actual full first-word box to score >=85 and all remaining name
// tokens to agree with independently observed spatial words. No dictionary.
export function completePrefixRead(best, reads) {
  const words = value => String(value).trim().split(/\s+/).map(t=>t.replace(/^[^\p{L}]+|[^\p{L}]+$/gu,'')).filter(Boolean);
  const base=words(best.text);
  if(base.length<2)return best;
  const longer=reads.find(r=>{
    const full=words(r.text);
    return full.length===base.length && full[0].length>base[0].length && full[0].toLocaleLowerCase().endsWith(base[0].toLocaleLowerCase()) &&
      full.slice(1).every((t,i)=>t.toLocaleLowerCase()===base[i+1].toLocaleLowerCase()) &&
      r.words.some(w=>words(w.text)[0]===full[0] && w.confidence>=85);
  });
  return longer ? {...longer, prefixRestored:true} : best;
}
export const MATCH_DAY_LIMIT = 30;
const namedMatchDayPlayer = p => p.role !== "panel" && String(p.name || "").trim();
// This limits the named match-day selection, not the permanent squad or jersey
// range. Retain overflow separately so it is visible rather than silently lost.
export function limitMatchDayCandidates(players) {
  let count = 0;
  const excluded = [];
  const kept = players.filter(p => {
    if (!namedMatchDayPlayer(p) || ++count <= MATCH_DAY_LIMIT) return true;
    excluded.push(p);
    return false;
  });
  return { players: kept, excluded };
}
export function assertMatchDayCapacity(players, existing = []) {
  if ([...existing, ...players].filter(namedMatchDayPlayer).length > MATCH_DAY_LIMIT)
    throw Error("Maximum 30 named match-day players. Remove extra selected rows or mark extended members as Panel · not selected.");
}
export function programmeRowWarnings(players, { programme = false } = {}) {
  const numbers = new Map(), names = new Map();
  players.forEach((p,i) => {
    if (p.number) { const k=String(+p.number); numbers.set(k,[...(numbers.get(k)||[]),i]); }
    const key=String(p.name||'').trim().normalize('NFC').toLocaleLowerCase().replace(/\s+/g,' ');
    if(key) names.set(key,[...(names.get(key)||[]),i]);
  });
  const numberedStarters=players.filter(p=>p.role==='starter' && +p.number>=1 && +p.number<=15).length;
  return players.map((p,i) => {
    const warnings=[],label=p.number?`#${p.number}`:`Row ${i+1}`,name=String(p.name||'').trim();
    const key=name.normalize('NFC').toLocaleLowerCase().replace(/\s+/g,' ');
    if(p.number && numbers.get(String(+p.number)).length>1) warnings.push(`Duplicate jersey #${+p.number} — correct or remove the conflicting row.`);
    if(key && names.get(key).length>1) warnings.push(`${label} ${name}: duplicate name — verify both rows; no players have been merged.`);
    if(programmeSectionWord(name))warnings.push(`${label}: section text inside player name — review name.`);
    if(programme && p.role==='starter'&&!p.number&&numberedStarters>=8)warnings.push(`${label} ${name}: starter jersey missing in numbered formation — review jersey.`);
    const score=String(p.confidence||'').match(/(?:word score|confidence)\s*(\d+)\s*\//i);
    if(name && (/Review name:/i.test(p.confidence||'') || (score && +score[1]<60) || /(?:^|\s)[a-z](?:\s|$)/.test(name) || (score && name.split(/\s+/).length<2)))warnings.push(`${label} ${name}: possibly truncated/low-confidence name — verify against photo.`);
    if(!name && /Review name|name unresolved/i.test(p.confidence||''))warnings.push(`${label}: player name unresolved — review name.`);
    if(/ambiguous (?:player|name|association)|association uncertain/i.test(p.confidence||''))warnings.push(`${label} ${name}: ambiguous player association — review against photo.`);
    if(p.role==='substitute'&&!p.number)warnings.push(`${label} ${name}: substitute jersey unreadable — review jersey; no number inferred.`);
    return warnings;
  });
}
export function programmeReviewWarnings(players, options) {
  return [...new Set(programmeRowWarnings(players,options).flat())];
}
// Only the traditional printed programme route uses this display policy. OCR
// scores are evidence, not guarantees; unchanged universal confirmation remains.
export function programmeConfidence(number, name, score, { uncertainNumber=false }={}) {
  const useful=String(name||'').trim().split(/\s+/).filter(w=>/\p{L}{2}/u.test(w));
  const issues=[];
  if(!number || uncertainNumber)issues.push("Review jersey: unreadable; left blank");
  if(!name || useful.length<2 || Math.round(score)<85 || /(?:^|\s)[a-z](?:\s|$)/.test(name))issues.push("Review name: uncertain transcription");
  return `${issues.length ? 'Review required · '+issues.join(' · ')+' · ' : ''}OCR word score ${Math.max(0,Math.round(score))}/100 · ${issues.length ? 'verify against source' : 'Number/name pair'}`;
}

// Name fragments at a wrapped line's left edge still belong to the substitute
// block even when their leading jersey was cropped or not read. Return evidence
// boxes only; never fill the absent number from the sequence.
export function substitutePrefixes(words, anchors, height) {
  const rows=[];
  let row=null,previous=null;
  for(const n of anchors.slice().sort((a,b)=>(a.order||+a.text)-(b.order||+b.text))) {
    if(!row || n.x < previous.x-height*2 || n.y-previous.y>height*2.2)rows.push(row={numbers:[]});
    row.numbers.push(n);previous=n;
  }
  return rows.flatMap(row=>{
    const first=row.numbers.slice().sort((a,b)=>a.x-b.x)[0];
    const prefix=words.filter(w=>w.x+w.w<=first.x && Math.abs(w.y+w.h-first.y-first.h)<height*0.6 && /\p{L}{2}/u.test(w.text) && !programmeSectionWord(w.text));
    return prefix.length>=2?[{anchor:first,words:prefix.sort((a,b)=>a.x-b.x)}]:[];
  });
}
