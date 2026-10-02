import {chromium} from 'playwright';import assert from 'node:assert/strict';
const b=await chromium.launch({channel:'msedge',headless:true});try{
 const p=await b.newPage({viewport:{width:390,height:844}});await p.goto('http://localhost:5174',{waitUntil:'networkidle'});await p.getByRole('button',{name:'Start game',exact:true}).click();
 await p.evaluate(()=>{const save=JSON.parse(localStorage.getItem('naija-estates.local.v1'));save.state.G.current=0;save.state.G.phase='buy';save.state.G.players[0].position=1;localStorage.setItem('naija-estates.local.v1',JSON.stringify(save));});await p.reload({waitUntil:'networkidle'});
 await p.getByRole('button',{name:'Buy property',exact:true}).click();await p.locator('.money-toast.debit').waitFor({state:'visible'});assert.match(await p.locator('.money-toast').textContent(),/Property purchase.*Agric/);await p.screenshot({path:'tests/money-toast.png'});
 await p.getByRole('button',{name:'Dismiss debit notification'}).click();assert.equal(await p.locator('.money-toast').count(),0);
 await p.reload({waitUntil:'networkidle'});assert.equal(await p.locator('.money-toast').count(),0,'Old notifications replayed on restore');console.log('Debit toast, property reason, dismissal, and restore checks passed.');
}finally{await b.close();}
