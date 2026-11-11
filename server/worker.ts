interface AssetEnvironment { ASSETS: { fetch(request: Request): Promise<Response> }; }
const PREFIX = '/skycycle';

/** Serve only SkyCycle's path. Orion's main Worker retains the rest of the domain. */
export default {
  async fetch(request: Request, env: AssetEnvironment): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    // Root is a convenience entry for the separate workers.dev preview URL.
    if (url.pathname === '/' || url.pathname === PREFIX || url.pathname === `${PREFIX}/index.html`) {
      url.pathname = `${PREFIX}/`;
      return Response.redirect(url.toString(), 307);
    }
    if (!url.pathname.startsWith(`${PREFIX}/`)) return new Response('Not found', { status: 404 });
    const isIndex = url.pathname === `${PREFIX}/`;
    url.pathname = isIndex ? '/index.html' : url.pathname.slice(PREFIX.length);
    // HTML handling is disabled to prevent the asset binding redirecting outside /skycycle/.
    const asset = await env.ASSETS.fetch(new Request(url, request));
    const response = new Response(asset.body, asset);
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Permissions-Policy', 'bluetooth=(self), screen-wake-lock=(self)');
    if (isIndex || url.pathname === '/build-info.json') response.headers.set('Cache-Control', 'no-cache');
    return response;
  },
};
