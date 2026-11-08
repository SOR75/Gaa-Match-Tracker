import test from 'node:test';
import assert from 'node:assert/strict';
import {openInterceptionCredit} from '../src/interception-capture.js';
import {flowMatch,addFlow} from './helpers/match-flow-match.js';
// Minimal DOM surface exercises capture identity and duplicate-save protection.
test('interception credit keeps captured ID even when the event ledger advances',()=>{
 const m=flowMatch({lineup:true}),event=addFlow(m,'interception','our',30),later=addFlow(m,'point','our',40);
 const pick={dataset:{interceptionPlayer:'4'}},close={focus(){}},updates=[];
 const dialog={querySelectorAll:s=>s==='[data-interception-player]'?[pick]:s==='[data-interception-close]'?[close]:[],querySelector:s=>s==='[data-interception-close]'?close:null,addEventListener(){},showModal(){},close(){this.closed=true;}};
 openInterceptionCredit(dialog,event,m,(id,number)=>updates.push({id,number}),()=>{});pick.onclick();pick.onclick();
 assert.deepEqual(updates,[{id:event.id,number:'4'}]);assert.notEqual(updates[0].id,later.id);assert.equal(dialog.closed,true);
});
