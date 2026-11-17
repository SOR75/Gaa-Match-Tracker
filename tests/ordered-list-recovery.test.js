import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {orderedRowAnchors,completeAnchoredNames,rereadOrderedJerseys} from '../src/ordered-list-recovery.js';
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

const jerseyWord = {text:'1', x:43, y:721, w:19, h:19};
const jerseyPlayer = {number:'1', name:'Example Player', role:'substitute', position:'', confidence:'Review required'};
const twoGlyphs = [[43,721,7,19], [55,721,7,19]];
const clearReread = {text:'11\n', words:[{text:'11', x:18, w:57, confidence:95}]};

function jerseyHarness(ink, result = clearReread) {
  const calls = [];
  const crop = {getContext: () => ({
    fillRect() {},
    drawImage(_source, ...bounds) { calls.push(['crop', bounds]); },
  })};
  const source = {
    width:1180, height:1400,
    ownerDocument:{createElement: () => crop},
    getContext: () => ({
      getImageData(x, y, width, height) {
        const data = new Uint8ClampedArray(width * height * 4).fill(255);
        for (let row = 0; row < height; row++) {
          for (let col = 0; col < width; col++) {
            if (!ink.some(([left, top, w, h]) => x+col>=left && x+col<left+w && y+row>=top && y+row<top+h)) continue;
            const offset = (row * width + col) * 4;
            data.fill(0, offset, offset + 3);
          }
        }
        return {data};
      },
    }),
  };
  const worker = {async setParameters(params) { calls.push(['parameters', params]); }};
  const read = async (_canvas, mode) => {
    calls.push(['read', mode]);
    if (result instanceof Error) throw result;
    return result;
  };
  return {calls, source, worker, read};
}

test('a complete numbered list retains the source jersey token for its own candidate', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/programme-structure/vincents-style-ordered.json', import.meta.url)));
  const collapsed = fixture.words.find(w => w.text === '11');
  const words = fixture.words.map(w => w === collapsed ? {...w, text:'1'} : w);
  const jerseyWords = [];
  const players = readNumberedList(words, jerseyWords);
  assert.equal(players.length, 29);
  assert.equal(jerseyWords.length, players.length);
  assert.equal(players[17].number, '1');
  assert.equal(jerseyWords[17], words[fixture.words.indexOf(collapsed)]);
});

test('rereads both glyphs of a collapsed 11 in one bounded crop and restores OCR settings', async () => {
  const harness = jerseyHarness(twoGlyphs);
  const players = [jerseyPlayer];
  assert.deepEqual(await rereadOrderedJerseys({players, jerseyWords:[jerseyWord], ...harness}), [
    {...jerseyPlayer, number:'11'},
  ]);
  assert.equal(players[0].number, '1');
  assert.deepEqual(harness.calls, [
    ['parameters', {tessedit_char_whitelist:'0123456789'}],
    ['crop', [43,721,19,19,18,15,57,57]],
    ['read', '7'],
    ['parameters', {tessedit_char_whitelist:'', tessedit_pageseg_mode:'11'}],
  ]);
});

test('a genuine 1 and a correct two-digit jersey need no reread, even with ink next to their boxes', async () => {
  const harness = jerseyHarness([[43,721,7,19], [55,742,7,19], [55,702,7,19]]);
  const players = [jerseyPlayer, {...jerseyPlayer, number:'21'}];
  const jerseyWords = [jerseyWord, {...jerseyWord, text:'21'}];
  assert.equal(await rereadOrderedJerseys({players, jerseyWords, ...harness}), players);
  assert.deepEqual(harness.calls, []);
});

test('ambiguous, conflicting, or spatially incomplete rereads keep the original jersey for review', async () => {
  const results = [
    {text:'1', words:[{text:'1', x:18, w:57, confidence:95}]},
    {text:'11', words:[{...clearReread.words[0], confidence:89}]},
    {text:'23', words:[{text:'23', x:18, w:57, confidence:97}]},
    {text:'11', words:[{...clearReread.words[0], w:19}]},
    {text:'11', words:[{...clearReread.words[0], text:'12'}]},
  ];
  for (const result of results) {
    const harness = jerseyHarness(twoGlyphs, result);
    assert.deepEqual(await rereadOrderedJerseys({players:[jerseyPlayer], jerseyWords:[jerseyWord], ...harness}), [
      {...jerseyPlayer, confidence:'Review required · Review jersey'},
    ]);
  }
});

test('the digits-only OCR setting is cleared when the reread fails', async () => {
  const error = Error('OCR read failed');
  const harness = jerseyHarness(twoGlyphs, error);
  await assert.rejects(rereadOrderedJerseys({players:[jerseyPlayer], jerseyWords:[jerseyWord], ...harness}), error);
  assert.deepEqual(harness.calls.at(-1), ['parameters', {tessedit_char_whitelist:'', tessedit_pageseg_mode:'11'}]);
});
