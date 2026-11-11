import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => {
  // Certificates are local-only. Ordinary development and hosted builds need none.
  const https = mode === 'local-https' ? {
    key: readFileSync(fileURLToPath(new URL('./.certs/skycycle-key.pem', import.meta.url))),
    cert: readFileSync(fileURLToPath(new URL('./.certs/skycycle.pem', import.meta.url))),
  } : undefined;
  return { plugins: [react()], base: './', server: { https, fs: { deny: ['.env', '.env.*', '*.{crt,pem,key,cer,p12,pfx}', '**/.git/**', '**/.certs/**', '**/.local/**'] } }, build: { rollupOptions: { output: { manualChunks: { three: ['three'] } } } } };
});
