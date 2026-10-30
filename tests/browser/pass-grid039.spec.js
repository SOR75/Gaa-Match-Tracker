import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { blankMatch } from "../../src/domain.js";
import { snapshotSquad, loadSquadPlayers } from "../../src/squads.js";
const root = "/workspace/sideline-v039-pass-one-screen-review";
const state = p => p.evaluate(() => JSON.parse(localStorage.getItem("sideline.match.v1")));
const nav = (p, name) => p.getByRole("button", { name, exact: true }).click();
const from = (p,n) => p.locator(`[data-pass-from="${n}"]`);
const to = (p,n) => p.locator(`[data-pass-to="${n}"]`);
async function seed(page, anonymous = false) {
 await page.setViewportSize({width:1024,height:768});
 const m=blankMatch();
 m.setup.ourTeam="Harbour Athletic";m.setup.opposition="Mountain Rovers";
 const roster=Array.from({length:18},(_,i)=>({number:i+1,name:`Player ${i+1}`,role:i<15?"starter":"substitute"}));
 m.players=loadSquadPlayers(snapshotSquad("Test squad",roster));
 m.oppositionPlayers=anonymous?roster.map(p=>({...p,id:`anonymous-${p.number}`,name:""})):loadSquadPlayers(snapshotSquad("Away squad",roster));
 await page.goto("/");
 await page.evaluate(m=>localStorage.setItem("sideline.match.v1",JSON.stringify(m)),m);
 await page.reload();await nav(page,"Live match");await page.evaluate(()=>document.fonts.ready);
}
async function grids(page,on="8",off="18") {
 const d=page.getByRole("dialog");
 await expect(d.getByRole("heading",{name:"Pass",exact:true})).toBeVisible();
 await expect(d.locator("select")).toHaveCount(0);
 for(const [label,attribute] of [["FROM","data-pass-from"],["TO","data-pass-to"]]) {
  const group=d.getByRole("group",{name:label,exact:true});
  await expect(group.locator("button")).toHaveCount(15);
  await expect(group.locator(`[${attribute}="${on}"]`)).toBeVisible();
  await expect(group.locator(`[${attribute}="${off}"]`)).toHaveCount(0);
 }
 await expect(d.getByRole("heading",{name:"PASS TYPE",exact:true})).toBeVisible();
 for(const name of ["Hand Pass","Kick Pass"])await expect(d.getByRole("button",{name,exact:true})).toBeVisible();
 await expect(d.getByRole("button",{name:/^(Save|Next|Back|Record pass|Skip)$/i})).toHaveCount(0);
 const geometry=await d.locator("[data-pass-from],[data-pass-to],[data-pass-type]").evaluateAll(ns=>ns.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};}));
 for(const r of geometry){expect(r.width).toBeGreaterThanOrEqual(44);expect(r.height).toBeGreaterThanOrEqual(44);expect(r.y).toBeGreaterThanOrEqual(0);expect(r.bottom).toBeLessThanOrEqual(768);}
 expect(await d.evaluate(n=>n.scrollHeight<=n.clientHeight)).toBe(true);
 const a=await d.getByRole("group",{name:"FROM",exact:true}).boundingBox();
 const b=await d.getByRole("group",{name:"TO",exact:true}).boundingBox();
 expect(Math.abs(a.y-b.y)).toBeLessThan(1);expect(b.x).toBeGreaterThan(a.x+a.width);
}
async function pass(page,a,b,type="Kick Pass"){
 await page.locator('[data-event="pass"]').click();await from(page,a).click();await to(page,b).click();await nav(page,type);
}
test("one-screen landscape: both complete grids/type visible; selections change in place; type completes one event",async({page})=>{
 await mkdir(root,{recursive:true});await seed(page);
 const before=await state(page);
 await page.locator('[data-event="pass"]').click();await grids(page);
 const d=page.getByRole("dialog");
 await expect(d.getByRole("button",{name:"Kick Pass",exact:true})).toBeDisabled();
 await expect(d.getByRole("button",{name:"Hand Pass",exact:true})).toBeDisabled();
 await page.screenshot({path:`${root}/01-complete-pass-panel.png`});
 await from(page,8).click();
 await expect(d.getByRole("button",{name:"Kick Pass",exact:true})).toBeDisabled();
 await from(page,4).click();await to(page,15).click();await to(page,11).click();
 await expect(from(page,4)).toHaveAttribute("aria-pressed","true");await expect(from(page,8)).toHaveAttribute("aria-pressed","false");
 await expect(to(page,11)).toHaveAttribute("aria-pressed","true");await expect(to(page,15)).toHaveAttribute("aria-pressed","false");
 await expect(from(page,4)).toHaveClass(/chosen/);await expect(to(page,11)).toHaveClass(/chosen/);
 await expect(d.getByRole("button",{name:"Kick Pass",exact:true})).toBeEnabled();
 await grids(page);expect(await state(page)).toEqual(before);
 await page.screenshot({path:`${root}/02-from4-to11-selected.png`});
 await nav(page,"Kick Pass");await expect(d).not.toBeVisible();
 const m=await state(page);expect(m.events).toHaveLength(1);
 expect(m.events[0]).toMatchObject({event:"pass",playerNumber:"4",receiverNumber:"11",passType:"kick"});
 expect(m.events[0].participants.player.matchPlayerId).toBe(m.players[3].matchPlayerId);
 expect(m.events[0].participants.receiver.matchPlayerId).toBe(m.players[10].matchPlayerId);
 await expect(page.locator("[data-next-pass]")).toHaveCount(0);
 await expect(page.locator('[data-event="pass"]')).toHaveCount(1);
 await page.waitForTimeout(700);await page.locator('[data-event="pass"]').click();
 await expect(d.locator('[aria-pressed="true"]')).toHaveCount(0);
 await expect(d.getByRole("button",{name:"Hand Pass",exact:true})).toBeDisabled();
});
for(const team of ["our","opposition"])test(`${team} substitution updates FROM and TO while preserving one-screen capture`,async({page})=>{
 await mkdir(root,{recursive:true});await seed(page);await page.locator(`[data-team="${team}"]`).click();
 await page.locator('[data-event="substitution"]').click();await page.locator('[data-sub-on="18"]').click();await page.locator('[data-sub-off="10"]').click();await nav(page,"Record substitution");
 await page.locator('[data-event="pass"]').click();await grids(page,"18","10");
 if(team==="our")await page.screenshot({path:`${root}/03-pass-after-substitution.png`});
 await from(page,18).click();await to(page,11).click();await nav(page,"Hand Pass");
 const m=await state(page);expect(m.events).toHaveLength(2);expect(m.events[1]).toMatchObject({event:"pass",team,playerNumber:"18",receiverNumber:"11",passType:"hand"});
});
for(const selection of ["none","from","both","to-first"])test(`close with ${selection} selected discards draft; TO-first also cannot record alone`,async({page})=>{
 await seed(page);const before=await state(page);await page.locator('[data-event="pass"]').click();
 if(selection==="from"||selection==="both")await from(page,4).click();
 if(selection==="both"||selection==="to-first")await to(page,11).click();
 if(selection==="to-first"){
  await expect(page.getByRole("button",{name:"Hand Pass",exact:true})).toBeDisabled();
  await page.locator('[data-pass-type="hand"]').dispatchEvent("click");
 }
 await nav(page,"Close Pass");expect(await state(page)).toEqual(before);
});
test("two selected passes then normal Goal preserve independent IDs/time/order, Timeline, reload and native History Resume",async({page})=>{
 await page.clock.install({time:new Date("2026-10-30T12:00:00Z")});await seed(page);await nav(page,"Start clock");await page.clock.fastForward(2000);
 await pass(page,4,11);const first=(await state(page)).events[0];await page.clock.fastForward(3000);await pass(page,11,15);
 const two=await state(page),second=two.events[1];expect(two.events).toHaveLength(2);expect(two.events[0]).toEqual(first);expect(second.id).not.toBe(first.id);expect(second.timeMs).toBeGreaterThan(first.timeMs);expect(Date.parse(second.createdAt)).toBeGreaterThan(Date.parse(first.createdAt));expect(Object.keys(second).sort()).toEqual(Object.keys(first).sort());
 expect(second).toMatchObject({playerNumber:"11",receiverNumber:"15",directScoreLink:"",buildUpLink:""});
 await expect(page.locator("[data-next-pass]")).toHaveCount(0);await page.clock.fastForward(2000);
 await page.locator('[data-event="goal"]').click();await page.locator('[data-shot-player="15"]').click();await page.keyboard.press("Escape");await nav(page,"Pause clock");
 const saved=await state(page);expect(saved.events).toHaveLength(3);expect(saved.events.slice(0,2)).toEqual(two.events);expect(saved.events[2]).toMatchObject({event:"goal",playerNumber:"15",shotSource:"open-play",directScoreLink:""});
 await nav(page,"Timeline");await expect(page.locator(".event-row").filter({hasText:"#4 → #11"})).toHaveCount(1);await expect(page.locator(".event-row").filter({hasText:"#11 → #15"})).toHaveCount(1);
 await page.reload();expect((await state(page)).events).toEqual(saved.events);
 await page.evaluate(m=>{localStorage.setItem("sideline.match.archive."+m.id,JSON.stringify(m));localStorage.setItem("sideline.match.v1",JSON.stringify({...m,id:"different-current",events:[]}));},saved);
 await page.reload();await nav(page,"Match History");const card=page.locator(`[data-history-id="${saved.id}"]`);await card.locator("summary").click();page.once("dialog",d=>d.accept());await card.getByRole("button",{name:"RESUME MATCH",exact:true}).click();await expect.poll(async()=>(await state(page)).id).toBe(saved.id);expect((await state(page)).events).toEqual(saved.events);
 await expect(page.locator(".score-team.our .score-total")).toHaveText("1-0");
});
test("anonymous opposition numbered participants respect substitution without permanent IDs",async({page})=>{
 await seed(page,true);await page.locator('[data-team="opposition"]').click();await page.locator('[data-event="substitution"]').click();await page.locator('[data-sub-on="18"]').click();await page.locator('[data-sub-off="10"]').click();await nav(page,"Record substitution");
 await page.locator('[data-event="pass"]').click();await grids(page,"18","10");await from(page,18).click();await to(page,11).click();await nav(page,"Hand Pass");
 const e=(await state(page)).events[1];expect(e).toMatchObject({event:"pass",team:"opposition",playerNumber:"18",receiverNumber:"11"});expect(e.participants.player.playerId).toBeNull();
});
test("no-squad fallback and Other number record independently without creating players",async({page})=>{
 await seed(page);await page.evaluate(()=>{const m=JSON.parse(localStorage.getItem("sideline.match.v1"));m.oppositionPlayers=[];localStorage.setItem("sideline.match.v1",JSON.stringify(m));});await page.reload();await nav(page,"Live match");await page.locator('[data-team="opposition"]').click();await page.locator('[data-event="pass"]').click();
 await expect(page.locator("[data-pass-from]")).toHaveCount(15);await expect(page.locator("[data-pass-to]")).toHaveCount(15);
 const other=page.locator(".pass-roster").filter({has:page.getByRole("group",{name:"FROM",exact:true})}).getByLabel("Other number",{exact:true});await other.fill("23");await to(page,8).click();
 await expect(page.getByRole("button",{name:"Kick Pass",exact:true})).toBeEnabled();
 await other.fill("");await expect(page.getByRole("button",{name:"Kick Pass",exact:true})).toBeDisabled();
 await other.fill("23");await from(page,4).click();await expect(other).toHaveValue("");
 await other.fill("23");await expect(from(page,4)).toHaveAttribute("aria-pressed","false");await nav(page,"Kick Pass");
 const m=await state(page);expect(m.oppositionPlayers).toEqual([]);expect(m.events).toHaveLength(1);expect(m.events[0]).toMatchObject({team:"opposition",playerNumber:"23",receiverNumber:"8"});
});
for(const [name,viewport] of [["portrait",{width:768,height:1024}],["phone",{width:390,height:844}]])test(`${name}: single panel retains all controls without horizontal clipping`,async({page})=>{
 await seed(page);await page.setViewportSize(viewport);await page.locator('[data-event="pass"]').click();const d=page.getByRole("dialog");await expect(d.getByRole("group",{name:"FROM",exact:true})).toHaveCount(1);await expect(d.getByRole("group",{name:"TO",exact:true})).toHaveCount(1);expect(await d.evaluate(n=>n.scrollWidth<=n.clientWidth)).toBe(true);await from(page,4).click();await to(page,11).click();await nav(page,"Kick Pass");expect((await state(page)).events).toHaveLength(1);
});
