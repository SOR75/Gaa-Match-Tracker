import { test, expect } from "@playwright/test";
import { blankMatch } from "../../src/domain.js";
import { snapshotSquad, loadSquadPlayers } from "../../src/squads.js";
const state=p=>p.evaluate(()=>JSON.parse(localStorage.getItem("sideline.match.v1")));
const nav=(p,name)=>p.getByRole("button",{name,exact:true}).click();
test("physical 3/4 and GK #16 1/2: OOP is one kicking-team loss in both teams, HT/FT, detailed report and edited/offline recalculation",async({page,context})=>{
 test.setTimeout(60000);
 await page.setViewportSize({width:1024,height:768});
 await page.clock.install({time:new Date("2026-10-30T12:00:00Z")});
 const m=blankMatch();m.setup.ourTeam="Home";m.setup.opposition="Away";
 const roster=Array.from({length:18},(_,i)=>({number:i+1,name:`Player ${i+1}`,role:i<15?"starter":"substitute"}));
 m.players=loadSquadPlayers(snapshotSquad("Home",roster));m.oppositionPlayers=loadSquadPlayers(snapshotSquad("Away",roster));
 await page.goto("/");await page.evaluate(m=>localStorage.setItem("sideline.match.v1",JSON.stringify(m)),m);await page.reload();await nav(page,"Live match");await nav(page,"Start clock");
 const ko=async(type,outcome)=>{
  await page.clock.fastForward(1000);await page.locator(`[data-event="${type}"]`).click();await nav(page,"LONG");await nav(page,outcome);
  if(outcome!=="Out of Play / Sideline")await page.locator('[data-ko-player="8"]').click();
 };
 await ko("our-kickout","Won by us");await ko("our-kickout","Won by us");
 await page.locator('[data-event="substitution"]').click();await page.locator('[data-sub-on="16"]').click();await page.locator('[data-sub-off="1"]').click();await nav(page,"Record substitution");
 await ko("our-kickout","Won by us");await ko("our-kickout","Out of Play / Sideline");
 for(let i=0;i<3;i++)await ko("opposition-kickout","Retained by opposition");await ko("opposition-kickout","Out of Play / Sideline");
 await page.locator('[data-event="interception"]').click();
 const captured=await state(page);
 expect(captured.events.filter(e=>e.event==="our-kickout")).toHaveLength(4);expect(captured.events.filter(e=>e.event==="opposition-kickout")).toHaveLength(4);
 for(const e of captured.events.filter(e=>e.outcome==="out-of-play")){expect(e.kickoutWinnerNumber).toBe("");expect(e.mark).toBe(false);}
 await nav(page,"HALF-TIME ANALYSIS");
 const checkKPIs=async()=>{
  await expect(page.locator('[data-ht-kpi="our-kickouts"]')).toContainText("3 / 4");await expect(page.locator('[data-ht-kpi="our-kickouts"]')).toContainText("75% retained");
  await expect(page.locator('[data-ht-kpi="their-kickouts"]')).toContainText("Won 1 / 4");await expect(page.locator('[data-ht-kpi="their-kickouts"]')).toContainText("25% won by us");
  await expect(page.locator('[data-ht-kpi="turnovers"]')).toContainText("Won 0");
  await expect(page.locator(".ht-method")).toContainText("included as losses for the kicking team");
 };
 await checkKPIs();await nav(page,"START SECOND HALF →");await nav(page,"END MATCH / FULL TIME");await checkKPIs();
 const g=page.locator(`[data-gk-card="our:${captured.players[15].matchPlayerId}"]`),opp=page.locator(`[data-gk-card="opposition:${captured.oppositionPlayers[0].matchPlayerId}"]`);
 const checkGK=async()=>{
  for(const [key,value] of Object.entries({taken:"2",retained:"1 · 50%",lost:"1",out:"1"}))await expect(g.locator(`[data-gk-metric="${key}"]`)).toHaveText(value);
  for(const [key,value] of Object.entries({taken:"4",retained:"3 · 75%",lost:"1",out:"1"}))await expect(opp.locator(`[data-gk-metric="${key}"]`)).toHaveText(value);
 };
 await checkGK();
 const comparison=page.locator(".ht-comparison tr").filter({has:page.getByRole("rowheader",{name:"Our KO retained",exact:true})});
 await expect(comparison.locator("td")).toHaveText(["75% (3/4)","—","75% (3/4)"]);
 await nav(page,"VIEW DETAILED MATCH REPORT");await checkGK();
 const table=page.locator("section.analysis-section").filter({has:page.getByRole("heading",{name:"Kickout analysis",exact:true})}).getByRole("table");
 const ourRow=table.getByRole("row").filter({has:page.getByRole("rowheader",{name:"Our Kickouts · Home",exact:true})});
 const theirRow=table.getByRole("row").filter({has:page.getByRole("rowheader",{name:"Opposition Kickouts · Away",exact:true})});
 expect((await ourRow.getByRole("cell").allTextContents()).slice(0,5)).toEqual(["4","3","1","0","75%"]);
 expect((await theirRow.getByRole("cell").allTextContents()).slice(0,5)).toEqual(["4","1","3","0","75%"]);
 await expect(ourRow.getByRole("cell").last()).toHaveText("1");await expect(theirRow.getByRole("cell").last()).toHaveText("1");
 // Correct an existing OOP to retained; no new kickout and keeper handover stays intact.
 await nav(page,"Timeline");const oop=captured.events.find(e=>e.event==="our-kickout"&&e.outcome==="out-of-play");await page.locator(`[data-edit-event="${oop.id}"]`).click();await page.getByLabel("Kickout result",{exact:true}).selectOption("won");await nav(page,"Save changes");
 await nav(page,"Match analysis");
 await expect(g.locator('[data-gk-metric="retained"]')).toHaveText("2 · 100%");await expect(g.locator('[data-gk-metric="lost"]')).toHaveText("0");await expect(g.locator('[data-gk-metric="out"]')).toHaveText("0");
 expect((await state(page)).events).toHaveLength(captured.events.length);
 await page.reload();await context.setOffline(true);await nav(page,"Match analysis");await expect(g.locator('[data-gk-metric="retained"]')).toHaveText("2 · 100%");
 await context.setOffline(false);
});
