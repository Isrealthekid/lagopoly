import { useEffect, useRef, useState } from 'react';
import { Check, Copy, DoorOpen, Globe, Lock, LogOut, Plus, RefreshCw, UserRound } from 'lucide-react';
import { api, type Account, type OnlineRoom } from '../online/api';
import { Modal } from './Modal';

export function Multiplayer({account,onAccount,onGame,close,currentRoom}:{account:Account|null;onAccount:(user:Account|null)=>void;onGame:(room:OnlineRoom)=>void;close:()=>void;currentRoom?:string}) {
  const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[register,setRegister]=useState(false);
  const [room,setRoom]=useState<OnlineRoom|null>(null),[rooms,setRooms]=useState<{code:string;host:string;count:number;cap:number}[]>([]);
  const [code,setCode]=useState(new URLSearchParams(location.search).get('room')??''),[cap,setCap]=useState(4),[isPublic,setPublic]=useState(false);
  const [error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false),[copied,setCopied]=useState(false);
  const busyRef=useRef(false);
  const run=async(fn:()=>Promise<void>)=>{if(busyRef.current)return;busyRef.current=true;setBusy(true);setError(null);try{await fn();}catch(e){setError(e instanceof Error?e.message:'Request failed.');}finally{busyRef.current=false;setBusy(false);}};
  const load=async()=>{
    const mine=await api<{room:OnlineRoom|null}>('/rooms/mine');setRoom(mine.room);
    const open=await api<{rooms:typeof rooms}>('/rooms');setRooms(open.rooms);
  };
  useEffect(()=>{
    if(!account)return;
    let live=true, fetching=false;
    const refresh=async()=>{
      if(fetching||busyRef.current)return;fetching=true;
      try{
        const mine=await api<{room:OnlineRoom|null}>('/rooms/mine');
        if(!live||busyRef.current)return;
        if(mine.room?.game){if(currentRoom===mine.room.code)setRoom(mine.room);else onGame(mine.room);return;}
        setRoom(mine.room);
        const open=await api<{rooms:typeof rooms}>('/rooms');if(live)setRooms(open.rooms);
      }catch(e){if(live)setError(e instanceof Error?e.message:'Connection unavailable.');}finally{fetching=false;}
    };
    void refresh();const interval=setInterval(()=>void refresh(),1500);
    return ()=>{live=false;clearInterval(interval);};
  },[account?.id,currentRoom]);
  const join=async(value:string)=>{const result=await api<{room:OnlineRoom}>(`/rooms/${value.trim().toUpperCase()}/join`,{});setRoom(result.room);if(result.room.game)onGame(result.room);};
  return <Modal title={account?'Online table':'Your account'} close={close}>
    {error&&<p className="form-error" role="alert">{error}</p>}
    {!account?<form className="account-form" onSubmit={e=>{e.preventDefault();void run(async()=>{const result=await api<{user:Account}>(register?'/register':'/login',{username,password});setPassword('');onAccount(result.user);});}}>
      <div className="mode-tabs"><button type="button" aria-pressed={!register} onClick={()=>setRegister(false)}>Sign in</button><button type="button" aria-pressed={register} onClick={()=>setRegister(true)}>Create account</button></div>
      <label>Public username<input autoComplete="username" required minLength={3} maxLength={20} pattern="[A-Za-z0-9_]+" value={username} onChange={e=>setUsername(e.target.value)}/></label>
      <label>Password<input type="password" autoComplete={register?'new-password':'current-password'} required minLength={8} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></label>
      <button className="primary full" disabled={busy}><UserRound size={18}/>{busy?'Please wait...':register?'Create account':'Sign in'}</button>
    </form>:<>
      <div className="account-row"><span><UserRound size={18}/>{account.username}</span><button className="icon-button" title="Sign out" aria-label="Sign out" disabled={busy} onClick={()=>void run(async()=>{await api('/logout',{});onAccount(null);setRoom(null);})}><LogOut size={18}/></button></div>
      {room?<div className="room-lobby"><div className="room-heading"><h3>{room.code}</h3><span>{room.public?<Globe size={16}/>:<Lock size={16}/>} {room.members.length}/{room.cap}</span><button className="icon-button" title="Copy room link" aria-label="Copy room link" onClick={()=>void run(async()=>{const link=new URL(location.href);link.searchParams.set('room',room.code);await navigator.clipboard.writeText(link.toString());setCopied(true);})}>{copied?<Check size={18}/>:<Copy size={18}/>}</button></div>
        <ul className="room-members">{room.members.map(member=><li key={member.id}><span>{member.username}{member.id===room.host?' (host)':''}</span><span>{member.ready?'Ready':'Waiting'}</span></li>)}</ul>
        {!room.game&&<label className="ready-toggle"><input type="checkbox" checked={room.members[room.seat]?.ready??false} disabled={busy} onChange={e=>{const ready=e.target.checked;setRoom({...room,members:room.members.map((m,i)=>i===room.seat?{...m,ready}:m)});void run(async()=>{try{const result=await api<{room:OnlineRoom}>(`/rooms/${room.code}/ready`,{ready});setRoom(result.room);}catch(error){setRoom(room);throw error;}});}}/>Ready to play</label>}
        {room.game&&<button className="primary full" onClick={()=>onGame(room)}>Return to game</button>}
        {!room.game&&room.host===account.id&&<button className="primary full" disabled={busy||room.members.length<2||!room.members.every(m=>m.ready)} onClick={()=>void run(async()=>{const result=await api<{room:OnlineRoom}>(`/rooms/${room.code}/start`,{});onGame(result.room);})}>Start room</button>}
        <button className="secondary full" disabled={busy||!!room.game} onClick={()=>void run(async()=>{await api(`/rooms/${room.code}/leave`,{});setRoom(null);await load();})}><DoorOpen size={18}/>Leave room</button>
      </div>:<>
        <div className="room-create"><label>Player limit<select value={cap} onChange={e=>setCap(Number(e.target.value))}>{[2,3,4].map(n=><option key={n}>{n}</option>)}</select></label><label className="ready-toggle"><input type="checkbox" checked={isPublic} onChange={e=>setPublic(e.target.checked)}/>Public room</label><button className="primary" disabled={busy} onClick={()=>void run(async()=>{const result=await api<{room:OnlineRoom}>('/rooms',{cap,public:isPublic});setRoom(result.room);})}><Plus size={18}/>Create room</button></div>
        <form className="room-join" onSubmit={e=>{e.preventDefault();void run(()=>join(code));}}><label>Room code<input value={code} maxLength={6} autoCapitalize="characters" onChange={e=>setCode(e.target.value.toUpperCase())}/></label><button className="secondary" disabled={busy||code.length!==6}>Join room</button></form>
        <div className="open-room-heading"><h3>Open rooms</h3><button className="icon-button" title="Refresh rooms" aria-label="Refresh rooms" onClick={()=>void run(load)}><RefreshCw size={17}/></button></div>
        <button className="secondary full" disabled={busy||!rooms.length} onClick={()=>void run(async()=>{const result=await api<{room:OnlineRoom}>('/rooms/random',{});setRoom(result.room);})}><Globe size={18}/>Join random room</button>
        <div className="open-rooms">{rooms.map(r=><button className="open-room" key={r.code} disabled={busy} onClick={()=>void run(()=>join(r.code))}><strong>{r.host}</strong><span>{r.count}/{r.cap}</span><span>{r.code}</span></button>)}</div>
      </>}
    </>}
  </Modal>;
}
