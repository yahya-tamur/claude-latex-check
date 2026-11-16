// Build the plugin as a zip, for loading it into the Claude app as a file and for GitHub releases:
// dist/latex-check-<version>.zip, holding the committed state (HEAD) of what the plugin needs to run,
// without the tests. The version comes from .claude-plugin/plugin.json.
//
// usage: node package.mjs   (or npm run package)
import { execFileSync } from 'child_process';
import { mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const { version } = JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8'));
const parts = ['.claude-plugin', 'skills', 'hooks', 'LICENSE', 'README.md', 'MAINTENANCE.md', 'icon.png', 'package.json'];

// The zip is built from HEAD, so uncommitted changes to these files wouldn't be in it.
if (git('status', '--porcelain', '--', ...parts).trim())
  console.warn('warning: uncommitted changes to the plugin\'s files are not in the zip; it holds HEAD');
mkdirSync(join(root, 'dist'), { recursive: true });
const out = join('dist', `latex-check-${version}.zip`);
git('archive', '--format=zip', '-o', out, 'HEAD', ...parts);
console.log(`wrote ${out}`);
