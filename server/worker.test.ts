import { describe, expect, it, vi } from 'vitest';
import worker from './worker';
describe('SkyCycle subdirectory hosting', () => {
  const environment = () => ({ ASSETS: { fetch: vi.fn(async (request: Request) => new Response(new URL(request.url).pathname, { headers: { 'Content-Type': 'text/plain' } })) } });
  it('canonicalizes entry URLs with a trailing slash, preserving the query and origin', async () => {
    const env = environment();
    for (const path of ['/', '/skycycle', '/skycycle/index.html']) {
      const response = await worker.fetch(new Request(`https://orionrepository.com${path}?mode=ride`), env);
      expect(response.status).toBe(307); expect(response.headers.get('Location')).toBe('https://orionrepository.com/skycycle/?mode=ride');
    }
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });
  it('serves the app index and hashed assets within /skycycle/', async () => {
    const env = environment();
    const index = await worker.fetch(new Request('https://orionrepository.com/skycycle/'), env);
    expect(await index.text()).toBe('/index.html'); expect(index.headers.get('Cache-Control')).toBe('no-cache');
    const asset = await worker.fetch(new Request('https://orionrepository.com/skycycle/assets/Game-test.js?v=2'), env);
    expect(await asset.text()).toBe('/assets/Game-test.js');
    expect(env.ASSETS.fetch.mock.calls[1][0].url).toBe('https://orionrepository.com/assets/Game-test.js?v=2');
    expect(asset.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
  it('does not serve unrelated Orion paths or silently return app HTML for missing assets', async () => {
    const env = environment();
    for (const path of ['/manifesto', '/assets/foo.js', '/skycycle-other']) expect((await worker.fetch(new Request(`https://orionrepository.com${path}`), env)).status).toBe(404);
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
    env.ASSETS.fetch.mockResolvedValueOnce(new Response('Not found', { status: 404 }));
    expect((await worker.fetch(new Request('https://orionrepository.com/skycycle/assets/missing.js'), env)).status).toBe(404);
    expect((await worker.fetch(new Request('https://orionrepository.com/skycycle/', { method: 'POST' }), env)).status).toBe(405);
  });
});
