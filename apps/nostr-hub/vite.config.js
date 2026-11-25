import { defineConfig } from 'vite';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  resolve: { dedupe: ['nostr-tools'] },
  build: {
    rollupOptions: {
      input: readdirSync(import.meta.dirname)
        .filter(name => name.endsWith('.html'))
        .map(name => resolve(import.meta.dirname, name)),
    },
  },
});
