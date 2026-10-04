import { useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import type { BoardDefinition, GameState, Trade as TradeProposal } from '../game/types';
import { money, groupSpaces } from '../game/engine';
import { Modal } from './Modal';

export function Trade({ game, board, from, close, propose }: { game: GameState; board: BoardDefinition; from: number; close: () => void; propose: (t: TradeProposal) => void }) {
  const [to, setTo] = useState(game.players.find(p=>p.id!==from&&!p.bankrupt)!.id);
  const [give, setGive] = useState<number[]>([]), [take, setTake] = useState<number[]>([]);
  const [giveCards, setGiveCards] = useState<string[]>([]), [takeCards, setTakeCards] = useState<string[]>([]);
  const [giveCash,setGiveCash] = useState('0'), [takeCash,setTakeCash] = useState('0');
  const debt = game.phase === 'debt';
  const toggle = <T,>(items:T[], value:T) => items.includes(value)?items.filter(v=>v!==value):[...items,value];
  const assetList = (owner:number, selected:number[], change:(ids:number[])=>void) => <div className="trade-assets">{board.spaces.filter(s=>game.assets[s.id]?.owner===owner).map(s=>{const built=groupSpaces(game,s).some(x=>game.assets[x.id].level>0);return <label key={s.id} className={built?'unavailable':''}><input type="checkbox" checked={selected.includes(s.id)} disabled={built||(debt&&owner===to)} onChange={()=>change(toggle(selected,s.id))}/><span>{s.name}<small>{game.assets[s.id].mortgaged?'Mortgaged':built?'Sell group development first':money(s.price!)}</small></span></label>;})}{!board.spaces.some(s=>game.assets[s.id]?.owner===owner)&&<p className="empty-state">No assets yet</p>}</div>;
  return <Modal title={debt?'Sell assets to raise cash':'Make a trade'} close={close} wide>
    <div className="trade-columns"><section><h3>{game.players[from].name} offers</h3><label className="cash-field">Cash (N)<input type="number" min={0} step={1000} disabled={debt} value={giveCash} onChange={e=>setGiveCash(e.target.value)}/></label>{assetList(from,give,setGive)}{game.players[from].cards.map(c=><label className="card-checkbox" key={c}><input type="checkbox" checked={giveCards.includes(c)} onChange={()=>setGiveCards(toggle(giveCards,c))}/> Kirikiri-release card ({c})</label>)}</section>
    <section><select aria-label="Trade partner" value={to} onChange={e=>{setTo(+e.target.value);setTake([]);setTakeCards([]);}}>{game.players.filter(p=>p.id!==from&&!p.bankrupt).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><label className="cash-field">Cash (N)<input type="number" min={0} step={1000} value={takeCash} onChange={e=>setTakeCash(e.target.value)}/></label>{assetList(to,take,setTake)}{game.players[to].cards.map(c=><label className="card-checkbox" key={c}><input type="checkbox" disabled={debt} checked={takeCards.includes(c)} onChange={()=>setTakeCards(toggle(takeCards,c))}/> Kirikiri-release card ({c})</label>)}</section></div>
    <p className="trade-note">Incoming mortgaged assets carry a 10% transfer charge. Mortgages remain active until redeemed.</p>
    <button className="primary full" onClick={()=>propose({from,to,give,take,giveCash:Number(giveCash),takeCash:Number(takeCash),giveCards,takeCards})}><ArrowLeftRight size={18}/> Propose trade</button>
  </Modal>;
}
