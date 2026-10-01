import { describe, expect, it } from 'vitest';
import { createGame, transition } from '../src/game/engine';
import { chooseAIAction, decisionPlayer } from '../src/game/ai';
import { lagos } from '../src/data/lagos';
const fresh=()=>createGame(lagos,['Human','AI 1'],[0,1],items=>items,(()=>{let i=0;return ()=>[6,6,1,1][i++%4];})());
describe('balanced computer opponent',()=>{
  it('resolves auctions and reacts to fair and unfair trades',()=>{
    let g=fresh();g.current=1;g.phase='buy';g.players[1].position=5;
    g=transition(g,{type:'auction'},()=>2);
    expect(decisionPlayer(g)).toBe(g.auction!.bidder);
    for(let i=0;i<10&&g.phase==='auction';i++)g=transition(g,chooseAIAction(g),()=>2);
    expect(g.phase).not.toBe('auction');
    g=fresh();g=transition(g,{type:'trade',proposal:{from:0,to:1,give:[],take:[],giveCash:1000,takeCash:0,giveCards:[],takeCards:[]}},()=>2);
    expect(decisionPlayer(g)).toBe(1);expect(chooseAIAction(g)).toEqual({type:'acceptTrade'});
    g.trade!.giveCash=0;g.trade!.takeCash=100000;expect(chooseAIAction(g)).toEqual({type:'rejectTrade'});
  });
  it('plays 1500 legal actions without stuck decisions or negative cash',()=>{
    let g=fresh(),seed=42;
    const dice=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%6+1;};
    for(let i=0;i<1500&&g.phase!=='won';i++) {
      g=transition(g,chooseAIAction(g),dice);
      expect(g.players.every(p=>p.cash>=0)).toBe(true);
    }
  });
});
