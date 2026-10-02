import { useEffect, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, X } from 'lucide-react';
import type { GameState, MoneyEvent } from '../game/types';
import { money } from '../game/engine';

export function MoneyToasts({game,busy}:{game:GameState;busy:boolean}) {
 const latest=game.moneyEvents?.at(-1)?.id??0;
 const lastSeen=useRef(latest);
 const [queue,setQueue]=useState<MoneyEvent[]>([]);
 useEffect(()=>{
   if(latest<lastSeen.current){lastSeen.current=latest;setQueue([]);return;}
   const events=(game.moneyEvents??[]).filter(e=>e.id>lastSeen.current);
   lastSeen.current=latest;
   if(events.length)setQueue(previous=>[...previous,...events]);
 },[game.moneyEvents,latest]);
 const batch=queue.slice(0,2);
 const first=batch[0]?.id;
 useEffect(()=>{
   if(busy||first===undefined)return;
   const timer=setTimeout(()=>setQueue(previous=>previous.slice(2)),5500);
   return ()=>clearTimeout(timer);
 },[first,busy]);
 return <div className="money-toasts" role="status" aria-live="polite" aria-atomic="false">{!busy&&batch.map(event=>{
  const credit=event.amount>0,Icon=credit?ArrowDownLeft:ArrowUpRight;
  return <div key={event.id} className={`money-toast ${credit?'credit':'debit'}`}><span className="money-toast-icon"><Icon size={18}/></span><div><strong>{game.players[event.player]?.name} · {credit?'Credit':'Debit'}</strong><p>{event.reason}</p></div><b>{credit?'+':'−'}{money(Math.abs(event.amount))}</b><button className="money-toast-close" aria-label={`Dismiss ${credit?'credit':'debit'} notification`} onClick={()=>setQueue(previous=>previous.filter(e=>e.id!==event.id))}><X size={14}/></button></div>;
 })}</div>;
}
