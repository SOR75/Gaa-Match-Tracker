import {test} from 'node:test';
import assert from 'node:assert/strict';
import {playerNumberToken,numberedPlayerRows} from '../src/numbered-rows.js';
import {notebookCandidate} from '../src/notebook-programme.js';
const word=(text,x,y,confidence=96)=>({text,x,y,w:text.length*10,h:22,confidence});
const fixture=style=>[8,18,31].flatMap((n,i)=>[word(style(n),30,60+i*55),word(['Nora','Ruth','Maeve'][i],110,60+i*55),word('Example',210,60+i*55)]);
for(const [label,style] of [['plain',n=>`${n}`],['dot',n=>`${n}.`],['underlined token',n=>`${n}_`],['closing bracket',n=>`${n})`],['parentheses',n=>`(${n})`],['square brackets',n=>`[${n}]`],['circled token',n=>n===8?'⑧':`(${n})`]])test(`${label}: number boxes anchor independent name regions without ring evidence`,()=>{
 const columns=numberedPlayerRows(fixture(style));assert.equal(columns.length,1);assert.deepEqual(columns[0].map(p=>p.number),['8','18','31']);assert.deepEqual(columns[0].map(p=>p.names.map(w=>w.text).join(' ')),['Nora Example','Ruth Example','Maeve Example']);assert.equal(columns[0][0].kind,'ocr-number');
});
test('plain number beside unreadable handwriting preserves trusted jersey; printed name beside uncertain number remains intact',()=>{
 const anchor=word('8.',30,60,96);let p=notebookCandidate([{text:'xx \\',words:[word('xx',100,60,4)]}],[],anchor);assert.equal(p.number,'8');assert.equal(p.name,'');assert.match(p.confidence,/Review name/);
 p=notebookCandidate([{text:'Nora Example',words:[word('Nora',110,60),word('Example',210,60)]}],[],word('18)',30,60,40));assert.equal(p.name,'Nora Example');assert.equal(p.number,'');assert.match(p.confidence,/Review jersey/);
});
test('Extended panel is excluded even when its rows have ordinary numbers',()=>{
 const words=fixture(n=>`${n}.`);words.push(word('Extended',30,250),word('panel',150,250),word('42',30,310),word('Other',110,310),word('Player',210,310));assert.deepEqual(numberedPlayerRows(words)[0].map(r=>r.number),['8','18','31']);
});
test('two adjacent number/name columns stay separate and do not merge neighbouring rows',()=>{
 const a=fixture(n=>`${n})`),b=fixture(n=>`${n+1}.`).map(w=>({...w,x:w.x+500}));const columns=numberedPlayerRows([...a,...b]);assert.equal(columns.length,2);assert.equal(columns[0][0].names.length,2);assert.equal(columns[1][0].names.length,2);
});
test('isolated metadata and invalid jersey tokens do not establish player rows',()=>{
 for(const text of ['100','0','DOB','O8','8/12/2012','?'])assert.equal(playerNumberToken(text),'');assert.equal(playerNumberToken('08.'),'8');assert.deepEqual(numberedPlayerRows([word('8',30,60),word('Venue',100,60)]),[]);
});

test('noisy digit-like fragments do not establish a number column; credible names can establish rows with uncertain jerseys',()=>{
 const noisy=fixture(n=>String(n)).map(w=>({...w,confidence:25}));assert.deepEqual(numberedPlayerRows(noisy),[]);
 const named=fixture(n=>String(n)).map(w=>({...w,confidence:/^\d/.test(w.text)?35:96}));assert.equal(numberedPlayerRows(named)[0].length,3);
});

test('missing number OCR keeps the reliably recognised name and searches the established margin without assigning a jersey',()=>{
 const words=fixture(n=>String(n)).filter(w=>w.text!=='8');const rows=numberedPlayerRows(words)[0];assert.equal(rows.length,3);assert.equal(rows[0].number,'');assert.equal(rows[0].names.map(w=>w.text).join(' '),'Nora Example');assert.equal(rows[0].kind,'ocr-number-region');
});
