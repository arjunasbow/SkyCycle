import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { networkInterfaces, hostname } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ipv4 = [...new Set(Object.values(networkInterfaces()).flat().filter(n => n && n.family === 'IPv4' && !n.internal && !n.address.startsWith('169.254.')).map(n => n.address))];
const hosts = ['localhost', '127.0.0.1', '::1', hostname(), `${hostname()}.local`, ...ipv4];
const certDir = join(root, '.certs');
mkdirSync(certDir, { recursive: true });
// MKCERT_BIN is useful immediately after a Windows winget install, before PATH refresh.
const mkcert = process.env.MKCERT_BIN || 'mkcert';
try {
  execFileSync(mkcert, ['-cert-file', join(certDir, 'skycycle.pem'), '-key-file', join(certDir, 'skycycle-key.pem'), ...hosts], { stdio: 'inherit' });
  const caRoot = execFileSync(mkcert, ['-CAROOT'], { encoding: 'utf8' }).trim();
  // Copy ONLY the public CA certificate. Its signing key stays in mkcert's CA directory.
  copyFileSync(join(caRoot, 'rootCA.pem'), join(certDir, 'skycycle-rootCA.cer'));
  console.log('\nCertificate generated. PC trust was not changed.');
  console.log('Start HTTPS: npm run dev:https');
  console.log('Share the public root certificate locally: npm run cert:serve');
  for (const ip of ipv4) console.log(`iPhone: https://${ip}:5173/ (install and trust the public root first)`);
  console.log('Regenerate with npm run setup:https if your LAN IP changes. Never share private keys.');
} catch (error) {
  console.error('HTTPS setup failed. Install mkcert, restart your terminal for PATH changes, then run npm run setup:https.');
  process.exitCode = 1;
}
