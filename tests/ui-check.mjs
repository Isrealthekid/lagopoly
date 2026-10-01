import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:5173/',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Start game',exact:true}).click();
  assert.match(await page.title(),/MONOPOLY.*LAG-EDITION/);
  assert.equal(await page.locator('.space').count(),40);
  assert.ok(await page.evaluate(()=>document.fonts.check('12px "Inter Variable"')));
  assert.match(await page.locator('.space-name').first().evaluate(e=>getComputedStyle(e).fontFamily),/Inter/);
  assert.equal(await page.locator('.board-scroll').evaluate(e=>e.classList.contains('zoomed')),false);
  assert.ok(await page.locator('.game-board').evaluate(e=>e.clientWidth>=790));
  for(const [edge,angle] of [[0,'0deg'],[1,'90deg'],[2,'180deg'],[3,'-90deg']]){
    const labels=page.locator(`.space.edge-${edge}:not(.corner) .space-content`);
    const actual=await labels.evaluateAll(es=>es.map(e=>getComputedStyle(e).getPropertyValue('--label-angle').trim()||'0deg'));
    assert.ok(actual.every(a=>a===angle),`Incorrect label orientation on edge ${edge}`);
  }
  for(const width of [390,900]){
    await page.setViewportSize({width,height:1000});
    const bar=page.getByRole('navigation',{name:'Game actions'});
    assert.ok(await bar.isVisible());
    await bar.getByRole('button',{name:'My assets',exact:true}).click();
    assert.ok(await page.getByRole('dialog').isVisible());
    await page.getByRole('button',{name:'Close',exact:true}).click();
    await bar.getByRole('button',{name:'Trade',exact:true}).click();
    assert.ok(await page.getByRole('dialog').isVisible());
    await page.getByRole('button',{name:'Close',exact:true}).click();
    assert.equal(await page.locator('.players-section').isVisible(),false);
  }
  await page.setViewportSize({width:1440,height:900});
  assert.equal(await page.getByRole('navigation',{name:'Game actions'}).isVisible(),false);
  assert.ok(await page.locator('.players-section').isVisible());
  const groups=await page.locator('.space.property').evaluateAll(elements=>{
    const groups={};
    for(const element of elements){
      const style=getComputedStyle(element);
      (groups[getComputedStyle(element.querySelector('.group-strip')).backgroundColor]??=[]).push({row:style.gridRowStart,column:style.gridColumnStart});
    }
    return Object.values(groups);
  });
  assert.equal(groups.length,8);
  for(const group of groups)assert.ok(group.every(s=>s.row===group[0].row)||group.every(s=>s.column===group[0].column),'Colour group crosses a corner');
  assert.equal(await page.locator('.board-brand h1').textContent(),'MONOPOLY');
  assert.equal(await page.locator('.space.property').first().evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(206, 227, 199)');
  assert.equal(await page.locator('.group-strip').first().evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(121, 83, 160)');
  assert.equal(await page.locator('.die').first().evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(223, 30, 39)');
  await page.screenshot({path:'tests/restyled-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Yaba, N140k',exact:false}).click();
  assert.equal(await page.locator('.deed-title h3').textContent(),'Yaba');
  assert.equal(await page.locator('.deed-paper .rent-table>div').count(),6);
  await page.screenshot({path:'tests/restyled-deed.png'});
  await page.getByRole('button',{name:'Close',exact:true}).click();
  for(const width of [390,360,768]){
    await page.setViewportSize({width,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Overflow at ${width}`);
    const brand=await page.locator('.board-brand h1').evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth}));
    assert.ok(brand.scroll<=brand.width+1,`Brand text overflow at ${width}`);
    await page.screenshot({path:`tests/restyled-${width}.png`,fullPage:true});
    await page.getByRole('button',{name:'Agric, N60k',exact:false}).click();
    const dialog=await page.getByRole('dialog').evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth}));
    assert.ok(dialog.scroll<=dialog.width+1,`Deed overflow at ${width}`);
    await page.getByRole('button',{name:'Close',exact:true}).click();
  }
  assert.equal(errors.length,0,errors.join('\n'));
  for(const [width,height] of [[1440,450],[900,500],[390,844]]){
    await page.setViewportSize({width,height});
    const dimensions=await page.locator('.game-board').evaluate(e=>({width:e.clientWidth,font:parseFloat(getComputedStyle(e.querySelector('.space-name')).fontSize)}));
    assert.ok(dimensions.width>=790,'Board shrank below readable dimensions');
    assert.ok(dimensions.font>=9,'Labels shrank at browser zoom');
    assert.equal(await page.locator('.owner-marker').count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  const bar=page.getByRole('navigation',{name:'Game actions'});
  await bar.getByRole('button',{name:'Trade',exact:true}).click();
  await page.getByLabel('Cash (N)',{exact:true}).first().fill('1000');
  await page.getByRole('button',{name:'Propose trade'}).click();
  assert.equal(await bar.locator('.trade-badge').textContent(),'1');
  assert.ok(await bar.locator('.trade-badge.proposed').count());
  await page.getByRole('button',{name:'Decline trade',exact:true}).click();
  assert.ok(await bar.locator('.trade-badge.declined').count());
  await bar.locator('.trade-button').click();
  assert.equal(await bar.locator('.trade-badge').count(),0);
  await page.getByRole('button',{name:'New trade',exact:true}).click();
  await page.getByLabel('Cash (N)',{exact:true}).first().fill('1000');
  await page.getByRole('button',{name:'Propose trade'}).click();
  assert.equal(await bar.locator('.trade-badge').textContent(),'1');
  assert.equal(await bar.locator('.trade-badge').count(),1);
  await page.getByRole('button',{name:'Accept trade',exact:true}).click();
  assert.ok(await bar.locator('.trade-badge.accepted').count());
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.locator('.mobile-game-actions .trade-badge.accepted').textContent(),'1');
  await page.locator('.mobile-game-actions .trade-button').click();
  assert.equal(await page.locator('.mobile-game-actions .trade-badge').count(),0);
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.locator('.trade-badge').count(),0);
  for(const position of [1,13,24,34]){
    await page.evaluate(position=>{
      const save=JSON.parse(localStorage.getItem('naija-estates.local.v1'));
      save.state.G.players[save.state.G.current].position=position;
      localStorage.setItem('naija-estates.local.v1',JSON.stringify(save));
    },position);
    await page.reload({waitUntil:'networkidle'});
    const focused=await page.locator('.board-scroll').evaluate(host=>{
      const frame=host.getBoundingClientRect(),token=host.querySelector('.active-token').getBoundingClientRect();
      return token.left>=frame.left&&token.right<=frame.right&&token.top>=frame.top&&token.bottom<=frame.bottom;
    });
    assert.ok(focused,`Active token not visible at position ${position}`);
  }
  console.log('UI checks passed: project name, board colours, red dice, deed layout, and desktop/mobile framing.');
  await page.evaluate(()=>{
    const save=JSON.parse(localStorage.getItem('naija-estates.local.v1'));
    save.state.G.assets[19].owner=0;
    save.state.G.players[save.state.G.current].position=19;
    localStorage.setItem('naija-estates.local.v1',JSON.stringify(save));
  });
  await page.reload({waitUntil:'networkidle'});
  const owned=page.locator('[data-space="19"]');
  assert.equal(await owned.locator('.owner-dot').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(24, 102, 72)');
  assert.ok(await owned.evaluate(e=>Number(getComputedStyle(e.querySelector('.tile-tokens')).zIndex)>Number(getComputedStyle(e.querySelector('.group-strip')).zIndex)),'Token is behind the asset band');
}finally{await browser.close();}
