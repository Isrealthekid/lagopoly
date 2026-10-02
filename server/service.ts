import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, randomInt, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { openDatabase } from './database';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { getBoard } from '../src/data/boards';
import { addLog, createGame, transition } from '../src/game/engine';
import { chooseAIAction, decisionPlayer } from '../src/game/ai';
import type { Action, GameState } from '../src/game/types';

type User = { id: string; username: string };
type Member = User & { ready: boolean; left?: boolean; returnBy?: number };
type Room = { code: string; host: string; public: boolean; cap: number; members: Member[]; game: GameState | null; revision: number; updated: number };
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
function assert(condition: unknown, status: number, message: string): asserts condition { if(!condition)throw new HttpError(status,message); }
const hashToken=(token:string)=>createHash('sha256').update(token).digest('hex');
const passwordHash=(password:string,salt:string,p=3)=>new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,64,{N:32768,r:8,p,maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve(key)));
const encodeHash=(hash:Buffer)=>`scrypt$32768$8$3$${hash.toString('hex')}`;
const dice=()=>randomInt(1,7);
const shuffle=<T,>(items:T[])=>{const copy=[...items];for(let i=copy.length-1;i>0;i--){const j=randomInt(i+1);[copy[i],copy[j]]=[copy[j],copy[i]];}return copy;};

export function createService(options: { database?: string; origin?: string; production?: boolean; staticDir?: string } = {}) {
  const db=openDatabase(options.database ?? resolve('server-data/accounts.sqlite'));
  const production=options.production ?? false;
  if(production&&!options.origin)throw new Error('APP_ORIGIN is required in production.');
  const cookieName=production?'__Host-lag-session':'lag-session';
  const completed = {
    get: async(code:string) => { const row=await db.prepare('SELECT payload,expires FROM completed WHERE code=? AND expires>?').get(code,Date.now()); return row?{room:JSON.parse(row.payload as string) as Room,expires:Number(row.expires)}:undefined; },
    set: async(code:string,value:{room:Room;expires:number}) => {await db.prepare('INSERT INTO completed(code,payload,expires) VALUES (?,?,?) ON CONFLICT(code) DO UPDATE SET payload=excluded.payload,expires=excluded.expires').run(code,JSON.stringify(value.room),value.expires);},
  };
  const limits=new Map<string,{count:number;until:number}>();
  const limit=(key:string,maximum:number,window=60000)=>{
    const now=Date.now(), entry=limits.get(key);
    if(!entry||entry.until<now){limits.set(key,{count:1,until:now+window});return;}
    assert(++entry.count<=maximum,429,'Too many requests. Try again shortly.');
  };
  const allRooms=async()=>(await db.prepare('SELECT payload FROM rooms').all()).map(r=>JSON.parse(r.payload as string) as Room);
  const store=async(room:Room)=>{room.updated=Date.now();await db.prepare('INSERT INTO rooms(code,payload) VALUES (?,?) ON CONFLICT(code) DO UPDATE SET payload=excluded.payload').run(room.code,JSON.stringify(room));};
  const remove=async(code:string)=>await db.prepare('DELETE FROM rooms WHERE code=?').run(code);
  const cleanup=async()=>{
    const now=Date.now();await db.prepare('DELETE FROM sessions WHERE expires<?').run(now);
    for(const room of await allRooms())if(now-room.updated>(room.game?48*3600000:3600000))await remove(room.code);
    await db.prepare('DELETE FROM completed WHERE expires<?').run(now);
    for(const [key,entry] of limits)if(entry.until<now)limits.delete(key);
  };
  const roomByCode=async(code:string)=>{
    const row=await db.prepare('SELECT payload FROM rooms WHERE code=?').get(code);
    return row?JSON.parse(row.payload as string) as Room:null;
  };
  const view=(room:Room,user:User,closed=false)=>{
    const game=room.game?structuredClone(room.game):null;
    if(game){game.community=game.community.map((_,i)=>`CC-hidden-${i}`);game.chance=game.chance.map((_,i)=>`CH-hidden-${i}`);game.onlineDepartures=room.members.flatMap((m,player)=>m.left&&m.returnBy?[{player,returnBy:m.returnBy}]:[]);}
    return {...room,game,seat:room.members.findIndex(m=>m.id===user.id),closed};
  };
  const userFor=async(req:IncomingMessage)=>{
    const token=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith(`${cookieName}=`))?.slice(cookieName.length+1);
    if(!token)return null;
    const row=await db.prepare('SELECT users.id,users.username FROM sessions JOIN users ON users.id=sessions."user" WHERE token=? AND expires>?').get(hashToken(token),Date.now());
    return row?{id:row.id as string,username:row.username as string}:null;
  };
  const json=(res:ServerResponse,status:number,value:unknown)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  const setSession=async(res:ServerResponse,user:User)=>{
    const token=randomBytes(32).toString('base64url');
    await db.prepare('INSERT INTO sessions(token,"user",expires) VALUES (?,?,?)').run(hashToken(token),user.id,Date.now()+30*86400000);
    res.setHeader('Set-Cookie',`${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${production?'; Secure':''}`);
  };
  const body=async(req:IncomingMessage)=>{
    assert(req.headers['content-type']?.startsWith('application/json'),415,'JSON requests are required.');
    let size=0;const chunks:Buffer[]=[];
    for await(const chunk of req){size+=chunk.length;assert(size<=16000,413,'Request is too large.');chunks.push(chunk);}
    try{return JSON.parse(Buffer.concat(chunks).toString()) as Record<string,unknown>;}catch{throw new HttpError(400,'Invalid JSON.');}
  };
  const join=async(room:Room,user:User)=>{
    room=(await roomByCode(room.code))!;assert(room,404,'This room has closed.');
    if(room.members.some(m=>m.id===user.id&&!m.left))return view(room,user);
    const returning=room.members.findIndex(m=>m.id===user.id&&m.left&&!!m.returnBy&&m.returnBy>Date.now());
    if(returning>=0&&room.game){
      assert(!(await allRooms()).some(r=>r.code!==room.code&&r.members.some(m=>m.id===user.id&&!m.left)),409,'Leave your other room first.');
      room.members[returning].left=false;delete room.members[returning].returnBy;
      addLog(room.game,`${user.username} rejoined the game.`,returning);room.revision++;await store(room);return view(room,user);
    }
    assert(!room.game,409,'This game has already started.');
    assert(room.members.length<room.cap,409,'This room is full.');
    assert(!(await allRooms()).some(r=>r.members.some(m=>m.id===user.id&&!m.left)),409,'Leave your current room before joining another.');
    room.members.push({...user,ready:false});room.revision++;await store(room);return view(room,user);
  };
  const server=createServer(async(req,res)=>{
    // Do not send a successful response until database COMMIT succeeds.
    let status=200, headers:Record<string,string>={}, output:string|Buffer='';
    const reply={setHeader:(name:string,value:string)=>{headers[name]=value;},writeHead:(code:number,values:Record<string,string>)=>{status=code;Object.assign(headers,values);},end:(value:string|Buffer)=>{output=value;}} as unknown as ServerResponse;
    const actual=res;res=reply;
    try { await db.transaction(async()=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('X-Frame-Options','DENY');
    if(production)res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const url=new URL(req.url??'/', 'http://localhost'), route=url.pathname, method=req.method??'GET';
      const proxySecret=process.env.API_PROXY_SECRET;
      const trustedProxy=!!proxySecret&&typeof req.headers['x-monopoly-proxy-secret']==='string'&&
        req.headers['x-monopoly-proxy-secret'].length===proxySecret.length&&
        timingSafeEqual(Buffer.from(req.headers['x-monopoly-proxy-secret']),Buffer.from(proxySecret));
      const ip=trustedProxy&&typeof req.headers['x-monopoly-client-ip']==='string'?req.headers['x-monopoly-client-ip']:req.socket.remoteAddress??'unknown';
      limit(`request:${ip}`,600);
      if(method!=='GET'&&method!=='HEAD') {
        const allowed=options.origin??'http://localhost:5173';
        assert(req.headers.origin===allowed,403,'This request did not come from the game website.');
      }
      if(route==='/api/health'){await db.prepare('SELECT count(*) FROM users').get();return json(res,200,{ok:true});}
      if(route==='/api/me'&&method==='GET')return json(res,200,{user:await userFor(req)});
      if((route==='/api/register'||route==='/api/login')&&method==='POST') {
        limit(`auth:${ip}`,12,15*60000);
        const input=await body(req), username=typeof input.username==='string'?input.username.trim():'', password=typeof input.password==='string'?input.password:'';
        assert(/^[a-zA-Z0-9_]{3,20}$/.test(username)&&password.length>=8&&password.length<=128,400,'Use a 3-20 character username (letters, numbers, underscore) and a password of 8-128 characters.');
        const key=username.toLowerCase();
        let user:User;
        if(route==='/api/register') {
          assert(!(await db.prepare('SELECT id FROM users WHERE key=?').get(key)),409,'That username is unavailable.');
          const salt=randomBytes(16).toString('hex'), hash=await passwordHash(password,salt);
          user={id:randomUUID(),username};
          try{await db.prepare('INSERT INTO users(id,username,key,salt,password) VALUES (?,?,?,?,?)').run(user.id,username,key,salt,encodeHash(hash));}catch(error){if((error as {code?:string}).code==='23505'||(error as {code?:string}).code==='ERR_SQLITE_ERROR')throw new HttpError(409,'That username is unavailable.');throw error;}
        }else{
          const row=await db.prepare('SELECT * FROM users WHERE key=?').get(key);
          const stored=row?.password as string|undefined, legacy=!!stored&&!stored.startsWith('scrypt$');
          const actual=await passwordHash(password,row?.salt as string??'dummy-salt-for-unknown-user',legacy?1:3);
          const expected=stored?Buffer.from(stored.split('$').at(-1)!,'hex'):Buffer.alloc(64);
          assert(row&&timingSafeEqual(actual,expected),401,'Username or password is incorrect.');
          if(legacy)await db.prepare('UPDATE users SET password=? WHERE id=?').run(encodeHash(await passwordHash(password,row.salt as string)),row.id);
          user={id:row.id as string,username:row.username as string};
        }
        await setSession(res,user);return json(res,200,{user});
      }
      if(route.startsWith('/api/')) {
        const user=await userFor(req);assert(user,401,'Sign in to continue.');
        if(route==='/api/logout'&&method==='POST') {
          const token=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith(`${cookieName}=`))?.slice(cookieName.length+1);
          if(token)await db.prepare('DELETE FROM sessions WHERE token=?').run(hashToken(token));
          res.setHeader('Set-Cookie',`${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${production?'; Secure':''}`);return json(res,200,{ok:true});
        }
        if(route==='/api/rooms/mine'&&method==='GET')return json(res,200,{room:await(async()=>{const room=(await allRooms()).find(r=>r.members.some(m=>m.id===user.id&&!m.left));return room?view(room,user):null;})()});
        if(route==='/api/rooms'&&method==='GET')return json(res,200,{rooms:(await allRooms()).filter(r=>r.public&&!r.game&&r.members.length<r.cap).slice(0,30).map(r=>({code:r.code,host:r.members.find(m=>m.id===r.host)?.username,count:r.members.length,cap:r.cap}))});
        if(route==='/api/rooms'&&method==='POST') {
          limit(`room:${user.id}`,10);
          assert(!(await allRooms()).some(r=>r.members.some(m=>m.id===user.id&&!m.left)),409,'You already have a room.');
          const input=await body(req);assert(Number.isInteger(input.cap)&&Number(input.cap)>=2&&Number(input.cap)<=4,400,'Room limit must be 2-4 players.');
          const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let code='';
          do{code=Array.from({length:6},()=>alphabet[randomInt(alphabet.length)]).join('');}while(await roomByCode(code)||await completed.get(code));
          const room:Room={code,host:user.id,public:input.public===true,cap:Number(input.cap),members:[{...user,ready:false}],game:null,revision:0,updated:Date.now()};
          await store(room);return json(res,201,{room:view(room,user)});
        }
        if(route==='/api/rooms/random'&&method==='POST') {
          await body(req);
          const room=shuffle((await allRooms()).filter(r=>r.public&&!r.game&&r.members.length<r.cap))[0];
          assert(room,404,'No open public room yet. Create one.');return json(res,200,{room:await join(room,user)});
        }
        const match=route.match(/^\/api\/rooms\/([A-Z2-9]{6})(?:\/(join|ready|start|action|leave))?$/);
        assert(match,404,'Not found.');
        const code=match[1], command=match[2];
        let room=await roomByCode(code);
        if(!room) {
          const result=await completed.get(code);
          if(method==='POST'&&command==='leave'&&result&&result.room.members.some(m=>m.id===user.id)){await body(req);return json(res,200,{room:null});}
          if(method==='GET'&&result&&result.room.members.some(m=>m.id===user.id))return json(res,200,{room:view(result.room,user,true)});
          if(method==='POST'&&command==='action'&&result&&result.room.members.some(m=>m.id===user.id)) {
            const input=await body(req),action=input.action as Action,seat=result.room.members.findIndex(m=>m.id===user.id);
            assert(action?.type==='readTradeNotifications'&&action.player===seat,403,'The game has finished.');
            result.room.game=transition(result.room.game!,action,dice);result.room.revision++;await completed.set(code,result);
            return json(res,200,{room:view(result.room,user,true)});
          }
          throw new HttpError(404,'This room has closed or expired.');
        }
        if(command==='join'&&method==='POST'){await body(req);return json(res,200,{room:await join(room,user)});}
        let seat=room.members.findIndex(m=>m.id===user.id&&!m.left);assert(seat>=0,403,'You are not a member of this room.');
        if(!command&&method==='GET')return json(res,200,{room:view(room,user)});
        assert(method==='POST',405,'Method not allowed.');
        const input=await body(req);
        room=await roomByCode(code);assert(room,404,'This room has closed.');
        seat=room.members.findIndex(m=>m.id===user.id&&!m.left);assert(seat>=0,403,'You are not a member of this room.');
        if(command==='ready') {assert(!room.game,409,'Game already started.');room.members[seat].ready=input.ready===true;}
        else if(command==='leave') {
          if(room.game){
            room.members[seat].left=true;
            room.members[seat].returnBy=Date.now()+10000;
            addLog(room.game,`${user.username} left the game. They have 10 seconds to rejoin before the computer takes over.`,seat);
            if(room.host===user.id&&room.members.some(m=>!m.left))room.host=room.members.find(m=>!m.left)!.id;
            room.revision++;await store(room);return json(res,200,{room:null,returnBy:room.members[seat].returnBy});
          }
          room.members.splice(seat,1);
          if(!room.members.length){await remove(code);return json(res,200,{room:null});}
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
            room.revision++;await remove(code);await completed.set(code,{room,expires:Date.now()+15*60000});
            return json(res,200,{room:view(room,user,true)});
          }
        }else throw new HttpError(404,'Not found.');
        room.revision++;await store(room);return json(res,200,{room:view(room,user)});
      }
      if(options.staticDir&&method==='GET') {
        const root=resolve(options.staticDir), requested=resolve(root,`.${decodeURIComponent(route)}`);
        assert(requested===root||requested.startsWith(root+'/')||requested.startsWith(root+'\\'),403,'Not found.');
        const file=existsSync(requested)&&extname(requested)?requested:resolve(root,'index.html');
        const mime:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'};
        res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream'});res.end(readFileSync(file));return;
      }
      throw new HttpError(404,'Not found.');
    }catch(error){throw error;}
    }); actual.writeHead(status,headers);actual.end(output);
    } catch(error) {
      if(!(error instanceof HttpError))console.error('Server request failed:', error instanceof Error?error.message:'database error');
      actual.removeHeader('Set-Cookie');
      json(actual,error instanceof HttpError?error.status:500,{error:error instanceof HttpError?error.message:'The server could not complete this request.'});
    }
  });
  const aiTimer=setInterval(()=>{ void db.transaction(async()=>{
    for(const room of await allRooms()){
      let expired=false;
      for(const [seat,member] of room.members.entries())if(room.game&&member.left&&member.returnBy&&member.returnBy<=Date.now()){
        delete member.returnBy;room.game.aiPlayers=[...new Set([...(room.game.aiPlayers??[]),seat])];
        addLog(room.game,`${member.username} did not rejoin. The computer has taken over their seat.`,seat);expired=true;
      }
      if(expired){room.revision++;if(room.members.every(m=>m.left&&!m.returnBy)){await remove(room.code);continue;}await store(room);}
      if(!room.game||room.game.phase==='won'||!room.game.aiPlayers?.includes(decisionPlayer(room.game)))continue;
      try{
        room.game=transition(room.game,chooseAIAction(room.game),dice);room.revision++;
        if(room.game.phase==='won'){await remove(room.code);await completed.set(room.code,{room,expires:Date.now()+15*60000});}
        else await store(room);
      }catch(error){console.error('Online AI move failed:',error);}
    }
  }).catch(error=>console.error("Online AI database operation failed:",error instanceof Error?error.message:"database error")); },650);aiTimer.unref();
  const runCleanup=()=>db.transaction(cleanup).catch(error=>console.error("Database cleanup failed:",error instanceof Error?error.message:"database error"));
  const timer=setInterval(runCleanup,60000);timer.unref();
  return {server,db,close:async()=>{clearInterval(timer);clearInterval(aiTimer);server.close();await db.close();}};
}
