/** Dependency-free WebToApp Frontend build: materialize the static entry points in dist/. */
import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, 'dist');
const example = join(root, 'templates', 'mini-app');
const manifest = JSON.parse(await readFile(join(example, 'app.json'), 'utf8'));
if (manifest.entry !== 'index.html' || manifest.id !== 'pocket-counter') {
  throw new Error('The workbench example entry/identity changed; update this build intentionally.');
}
await rm(output, { recursive: true, force: true });
await mkdir(join(output, 'templates'), { recursive: true });
await cp(join(root, 'index.html'), join(output, 'index.html'));
await cp(example, join(output, 'templates', 'mini-app'), {
  recursive: true,
  filter: (path) => !path.endsWith('README.md') && !path.includes('/.git/')
});
console.log('Frontend build ready: dist/index.html and dist/templates/mini-app/index.html');
