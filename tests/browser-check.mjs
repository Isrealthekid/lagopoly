import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.getByRole('textbox', {name:'Player 1 name'}).fill('Ada');
  await page.getByRole('textbox', {name:'Player 2 name'}).fill('Tunde');
  await page.getByRole('button', {name:'Start game',exact:true}).click();
  assert.equal(await page.locator('.space').count(), 40);
  assert.equal(await page.locator('.player-row').count(), 2);
  assert.equal(await page.locator('.skyline').evaluate(e => e.complete && e.naturalWidth > 0), true);
  await page.screenshot({path:'tests/desktop.png',fullPage:true});
  for(let i=0;i<24;i++) {
    const phase=await page.evaluate(()=>JSON.parse(localStorage.getItem('naija-estates.local.v1')).state.G.phase);
    if(phase==='roll')await page.getByRole('button',{name:/Roll dice|Try for doubles/}).click();
    else if(phase==='buy')await page.getByRole('button',{name:'Buy property',exact:true}).click();
    else if(phase==='card')await page.getByRole('button',{name:'Apply card'}).click();
    else if(phase==='manage')await page.getByRole('button',{name:/End turn|Continue to extra roll/}).click();
    else break;
  }
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('naija-estates.local.v1')).state.G);
  await page.reload({waitUntil:'networkidle'});
  const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('naija-estates.local.v1')).state.G);
  assert.deepEqual(after,before);
  await page.getByRole('button',{name:'National Theatre, N150k',exact:false}).click();
  assert.equal(await page.getByRole('dialog').count(),1);
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:'Rules',exact:true}).click();
  assert.equal(await page.getByRole('dialog').count(),1);
  await page.keyboard.press('Escape');
  for(const width of [390,360,768]) {
    await page.setViewportSize({width,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Overflow at ${width}`);
    await page.screenshot({path:`tests/mobile-${width}.png`,fullPage:true});
    if(width===390) {
      if(await page.getByRole('button',{name:'Zoom out board'}).isVisible())await page.getByRole('button',{name:'Zoom out board'}).click();
      await page.getByRole('button',{name:'Zoom in board'}).click();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.equal(await page.locator('.game-board').evaluate(e=>e.getBoundingClientRect().width),1000);
      await page.getByRole('button',{name:'Zoom out board'}).click();
    }
  }
  await page.getByRole('button',{name:'New game',exact:true}).click();
  await page.getByRole('button',{name:'Player 1: Plane',exact:true}).click();
  await page.getByRole('button',{name:'Add player',exact:true}).click();
  await page.getByRole('button',{name:'Add player',exact:true}).click();
  await page.getByRole('button',{name:'Start game',exact:true}).click();
  assert.equal(await page.locator('.player-row').count(),4);
  assert.equal(await page.evaluate(()=>new Set(JSON.parse(localStorage.getItem('naija-estates.local.v1')).state.G.players.map(p=>p.token)).size),4);
  const loadScenario=async(save)=>{
    await page.getByRole('button',{name:'Table settings'}).click();
    await page.locator('input[type=file]').setInputFiles({name:'scenario.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(save))});
    await page.getByRole('dialog').waitFor({state:'hidden'});
  };
  let scenario=await page.evaluate(()=>JSON.parse(localStorage.getItem('naija-estates.local.v1')));
  scenario.state.G.current=0;scenario.state.G.phase='manage';
  for(const id of [1,3])scenario.state.G.assets[id].owner=0;
  await loadScenario(scenario);
  await page.getByRole('button',{name:'Agric, N60k',exact:false}).click();
  await page.getByRole('button',{name:'Develop',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Develop',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'Liquidate group'}).click();
  await page.getByRole('button',{name:'Mortgage',exact:true}).click();
  await page.getByRole('button',{name:'Redeem',exact:true}).click();
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:'Trade',exact:true}).click();
  await page.getByLabel('Cash (N)',{exact:true}).nth(0).fill('1000');
  await page.getByRole('button',{name:'Propose trade'}).click();
  await page.getByRole('button',{name:'Accept trade'}).click();
  scenario=await page.evaluate(()=>JSON.parse(localStorage.getItem('naija-estates.local.v1')));
  scenario.state.G.phase='debt';scenario.state.G.payments=[{from:0,to:1,amount:20000,reason:'Test rent'}];scenario.state.G.players[0].cash=0;
  await loadScenario(scenario);
  await page.getByRole('button',{name:'Agric, N60k',exact:false}).click();
  await page.getByRole('button',{name:'Mortgage',exact:true}).click();
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:'Settle payment'}).click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('naija-estates.local.v1')).state.G.phase),'manage');
  await page.getByRole('button',{name:'Table settings'}).click();
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download saved table'}).click();
  assert.match((await downloadPromise).suggestedFilename(),/monopoly-lagos-turn-\d+\.json/);
  await page.getByRole('button',{name:'Close',exact:true}).click();
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('Browser checks passed: 40 tiles, 2-4 players, gameplay, saves, imports/exports, development, mortgages, trades, debt, dialogs, artwork, zoom, and responsive layouts.');
} finally { await browser.close(); }
