import {test,expect} from '@playwright/test';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {reportCases0312,ttReference0312} from '../helpers/reports0312.js';
import {completeMatch} from '../../src/history.js';
const nav=(p,n)=>p.getByRole('button',{name:n,exact:true}).click();
async function load(p,m){await p.goto('/');await p.evaluate(m=>localStorage.setItem('sideline.match.v1',JSON.stringify(m)),m);await p.reload();await nav(p,'Match analysis');}
async function pdf(p){const buffer=await p.pdf({format:'A4',preferCSSPageSize:true,printBackground:true}),task=getDocument({data:new Uint8Array(buffer),useSystemFonts:true}),doc=await task.promise,pages=[];for(let i=1;i<=doc.numPages;i++){const data=await(await doc.getPage(i)).getTextContent();pages.push(data.items.map(i=>i.str).join(' '));}await task.destroy();return pages;}
test('factual PDFs paginate short/normal/heavy reports by content, without embedding the full ledger',async({page})=>{
 test.setTimeout(120000);await page.setViewportSize({width:1024,height:768});const counts={};for(const [name,m]of Object.entries(reportCases0312())){
  await load(page,m);const before=await page.evaluate(()=>localStorage.getItem('sideline.match.v1'));await nav(page,'Full Match Report');await expect(page.getByRole('button',{name:'Coach Report',exact:true})).toHaveCount(0);await expect(page.locator('[data-report-event]')).toHaveCount(0);await page.emulateMedia({media:'print'});const pages=await pdf(page);counts[name]=pages.length;
  // Whole-section pagination permits whitespace, but not missing/split rows or
  // a sparse continuation page containing just one avoidable table row.
  const rows=await page.locator('.report-view tbody tr').evaluateAll(ns=>ns.map(r=>[...r.children].map(c=>c.textContent.trim()).join(' ').replace(/\s+/g,' ').trim()));
  const normalised=pages.map(p=>p.replace(/\s+/g,' ').trim());
  for(const row of rows)expect(normalised.some(p=>p.includes(row))).toBe(true);
  for(const p of normalised){expect(p.length).toBeGreaterThan(0);if(p.length<=300)expect(rows.filter(r=>p.includes(r)).length).toBeGreaterThanOrEqual(2);}
  const firstContent=await page.locator('.report-view > .analysis-section, .report-view > p[data-report-substitutions]').evaluateAll(nodes=>nodes.map(node=>{
   const heading=(node.querySelector(':scope > h2')||node.querySelector('b')).textContent.trim(),row=node.querySelector('tbody tr, dl > div'),p=node.querySelector('p');
   return {heading,text:(row?[...row.children].map(c=>c.textContent.trim()).join(' '):p?p.textContent:node.textContent.replace(heading,'')).replace(/\s+/g,' ').trim()};
  }));
  const all=pages.join(' ');for(const heading of ['Match details','Score by period','Player shooting analysis','Substitutions','Recorded participation & playing time']){
   expect(all).toContain(heading);const sheet=normalised.find(p=>p.includes(heading));expect(sheet).toContain(firstContent.find(c=>c.heading===heading).text);
  }
  expect(all).not.toContain('Coach Report');expect(all).not.toContain('no established trend inferred');expect(all).not.toContain('Recorded match events');expect(all).not.toContain('Event ID:');
  if(name==='heavy')for(const team of ['our','opposition'])for(let n=1;n<=30;n++)expect(all).toContain(`Synthetic ${team} Player ${n}`);
  expect(await page.locator('.report-view table').evaluateAll(ns=>ns.every(n=>parseFloat(getComputedStyle(n).fontSize)>=12))).toBe(true);await page.emulateMedia({media:'screen'});expect(await page.evaluate(()=>localStorage.getItem('sideline.match.v1'))).toBe(before);
 }expect(counts.heavy).toBeGreaterThan(counts.short);expect(counts.normal).toBeGreaterThan(counts.short);
});
test('TT small-sample context remains on Full-Time with evidence; sole PDF records facts without ranked observations',async({page})=>{
 const m=completeMatch(ttReference0312(),1);await load(page,m);const before=await page.evaluate(()=>localStorage.getItem('sideline.match.v1'));await nav(page,'Match History');await page.locator(`[data-history-id="${m.id}"]`).getByRole('button',{name:'VIEW MATCH',exact:true}).click();await expect(page.locator('[data-small-sample-context]')).toContainText('H1 2/2 (100%) → H2 1/3 (33.3%)');await page.locator('[data-small-sample-context] summary').click();await expect(page.locator('[data-small-sample-context] [data-insight-evidence]')).toHaveCount(5);expect(await page.locator('[data-observation],[data-flow-story]').count()).toBeLessThanOrEqual(5);
 await page.locator('.history-tabs').getByRole('button',{name:'Full Match Report',exact:true}).click();await expect(page.locator('[data-small-sample-context],[data-observation],[data-flow-story]')).toHaveCount(0);await expect(page.locator('.report-view')).toContainText('Unclassified / not recorded');await expect(page.locator('.report-view')).toContainText('Wides (subset)');await expect(page.locator('.report-view')).toContainText('Medium (legacy)');expect(await page.evaluate(()=>localStorage.getItem('sideline.match.v1'))).toBe(before);
});
for(const size of [{width:1024,height:768},{width:1366,height:1024},{width:1440,height:900}])test(`single report controls and unchanged pitch fit ${size.width}x${size.height}`,async({page})=>{
 await page.setViewportSize(size);await load(page,ttReference0312());await nav(page,'Full Match Report');await expect(page.getByRole('button',{name:'Print / Save as PDF',exact:true})).toBeVisible();const bounds=await page.locator('.report-view').boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(size.width+1);await expect(page.locator('.gaelic-pitch').first()).toBeVisible();
});
