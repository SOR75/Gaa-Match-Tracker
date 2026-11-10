import {test,expect} from '@playwright/test';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {validMatch} from '../../src/domain.js';
import {paginationCases0314} from '../helpers/report-pagination0314.js';
const root='/workspace/sideline-0315-workflow-review';
const phase=process.env.REVIEW_PHASE||'After';
const norm=s=>s.replace(/\s+/g,' ').trim();
async function load(page,m){
 expect(validMatch(m)).toBe(true);
 await page.setViewportSize({width:1024,height:768});await page.goto('/');await page.evaluate(m=>localStorage.setItem('sideline.match.v1',JSON.stringify(m)),m);await page.reload();await page.getByRole('button',{name:'Match analysis',exact:true}).click();await page.getByRole('button',{name:'Full Match Report',exact:true}).click();await page.evaluate(()=>document.fonts.ready);
}
async function evidence(page,name){
 const screen=await page.locator('.report-view').innerHTML(),store=await page.evaluate(()=>localStorage.getItem('sideline.match.v1'));
 await page.screenshot({path:`${root}/${phase}-${name}-screen.png`,fullPage:true});
 const blocks=await page.locator('.report-view > .analysis-section:not([data-report-minutes]), .report-view > p[data-report-substitutions]').evaluateAll(nodes=>nodes.map(node=>({
  heading:(node.querySelector(':scope > h2')||node.querySelector('b')).textContent.trim(),
  details:[...node.querySelectorAll('.report-details > div')].map(row=>[...row.children].map(c=>c.textContent.trim()).join(' ')),
  rows:[...node.querySelectorAll('tbody tr')].map(row=>[...row.children].map(c=>c.textContent.trim()).join(' ')),
  headers:[...node.querySelectorAll('thead tr')].map(row=>[...row.children].map(c=>c.textContent.trim()).join(' ')),
  notes:[...node.querySelectorAll('p,caption')].map(p=>p.textContent.trim()),
  keepers:[...node.querySelectorAll('[data-gk-card]')].map(card=>({id:card.dataset.gkCard,name:card.querySelector('h3').textContent.trim(),metrics:card.querySelectorAll('dl>div').length,fields:[...card.querySelectorAll('dl>div')].map(row=>[...row.children].map(x=>x.textContent.trim()).join(' '))})),
 })));
 await page.evaluate(()=>window.addEventListener('beforeprint',()=>{
  window.__overviewFits=document.querySelector('[data-print-overview]').classList.contains('report-print-fit');
  window.__paginationAudit=[...document.querySelectorAll('.report-view > .analysis-section:not([data-report-minutes]), .report-view > [data-print-overview] > .analysis-section, .report-view > p[data-report-substitutions]')].map(n=>({heading:(n.querySelector(':scope > h2')||n.querySelector('b')).textContent.trim(),fit:n.classList.contains('report-print-fit'),long:n.classList.contains('report-print-continuation')}));
 },{once:true}));

 const buffer=await page.pdf({format:'A4',landscape:false,scale:1,preferCSSPageSize:true,printBackground:true});await writeFile(`${root}/${phase}-${name}.pdf`,buffer);
 const task=getDocument({data:new Uint8Array(buffer),useSystemFonts:true}),doc=await task.promise,pages=[];
 for(let i=1;i<=doc.numPages;i++){const p=await doc.getPage(i),c=await p.getTextContent();pages.push({text:norm(c.items.map(x=>x.str).join(' ')),width:p.view[2],height:p.view[3],items:c.items.filter(x=>x.str.trim()).map(x=>({text:x.str,x:x.transform[4],y:x.transform[5],width:x.width}))});}
 const overviewFits=await page.evaluate(()=>window.__overviewFits);
 const audit=await page.evaluate(()=>window.__paginationAudit);await task.destroy();await writeFile(`${root}/${phase}-${name}.json`,JSON.stringify({pages,blocks,audit,overviewFits},null,2));
 expect(await page.locator('.report-view').innerHTML()).toBe(screen);expect(await page.evaluate(()=>localStorage.getItem('sideline.match.v1'))).toBe(store);
 console.log(`${phase} ${name}: ${pages.length} A4 portrait pages`);
 return {pages,blocks,audit,overviewFits};
}
for(const name of Object.keys(paginationCases0314()))test(`section-aware 100% A4 portrait: ${name}`,async({page})=>{
 test.setTimeout(120000);await mkdir(root,{recursive:true});await load(page,paginationCases0314()[name]);const {pages,blocks,audit,overviewFits}=await evidence(page,name);
 expect(pages.every(p=>p.width<p.height&&p.text.length>0)).toBe(true);
 expect(audit?.length).toBe(blocks.length);expect(audit.every(b=>b.fit||b.long)).toBe(true);
 expect(overviewFits).toBe(name!=='overviewOverflow');
 if(name!=='overviewOverflow')for(const block of blocks.slice(0,3)){expect(pages[0].text).toContain(block.heading);for(const row of [...block.rows,...block.details])expect(pages[0].text).toContain(norm(row));}
 const joined=pages.map(p=>p.text).join('\f');let cursor=0;
 for(let i=0;i<blocks.length;i++){
  const block=blocks[i],start=joined.indexOf(block.heading,cursor);expect(start,block.heading).toBeGreaterThanOrEqual(cursor);const end=i+1<blocks.length?joined.indexOf(blocks[i+1].heading,start+block.heading.length):joined.length;expect(end,block.heading).toBeGreaterThan(start);cursor=start+block.heading.length;
  const fragments=joined.slice(start,end).split('\f').map(norm).filter(Boolean);
  if(audit[i].fit)expect(fragments,`${name}: ${block.heading} fits but split`).toHaveLength(1);
  if(block.rows.length)expect(fragments[0],`${block.heading}: heading detached from first row`).toContain(norm(block.rows[0]));
  for(const row of block.rows)expect(fragments.some(p=>p.includes(norm(row))),`${block.heading}: incomplete/split row ${row}`).toBe(true);
  for(const detail of block.details)expect(norm(fragments.join(' '))).toContain(norm(detail));
  for(const note of block.notes)expect(norm(fragments.join(' '))).toContain(norm(note));
  if(audit[i].long&&block.rows.length>2){
   const last=fragments.at(-1),count=block.rows.filter(row=>last.includes(norm(row))).length;expect(count,`${block.heading}: isolated tail row/note`).toBeGreaterThanOrEqual(2);
   for(const part of fragments)if(block.rows.some(row=>part.includes(norm(row))))expect(block.headers.some(header=>part.includes(norm(header))),`${block.heading}: missing continued table headers`).toBe(true);
  }
  for(const card of block.keepers){
   expect(card.metrics).toBe(10);const sheet=pages.find(p=>p.text.includes(norm(card.name)));expect(sheet).toBeTruthy();
   for(const field of card.fields)expect(sheet.text).toContain(norm(field));
  }
  if(block.keepers.length){
   const ours=block.keepers.filter(k=>k.id.startsWith('our:')),theirs=block.keepers.filter(k=>k.id.startsWith('opposition:'));
   for(let j=0;j<Math.min(ours.length,theirs.length);j++){
    const left=pages.findIndex(p=>p.text.includes(norm(ours[j].name))),right=pages.findIndex(p=>p.text.includes(norm(theirs[j].name)));expect(left).toBe(right);
    const sheet=pages[left];const a=sheet.items.filter(x=>norm(ours[j].name).startsWith(norm(x.text))&&norm(x.text).startsWith('#')),b=sheet.items.filter(x=>norm(theirs[j].name).startsWith(norm(x.text))&&norm(x.text).startsWith('#'));
    const pair=a.flatMap(x=>b.map(y=>[x,y])).find(([x,y])=>Math.abs(x.y-y.y)<2&&y.x-x.x>sheet.width/3);expect(pair,'keeper cards must be horizontal, not newspaper columns').toBeTruthy();
   }
   if(audit[i].long)expect(block.keepers.filter(k=>fragments.at(-1).includes(norm(k.name))).length).toBeGreaterThanOrEqual(2);
  }
 }
 for(const p of pages)for(const item of p.items){expect(item.y,`${name}: clipped ${item.text}`).toBeGreaterThanOrEqual(34);expect(item.y).toBeLessThanOrEqual(p.height-34);expect(item.x).toBeGreaterThanOrEqual(34);expect(item.x+item.width).toBeLessThanOrEqual(p.width-30);}
 if(name==='normal'){
  const g=blocks.find(b=>b.heading==='Goalkeepers');expect(g.keepers).toHaveLength(2);const indexes=g.keepers.map(k=>pages.findIndex(p=>p.text.includes(norm(k.name))));expect(indexes[0]).toBe(indexes[1]);
 }
});
test('print preparation is repeatable and restores the on-screen goalkeeper grid and report exactly',async({page})=>{
 await mkdir(root,{recursive:true});await load(page,paginationCases0314().keepers);const html=await page.locator('.report-view').innerHTML();await evidence(page,'repeat-first');await evidence(page,'repeat-second');expect(await page.locator('.report-view').innerHTML()).toBe(html);await expect(page.locator('[data-print-keeper-pair], [data-report-print-probe]')).toHaveCount(0);
 await page.emulateMedia({media:'print'});await expect(page.locator('.report-view .report-print-fit').first()).toHaveCount(1);
 const pairs=await page.locator('[data-print-keeper-pair]').evaluateAll(ns=>ns.map(n=>[...n.children].map(c=>{const r=c.getBoundingClientRect();return {width:r.width,top:r.top};})));expect(pairs).toHaveLength(4);
 for(const [a,b]of pairs){expect(Math.abs(a.width-b.width)).toBeLessThan(1);expect(Math.abs(a.top-b.top)).toBeLessThan(1);}
 await page.emulateMedia({media:'screen'});await expect.poll(()=>page.locator('.report-view').innerHTML()).toBe(html);
});
for(const viewport of [{width:1366,height:1024},{width:1920,height:1080}])test(`portrait printing restores the exact iPad/TV screen at ${viewport.width}x${viewport.height}`,async({page})=>{
 await mkdir(root,{recursive:true});await load(page,paginationCases0314().normal);await page.setViewportSize(viewport);await page.evaluate(()=>document.fonts.ready);
 const report=page.locator('.report-view'),before=await report.screenshot({animations:'disabled'});
 await writeFile(`${root}/Screen-${viewport.width}-before.png`,before);
 await page.pdf({format:'A4',scale:1,preferCSSPageSize:true});
 const after=await report.screenshot({animations:'disabled'});await writeFile(`${root}/Screen-${viewport.width}-after.png`,after);expect(after.equals(before)).toBe(true);
});
test('portrait refinements retain map evidence, separate scorecard text and remove the empty shaded canvas',async({page})=>{
 await mkdir(root,{recursive:true});await load(page,paginationCases0314().normal);
 const original=await page.locator('.report-view').innerHTML();
 const pitch=page.locator('.report-shot-map svg'),geometry=await pitch.getAttribute('viewBox'),markers=await pitch.innerHTML();
 await page.setViewportSize({width:688,height:1017});await page.emulateMedia({media:'print'});
 const layout=await page.evaluate(()=>{
  const section=document.querySelector('.report-shot-map'),pitch=section.querySelector('.analysis-pitch'),legend=section.querySelector('.shot-legend');
  const rect=n=>{const r=n.getBoundingClientRect();return {width:r.width,height:r.height,top:r.top,bottom:r.bottom};};
  return {canvas:getComputedStyle(document.documentElement).backgroundColor,pitch:rect(pitch),legend:rect(legend),labels:[...legend.querySelectorAll('span')].map(n=>n.textContent.trim()),scores:[...document.querySelectorAll('.analysis-scores>div')].map(n=>[...n.querySelectorAll('small')].map(rect)),font:parseFloat(getComputedStyle(legend).fontSize)};
 });
 expect(layout.canvas).toBe('rgb(255, 255, 255)');expect(layout.pitch.width).toBe(210);expect(layout.pitch.height/layout.pitch.width).toBeCloseTo(1.5,1);
 expect(layout.legend.height).toBeLessThan(layout.pitch.height/2);expect(layout.font).toBeGreaterThanOrEqual(12);
 for(const label of ['Goal','Point','2 Point','Unsuccessful','Blocked shot'])expect(layout.labels.some(s=>s.endsWith(label))).toBe(true);
 for(const [total,detail]of layout.scores)expect(detail.top).toBeGreaterThanOrEqual(total.bottom);
 expect(await pitch.getAttribute('viewBox')).toBe(geometry);expect(await pitch.innerHTML()).toBe(markers);
 await page.emulateMedia({media:'screen'});await expect.poll(()=>page.locator('.report-view').innerHTML()).toBe(original);
 await page.emulateMedia({media:null});
 const {pages}=await evidence(page,'refinement-geometry');
 expect(pages[0].text).toContain('(18) 2 goals · 8 points · 2 2-pointers');expect(pages[0].text).not.toContain('(18)2 goals');
});
test('print omits individual playing-time tables and notes while screen, substitutions and saved data are retained',async({page})=>{
 await mkdir(root,{recursive:true});await load(page,paginationCases0314().normal);
 const participation=page.locator('[data-report-minutes]');await expect(participation).toBeVisible();const rows=await participation.locator('tbody tr').count();expect(rows).toBeGreaterThan(0);
 const {pages}=await evidence(page,'without-playing-times');const text=pages.map(p=>p.text).join(' ');
 expect(text).not.toContain('Recorded participation & playing time');expect(text).not.toContain('Times use recorded clock and field changes');expect(text).toContain('Substitutions · No substitutions recorded.');
 await expect(participation).toBeVisible();await expect(participation.locator('tbody tr')).toHaveCount(rows);
});
