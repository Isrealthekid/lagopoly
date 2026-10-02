import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:5174/',{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'Start game',exact:true}).click();
 await page.screenshot({path:'tests/tabletop-desktop.png'});
 const initial=await page.locator('.game-board').evaluate(e=>getComputedStyle(e).transform);
 await page.getByRole('button',{name:'Rotate board right'}).click();await page.waitForTimeout(400);
 assert.notEqual(await page.locator('.game-board').evaluate(e=>getComputedStyle(e).transform),initial);
 await page.getByRole('button',{name:'Reset board angle'}).click();await page.waitForTimeout(400);
 const stage=await page.locator('.board-stage').boundingBox();
 await page.mouse.move(stage.x+stage.width*.4,stage.y+stage.height*.4);await page.mouse.down();await page.mouse.move(stage.x+stage.width*.6,stage.y+stage.height*.4,{steps:12});await page.mouse.up();await page.waitForTimeout(400);
 assert.notEqual(await page.locator('.game-board').evaluate(e=>getComputedStyle(e).transform),initial);
 assert.equal(await page.getByRole('dialog').count(),0,'Dragging opened a property');
 await page.getByRole('button',{name:'3D VIEW',exact:true}).click();
 for(const [width,height] of [[1440,900],[820,1180],[768,650],[390,844],[360,640],[844,390]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(200);
  const geometry=await page.evaluate(()=>{
   const host=document.querySelector('.board-scroll'),board=document.querySelector('.game-board'),bar=document.querySelector('.mobile-game-actions');
   const h=host.getBoundingClientRect(),b=board.getBoundingClientRect(),a=bar.getBoundingClientRect();
   return {width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollHeight>innerHeight+1,overflow:document.documentElement.scrollWidth>innerWidth+1,hostScroll:host.scrollWidth>host.clientWidth+1||host.scrollHeight>host.clientHeight+1,fit:b.left>=h.left-1&&b.right<=h.right+1&&b.top>=h.top-1&&b.bottom<=h.bottom+1,boardSize:b.width,barTop:a.top,barBottom:a.bottom};
  });
  console.log(geometry);assert.ok(geometry.fit,'Flat board clipped');assert.equal(geometry.hostScroll,false);assert.equal(geometry.overflow,false);
  assert.equal(geometry.scroll,false);
  if(width<=1000){assert.ok(geometry.barTop>=0&&geometry.barBottom<=height+1);}
  if(width===390)await page.screenshot({path:'tests/tabletop-mobile-flat.png'});
 }
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'FLAT VIEW',exact:true}).click();await page.getByRole('button',{name:'Reset board angle'}).click();await page.waitForTimeout(400);await page.screenshot({path:'tests/tabletop-mobile-3d.png'});
 const bar=page.getByRole('navigation',{name:'Game actions'});
 const before=await page.locator('.active-token').getAttribute('data-position');
 const landing=await page.locator('.dice-landing').first().getAttribute('style');
 await bar.getByRole('button',{name:'Roll dice',exact:true}).click();
 await page.waitForTimeout(300);

 assert.equal(await page.locator('.active-token').getAttribute('data-position'),before,'Piece moved before dice settled');
 assert.equal(await page.locator('.tumbling').count(),1);
 const positions=new Set();
 for(let i=0;i<25;i++){positions.add(await page.locator('.active-token').getAttribute('data-position'));await page.waitForTimeout(180);}
 assert.ok(positions.size>2,'No visible step-by-step movement');
 assert.notEqual(await page.locator('.dice-landing').first().getAttribute('style'),landing,'Dice landed at identical location');
 const game=await page.evaluate(()=>JSON.parse(localStorage.getItem('naija-estates.local.v1')).state.G);
 assert.equal(Number(await page.locator('.active-token').getAttribute('data-position')),game.players[game.current].position);
 console.log('Movement visited', [...positions], 'dice',game.dice);
 if(game.phase==='buy'){
 const buy=page.getByRole('button',{name:'Buy property',exact:true});const b=await buy.boundingBox();assert.ok(b.y+b.height<844);await buy.click();
 }
 const firstLanding=await page.locator('.dice-landing').first().getAttribute('style');
 for(let step=0;step<6;step++){
   const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('naija-estates.local.v1')).state.G);
   if(state.phase==='roll')break;
   if(state.phase==='buy')await page.getByRole('button',{name:'Buy property',exact:true}).click();
   else if(state.phase==='card')await page.getByRole('button',{name:'Apply card',exact:true}).click();
   else if(state.phase==='manage')await bar.getByRole('button',{name:/End turn|Roll again/}).click();
   else break;
   await page.waitForFunction(()=>document.querySelector('.board-hint span')?.textContent==='',{},{timeout:12000});
 }
 if(await bar.getByRole('button',{name:'Roll dice',exact:true}).isEnabled()){
   await bar.getByRole('button',{name:'Roll dice',exact:true}).click();
   await page.waitForTimeout(1500);
   assert.notEqual(await page.locator('.dice-landing').first().getAttribute('style'),firstLanding,'Consecutive rolls used the same landing');
 }
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.reload({waitUntil:'networkidle'});
 assert.equal(await page.locator('.tumbling').count(),0);
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.evaluate(()=>{
   const save=JSON.parse(localStorage.getItem('naija-estates.local.v1'));
   const g=save.state.G;g.current=1;g.aiPlayers=[1];g.phase='roll';g.pendingCard=null;g.payments=[];g.transferCharges=[];g.players[1].position=0;g.players[1].holding=false;g.doubles=0;
   localStorage.setItem('naija-estates.local.v1',JSON.stringify(save));
 });
 await page.reload({waitUntil:'networkidle'});
 await page.locator('.tumbling').waitFor({state:'visible',timeout:6000});
 assert.equal(await page.locator('.active-token').getAttribute('data-position'),'0','AI piece moved before its dice settled');
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('Tabletop checks passed');
} finally {await browser.close();}
