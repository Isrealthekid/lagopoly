import type { GameState } from '../game/types';
export interface Account { id: string; username: string }
export interface OnlineRoom { code: string; host: string; public: boolean; cap: number; members: (Account & {ready:boolean})[]; game: GameState | null; revision:number; seat:number; closed:boolean }
export async function api<T>(path:string, data?:unknown): Promise<T> {
  const response=await fetch(`/api${path}`,{method:data===undefined?'GET':'POST',credentials:'same-origin',headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
  const value=await response.json().catch(()=>({error:'The account server is unavailable.'}));
  if(!response.ok)throw new Error(value.error??'Request failed.');
  return value as T;
}
