import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export default defineConfig(({ mode, command }) => {
  const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  let commit = 'unknown', revisionCount: number | null = null;
  try {
    commit = git('rev-parse', '--short=7', 'HEAD');
    // Hosted checkouts can be shallow. Restore history so the number does not reset to 1.
    if (command === 'build' && git('rev-parse', '--is-shallow-repository') === 'true') git('fetch', '--unshallow', '--quiet', 'origin');
    if (git('rev-parse', '--is-shallow-repository') === 'false') revisionCount = Number(git('rev-list', '--count', 'HEAD'));
  } catch { console.warn('Full Git history unavailable; build label will use the commit instead of an inaccurate revision number.'); }
  const buildInfo = {
    // The first numbered prototype follows the eleven existing repository commits.
    label: revisionCount === null ? `Prototype 1.${commit}` : `Prototype 1.${Math.max(0, revisionCount - 11)}`,
    commit, revisionCount, builtAt: new Date().toISOString(),
  };
  // Certificates are local-only. Ordinary development and hosted builds need none.
  const https = mode === 'local-https' ? {
    key: readFileSync(fileURLToPath(new URL('./.certs/skycycle-key.pem', import.meta.url))),
    cert: readFileSync(fileURLToPath(new URL('./.certs/skycycle.pem', import.meta.url))),
  } : undefined;
  return { plugins: [react(), {
    name: 'skycycle-build-info',
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'build-info.json', source: JSON.stringify(buildInfo, null, 2) }); },
  }], define: { __SKYCYCLE_BUILD_INFO__: JSON.stringify(buildInfo) }, base: './', server: { https, fs: { deny: ['.env', '.env.*', '*.{crt,pem,key,cer,p12,pfx}', '**/.git/**', '**/.certs/**', '**/.local/**'] } }, build: { rollupOptions: { output: { manualChunks: { three: ['three'] } } } } };
});
