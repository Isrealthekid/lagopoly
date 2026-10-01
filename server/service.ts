import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, randomInt, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { getBoard } from '../src/data/boards';
import { createGame, transition } from '../src/game/engine';
import { decisionPlayer } from '../src/game/ai';
import type { Action, GameState } from '../src/game/types';

type User = { id: string; username: string };
type Member = User & { ready: boolean };
type Room = { code: string; host: string; public: boolean; cap: number; members: Member[]; game: GameState | null; revision: number; updated: number };
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
function assert(condition: unknown, status: number, message: string): asserts condition { if(!condition)throw new HttpError(status,message); }
const hashToken=(token:string)=>createHash('sha256').update(token).digest('hex');
const passwordHash=(password:string,salt:string,p=3)=>new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,64,{N:32768,r:8,p,maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve(key)));
const encodeHash=(hash:Buffer)=>`scrypt$32768$8$3$${hash.toString('hex')}`;
const dice=()=>randomInt(1,7);
const shuffle=<T,>(items:T[])=>{const copy=[...items];for(let i=copy.length-1;i>0;i--){const j=randomInt(i+1);[copy[i],copy[j]]=[copy[j],copy[i]];}return copy;};

export function createService(options: { database?: string; origin?: string; production?: boolean; staticDir?: string } = {}) {
  const path=options.database ?? resolve('server-data/accounts.sqlite');
  if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
  const db=new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT NOT NULL,key TEXT UNIQUE NOT NULL,salt TEXT NOT NULL,password TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS rooms(code TEXT PRIMARY KEY,payload TEXT NOT NULL);`);
  const production=options.production ?? false;
  if(production&&!options.origin)throw new Error('APP_ORIGIN is required in production.');
  const cookieName=production?'__Host-lag-session':'lag-session';
  const completed=new Map<string,{room:Room;expires:number}>();
  const limits=new Map<string,{count:number;until:number}>();
  const limit=(key:string,maximum:number,window=60000)=>{
    const now=Date.now(), entry=limits.get(key);
    if(!entry||entry.until<now){limits.set(key,{count:1,until:now+window});return;}
    assert(++entry.count<=maximum,429,'Too many requests. Try again shortly.');
  };
  const allRooms=()=>db.prepare('SELECT payload FROM rooms').all().map(r=>JSON.parse(r.payload as string) as Room);
  const store=(room:Room)=>{room.updated=Date.now();db.prepare('INSERT OR REPLACE INTO rooms(code,payload) VALUES (?,?)').run(room.code,JSON.stringify(room));};
  const remove=(code:string)=>db.prepare('DELETE FROM rooms WHERE code=?').run(code);
  const cleanup=()=>{
    const now=Date.now();db.prepare('DELETE FROM sessions WHERE expires<?').run(now);
    for(const room of allRooms())if(now-room.updated>(room.game?48*3600000:3600000))remove(room.code);
    for(const [code,result] of completed)if(result.expires<now)completed.delete(code);
    for(const [key,entry] of limits)if(entry.until<now)limits.delete(key);
  };
  const roomByCode=(code:string)=>{
    const row=db.prepare('SELECT payload FROM rooms WHERE code=?').get(code);
    return row?JSON.parse(row.payload as string) as Room:null;
  };
  const view=(room:Room,user:User,closed=false)=>{
    const game=room.game?structuredClone(room.game):null;
    if(game){game.community=game.community.map((_,i)=>`CC-hidden-${i}`);game.chance=game.chance.map((_,i)=>`CH-hidden-${i}`);}
    return {...room,game,seat:room.members.findIndex(m=>m.id===user.id),closed};
  };
  const userFor=(req:IncomingMessage)=>{
    const token=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith(`${cookieName}=`))?.slice(cookieName.length+1);
    if(!token)return null;
    const row=db.prepare('SELECT users.id,users.username FROM sessions JOIN users ON users.id=sessions.user WHERE token=? AND expires>?').get(hashToken(token),Date.now());
    return row?{id:row.id as string,username:row.username as string}:null;
  };
  const json=(res:ServerResponse,status:number,value:unknown)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  const setSession=(res:ServerResponse,user:User)=>{
    const token=randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO sessions(token,user,expires) VALUES (?,?,?)').run(hashToken(token),user.id,Date.now()+30*86400000);
    res.setHeader('Set-Cookie',`${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${production?'; Secure':''}`);
  };
  const body=async(req:IncomingMessage)=>{
    assert(req.headers['content-type']?.startsWith('application/json'),415,'JSON requests are required.');
    let size=0;const chunks:Buffer[]=[];
    for await(const chunk of req){size+=chunk.length;assert(size<=16000,413,'Request is too large.');chunks.push(chunk);}
    try{return JSON.parse(Buffer.concat(chunks).toString()) as Record<string,unknown>;}catch{throw new HttpError(400,'Invalid JSON.');}
  };
  const join=(room:Room,user:User)=>{
    room=roomByCode(room.code)!;assert(room,404,'This room has closed.');
    if(room.members.some(m=>m.id===user.id))return view(room,user);
    assert(!room.game,409,'This game has already started.');
    assert(room.members.length<room.cap,409,'This room is full.');
    assert(!allRooms().some(r=>r.members.some(m=>m.id===user.id)),409,'Leave your current room before joining another.');
    room.members.push({...user,ready:false});room.revision++;store(room);return view(room,user);
  };
  const server=createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('X-Frame-Options','DENY');
    if(production)res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const url=new URL(req.url??'/', 'http://localhost'), route=url.pathname, method=req.method??'GET';
      const ip=req.socket.remoteAddress??'unknown';
      limit(`request:${ip}`,600);
      if(method!=='GET'&&method!=='HEAD') {
        const allowed=options.origin??'http://localhost:5173';
        assert(req.headers.origin===allowed,403,'This request did not come from the game website.');
      }
      if(route==='/api/health')return json(res,200,{ok:true});
      if(route==='/api/me'&&method==='GET')return json(res,200,{user:userFor(req)});
      if((route==='/api/register'||route==='/api/login')&&method==='POST') {
        limit(`auth:${ip}`,12,15*60000);
        const input=await body(req), username=typeof input.username==='string'?input.username.trim():'', password=typeof input.password==='string'?input.password:'';
        assert(/^[a-zA-Z0-9_]{3,20}$/.test(username)&&password.length>=12&&password.length<=128,400,'Use a 3-20 character username (letters, numbers, underscore) and a password of 12-128 characters.');
        const key=username.toLowerCase();
        let user:User;
        if(route==='/api/register') {
          assert(!db.prepare('SELECT id FROM users WHERE key=?').get(key),409,'That username is unavailable.');
          const salt=randomBytes(16).toString('hex'), hash=await passwordHash(password,salt);
          user={id:randomUUID(),username};
          try{db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(user.id,username,key,salt,encodeHash(hash));}catch{throw new HttpError(409,'That username is unavailable.');}
        }else{
          const row=db.prepare('SELECT * FROM users WHERE key=?').get(key);
          const stored=row?.password as string|undefined, legacy=!!stored&&!stored.startsWith('scrypt$');
          const actual=await passwordHash(password,row?.salt as string??'dummy-salt-for-unknown-user',legacy?1:3);
          const expected=stored?Buffer.from(stored.split('$').at(-1)!,'hex'):Buffer.alloc(64);
          assert(row&&timingSafeEqual(actual,expected),401,'Username or password is incorrect.');
          if(legacy)db.prepare('UPDATE users SET password=? WHERE id=?').run(encodeHash(await passwordHash(password,row.salt as string)),row.id);
          user={id:row.id as string,username:row.username as string};
        }
        setSession(res,user);return json(res,200,{user});
      }
      if(route.startsWith('/api/')) {
        const user=userFor(req);assert(user,401,'Sign in to continue.');
        if(route==='/api/logout'&&method==='POST') {
          const token=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith(`${cookieName}=`))?.slice(cookieName.length+1);
          if(token)db.prepare('DELETE FROM sessions WHERE token=?').run(hashToken(token));
          res.setHeader('Set-Cookie',`${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${production?'; Secure':''}`);return json(res,200,{ok:true});
        }
        if(route==='/api/rooms/mine'&&method==='GET')return json(res,200,{room:(()=>{const room=allRooms().find(r=>r.members.some(m=>m.id===user.id));return room?view(room,user):null;})()});
        if(route==='/api/rooms'&&method==='GET')return json(res,200,{rooms:allRooms().filter(r=>r.public&&!r.game&&r.members.length<r.cap).slice(0,30).map(r=>({code:r.code,host:r.members.find(m=>m.id===r.host)?.username,count:r.members.length,cap:r.cap}))});
        if(route==='/api/rooms'&&method==='POST') {
          limit(`room:${user.id}`,10);
          assert(!allRooms().some(r=>r.members.some(m=>m.id===user.id)),409,'You already have a room.');
          const input=await body(req);assert(Number.isInteger(input.cap)&&Number(input.cap)>=2&&Number(input.cap)<=4,400,'Room limit must be 2-4 players.');
          const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let code='';
          do{code=Array.from({length:6},()=>alphabet[randomInt(alphabet.length)]).join('');}while(roomByCode(code)||completed.has(code));
          const room:Room={code,host:user.id,public:input.public===true,cap:Number(input.cap),members:[{...user,ready:false}],game:null,revision:0,updated:Date.now()};
          store(room);return json(res,201,{room:view(room,user)});
        }
        if(route==='/api/rooms/random'&&method==='POST') {
          await body(req);
          const room=shuffle(allRooms().filter(r=>r.public&&!r.game&&r.members.length<r.cap))[0];
          assert(room,404,'No open public room yet. Create one.');return json(res,200,{room:join(room,user)});
        }
        const match=route.match(/^\/api\/rooms\/([A-Z2-9]{6})(?:\/(join|ready|start|action|leave))?$/);
        assert(match,404,'Not found.');
        const code=match[1], command=match[2];
        let room=roomByCode(code);
        if(!room) {
          const result=completed.get(code);
          if(method==='GET'&&result&&result.room.members.some(m=>m.id===user.id))return json(res,200,{room:view(result.room,user,true)});
          if(method==='POST'&&command==='action'&&result&&result.room.members.some(m=>m.id===user.id)) {
            const input=await body(req),action=input.action as Action,seat=result.room.members.findIndex(m=>m.id===user.id);
            assert(action?.type==='readTradeNotifications'&&action.player===seat,403,'The game has finished.');
            result.room.game=transition(result.room.game!,action,dice);result.room.revision++;
            return json(res,200,{room:view(result.room,user,true)});
          }
          throw new HttpError(404,'This room has closed or expired.');
        }
        if(command==='join'&&method==='POST'){await body(req);return json(res,200,{room:join(room,user)});}
        let seat=room.members.findIndex(m=>m.id===user.id);assert(seat>=0,403,'You are not a member of this room.');
        if(!command&&method==='GET')return json(res,200,{room:view(room,user)});
        assert(method==='POST',405,'Method not allowed.');
        const input=await body(req);
        room=roomByCode(code);assert(room,404,'This room has closed.');
        seat=room.members.findIndex(m=>m.id===user.id);assert(seat>=0,403,'You are not a member of this room.');
        if(command==='ready') {assert(!room.game,409,'Game already started.');room.members[seat].ready=input.ready===true;}
        else if(command==='leave') {
          assert(!room.game,409,'A live game cannot be abandoned. You can reconnect to this room.');
          room.members.splice(seat,1);
          if(!room.members.length){remove(code);return json(res,200,{room:null});}
          if(room.host===user.id)room.host=room.members[0].id;
        }else if(command==='start') {
          assert(room.host===user.id,403,'Only the host can start.');assert(!room.game&&room.members.length>=2&&room.members.every(m=>m.ready),409,'At least two players must be ready.');
          room.game=createGame(getBoard('lagos'),room.members.map(m=>m.username),room.members.map((_,i)=>i),shuffle,dice);
        }else if(command==='action') {
          limit(`move:${user.id}`,90);
          assert(room.game&&room.game.phase!=='won',409,'No live game is waiting.');
          const action=input.action as Action;assert(action&&typeof action.type==='string',400,'Choose a game action.');
          assert(['roll','release','end','buy','auction','bid','pass','card','settle','bankrupt','transfer','build','sell','mortgage','redeem','liquidate','trade','acceptTrade','rejectTrade','readTradeNotifications'].includes(action.type),400,'Unknown game action.');
          if(action.type==='readTradeNotifications')assert(action.player===seat,403,'You may only read your own notifications.');
          else{assert(input.revision===room.revision,409,'The table changed. Please retry your move.');assert(decisionPlayer(room.game)===seat,403,'It is another player\'s decision.');}
          if('player' in action)assert(action.player===seat,403,'You may only manage your own assets.');
          if(action.type==='trade')assert(action.proposal?.from===seat,403,'You may only propose your own trades.');
          try{room.game=transition(room.game,action,dice);}catch(error){throw new HttpError(400,error instanceof Error?error.message:'Invalid move.');}
          if(room.game.phase==='won') {
            room.revision++;remove(code);completed.set(code,{room,expires:Date.now()+15*60000});
            return json(res,200,{room:view(room,user,true)});
          }
        }else throw new HttpError(404,'Not found.');
        room.revision++;store(room);return json(res,200,{room:view(room,user)});
      }
      if(options.staticDir&&method==='GET') {
        const root=resolve(options.staticDir), requested=resolve(root,`.${decodeURIComponent(route)}`);
        assert(requested===root||requested.startsWith(root+'/')||requested.startsWith(root+'\\'),403,'Not found.');
        const file=existsSync(requested)&&extname(requested)?requested:resolve(root,'index.html');
        const mime:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'};
        res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream'});res.end(readFileSync(file));return;
      }
      throw new HttpError(404,'Not found.');
    }catch(error){
      if(!(error instanceof HttpError))console.error('Server request failed:',error);
      if(!res.headersSent)json(res,error instanceof HttpError?error.status:500,{error:error instanceof HttpError?error.message:'The server could not complete this request.'});
    }
  });
  const timer=setInterval(cleanup,60000);timer.unref();cleanup();
  return {server,db,close:()=>{clearInterval(timer);server.close();db.close();}};
}
