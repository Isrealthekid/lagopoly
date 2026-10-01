import { getBoard } from '../data/boards';
import { assetActionError, groupSpaces, managementPlayer, ownsGroup, redemptionCost } from './engine';
import type { Action, GameState } from './types';

export function decisionPlayer(g: GameState): number {
  if(g.phase==='auction')return g.auction!.bidder;
  if(g.phase==='trade')return g.trade!.to;
  return managementPlayer(g);
}

export function chooseAIAction(g: GameState): Action {
  const board=getBoard(g.boardId), id=decisionPlayer(g), player=g.players[id];
  const reserve=150000;
  if(g.transferCharges.length&&g.phase!=='debt')return {type:'transfer',redeem:player.cash>redemptionCost(board.spaces[g.transferCharges[0].space])+reserve};
  if(g.phase==='roll') {
    if(player.holding&&player.cards.length)return {type:'release',method:'card'};
    if(player.holding&&player.cash>reserve+board.releaseFee)return {type:'release',method:'pay'};
    return {type:'roll'};
  }
  if(g.phase==='buy')return {type:player.cash>=board.spaces[player.position].price!+reserve?'buy':'auction'};
  if(g.phase==='card')return {type:'card'};
  if(g.phase==='auction') {
    const s=board.spaces[g.auction!.space], completes=s.group&&groupSpaces(g,s).every(x=>x.id===s.id||g.assets[x.id].owner===id);
    const ceiling=Math.min(player.cash-reserve,Math.round(s.price!*(completes?1.15:.85)));
    const minimum=g.auction!.high+1000;
    const target=g.auction!.high?g.auction!.high+Math.round(s.price!*.1):Math.round(s.price!*.5);
    const bid=Math.min(Math.floor(ceiling/1000)*1000,Math.max(minimum,target));
    return bid>=minimum&&bid<=ceiling?{type:'bid',amount:bid}:{type:'pass'};
  }
  if(g.phase==='trade') {
    const t=g.trade!;
    const value=(ids:number[])=>ids.reduce((sum,asset)=>sum+board.spaces[asset].price!*(g.assets[asset].mortgaged ? 0.5 : 1),0);
    const incoming=value(t.give)+t.giveCash+t.giveCards.length*25000;
    const outgoing=value(t.take)+t.takeCash+t.takeCards.length*25000;
    return {type:incoming>=outgoing*1.05?'acceptTrade':'rejectTrade'};
  }
  if(g.phase==='debt') {
    if(player.cash>=g.payments[0].amount)return {type:'settle'};
    const owned=board.spaces.filter(s=>g.assets[s.id]?.owner===id);
    const sell=owned.find(s=>!assetActionError(g,'sell',s.id,id));
    if(sell)return {type:'sell',space:sell.id,player:id};
    const mortgage=owned.sort((a,b)=>Number(ownsGroup(g,a,id))-Number(ownsGroup(g,b,id))).find(s=>!assetActionError(g,'mortgage',s.id,id));
    if(mortgage)return {type:'mortgage',space:mortgage.id,player:id};
    const liquidate=owned.find(s=>!assetActionError(g,'liquidate',s.id,id));
    return liquidate?{type:'liquidate',space:liquidate.id,player:id}:{type:'bankrupt'};
  }
  const build=board.spaces.find(s=>g.assets[s.id]?.owner===id&&!assetActionError(g,'build',s.id,id)&&player.cash>=s.buildingCost!+reserve);
  if(build)return {type:'build',space:build.id,player:id};
  const redeem=board.spaces.find(s=>g.assets[s.id]?.owner===id&&!assetActionError(g,'redeem',s.id,id)&&player.cash>=redemptionCost(s)+reserve);
  return redeem?{type:'redeem',space:redeem.id,player:id}:{type:'end'};
}
