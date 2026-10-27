import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectFoireannRows, resolveFoireannJersey, foireannPlayer, cleanFoireannName } from '../src/foireann-programme.js';
const word=(text,x,y,w=60,h=15,confidence=96)=>({text,x,y,w,h,confidence});
const read=(text,confidence)=>({text,words:[word(text,0,0,20,20,confidence)]});
test('bilingual roster detection requires repeated DOB/ID structures in two separate columns and excludes management',()=>{
 const words=[];for(const x of [100,650])for(let i=0;i<4;i++){words.push(word('03/04/2012',x,100+i*60,100),word('7654321',x+120,102+i*60,75));}
 words.push(word('Bainisteoirí',300,380),word('03/04/2012',100,400,100),word('7654321',220,402,75));
 const layout=detectFoireannRows(words);assert.equal(layout.columns.length,2);assert.deepEqual(layout.columns.map(c=>c.rows.length),[4,4]);assert.equal(detectFoireannRows(words.filter(w=>w.x<500)),null);
 assert.equal(detectFoireannRows([word('08',0,0),word('Example Player',100,0)]),null);
});
test('handwritten/uncertain jersey retains full English name with blank editable number, not an invented starter',()=>{
 const resolved=resolveFoireannJersey([read('18',64),read('18',73)]);assert.equal(resolved.number,'');
 const p=foireannPlayer({number:resolved.number,name:'Nora Jane Example',nameScore:96,numberScore:0,english:true,possible:['18']});
 assert.equal(p.name,'Nora Jane Example');assert.equal(p.number,'');assert.equal(p.role,'panel');assert.match(p.confidence,/jersey blank\/uncertain/);assert.match(p.confidence,/18 \(not assigned\)/);
});
test('jersey needs a clear OCR read; corroboration resolves disagreement, ties stay unresolved',()=>{
 assert.equal(resolveFoireannJersey([read('29',95),read('22',92),read('22',79)]).number,'22');
 assert.equal(resolveFoireannJersey([read('11',96),read('1',87)]).number,'');
 assert.equal(resolveFoireannJersey([read('8',84),read('8',84)]).number,'');
 assert.equal(resolveFoireannJersey([read('08',94)]).number,'8');
});
test('classification depends on shirt number, never source order; registered fallback is retained and flagged',()=>{
 for(const [number,role] of [['23','substitute'],['2','starter'],['18','substitute'],['1','starter']]){
 const p=foireannPlayer({number,name:'Áine Ní Shampla',nameScore:90,numberScore:95,english:false});assert.equal(p.role,role);assert.equal(p.name,'Áine Ní Shampla');assert.match(p.confidence,/registered name retained/);assert.doesNotMatch(p.name,/\d/);
 }
});
test('safe OCR cleanup joins apostrophe prefixes, preserves multi-word names and removes detached suffix marks',()=>{
 assert.equal(cleanFoireannName("Nora O’ Example {"),"Nora O'Example");assert.equal(cleanFoireannName('Nora Jane McExample -'),'Nora Jane McExample');
});
