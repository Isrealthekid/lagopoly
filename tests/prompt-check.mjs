import {chromium} from 'playwright';import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://localhost:5174',{waitUntil:'networkidle'});await page.getByRole('button',{name:'Gold',exact:true}).click();await page.getByRole('button',{name:'Start game',exact:true}).click();assert.equal(await page.locator('.sculpture.finish-gold').count(),2);
 let found=false;
 for(let attempt=0;attempt<8&&!found;attempt++){
  if(attempt){await page.evaluate(()=>{const save=JSON.parse(localStorage.getItem('naija-estates.local.v1'));const g=save.state.G;g.phase='roll';g.current=0;g.players[0].position=0;g.players[0].holding=false;g.pendingCard=null;g.payments=[];g.doubles=0;localStorage.setItem('naija-estates.local.v1',JSON.stringify(save));});await page.reload({waitUntil:'networkidle'});}
  await page.evaluate(()=>{window.promptAnimations=[];document.addEventListener('animationstart',e=>{if(e.target.classList.contains('prompt-presence'))window.promptAnimations.push(e.animationName);});});
  await page.getByRole('navigation',{name:'Game actions'}).getByRole('button',{name:'Roll dice',exact:true}).click();await page.waitForTimeout(250);
  assert.equal(await page.getByRole('button',{name:'Buy property',exact:true}).isVisible(),false,'Destination action appeared during dice roll');
  const game=await page.evaluate(()=>JSON.parse(localStorage.getItem('naija-estates.local.v1')).state.G);
  if(game.phase!=='buy'){await page.waitForTimeout(4200);continue;}
  found=true;
  await page.waitForTimeout(1100);
  assert.equal(await page.getByRole('button',{name:'Buy property',exact:true}).isVisible(),false,'Destination action appeared while the piece was moving');
  assert.ok(await page.locator('.piece-moving .piece-motion').count()>0,'Movement hop is missing');assert.ok(await page.locator('.piece-step-ring.travelling').count()>0,'Movement ripple is missing');
  const buy=page.getByRole('button',{name:'Buy property',exact:true});await buy.waitFor({state:'visible',timeout:7000});
  assert.equal(Number(await page.locator('.active-token').getAttribute('data-position')),game.players[game.current].position);
  assert.ok((await page.evaluate(()=>window.promptAnimations)).includes('prompt-pop-in'),'Prompt did not animate in');
  await page.waitForTimeout(300);
  const card=await page.locator('.prompt-presence').boundingBox(),button=await buy.boundingBox();assert.ok(card.width<=300&&card.width<390*.8);assert.ok(button.width<240);
  await page.screenshot({path:'tests/compact-prompt.png'});
  await buy.click();
  await page.waitForTimeout(240);assert.ok((await page.evaluate(()=>window.promptAnimations)).includes('prompt-pop-out'),'Prompt did not animate out');assert.equal(await page.locator('.prompt-presence').isVisible(),false);
 }
 await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('.sculpture.finish-gold').count(),2,'Gold finish was not restored');
 await page.getByRole('button',{name:'Exit game',exact:true}).click();await page.getByRole('button',{name:'Silver',exact:true}).click();await page.getByRole('button',{name:'Start game',exact:true}).click();assert.equal(await page.locator('.sculpture.finish-silver').count(),2);
 assert.ok(found,'Could not exercise purchase arrival');assert.equal(errors.length,0,errors.join('\n'));console.log('Arrival gating, compact prompt, pop-in and pop-out checks passed.');
}finally{await browser.close();}
