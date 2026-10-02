export async function onRequest({ request, env }) {
  if (!env.BACKEND_ORIGIN) return Response.json({ error: 'The account server is not configured.' }, {status:503});
  const destination = new URL(request.url);
  const backend = new URL(env.BACKEND_ORIGIN);
  if (backend.protocol !== 'https:') return Response.json({error:'The account server requires HTTPS.'},{status:503});
  destination.protocol = backend.protocol;
  destination.host = backend.host;
  const headers = new Headers(request.headers);
  // A browser cannot supply a trusted client address to the Node backend.
  headers.delete('x-monopoly-client-ip');
  headers.delete('x-monopoly-proxy-secret');
  if(env.API_PROXY_SECRET) {
    headers.set('x-monopoly-proxy-secret', env.API_PROXY_SECRET);
    headers.set('x-monopoly-client-ip',request.headers.get('cf-connecting-ip') ?? 'unknown');
  }
  try {
    const response = await fetch(new Request(destination, new Request(request, {headers,redirect:'manual'})));
    const result = new Response(response.body,response);
    result.headers.set('Cache-Control','no-store');
    return result;
  } catch {
    return Response.json({error:'The account server is temporarily unavailable.'},{status:502});
  }
}
