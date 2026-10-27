import {test} from 'node:test';
import assert from 'node:assert/strict';
import {numberColumns,usefulHandwriting,notebookCandidate} from '../src/notebook-programme.js';
const read=(text,confidence)=>({text,words:text.split(' ').map(text=>({text,confidence}))});
test('number-column geometry needs repeated spatial anchors and keeps columns separate without assigning jerseys',()=>{
 const points=[];for(const x of [100,600])for(let i=0;i<8;i++)points.push({x:x+i,y:100+i*45,r:20,score:.9});points.push({x:400,y:900,r:20,score:.9});
 const columns=numberColumns(points);assert.equal(columns.length,2);assert.deepEqual(columns.map(c=>c.length),[8,8]);assert.equal(numberColumns(points.slice(0,3)).length,0);
});
test('low name confidence retains credible jersey with Review name and blank transcription',()=>{
 const p=notebookCandidate([read('XY lll',12)],[read('7',95),read('7',93),read('7',96)]);assert.equal(p.number,'7');assert.equal(p.name,'');assert.equal(p.role,'starter');assert.match(p.confidence,/Review name/);
});
test('useful name with uncertain jersey stays editable and unassigned, never inferred from row order',()=>{
 const p=notebookCandidate([read('Nora Example',68)],[read('18',60),read('18',60)]);assert.equal(p.name,'Nora Example');assert.equal(p.number,'');assert.equal(p.role,'panel');assert.match(p.confidence,/Review jersey/);
 const partial=notebookCandidate([read('Nora',92)],[read('18',40)]);assert.equal(partial.name,'Nora');assert.match(partial.confidence,/Review name/);
});
test('unreliable handwriting does not turn fragments into confident names or invented numbers',()=>{
 const p=notebookCandidate([read('\\ fake 00',20)],[read('3',91),read('13',92),read('3',93)]);assert.equal(p.name,'');assert.equal(p.number,'');assert.match(p.confidence,/left blank/);
 assert.equal(usefulHandwriting('Word \\ junk',[{text:'Word',confidence:90}]),'');
});
test('higher real numbers are retained, classified by number and never clipped to XV',()=>{
 const p=notebookCandidate([read('Nora Example',70)],[read('31',96),read('31',94),read('31',95)]);assert.equal(p.number,'31');assert.equal(p.role,'substitute');assert.equal(p.name,'Nora Example');
});
