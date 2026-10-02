import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../functions/api/[[path]].js';
afterEach(()=>vi.unstubAllGlobals());
describe('Cloudflare API routing',()=>{
  it('reports a missing backend instead of returning the frontend',async()=>{
    const response=await onRequest({request:new Request('https://game.example/api/health'),env:{}});
    expect(response.status).toBe(503);expect((await response.json()).error).toContain('not configured');
  });
  it('preserves signup payload, browser origin and session cookies without caching',async()=>{
    const upstream=vi.fn(async request=>{
      expect(request.url).toBe('https://backend.example/api/register');
      expect(request.method).toBe('POST');expect(await request.json()).toEqual({username:'Ada',password:'Abc123!?'});
      expect(request.headers.get('origin')).toBe('https://game.example');
      expect(request.headers.get('cookie')).toBe('lag-session=existing');
      expect(request.headers.get('x-monopoly-client-ip')).toBe('203.0.113.4');
      expect(request.headers.get('x-monopoly-proxy-secret')).toBe('trusted');
      return new Response('{"user":{"username":"Ada"}}',{headers:{'Content-Type':'application/json','Set-Cookie':'__Host-lag-session=new; Path=/; Secure; HttpOnly'}});
    });vi.stubGlobal('fetch',upstream);
    const request=new Request('https://game.example/api/register',{method:'POST',headers:{origin:'https://game.example',cookie:'lag-session=existing','cf-connecting-ip':'203.0.113.4','x-monopoly-client-ip':'spoofed','x-monopoly-proxy-secret':'spoofed'},body:JSON.stringify({username:'Ada',password:'Abc123!?'})});
    const response=await onRequest({request,env:{BACKEND_ORIGIN:'https://backend.example',API_PROXY_SECRET:'trusted'}});
    expect(response.headers.get('set-cookie')).toContain('__Host-lag-session=new');expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('returns an API error when the backend cannot be reached',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('offline');}));
    const response=await onRequest({request:new Request('https://game.example/api/health'),env:{BACKEND_ORIGIN:'https://backend.example'}});
    expect(response.status).toBe(502);
  });
});
