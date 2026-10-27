import {test,expect} from '@playwright/test';
for(const style of ['plain','dotted/bracketed'])test(`controlled ${style} number/name image imports without circles, boxes or colour`,async({page})=>{
 test.setTimeout(120000);await page.goto('/');await page.getByRole('button',{name:'Squad',exact:true}).click();
 const image=await page.evaluate(style=>{
  const c=document.createElement('canvas');c.width=1000;c.height=460;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,c.width,c.height);x.fillStyle='black';x.font='32px sans-serif';
  [[8,'Nora Quinn'],[18,'Ruth Byrne'],[31,'Maeve Lane']].forEach(([n,name],i)=>{x.fillText(style==='plain'?String(n):i===0?`${n}.`:i===1?`${n})`:`(${n})`,50,100+i*100);x.fillText(name,200,100+i*100);});
  return c.toDataURL('image/png').split(',')[1];
 },style);
 await page.locator('#team-sheet-photo').setInputFiles({name:'controlled-number-rows.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});await expect(page.getByRole('heading',{name:'Review & confirm'})).toBeVisible({timeout:95000});
 const rows=await page.locator('[data-review-row]').evaluateAll(rs=>rs.map(r=>({...Object.fromEntries([...r.querySelectorAll('input,select')].map(e=>[e.name,e.value])),confidence:r.querySelector('.uncertain').textContent})));
 expect(rows.map(r=>r.name)).toEqual(['Nora Quinn','Ruth Byrne','Maeve Lane']);
 const numbers=['8','18','31'];
 if(style==='plain')expect(rows.map(r=>r.number)).toEqual(numbers);
 for(let i=0;i<rows.length;i++){
  // Layout detection is distinct from OCR certainty. Decorations must not
  // discard the player or cause an uncertain jersey to be filled from order.
  expect([numbers[i],'']).toContain(rows[i].number);
  expect(rows[i].role).toBe(rows[i].number?(+rows[i].number<=15?'starter':'substitute'):'panel');
  if(!rows[i].number)expect(rows[i].confidence).toContain('Review jersey');
 }
 expect(rows[1].number).toBe('18');
 await expect(page.locator('dialog .inline-notice')).toContainText('spatial number/name rows');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('sideline.match.v1')||'{"players":[]}').players)).toHaveLength(0);
});
