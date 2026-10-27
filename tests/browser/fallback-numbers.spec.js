import { test, expect } from '@playwright/test';
const state=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('sideline.match.v1')));
for(const team of ['our','opposition']) test(`${team}: number-only shots, Other number, later squad resolution without event mutation`,async({page})=>{
 await page.goto('/');await page.getByLabel('Our team',{exact:true}).fill('Home');await page.getByLabel('Opposition',{exact:true}).fill('Away');await page.getByRole('button',{name:'Continue to squad',exact:true}).click();await page.getByRole('button',{name:'Live match',exact:true}).click();
 await page.locator(`[data-team="${team}"]`).click();await page.locator('[data-event=point]').click();const modal=page.getByRole('dialog');await expect(modal.locator('[data-shot-player]')).toHaveCount(15);await modal.locator('[data-shot-player="8"]').click();await page.keyboard.press('Escape');let m=await state(page);expect(m.players).toHaveLength(0);expect(m.events[0].playerNumber).toBe('8');expect(m.events[0].team).toBe(team);const event=m.events[0];
 await page.locator('[data-event=goal]').click();await modal.getByLabel('Other player number · optional',{exact:true}).fill('23');await page.keyboard.press('Escape');expect((await state(page)).events[1].playerNumber).toBe('23');
 await page.getByRole('button',{name:'Squad',exact:true}).click();
 await page.locator(`[data-squad-team="${team}"]`).click();
 await page.getByLabel('Jersey number',{exact:true}).fill('8');await page.getByLabel('Player name',{exact:true}).fill('Later Roster Name');await page.getByRole('button',{name:'Add player',exact:true}).click();
 await page.reload();expect((await state(page)).events[0]).toEqual(event);await page.getByRole('button',{name:'Timeline',exact:true}).click();await expect(page.locator('.event-row').filter({hasText:'Later Roster Name'})).toHaveCount(1);
 await page.getByRole('button',{name:'Live match',exact:true}).click();await page.locator('[data-event=point]').click();await expect(modal.locator('[data-shot-player]')).toHaveCount(1);await expect(modal.locator('[data-shot-player="8"]')).toContainText('Later Roster Name');
});
test('fallback credit uses one Mark or defensive event, including Other number',async({page})=>{
 await page.goto('/');await page.getByLabel('Our team',{exact:true}).fill('Home');await page.getByLabel('Opposition',{exact:true}).fill('Away');await page.getByRole('button',{name:'Continue to squad',exact:true}).click();await page.getByRole('button',{name:'Live match',exact:true}).click();
 await page.locator('[data-event="our-kickout"]').click();await page.getByRole('button',{name:'Mark won by us',exact:true}).click();const modal=page.getByRole('dialog');await expect(modal.locator('[data-mark-player]')).toHaveCount(15);await modal.getByLabel('Other number',{exact:true}).fill('23');await modal.getByLabel('Other number',{exact:true}).press('Tab');await expect(modal).not.toBeVisible();expect((await state(page)).events).toHaveLength(1);expect((await state(page)).events[0].markPlayerNumber).toBe('23');
 await page.locator('[data-event="defensive-block"]').click();await expect(modal.locator('button[data-defensive-player]')).toHaveCount(15);await modal.locator('button[data-defensive-player="4"]').click();expect((await state(page)).events).toHaveLength(2);expect((await state(page)).events[1].playerNumber).toBe('4');expect((await state(page)).players).toHaveLength(0);
});
