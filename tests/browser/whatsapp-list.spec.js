import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const starters = [
  "Clodagh Keane",
  "Moya Larkin",
  "Sarah Hanniffy",
  "Cara Dolan",
  "Rhea Watts",
  "Olivia Carroll",
  "Eithne Sheahan",
  "Maisie Gohery",
  "Sarah Wynne",
  "Annie Donaghy",
  "Siun Ginty",
  "Sarah Keenaghan",
  "Kacey McGarvey",
  "Amy Keenaghan",
  "Cliona Boyd",
];
const subs = [
  "Shannon Connolly",
  "Laoise Byrne",
  "Larisa Shpuryk",
  "Aimee Grogan Doyle",
  "Maisie Lally",
  "Hannah Roe",
  "Fiadh Clarke",
  "Jessica Farrell",
  "Kayla Daly",
  "Meabh Martin",
  "Deryn Larkin",
  "Tara Woods",
];
test("original WhatsApp screenshot retains 24 number-led names and Subs, with uncertain clipped last row reviewed", async ({page}, testInfo) => {
 test.setTimeout(120000);
 await page.goto('/');await page.getByLabel('Our team',{exact:true}).fill('Home');await page.getByLabel('Opposition',{exact:true}).fill('Away');await page.getByRole('button',{name:'Continue to squad',exact:true}).click();
 await page.locator('#team-sheet-photo').setInputFiles('tests/fixtures/WhatsApp_Team_List.png');
 await expect(page.getByRole('heading',{name:'Review & confirm'})).toBeVisible({timeout:95000});
 const rows=await page.locator('[data-review-row]').evaluateAll(rs=>rs.map(r=>({...Object.fromEntries([...r.querySelectorAll('input,select')].map(e=>[e.name,e.value])),confidence:r.textContent})));
 expect(rows).toHaveLength(24);expect(rows.map(r=>r.number)).toEqual(Array.from({length:24},(_,i)=>String(i+1)));
 expect(rows.slice(0,15).map(r=>r.name)).toEqual(starters);expect(rows.slice(0,15).every(r=>r.role==='starter')).toBe(true);
 expect(rows.slice(15,23).map(r=>r.name)).toEqual(subs.slice(0,8));expect(rows.slice(15).every(r=>r.role==='substitute')).toBe(true);
 expect(rows[23].name).toBe('Kavla Dalv');expect(rows[23].confidence).toContain('uncertain transcription');
 expect(rows.every(r=>r.confidence.includes('Review required'))).toBe(true);
 await testInfo.attach('whatsapp-extraction.json',{body:JSON.stringify(rows,null,2),contentType:'application/json'});
 await page.screenshot({path:testInfo.outputPath('whatsapp-review.png'),fullPage:true});
});
