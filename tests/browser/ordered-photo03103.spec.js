import {test,expect} from '@playwright/test';
const rows=page=>page.locator('[data-review-row]').evaluateAll(rs=>rs.map(r=>Object.fromEntries([...r.querySelectorAll('input,select')].map(e=>[e.name,e.value]))));
test('exact uploaded sloping ordered photograph keeps every visible number through real photo import and review',async({page},info)=>{
 test.setTimeout(120000);
 await page.goto('/');await page.getByLabel('Our team',{exact:true}).fill('Photo Home');await page.getByLabel('Opposition',{exact:true}).fill('Photo Away');await page.getByRole('button',{name:'Continue to squad',exact:true}).click();
 await page.locator('#team-sheet-photo').setInputFiles('tests/fixtures/st-manchans-ordered/Pic.jpg');
 await expect(page.getByRole('heading',{name:'Review & confirm',exact:true})).toBeVisible({timeout:95000});
 const extracted=await rows(page);await info.attach('actual-photo-review.json',{body:JSON.stringify(extracted,null,2),contentType:'application/json'});
 expect(extracted.map(p=>p.number)).toEqual(Array.from({length:25},(_,i)=>String(i+1)));
 expect(extracted.filter(p=>p.role==='starter')).toHaveLength(15);expect(extracted.filter(p=>p.role==='substitute')).toHaveLength(10);
 expect(extracted[0].name).toBe('Jack Ryan');expect(extracted[1].name).toBe('Noah Tierney');expect(extracted[15].name).toBe(''); // Actual supplied JPEG has a blank #16.
 expect(extracted[16].name).toMatch(/^Daith/i);expect(extracted[16].name).toContain('Shirley');expect(extracted[20].name).toBe('Domhnall Molloy');expect(extracted[21].name).toBe('Tommy Doherty');expect(extracted[23].name).toBe('Senan Dunne');expect(extracted[24].name).toBe('Sean Moran');
 await expect(page.locator('[data-review-row]').nth(15)).toContainText('Review name');
 await info.attach('actual-photo-review.png',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
});
