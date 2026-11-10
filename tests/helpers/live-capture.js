// Existing capture regressions now begin play through the real Start button.
// Start-gating acceptance tests deliberately do NOT use this fixture helper.
export async function startCaptureFixture(page) {
 const state=await page.evaluate(()=>{
  const raw=localStorage.getItem('sideline.match.v1');if(!raw)return null;
  const m=JSON.parse(raw),c=m.clock,started=c.periods?.[['H1','H2','ET1','ET2'][c.half-1]]?.hasStarted;
  return {unstarted:typeof started==='boolean'?!started:c.startedAt===null&&c.elapsedMs===0,phase:c.phase||'PLAY',completed:m.lifecycle?.status==='completed'};
 });
 if(!state?.unstarted||state.phase!=='PLAY'||state.completed)return;
 const button=page.locator('[data-action="clock"]');
 if(await button.count()&&await button.isEnabled()){
  await button.click();
  // Preserve the regression fixture's paused timing; this is a deliberate pause.
  await page.getByRole('button',{name:'Pause clock',exact:true}).click();
 }
}
export async function clickCapture(page,selector,options) {
 await startCaptureFixture(page);
 await page.locator(selector).click(options);
}
