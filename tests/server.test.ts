import { afterEach, describe, expect, it } from 'vitest';
import { createService } from '../server/service';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const services:ReturnType<typeof createService>[]=[];
const staticFixtures:string[]=[];
afterEach(()=>{for(const service of services.splice(0))service.close();for(const folder of staticFixtures.splice(0)){unlinkSync(join(folder,'index.html'));rmdirSync(folder);}});
async function fixture(){
  const service=createService({database:':memory:',origin:'http://localhost:5173'});services.push(service);
  await new Promise<void>(resolve=>service.server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${(service.server.address() as AddressInfo).port}`;
  const request=async(path:string,data?:unknown,cookie='',origin='http://localhost:5173')=>{
    const response=await fetch(url+path,{method:data===undefined?'GET':'POST',headers:{cookie,origin,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
    return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]??''};
  };
  const account=async(name:string)=>{const result=await request('/api/register',{username:name,password:'CorrectHorseBattery123!'});expect(result.status).toBe(200);return result;};
  return {service,request,account};
}
describe('secure accounts and authoritative rooms',()=>{
  it('serves the production website and issues secure HTTP-only cookies',async()=>{
    const folder=mkdtempSync(join(tmpdir(),'lag-board-test-'));staticFixtures.push(folder);writeFileSync(join(folder,'index.html'),'<title>MONOPOLY</title>');
    const service=createService({database:':memory:',production:true,origin:'https://game.example',staticDir:folder});services.push(service);
    await new Promise<void>(resolve=>service.server.listen(0,'127.0.0.1',resolve));
    const url=`http://127.0.0.1:${(service.server.address() as AddressInfo).port}`;
    const home=await fetch(url+'/');expect(home.status).toBe(200);expect(await home.text()).toContain('MONOPOLY');
    expect(home.headers.get('content-security-policy')).toContain("script-src 'self'");
    const register=await fetch(url+'/api/register',{method:'POST',headers:{origin:'https://game.example','Content-Type':'application/json'},body:JSON.stringify({username:'ProdUser',password:'CorrectHorseBattery123!'})});
    expect(register.status).toBe(200);expect(register.headers.get('set-cookie')).toContain('__Host-lag-session=');
    expect(register.headers.get('set-cookie')).toContain('HttpOnly');expect(register.headers.get('set-cookie')).toContain('Secure');
  });
  it('persists hashed credentials, remembers sessions, rejects CSRF and revokes logout',async()=>{
    const {service,request,account}=await fixture();const user=await account('Ada');
    expect((await request('/api/me',undefined,user.cookie)).body.user.username).toBe('Ada');
    const stored=service.db.prepare('SELECT * FROM users').get()!;
    expect(stored.password).not.toBe('CorrectHorseBattery123!');
    expect((await request('/api/login',{username:'Ada',password:'WrongPassword123!'})).status).toBe(401);
    const login=await request('/api/login',{username:'ada',password:'CorrectHorseBattery123!'});expect(login.status).toBe(200);
    expect((await request('/api/rooms',{cap:4},user.cookie,'https://attacker.example')).status).toBe(403);
    await request('/api/logout',{},user.cookie);expect((await request('/api/me',undefined,user.cookie)).body.user).toBe(null);
    expect((await request('/api/me',undefined,login.cookie)).body.user.username).toBe('Ada');
  });
  it('enforces concurrent room capacity and membership and protects other players moves',async()=>{
    const {request,account}=await fixture();const a=await account('Ada'),b=await account('Tunde'),c=await account('Bisi');
    const created=await request('/api/rooms',{cap:2,public:true},a.cookie),code=created.body.room.code;
    const joins=await Promise.all([request(`/api/rooms/${code}/join`,{},b.cookie),request(`/api/rooms/${code}/join`,{},c.cookie)]);
    expect(joins.map(j=>j.status).sort()).toEqual([200,409]);
    const partner=joins[0].status===200?b:c,outsider=joins[0].status===200?c:b;
    expect((await request(`/api/rooms/${code}`,undefined,outsider.cookie)).status).toBe(403);
    await request(`/api/rooms/${code}/ready`,{ready:true},a.cookie);await request(`/api/rooms/${code}/ready`,{ready:true},partner.cookie);
    const started=await request(`/api/rooms/${code}/start`,{},a.cookie);expect(started.status).toBe(200);
    expect(started.body.room.game.community.every((s:string)=>s.startsWith('CC-hidden'))).toBe(true);
    const room=started.body.room,wrong=room.game.current===0?partner:a,right=room.game.current===0?a:partner;
    expect((await request(`/api/rooms/${code}/action`,{revision:room.revision,action:{type:'roll'}},wrong.cookie)).status).toBe(403);
    const move=await request(`/api/rooms/${code}/action`,{revision:room.revision,action:{type:'roll'}},right.cookie);expect(move.status).toBe(200);
    expect((await request(`/api/rooms/${code}/action`,{revision:room.revision,action:{type:'roll'}},right.cookie)).status).toBe(409);
  });
  it('joins random public rooms but never private rooms and destroys finished rooms',async()=>{
    const {service,request,account}=await fixture();const a=await account('Ada'),b=await account('Tunde');
    const created=await request('/api/rooms',{cap:4,public:false},a.cookie),code=created.body.room.code;
    expect((await request('/api/rooms/random',{},b.cookie)).status).toBe(404);
    await request(`/api/rooms/${code}/join`,{},b.cookie);
    await request(`/api/rooms/${code}/ready`,{ready:true},a.cookie);await request(`/api/rooms/${code}/ready`,{ready:true},b.cookie);
    await request(`/api/rooms/${code}/start`,{},a.cookie);
    const row=service.db.prepare('SELECT payload FROM rooms WHERE code=?').get(code)!;
    const room=JSON.parse(row.payload as string),g=room.game;
    g.current=0;g.phase='debt';g.players[0].cash=0;g.payments=[{from:0,to:1,amount:2000000,reason:'Test insolvency'}];
    g.tradeNotifications=[{from:0,to:1,status:'accepted',read:false}];
    service.db.prepare('UPDATE rooms SET payload=? WHERE code=?').run(JSON.stringify(room),code);
    const end=await request(`/api/rooms/${code}/action`,{revision:room.revision,action:{type:'bankrupt'}},a.cookie);
    expect(end.status).toBe(200);expect(end.body.room.closed).toBe(true);
    expect(service.db.prepare('SELECT code FROM rooms WHERE code=?').get(code)).toBeUndefined();
    expect((await request(`/api/rooms/${code}`,undefined,b.cookie)).body.room.game.phase).toBe('won');
    const read=await request(`/api/rooms/${code}/action`,{action:{type:'readTradeNotifications',player:0}},a.cookie);
    expect(read.status).toBe(200);expect(read.body.room.game.tradeNotifications[0].readBy).toEqual([0]);
    expect((await request(`/api/rooms/${code}/action`,{action:{type:'readTradeNotifications',player:0}},b.cookie)).status).toBe(403);
  });
});
