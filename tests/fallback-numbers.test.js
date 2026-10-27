import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attributionRoster } from '../src/player-credit.js';
import { blankMatch } from '../src/domain.js';
import { readNumberedList } from '../src/list-programme.js';
test('fallback jerseys are transient, team-specific and replaced by actual squad',()=>{
 const m=blankMatch(); for(const team of ['our','opposition'])assert.deepEqual(attributionRoster(m,team).players.map(p=>p.number),Array.from({length:15},(_,i)=>i+1));
 assert.equal(m.players.length,0);m.players.push({team:'our',number:8,name:'Example Player',role:'starter'});
 assert.deepEqual(attributionRoster(m,'our').players.map(p=>p.name),['Example Player']);assert.equal(attributionRoster(m,'opposition').fallback,true);
});
test('numbered list retains all name tokens, zero padding and Subs classification',()=>{
 const ws=[];['01 Alpha Beta','02 Gamma Delta','03 Epsilon Zeta','Subs','16 Eta Theta Iota','17 Kappa Lambda'].forEach((line,i)=>line.split(' ').forEach((text,j)=>ws.push({text,x:j*90,y:i*40,w:70,h:25,confidence:95})));
 const rows=readNumberedList(ws);assert.equal(rows.length,5);assert.equal(rows[0].number,'1');assert.equal(rows[3].name,'Eta Theta Iota');assert.equal(rows[3].role,'substitute');assert.equal(readNumberedList(ws.slice(0,3)),null);
});
