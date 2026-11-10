import {test,expect} from '@playwright/test';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {reportCases0312} from '../helpers/reports0312.js';
import {scoringTimeline} from '../../src/analysis.js';
import {validAnalysisEvents} from '../../src/analysis-evidence.js';
import {formatTime} from '../../src/domain.js';
const root='/workspace/sideline-0315-workflow-review';
for(const name of ['short','normal','heavy'])test(`A4 portrait ${name}: every H1/H2 scoring row survives PDF pagination`,async({page})=>{
 test.setTimeout(120000);await mkdir(root,{recursive:true});await page.setViewportSize({width:1024,height:768});const m=reportCases0312()[name];
 await page.goto('/');await page.evaluate(m=>localStorage.setItem('sideline.match.v1',JSON.stringify(m)),m);await page.reload();await page.getByRole('button',{name:'Match analysis',exact:true}).click();await page.getByRole('button',{name:'Full Match Report',exact:true}).click();
 const before=await page.evaluate(()=>localStorage.getItem('sideline.match.v1'));const section=page.locator('section').filter({has:page.getByRole('heading',{name:'Scoring timeline',exact:true})});
 const scores=scoringTimeline(validAnalysisEvents(m));await expect(section.locator('tbody tr')).toHaveCount(scores.length);
 await page.screenshot({path:`${root}/${process.env.REVIEW_PHASE||'After'}-${name}-screen.png`,fullPage:true});await page.emulateMedia({media:'print'});

 const buffer=await page.pdf({landscape:false,scale:1,format:'A4',preferCSSPageSize:true,printBackground:true});await writeFile(`${root}/${process.env.REVIEW_PHASE||'After'}-${name}.pdf`,buffer);
 const task=getDocument({data:new Uint8Array(buffer),useSystemFonts:true});const doc=await task.promise;const texts=[];const pages=[];
 for(let i=1;i<=doc.numPages;i++){const p=await doc.getPage(i),content=await p.getTextContent();texts.push(content.items.map(x=>x.str).join(' ').replace(/\s+/g,' ').trim());pages.push({width:p.view[2],height:p.view[3]});}
 expect(pages.every(p=>p.width<p.height)).toBe(true);
 const text=texts.join(' ');for(const {event,our,opposition} of scores){const tuple=[formatTime(event.timeMs),event.team==='our'?m.setup.ourTeam:m.setup.opposition,event.event==='two-point'?'2 Point':event.event,`${our} — ${opposition}`].join(' ');expect(text).toContain(tuple);}
 const mapPage=texts.find(p=>p.includes('Shot map'));expect(mapPage).toBeTruthy();
 if(name==='short')expect(mapPage).toContain('No recorded shot locations to plot.');
 else for(const label of ['Goal','Point','2 Point','Unsuccessful','Blocked shot','plotted /'])expect(mapPage).toContain(label);
 expect(await page.locator('.report-view table').evaluateAll(ns=>ns.every(n=>parseFloat(getComputedStyle(n).fontSize)>=12))).toBe(true);
 expect(texts.every(p=>p.length>200)).toBe(true);console.log(`${name}: ${doc.numPages} portrait pages, ${scores.length} scoring rows`);
 await writeFile(`${root}/${process.env.REVIEW_PHASE||'After'}-${name}-pages.json`,JSON.stringify({pages:doc.numPages,scores:scores.length,texts},null,2));await task.destroy();expect(await page.evaluate(()=>localStorage.getItem('sideline.match.v1'))).toBe(before);
});
