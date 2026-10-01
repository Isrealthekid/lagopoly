import type { Action, GameState } from '../game/types';
import type { Session } from '../game/session';
import { api, type OnlineRoom } from './api';

export function createOnlineSession(initial:OnlineRoom, onError:(message:string)=>void):Session {
  let room=initial, timer:ReturnType<typeof setInterval>|null=null, running=false, fetching=false, moving=false;
  const listeners=new Set<(g:GameState)=>void>();
  const update=(next:OnlineRoom)=>{
    if(next.revision<room.revision)return;
    const changed=next.revision!==room.revision;room=next;
    if(changed&&room.game)listeners.forEach(fn=>fn(room.game!));
    if(room.closed&&timer){clearInterval(timer);timer=null;}
  };
  const poll=async()=>{
    if(!running||fetching||moving)return;fetching=true;
    try{const result=await api<{room:OnlineRoom}>(`/rooms/${room.code}`);if(running)update(result.room);}catch(error){if(running)onError(error instanceof Error?error.message:'Connection lost.');}finally{fetching=false;}
  };
  return {
    get:()=>room.game!,
    subscribe:(fn:(g:GameState)=>void)=>{listeners.add(fn);fn(room.game!);return ()=>{listeners.delete(fn);};},
    dispatch:(action:Action)=>{
      if(moving)throw new Error('Your last move is still being confirmed.');
      moving=true;
      void api<{room:OnlineRoom}>(`/rooms/${room.code}/action`,{action,revision:room.revision}).then(result=>{if(running)update(result.room);}).catch(error=>{if(running)onError(error instanceof Error?error.message:'Move failed.');}).finally(()=>{moving=false;void poll();});
    },
    snapshot:()=>{throw new Error('Online games are saved by the server.');},
    save:()=>new Date().toISOString(),
    start:()=>{running=true;timer=setInterval(()=>void poll(),1000);void poll();},
    stop:()=>{running=false;if(timer)clearInterval(timer);timer=null;},
  };
}
