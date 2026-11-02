import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {orderedRowAnchors,completeAnchoredNames} from '../src/ordered-list-recovery.js';
import {readNumberedList} from '../src/list-programme.js';
const scans=['original','normalized','block'].map(n=>({words:JSON.parse(readFileSync(new URL(`./fixtures/st-manchans-ordered/${n}-words.json`,import.meta.url),'utf8'))}));
const word=(text,x,y,confidence=96)=>({text,x,y,w:text.length*12,h:40,confidence});
test('actual photograph page tokens expose dropped lower rows: same production recovery finds 25 physical anchors including #1 and blank #16',()=>{
 assert.equal(Math.max(...scans.map(s=>readNumberedList(s.words).length)),16);
 const anchors=orderedRowAnchors(scans);assert.equal(anchors.length,25);assert.equal(anchors[0].text,'1.');assert.equal(anchors[15].text,'16.');assert.equal(anchors.at(-2).text,'54.'); // Raw OCR mistake, NOT an accepted jersey.
 assert.equal(anchors.at(-1).text,'55.52"');
});
test('actual OCR geometry survives scale and translation; no photograph-specific coordinates',()=>{
 const moved=scans.map(s=>({words:s.words.map(w=>({...w,x:w.x*1.5+60,y:w.y*1.5+80,w:w.w*1.5,h:w.h*1.5}))}));assert.deepEqual(orderedRowAnchors(moved).map(w=>w.text),orderedRowAnchors(scans).map(w=>w.text));
});
test('unobserved numbers are never filled from a sequence',()=>{
 const without=scans.map(s=>({words:s.words.filter(w=>w.text!=='16.')}));assert.equal(orderedRowAnchors(without).length,24);assert.equal(orderedRowAnchors(without).some(w=>w.text==='16.'),false);
});
test('non-sequential high starter/low substitute columns retain their actual number anchors and stop at staff',()=>{
 const f=JSON.parse(readFileSync(new URL('./fixtures/programme-structure/vincents-style-ordered.json',import.meta.url)));const anchors=orderedRowAnchors([{words:f.words}]);assert.equal(anchors.length,29);assert.equal(anchors[7].text,'18');assert.equal(anchors[15].text,'7');assert.equal(anchors.some(w=>w.text==='90'),false);
});
test('source footer exclusion includes Physio, management and Extended panel',()=>{
 for(const footer of ['Physio:','Management:','Extended panel']){
  const words=Array.from({length:12},(_,i)=>word(String(i+1),20,100+i*70));words.push(word(footer,20,750));assert.equal(orderedRowAnchors([{words}]).some(w=>w.y>=750),false);
 }
});
test('arbitrary words or a few document numbers cannot establish an ordered recovery route',()=>{
 assert.deepEqual(orderedRowAnchors([{words:[word('Venue',10,10),word('2026',10,70),word('25',10,120)]}]),[]);
});
const anchor={x:20,y:300,w:60,h:40,cy:320},geometry={slope:0};
const regional={text:'Morgan Fr',words:[word('Morgan',10,10),word('Fr',100,10,30)]};
const spatial={words:[word('organ',100,300),word('Friel',180,295)]};
test('completes a clipped source first name/surname only from compatible independently read words in its own bounded row',()=>{
 assert.deepEqual(completeAnchoredNames(anchor,geometry,[spatial],[regional]),[{name:'Morgan Friel',score:96}]);
});
test('never borrows a name from another row or invents a correction from a vocabulary',()=>{
 assert.deepEqual(completeAnchoredNames(anchor,geometry,[{words:spatial.words.map(w=>({...w,y:w.y+200}))}],[regional]),[]);
 assert.deepEqual(completeAnchoredNames(anchor,geometry,[spatial],[{...regional,text:'Megan Fr',words:[word('Megan',10,10),word('Fr',100,10)]}]),[]);
});
test('low-confidence regional first word does not trigger name completion',()=>{
 assert.deepEqual(completeAnchoredNames(anchor,geometry,[spatial],[{...regional,words:[word('Morgan',10,10,84),word('Fr',100,10)]}]),[]);
});
test('source completion preserves multi-word surnames instead of truncating them',()=>{
 const source={words:[word('organ',100,300),word('Grogan',180,295),word('Doyle',280,292)]};assert.equal(completeAnchoredNames(anchor,geometry,[source],[regional])[0].name,'Morgan Grogan Doyle');
});
