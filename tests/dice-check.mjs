import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.goto('http://localhost:5173/');
  await page.getByRole('button',{name:'Start game',exact:true}).click();
  const button=page.locator('button').filter({hasText:/^Roll dice/});
  for(const element of await button.all())if(await element.isVisible()){await element.click();break;}
  await page.locator('.tumbling').waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({path:`tests/dice-flight-${width}.png`});
  const moving=await page.locator('.die.cube').first().evaluate(e=>getComputedStyle(e).transform);
  await page.waitForTimeout(1200);
  assert.ok(await page.locator('.tumbling').count(),'Camera must hold on the settled dice');
  assert.equal(await page.locator('.piece-moving').count(),0,'Pieces must wait until the dice hold finishes');
  assert.notEqual(await page.locator('.die.cube').first().evaluate(e=>getComputedStyle(e).transform),moving);
  const state=await page.locator('.cube-tray').evaluate(e=>({label:e.getAttribute('aria-label'),width:e.clientWidth,parent:e.parentElement.parentElement.clientWidth,points:[...e.querySelectorAll('.dice-landing')].map(d=>({x:parseFloat(d.style.left),y:parseFloat(d.style.top)}))}));
  assert.equal(state.label,'Dice rolling');
  for(const p of state.points)assert.ok(p.x>=12&&p.x<=88&&p.y>=12&&p.y<=88);
  assert.ok(Math.hypot(state.points[0].x-state.points[1].x,state.points[0].y-state.points[1].y)>=20);
  await page.screenshot({path:`tests/dice-landed-${width}.png`});
  await page.waitForTimeout(1900);
  assert.equal(await page.locator('.tumbling').count(),0);
  assert.match(await page.locator('.cube-tray').getAttribute('aria-label'),/Dice: [1-6] and [1-6]/);
  console.log(width,state);await page.close();
 }
}finally{await browser.close();}
