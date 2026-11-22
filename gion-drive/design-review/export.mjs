import { build } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';

const { output } = await build({
  base: './',
  build: { write: false, assetsInlineLimit: Infinity, cssCodeSplit: false },
});
const files = new Map(output.map(file => [file.fileName, file]));
const html = files.get('index.html').source
  .replace(/<script type="module" crossorigin src="\.\/([^"]+)"><\/script>/,
    (_, path) => '<script type="module">' + files.get(path).code.replace(/<\/script/gi, '<\\/script') + '</script>')
  .replace(/<link rel="stylesheet" crossorigin href="\.\/([^"]+)">/,
    (_, path) => '<style>' + files.get(path).source + '</style>');

await mkdir('build', { recursive: true });
await writeFile('build/index.html', html);
