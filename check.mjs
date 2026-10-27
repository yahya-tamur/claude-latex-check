// Check that LaTeX in a markdown reply renders as math in the Claude desktop app's Code tab.
//
// Runs the app's own transcript renderer (installed bundle under /usr/lib/claude-desktop) in jsdom:
// the same markdown hook + react-markdown + KaTeX the Code tab uses. Prints only problems: every
// $...$, $$...$$, \(...\) or \[...\] left as plain text, and every KaTeX error.
//
// usage: node check.mjs [--flag on|off] [file.md]        (reads stdin when no file)
//   --flag  state of the app's inline-math feature flag. Default "on" (single-$ math renders in
//           the Code tab). "off" = only $$ blocks render.
// exit 0 = everything rendered, 1 = something didn't, 2 = harness broke (app not found or changed).
//
// Environment overrides:
//   CLAUDE_DESKTOP_RESOURCES  the app's resources folder (the one containing ion-dist), for installs
//                             in places not listed in appAssets() below
//   LATEX_CHECK_CACHE         where the patched bundle copy is kept
//
// Bundle file names and minified export names change between app versions, so modules are found
// by what they contain and exports by what their code does.
import { readFileSync, existsSync, mkdirSync, cpSync, writeFileSync, readdirSync, rmSync } from 'fs';
import { createHash } from 'crypto';
import { homedir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';

const die = msg => { console.error(`latex-check harness error: ${String(msg).slice(0, 500)}`); process.exit(2); };
// Any crash is the harness's fault, not the reply's: keep it out of exit code 1.
process.on('uncaughtException', e => die(e?.stack ?? e));
process.on('unhandledRejection', e => die(e?.stack ?? e));

const home = homedir(), env = process.env;
const ls = d => { try { return readdirSync(d); } catch { return []; } };
// The app's web UI bundle: <resources>/ion-dist/assets/<v>/ holding the .js chunks.
function appAssets() {
  const resources = env.CLAUDE_DESKTOP_RESOURCES ? [env.CLAUDE_DESKTOP_RESOURCES] : {
    linux: ['/usr/lib/claude-desktop/resources', '/opt/Claude/resources', '/opt/claude-desktop/resources',
      '/usr/lib/claude/resources'],
    darwin: ['/Applications/Claude.app/Contents/Resources', join(home, 'Applications/Claude.app/Contents/Resources')],
    // Squirrel install keeps one app-<version> folder per update; newest first.
    win32: ls(join(env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'AnthropicClaude'))
      .filter(d => d.startsWith('app-'))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      .map(d => join(env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'AnthropicClaude', d, 'resources')),
  }[process.platform] ?? [];
  for (const r of resources) {
    const assets = join(r, 'ion-dist', 'assets');
    const v = ls(assets).find(d => ls(join(assets, d)).some(f => f.startsWith('vendor-frame-')));
    if (v) return join(assets, v);
  }
  die(`Claude desktop app bundle not found (looked in: ${resources.join(', ') || 'nothing for ' + process.platform}). ` +
    'Set CLAUDE_DESKTOP_RESOURCES to the app\'s resources folder.');
}
const cacheRoot = env.LATEX_CHECK_CACHE ?? {
  win32: join(env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'claude-latex-check'),
  darwin: join(home, 'Library', 'Caches', 'claude-latex-check'),
}[process.platform] ?? join(env.XDG_CACHE_HOME ?? join(home, '.cache'), 'claude-latex-check');

const args = process.argv.slice(2);
let flag = 'on', file;
for (let i = 0; i < args.length; i++) args[i] === '--flag' ? (flag = args[++i]) : (file = args[i]);
if (flag !== 'on' && flag !== 'off') die(`--flag must be on or off, got ${flag}`);
const text = readFileSync(file ?? 0, 'utf8');

// Math delimiters outside code. Without any (and no stray \commands) there is nothing to render.
const prose = text.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`/g, '');
const hasDelimiters = /\$|\\\(|\\\[/.test(prose);
if (!hasDelimiters && !/\\[a-zA-Z]{2,}/.test(prose)) { console.log('ok: no math'); process.exit(0); }

const SRC = appAssets();
const jsFiles = readdirSync(SRC).filter(f => f.endsWith('.js'));
const read = (dir, f) => readFileSync(join(dir, f), 'utf8');
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function findFile(marker) {
  const has = s => (marker instanceof RegExp ? marker.test(s) : s.includes(marker));
  const hits = jsFiles.filter(f => has(read(SRC, f)));
  if (hits.length !== 1) die(`expected one bundle file containing ${marker}, found ${hits.length}`);
  return hits[0];
}
const files = {
  renderer: findFile('guardedInline:'),              // Code-tab markdown hook (math gating + plugins)
  preload: findFile('=function(e,t,n){let r=globalThis.__antChunkLoadCtx'),  // vite chunk preloader
  react: findFile('e.createRoot=function'),          // react + react-dom
  markdown: findFile(/\.runSync\([\w$]+\.parse\(/),  // react-markdown
};

// Patched copy of the bundle, cached per app version and flag state.
const ver = createHash('sha1').update(jsFiles.sort().join()).digest('hex').slice(0, 12);
const dir = join(cacheRoot, `${ver}-${flag}`);
if (!existsSync(join(dir, '.ok'))) {
  // Copies for older app versions are dead weight (~150 MB each).
  for (const d of ls(cacheRoot)) if (!d.startsWith(`${ver}-`)) rmSync(join(cacheRoot, d), { recursive: true, force: true });
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  cpSync(SRC, dir, { recursive: true });
  const patch = (name, re, to, what) => {
    const s = read(dir, name);
    if (!re.test(s)) die(`can't ${what} in ${name}`);
    writeFileSync(join(dir, name), s.replace(re, to));
  };
  // Pin the inline-math flag: the hook does `x=<flagFn>(),{display:...}=...`.
  const flagFn = read(dir, files.renderer).match(/([\w$]+)=([\w$]+)\(\),\{display:/)?.[2]
    ?? die('inline-math flag function not found');
  patch(files.renderer, new RegExp(`function ${escapeRe(flagFn)}\\(\\)\\{(?:[^{}]|\\{[^{}]*\\})*\\}`),
    `function ${flagFn}(){return!${flag === 'on' ? 0 : 1}}`, 'pin the inline-math flag');
  // No GrowthBook provider outside the app: treat every other flag as absent instead of throwing.
  const gbRe = /if\(!([\w$]+)\)throw [\w$]+\(Error\("Missing or invalid GrowthBookProvider"\)[^;]*;/;
  const gbFiles = jsFiles.filter(f => gbRe.test(read(dir, f)));
  if (!gbFiles.length) die('GrowthBook provider check not found');
  for (const f of gbFiles)
    patch(f, gbRe, 'if(!$1)return{on:!1,off:!0,value:null,source:"unknownFeature"};', 'stub GrowthBook');
  // Vite's preloader waits on <link> loads that never fire in jsdom: export a pass-through instead.
  const preloadFn = read(dir, files.preload).match(/([\w$]+)=function\(e,t,n\)\{let r=globalThis\.__antChunkLoadCtx/)?.[1]
    ?? die('chunk preloader not found');
  patch(files.preload, new RegExp(`export\\{([^}]*)\\b${escapeRe(preloadFn)} as `),
    'const __pass=f=>f();export{$1__pass as ', 'replace the chunk preloader');
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  writeFileSync(join(dir, '.ok'), '');
}

await import('./env.mjs');
const quiet = console.log;
console.log = console.warn = console.info = console.debug = () => {};
// [exportName, fn] pairs of a bundle file.
const load = async f => Object.entries(await import(pathToFileURL(join(dir, f)).href)).filter(([, v]) => typeof v === 'function');
const src = f => Function.prototype.toString.call(f);
const passes = (test, f) => { try { return test(f); } catch { return false; } };
// A unique pattern match can still be the wrong function after an update, so React pieces are
// checked by behavior, the rest must match exactly once and are then proven by the canary below.
const pickBy = (entries, test, what) => entries.find(([, f]) => passes(test, f)) ?? die(`${what} not found`);
const pickOne = (entries, test, what) => {
  const hits = entries.filter(([, f]) => passes(test, f));
  if (new Set(hits.map(([, f]) => f)).size !== 1) die(`expected one ${what}, found ${hits.length}`);
  return hits[0];
};

const reactFns = await load(files.react);
const [, createRoot] = pickBy(reactFns, f => f.length === 2 && src(f).includes('(299)') &&
  typeof f(document.createElement('div'))?.render === 'function', 'createRoot');
const [, jsx] = pickBy(reactFns.filter(([, f]) => src(f).length < 800 && f.length >= 2), f => {
  const T = () => null, e = f(T, { a: 1 });
  return e?.$$typeof === Symbol.for('react.transitional.element') && e.type === T && e.props.a === 1;
}, 'jsx');
const [hookName, useTranscriptMarkdown] = pickOne(await load(files.renderer),
  f => src(f).includes('guardedInline:') && src(f).includes('rehypePlugins:'), 'transcript markdown hook');
const [, ReactMarkdown] = pickOne(await load(files.markdown),
  f => /\.runSync\([\w$]+\.parse\(/.test(src(f)) && f.length === 1, 'react-markdown');
console.log = quiet;

// Wiring check, once per app version: some component must still call this hook the way the Code
// tab transcript does, hook(text, "chat", true, ...). Otherwise the app has moved to another renderer.
if (!existsSync(join(dir, '.wired'))) {
  const importRe = new RegExp(`import\\{[^}]*\\b${escapeRe(hookName)} as ([\\w$]+)[^}]*\\}from"\\./${escapeRe(files.renderer)}"`);
  const wired = jsFiles.some(f => {
    const s = read(SRC, f), alias = s.match(importRe)?.[1];
    return alias && new RegExp(`(?<![\\w$.])${escapeRe(alias)}\\([\\w$]+,"chat",!0[,)]`).test(s);
  });
  if (!wired) die('no app component calls the markdown hook as hook(text, "chat", true) any more');
  writeFileSync(join(dir, '.wired'), '');
}

// Render markdown the way the transcript's text component does: hook(text, "chat", true).
async function render(md, waitForMath) {
  function Transcript() {
    const { remarkPlugins, rehypePlugins } = useTranscriptMarkdown(md, 'chat', true, false);
    return jsx(ReactMarkdown, { remarkPlugins, rehypePlugins, children: md });
  }
  const el = document.createElement('div');
  document.body.append(el);
  createRoot(el, { onUncaughtError: e => die(e?.stack ?? e) }).render(jsx(Transcript, {}));
  // Math plugins load lazily on first use; wait until math shows up or time runs out.
  for (let t = 0; waitForMath && t < 40 && !el.querySelector('.katex, .katex-error'); t++) await new Promise(r => setTimeout(r, 100));
  await new Promise(r => setTimeout(r, 300));
  return el;
}

// Canary: math that must render if the pipeline is assembled right (inline only with the flag on).
// Also loads the math plugins, so the real render below needs no waiting.
const canary = await render('Canary $a^2$ inline.\n\n$$b^2$$\n', true);
const canaryMath = [...canary.querySelectorAll('.katex annotation')].map(e => e.textContent.trim()).join(' ');
if (canaryMath !== (flag === 'on' ? 'a^2 b^2' : 'b^2')) die(`canary rendered [${canaryMath}]; the pipeline no longer works`);

const el = await render(text, false);
if (!el.textContent.trim() && text.trim()) die('renderer produced no output');

const rendered = el.querySelectorAll('.katex').length;
const errors = [...el.querySelectorAll('.katex-error')];
const rest = el.cloneNode(true);
rest.querySelectorAll('.katex, .katex-error, code, pre').forEach(e => e.remove());
const leftover = rest.textContent.match(/\$\$?[^$\n]+\$?\$?|\\\(.+?\\\)|\\\[.+?\\\]|\\[a-zA-Z]{2,}/g) ?? [];
// A rejected \(x\) shows as plain "(x)" (markdown eats the backslash), so it leaves no trace to find
// above. Count each \(body\) / \[body\] whose "(body)" / "[body]" appears in the output more often
// than the source has it written plainly.
const count = (s, sub) => s.split(sub).length - 1;
const bare = s => s.replace(/\\([()[\]])/g, '$1').replace(/\\,/g, ',');  // markdown's escape handling
const plainProse = prose.replace(/\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]/g, '');
const seen = new Set();
for (const m of prose.matchAll(/\\(\()([\s\S]+?)\\\)|\\(\[)([\s\S]+?)\\\]/g)) {
  const open = m[1] ?? m[3], shown = bare(open + (m[2] ?? m[4]) + (open === '(' ? ')' : ']'));
  if (seen.has(shown)) continue;
  seen.add(shown);
  const extra = count(rest.textContent, shown) - count(bare(plainProse), shown);
  for (let k = 0; k < extra; k++) leftover.push(m[0]);
}

for (const e of errors) console.log(`FAIL  KaTeX error in ${e.textContent.trim()}: ${(e.getAttribute('title') ?? '').replace(/^ParseError: KaTeX parse error: /, '').split('\n')[0]}`);
for (const s of leftover) console.log(`FAIL  shown as text: ${s}`);
const failed = errors.length + leftover.length;
console.log(failed ? `${failed} failed, ${rendered} rendered` : `ok: ${rendered} rendered`);
process.exit(failed ? 1 : 0);
