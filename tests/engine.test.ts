import { describe, expect, it } from 'vitest';
import { lagos } from '../src/data/lagos';
import { assetActionError, createGame, fee, inventory, transition } from '../src/game/engine';
import { createSession, validateSave } from '../src/game/session';
import type { Action, GameState } from '../src/game/types';

const dice = (...values: number[]) => { let i=0; return () => values[i++ % values.length]; };
const fresh = (count=2): GameState => createGame(lagos, ['Ada','Tunde','Bisi','Chidi'].slice(0,count), [0,1,2,3].slice(0,count), a=>a, dice(6,6,1,1,2,2,3,3));
const act=(g:GameState,a:Action,...rolls:number[])=>transition(g,a,dice(...(rolls.length?rolls:[2,3])));

describe('Lagos board definition',()=>{
  it('keeps each colour group entirely on one non-corner edge',()=>{
    for (const group of Object.keys(lagos.groups)) {
      const positions = lagos.spaces.filter(s=>s.group===group).map(s=>s.id);
      expect(positions.every(id=>id%10!==0)).toBe(true);
      expect(new Set(positions.map(id=>Math.floor(id/10))).size).toBe(1);
    }
    expect(lagos.spaces[31].name).toBe('Lekki');
    expect(lagos.spaces[32].name).toBe('Ikoyi');
    expect(lagos.spaces.slice(1,4).map(s=>s.name)).toEqual(['Agric','Personal Income Levy','Ogolonto']);
    expect(lagos.spaces.filter(s=>s.group==='yellow').map(s=>s.name)).toEqual(['Gbagada','Ogudu','Anthony']);
  });
  it('has 40 spaces, 28 assets, original groups and two landmark utilities',()=>{
    expect(lagos.spaces.map(s=>s.id)).toEqual(Array.from({length:40},(_,i)=>i));
    expect(lagos.spaces.filter(s=>s.price)).toHaveLength(28);
    expect(lagos.spaces.filter(s=>s.type==='utility').map(s=>s.name)).toEqual(['National Theatre','Tafawa Balewa Square']);
    expect(lagos.spaces.filter(s=>s.group==='pink').map(s=>s.name)).toEqual(['Mushin','Yaba','Surulere']);
    expect(lagos.spaces.filter(s=>s.group==='navy').map(s=>s.name)).toEqual(['Bourdillon','Banana Island']);
    expect(lagos.spaces.filter(s=>s.group==='green').map(s=>s.name)).toEqual(['Lekki','Ikoyi','Eko Atlantic']);
    expect(lagos.community).toHaveLength(16);expect(lagos.chance).toHaveLength(16);
  });
});
describe('movement, turns and payments',()=>{
  it('does not allow duplicate purchases or rolling through a pending decision',()=>{
    let g=act(fresh(),{type:'roll'},2,3);
    expect(g.phase).toBe('buy');expect(g.players[0].position).toBe(5);
    expect(()=>act(g,{type:'roll'})).toThrow();
    g=act(g,{type:'buy'});expect(g.players[0].cash).toBe(1300000);
    expect(()=>act(g,{type:'buy'})).toThrow();
    g=act(g,{type:'end'});expect(g.current).toBe(1);expect(g.phase).toBe('roll');
  });
  it('pays Start once for exact landing and preserves prior salaries on Holding transfer',()=>{
    let g=fresh();g.players[0].position=35;g=act(g,{type:'roll'},2,3);
    expect(g.players[0].cash).toBe(1700000);expect(g.players[0].position).toBe(0);
    g=fresh();g.players[0].position=37;g=act(g,{type:'roll'},3,3);
    expect(g.players[0].cash).toBe(1700000);g=act(g,{type:'buy'});g=act(g,{type:'end'});
    g=act(g,{type:'roll'},1,1);g=act(g,{type:'buy'});g=act(g,{type:'end'});
    const cash=g.players[0].cash;g=act(g,{type:'roll'},4,4);expect(g.players[0].holding).toBe(true);expect(g.players[0].cash).toBe(cash);expect(g.extraRoll).toBe(false);
  });
  it('releases on doubles without extra roll; third failure waits for payment before moving',()=>{
    let g=fresh();g.players[0].position=10;g.players[0].holding=true;
    g=act(g,{type:'roll'},2,2);expect(g.players[0].position).toBe(14);expect(g.extraRoll).toBe(false);
    g=fresh();Object.assign(g.players[0],{position:10,holding:true,attempts:2,cash:10000});g.assets[5].owner=0;
    g=act(g,{type:'roll'},1,2);expect(g.phase).toBe('debt');expect(g.players[0].position).toBe(10);
    g=act(g,{type:'mortgage',space:5,player:0});g=act(g,{type:'settle'});expect(g.players[0].position).toBe(13);expect(g.phase).toBe('buy');
  });
  it('calculates group bonuses and BRT / utility overrides',()=>{
    let g=fresh();for(const id of [1,3])g.assets[id].owner=1;
    expect(fee(g,lagos.spaces[1],7)).toBe(8000);g.assets[1].level=1;expect(fee(g,lagos.spaces[1],7)).toBe(20000);
    g.assets[5].owner=1;g.assets[15].owner=1;g.assets[15].mortgaged=true;
    expect(fee(g,lagos.spaces[5],7,true)).toBe(100000);expect(fee(g,lagos.spaces[15],7,true)).toBe(0);
    g.assets[12].owner=1;expect(fee(g,lagos.spaces[12],7)).toBe(28000);expect(fee(g,lagos.spaces[12],7,true)).toBe(70000);
    g.assets[28].owner=1;expect(fee(g,lagos.spaces[12],7)).toBe(70000);
  });
  it('pauses rent debt and completes it after a mortgage',()=>{
    let g=fresh();g.players[0].cash=20000;g.assets[5].owner=1;g.assets[6].owner=0;
    g=act(g,{type:'roll'},2,3);expect(g.phase).toBe('debt');expect(g.payments[0].amount).toBe(25000);
    expect(()=>act(g,{type:'end'})).toThrow();g=act(g,{type:'mortgage',space:6,player:0});g=act(g,{type:'settle'});
    expect(g.players[0].cash).toBe(45000);expect(g.players[1].cash).toBe(1525000);expect(g.phase).toBe('manage');
  });
});
describe('auctions, development, cards and trading',()=>{
  it('records proposed, declined and accepted trade notifications',()=>{
    const proposal={from:0,to:1,give:[],take:[],giveCash:1000,takeCash:0,giveCards:[],takeCards:[]};
    let g=act(fresh(),{type:'trade',proposal});
    expect(g.tradeNotifications?.map(n=>n.status)).toEqual(['proposed']);
    g=act(g,{type:'rejectTrade'});
    expect(g.tradeNotifications?.map(n=>n.status)).toEqual(['declined']);
    g=act(g,{type:'trade',proposal});g=act(g,{type:'acceptTrade'});
    expect(g.tradeNotifications?.map(n=>n.status)).toEqual(['declined','accepted']);
    const history=structuredClone(g.tradeNotifications);
    g=act(g,{type:'readTradeNotifications'});
    expect(g.tradeNotifications?.every(n=>n.read)).toBe(true);
    expect(g.tradeNotifications?.map(n=>n.status)).toEqual(history?.map(n=>n.status));
    g=act(g,{type:'trade',proposal});g=act(g,{type:'readTradeNotifications',player:1});
    expect(g.tradeNotifications?.at(-1)?.readBy).toEqual([1]);
    g=act(g,{type:'acceptTrade'});
    expect(g.tradeNotifications?.at(-1)?.read).toBe(false);
    expect(g.tradeNotifications?.at(-1)?.readBy).toEqual([]);
  });
  it('auction passes persist and highest bid wins exactly once',()=>{
    let g=act(fresh(3),{type:'roll'},2,3);g=act(g,{type:'auction'});g=act(g,{type:'bid',amount:10000});g=act(g,{type:'bid',amount:11000});g=act(g,{type:'pass'});g=act(g,{type:'pass'});
    expect(g.assets[5].owner).toBe(1);expect(g.players[1].cash).toBe(1489000);expect(g.auction).toBe(null);
    expect(()=>act(g,{type:'bid',amount:12000})).toThrow();
  });
  it('requires even development and tracks house/hotel stock through liquidation',()=>{
    let g=fresh();for(const id of [1,3])g.assets[id].owner=0;
    g=act(g,{type:'build',space:1,player:0});expect(assetActionError(g,'build',1,0)).toMatch(/evenly/);
    for(let level=0;level<4;level++)for(const id of [1,3])if(g.assets[id].level<=level)g=act(g,{type:'build',space:id,player:0});
    expect(inventory(g).houses).toBe(24);g=act(g,{type:'build',space:1,player:0});expect(inventory(g)).toEqual({houses:28,hotels:11});
    expect(assetActionError(g,'mortgage',1,0)).toMatch(/development/);g=act(g,{type:'liquidate',space:1,player:0});expect(inventory(g)).toEqual({houses:32,hotels:12});
  });
  it('back-three from 36 draws Community Chest at 33; release cards stay out of decks',()=>{
    let g=fresh();g.players[0].position=31;g.chance=['CH10',...g.chance.filter(c=>c!=='CH10')];g.community=['CC05',...g.community.filter(c=>c!=='CC05')];
    g=act(g,{type:'roll'},2,3);g=act(g,{type:'card'});expect(g.players[0].position).toBe(33);expect(g.pendingCard).toBe('CC05');
    g=act(g,{type:'card'});expect(g.players[0].cards).toEqual(['CC05']);expect(g.community).not.toContain('CC05');
    g.players[0].holding=true;g.players[0].position=10;g.phase='roll';g=act(g,{type:'release',method:'card'});expect(g.community.at(-1)).toBe('CC05');expect(g.phase).toBe('roll');
  });
  it('card utility roll sets the fee but never moves again or earns extra rolls',()=>{
    let g=fresh();g.players[0].position=2;g.chance=['CH07',...g.chance.filter(c=>c!=='CH07')];g.assets[12].owner=1;
    g=act(g,{type:'roll'},2,3);g=act(g,{type:'card'},4,4);expect(g.players[0].position).toBe(12);expect(g.players[0].cash).toBe(1420000);expect(g.extraRoll).toBe(false);
  });
  it('trade revalidates assets and pays incoming mortgage interest atomically',()=>{
    let g=fresh();g.assets[5].owner=0;g.assets[5].mortgaged=true;
    const proposal={from:0,to:1,give:[5],take:[],giveCash:0,takeCash:20000,giveCards:[],takeCards:[]};
    g=act(g,{type:'trade',proposal});g=act(g,{type:'acceptTrade'});expect(g.assets[5].owner).toBe(1);expect(g.players[0].cash).toBe(1520000);expect(g.players[1].cash).toBe(1470000);expect(g.phase).toBe('roll');
    g=act(g,{type:'trade',proposal:{...proposal,from:1,to:0}});g.assets[5].owner=0;expect(()=>act(g,{type:'acceptTrade'})).toThrow(/owner/);
  });
  it('eliminates an insolvent player and transfers assets; rejects premature bankruptcy',()=>{
    let g=fresh(3);g.players[0].cash=1000;g.assets[5].owner=0;g.assets[39].owner=1;
    g.players[0].position=34;g=act(g,{type:'roll'},2,3);expect(g.phase).toBe('debt');expect(()=>act(g,{type:'bankrupt'})).toThrow(/still settle/);
    g.assets[39].level=5;g.payments[0].amount=2000000;g=act(g,{type:'bankrupt'});expect(g.players[0].bankrupt).toBe(true);expect(g.assets[5].owner).toBe(1);expect(g.current).toBe(1);
  });
});
describe('framework and durable browser snapshots',()=>{
  it('migrates old positions and property ownership without changing the input save',()=>{
    const session=createSession('lagos',['Ada','Tunde'],[0,1]);
    const old=JSON.parse(JSON.stringify(session.snapshot()));
    const g=old.state.G;
    delete g.layoutVersion;
    g.assets[2]=g.assets[1];g.assets[1]={owner:null,level:0,mortgaged:false};delete g.assets[29];
    g.assets[29]=g.assets[31];g.assets[31]=g.assets[32];g.assets[32]=g.assets[34];delete g.assets[34];
    g.assets[29].owner=0;g.assets[31].owner=0;g.assets[32].owner=1;
    g.players[0].position=29;g.players[1].position=34;
    const migrated=validateSave(old).state.G;
    expect(migrated.layoutVersion).toBe(3);
    expect(migrated.players.map(p=>p.position)).toEqual([31,2]);
    expect(migrated.assets[31].owner).toBe(0);expect(migrated.assets[32].owner).toBe(0);
    expect(migrated.assets[34].owner).toBe(1);expect(migrated.assets[29].owner).toBeNull();
    expect(old.state.G.players[0].position).toBe(29);
    expect(validateSave(validateSave(old)).state.G).toEqual(migrated);
    session.stop();
  });
  it('restores complete framework state, pending decisions and random continuation',()=>{
    const session=createSession('lagos',['Ada','Tunde'],[0,1]);session.dispatch({type:'roll'});
    const save=validateSave(JSON.parse(JSON.stringify(session.snapshot())));
    const restored=createSession('lagos',['Ada','Tunde'],[0,1],save);expect(restored.get()).toEqual(session.get());
    const progress=(s:ReturnType<typeof createSession>)=>{const g=s.get();if(g.phase==='buy')s.dispatch({type:'buy'});if(s.get().phase==='card')s.dispatch({type:'card'});if(s.get().phase==='manage')s.dispatch({type:'end'});if(s.get().phase==='roll')s.dispatch({type:'roll'});};
    progress(session);progress(restored);expect(restored.get()).toEqual(session.get());
    session.stop();restored.stop();
  });
  it('rejects corrupt ownership, missing decks and unsupported saves',()=>{
    const s=createSession('lagos',['Ada','Tunde'],[0,1]).snapshot();
    const clone=()=>JSON.parse(JSON.stringify(s));let c=clone();c.state.G.assets[1].owner=8;expect(()=>validateSave(c)).toThrow();
    c=clone();c.state.G.community=[];expect(()=>validateSave(c)).toThrow();c=clone();c.format=2;expect(()=>validateSave(c)).toThrow();
  });
  it('keeps mortgage redemption cash integral and loadable',()=>{
    const s=createSession('lagos',['Ada','Tunde'],[0,1]);
    const save=JSON.parse(JSON.stringify(s.snapshot()));save.state.G.assets[5].owner=0;save.state.G.assets[5].mortgaged=true;
    const restored=createSession('lagos',['Ada','Tunde'],[0,1],validateSave(save));
    restored.dispatch({type:'redeem',space:5,player:0});
    expect(restored.get().players[0].cash).toBe(1390000);
    expect(()=>validateSave(JSON.parse(JSON.stringify(restored.snapshot())))).not.toThrow();
  });
});
describe('complete economic game simulations',()=>{
  it('finishes three seeded 4-player games without an unresolved phase or negative cash',()=>{
    for(const seed of [7,88,918]) {
      let random=seed;const roll=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return Math.floor(random/4294967296*6)+1;};
      let g=fresh(4), steps=0;
      // Give each player a complete set so non-trading bots can develop assets.
      for (const [index, group] of Object.keys(lagos.groups).entries()) {
        for (const space of lagos.spaces.filter(s=>s.group===group)) g.assets[space.id].owner=index%4;
      }
      while(g.phase!=='won'&&steps++<10000) {
        let action:Action;
        if(g.transferCharges.length&&g.phase!=='debt')action={type:'transfer',redeem:false};
        else if(g.phase==='roll')action={type:'roll'};
        else if(g.phase==='buy')action={type:g.players[g.current].cash>=lagos.spaces[g.players[g.current].position].price!?'buy':'auction'};
        else if(g.phase==='card')action={type:'card'};
        else if(g.phase==='auction')action={type:'pass'};
        else if(g.phase==='manage') {
          const build=lagos.spaces.find(s=>g.assets[s.id]?.owner===g.current&&!assetActionError(g,'build',s.id,g.current)&&g.players[g.current].cash>300000);
          action=build?{type:'build',space:build.id,player:g.current}:{type:'end'};
        } else if(g.phase==='debt') {
          const d=g.payments[0];
          if(g.players[d.from].cash>=d.amount)action={type:'settle'};
          else {
            const liquidation=lagos.spaces.find(s=>g.assets[s.id]?.owner===d.from&&!assetActionError(g,'liquidate',s.id,d.from));
            const mortgage=lagos.spaces.find(s=>g.assets[s.id]?.owner===d.from&&!assetActionError(g,'mortgage',s.id,d.from));
            action=liquidation?{type:'liquidate',space:liquidation.id,player:d.from}:mortgage?{type:'mortgage',space:mortgage.id,player:d.from}:{type:'bankrupt'};
          }
        }else throw new Error(`Unexpected phase: ${g.phase}`);
        g=transition(g,action,roll);
        expect(g.players.every(p=>Number.isSafeInteger(p.cash)&&p.cash>=0)).toBe(true);
        expect(inventory(g).houses).toBeGreaterThanOrEqual(0);expect(inventory(g).hotels).toBeGreaterThanOrEqual(0);
      }
      expect(g.phase,`seed ${seed} after ${steps} actions`).toBe('won');
      expect(g.players.filter(p=>!p.bankrupt)).toHaveLength(1);
    }
  });
});
