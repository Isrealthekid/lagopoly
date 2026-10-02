import {chromium} from 'playwright';import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:5174/',{waitUntil:'networkidle'});await page.getByRole('button',{name:'Start game',exact:true}).click();
 for(const [width,height] of [[390,844],[820,1180],[1024,768],[657,554],[844,390]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(350);
  const scene=await page.locator('.depth-view').boundingBox();assert.equal(scene.x,0);assert.equal(scene.y,0);assert.equal(scene.width,width);assert.equal(scene.height,height);
  const token=await page.locator('.active-token').boundingBox();assert.ok(token.x>=0&&token.x+token.width<=width&&token.y>=100&&token.y+token.height<height-110,'Camera lost the active piece');
  const actions=await page.locator('.mobile-game-actions').boundingBox();assert.ok(actions.y+actions.height<=height);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight),false);
  await page.screenshot({path:`tests/scene-${width}.png`});console.log(width,height,'scene fills viewport; token',Math.round(token.x),Math.round(token.y));
 }
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{const save=JSON.parse(localStorage.getItem('naija-estates.local.v1'));const g=save.state.G;g.current=0;g.players[0].position=34;g.phase='buy';g.assets[34].owner=null;localStorage.setItem('naija-estates.local.v1',JSON.stringify(save));});
 await page.reload({waitUntil:'networkidle'});const buy=page.getByRole('button',{name:'Buy property',exact:true});let box=await buy.boundingBox();assert.ok(box.y>0&&box.y+box.height<844);await page.getByRole('button',{name:'Details',exact:true}).click();
 const dialog=page.getByRole('dialog');assert.equal(await dialog.locator('.deed-title h3').textContent(),'Eko Atlantic');
 await page.getByRole('button',{name:'Close',exact:true}).click();assert.ok(await buy.isVisible());
 await page.screenshot({path:'tests/scene-purchase.png'});await buy.click();
 await page.getByRole('navigation',{name:'Game actions'}).getByRole('button',{name:/End turn|Roll again/}).click();
 const stage=page.locator('.board-stage');const cameraBefore=await stage.getAttribute('style');
 await page.getByRole('navigation',{name:'Game actions'}).getByRole('button',{name:'Roll dice',exact:true}).click();await page.waitForTimeout(1450);
 const cameraDuring=await stage.getAttribute('style');assert.notEqual(cameraBefore,cameraDuring,'Camera did not move with the turn and piece');
 const positions=new Set(),cameras=new Set();for(let i=0;i<18;i++){positions.add(await page.locator('.active-token').getAttribute('data-position'));cameras.add(await stage.getAttribute('style'));await page.waitForTimeout(180);}
 assert.ok(cameras.size>1&&positions.size>1,'Camera did not track movement');
 await page.getByRole('button',{name:'Following',exact:true}).click();assert.equal(await stage.evaluate(e=>getComputedStyle(e).getPropertyValue('--camera-x').trim()),'0px');
 await page.getByRole('button',{name:'3D VIEW',exact:true}).click();await page.waitForTimeout(250);
 const flat=await page.locator('.game-board').boundingBox(),host=await page.locator('.flat-view').boundingBox();assert.ok(flat.x>=host.x&&flat.y>=host.y&&flat.x+flat.width<=host.x+host.width+1&&flat.y+flat.height<=host.y+host.height+1);
 assert.equal(errors.length,0,errors.join('\n'));console.log('Full-screen scene, overlay actions, purchase, following camera, and flat overview checks passed.');
}finally{await browser.close();}
