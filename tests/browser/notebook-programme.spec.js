import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const fixtures=[
 ['original JPEG','tests/fixtures/Handwritten_Notebook_Team_Sheet.jpg','72392d718606b26aaa484fdcf1acef7066779d46182e0411b3d4182dcce1ead8'],
 ['lossless 90-degree derivative of the same original','tests/fixtures/Handwritten_Notebook_Rotated_90.png','135fd5236d97e11722e5bce0a23836be1be334ee2eb2ee53a4615341d6306673']
];
for(const [label,file,sha] of fixtures)test(`handwritten notebook ${label}: 30 real numbered rows, honest blank uncertain fields, no Extended panel or automatic squad additions`,async({page,context},testInfo)=>{
 test.setTimeout(180000);expect(createHash('sha256').update(readFileSync(file)).digest('hex')).toBe(sha);
 await page.goto('/');await page.getByLabel('Our team',{exact:true}).fill('Home');await page.getByLabel('Opposition',{exact:true}).fill('Away');await page.getByRole('button',{name:'Continue to squad',exact:true}).click();
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);await context.setOffline(true);
 await page.getByRole('button',{name:'Squad',exact:true}).click();await page.locator('#team-sheet-photo').setInputFiles(file);await expect(page.getByRole('heading',{name:'Review & confirm'})).toBeVisible({timeout:95000});
 await expect(page.locator('dialog .inline-notice')).toContainText('Local OCR is not reliable');
 const rows=await page.locator('[data-review-row]').evaluateAll(rs=>rs.map(r=>({...Object.fromEntries([...r.querySelectorAll('input,select')].map(e=>[e.name,e.value])),confidence:r.querySelector('.uncertain').textContent})));
 expect(rows).toHaveLength(30);
 // This fixture demonstrates the local printed-text model's limitation. Do not
 // bless guessed spellings or fill 1–30 from the expected physical row order.
 expect(rows.every(r=>r.number==='' && r.name==='' && r.role==='panel')).toBe(true);
 for(let i=0;i<30;i++){
  expect(rows[i].confidence).toContain('Number/name row');expect(rows[i].confidence).toContain('Review name');expect(rows[i].confidence).toContain('Review jersey');expect(rows[i].confidence).toContain(`Source column ${i<15?1:2}, row ${i%15+1}`);
 }
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('sideline.match.v1')).players)).toHaveLength(0);
 await testInfo.attach('notebook-review-rows.json',{body:JSON.stringify(rows,null,2),contentType:'application/json'});
 await page.setViewportSize({width:1366,height:1024});await page.screenshot({path:testInfo.outputPath('notebook-review.png'),fullPage:true});
 await page.getByRole('button',{name:'Cancel import',exact:true}).click();await page.getByRole('button',{name:'Live match',exact:true}).click();await page.locator('[data-event=point]').click();await page.keyboard.press('Escape');expect((await page.evaluate(()=>JSON.parse(localStorage.getItem('sideline.match.v1')))).events).toHaveLength(1);
});
