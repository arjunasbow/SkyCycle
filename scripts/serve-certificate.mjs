import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';

// Serve one public certificate, not a directory. Never expose keys or project source here.
const cert = readFileSync(new URL('../.certs/skycycle-rootCA.cer', import.meta.url));
const server = createServer((req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
  if (req.url === '/skycycle-rootCA.cer') {
    res.writeHead(200, { 'Content-Type': 'application/x-x509-ca-cert', 'Content-Disposition': 'attachment; filename="skycycle-rootCA.cer"', 'Content-Length': cert.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    return res.end(req.method === 'HEAD' ? undefined : cert);
  }
  if (req.url !== '/') { res.writeHead(404); return res.end('Not found'); }
  const html = '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SkyCycle local certificate</title><body style="font:18px system-ui;max-width:36em;margin:3em auto;padding:0 1em"><h1>SkyCycle local HTTPS</h1><p><a href="/skycycle-rootCA.cer">Download public root certificate</a></p><p>On iPhone, open this in Safari. Install the downloaded profile in Settings, then enable it under General → About → Certificate Trust Settings. Return to Bluefy and open the HTTPS game address.</p><p>Only install this certificate if you started this server on your own PC. It grants trust to certificates signed by that PC’s local development CA. Remove it when you no longer need local testing.</p></body></html>';
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(req.method === 'HEAD' ? undefined : html);
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(5180, '0.0.0.0', () => {
  for (const n of Object.values(networkInterfaces()).flat()) if (n?.family === 'IPv4' && !n.internal && !n.address.startsWith('169.254.')) console.log(`Certificate download: http://${n.address}:5180/skycycle-rootCA.cer`);
  console.log('Only the public root certificate is served. Stop with Ctrl+C after installation.');
});
