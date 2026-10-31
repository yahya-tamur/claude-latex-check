// Check that LaTeX in a markdown reply renders as math in the Claude desktop app's Code tab.
//
// Runs the installed desktop app's own transcript renderer in jsdom:
// the same markdown hook + react-markdown + KaTeX the Code tab uses. Prints only problems: every
// $...$, $$...$$, \(...\) or \[...\] left as plain text, and every KaTeX error.
//
// usage: node check.mjs [--flag on|off] [--data <folder>] [file.md]   (reads stdin when no file)
//   --data  folder for per-machine state; the plugin passes ${CLAUDE_PLUGIN_DATA}. Default: next to
//           this script.
//   --show-fixes, --add-fix "<text>", --set-app-path "<path>": print or append to fixes.local.md,
//           or save the app location, in the data folder, then exit.
//   --flag  state of the app's inline-math feature flag. Default "on" (single-$ math renders in
//           the Code tab). "off" = only $$ blocks render.
// exit 0 = everything rendered, 1 = something didn't, 2 = harness broke (app not found or changed).
//
// Finding the app: the path in app-path.local in the data folder (the resources folder, the one
// containing ion-dist or ion-dist.asar), else a few common install locations.
//
// Environment overrides:
//   CLAUDE_DESKTOP_RESOURCES  the app's resources folder, ahead of app-path.local
//   LATEX_CHECK_CACHE         where the patched bundle copy is kept
//
// Bundle file names and minified export names change between app versions, so modules are found
// by what they contain and exports by what their code does.
import { readFileSync, existsSync, mkdirSync, cpSync, writeFileSync, readdirSync, rmSync, openSync, readSync,
  closeSync, statSync, renameSync } from 'fs';
import { createHash } from 'crypto';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import { createRequire } from 'module';
import { spawnSync } from 'child_process';

const die = msg => { console.error(`claude-latex-check harness error: ${String(msg).slice(0, 500)}`); process.exit(2); };
// Any crash is the harness's fault, not the reply's: keep it out of exit code 1.
process.on('uncaughtException', e => die(e?.stack ?? e));
process.on('unhandledRejection', e => die(e?.stack ?? e));

const home = homedir(), env = process.env;
const ls = d => { try { return readdirSync(d); } catch { return []; } };
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Newer builds pack ion-dist into ion-dist.asar. Unpack it once per archive into the cache;
// returns the unpacked folder's name under cacheRoot.
let asarDir;
function unpackAsar(archive) {
  const st = statSync(archive);
  asarDir = `asar-${createHash('sha1').update(`${archive}:${st.size}:${st.mtimeMs}`).digest('hex').slice(0, 12)}`;
  const out = join(cacheRoot, asarDir, 'ion-dist');
  if (existsSync(join(cacheRoot, asarDir, '.ok'))) return out;
  for (const d of ls(cacheRoot)) if (d.startsWith('asar-')) rmSync(join(cacheRoot, d), { recursive: true, force: true });
  // Format: [4][header pickle size] [4][payload size][4][json length][json] then file data.
  const fd = openSync(archive, 'r');
  const head = Buffer.alloc(16);
  readSync(fd, head, 0, 16, 0);
  const json = Buffer.alloc(head.readUInt32LE(12));
  readSync(fd, json, 0, json.length, 16);
  const base = 8 + head.readUInt32LE(4);
  const tmp = join(cacheRoot, `${asarDir}.tmp`);
  rmSync(tmp, { recursive: true, force: true });
  (function walk(node, rel) {
    mkdirSync(join(tmp, rel), { recursive: true });
    for (const [name, e] of Object.entries(node.files)) {
      const r = join(rel, name);
      if (e.files) walk(e, r);
      else if (e.link) continue;
      else if (e.unpacked) cpSync(join(`${archive}.unpacked`, r), join(tmp, r));
      else {
        const buf = Buffer.alloc(e.size);
        if (e.size) readSync(fd, buf, 0, e.size, base + Number(e.offset));
        writeFileSync(join(tmp, r), buf);
      }
    }
  })(JSON.parse(json.toString('utf8')), 'ion-dist');
  closeSync(fd);
  writeFileSync(join(tmp, '.ok'), '');
  renameSync(tmp, dirname(out));
  return out;
}

// The app's web UI bundle: <resources>/ion-dist/assets/<v>/ holding the .js chunks.
// Where the app is installed varies by platform, store and version. A location found once is saved
// in app-path.local in the data folder and generalized by generalize() below, so it follows
// updates; after that come a few common guesses.
const args = process.argv.slice(2);
let flag = 'on', file, dataDir;
let showFixes = false, addFix, setAppPath, surface = 'code';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--flag') flag = args[++i];
  else if (args[i] === '--data') dataDir = args[++i];
  else if (args[i] === '--surface') surface = args[++i];
  else if (args[i] === '--show-fixes') showFixes = true;
  else if (args[i] === '--add-fix') addFix = args[++i];
  else if (args[i] === '--set-app-path') setAppPath = args[++i];
  else file = args[i];
}
// Per-machine state (app-path.local, and jsdom when this isn't a dev checkout) lives in the data
// folder: the plugin passes ${CLAUDE_PLUGIN_DATA}, which survives plugin updates.
const here = dirname(fileURLToPath(import.meta.url));
dataDir ||= here;
const savedPath = join(dataDir, 'app-path.local');

// State commands, so Claude never has to touch the data folder directly (it sits under ~/.claude,
// where file edits need approval): print or add local fixes, save the app location.
const fixesPath = join(dataDir, 'fixes.local.md');
if (showFixes || addFix !== undefined || setAppPath !== undefined) {
  mkdirSync(dataDir, { recursive: true });
  if (addFix !== undefined) {
    if (!existsSync(fixesPath)) writeFileSync(fixesPath, '# LaTeX fixes found on this machine\n\n');
    writeFileSync(fixesPath, readFileSync(fixesPath, 'utf8') + `- ${addFix.trim()}\n`);
    console.log(`saved to ${fixesPath}`);
  }
  if (setAppPath !== undefined) {
    const pattern = generalize(setAppPath.trim());
    writeFileSync(savedPath, pattern + '\n');
    console.log(`saved app location ${pattern}`);
  }
  if (showFixes) console.log(existsSync(fixesPath) ? readFileSync(fixesPath, 'utf8').trim() : 'no local fixes yet');
  process.exit(0);
}
// Expand `*` in path segments; most recently modified first when several match (the newest
// install), with the name as a tiebreaker.
// Folder names that carry a version (and often more after it, like an architecture or a hash that
// changes per release) are cut at the version or at an existing `*`, so `Claude_1.2.3.0_x64__abc`
// and `Claude_*_x64__abc` both become `Claude_*`. A match still has to contain the app's bundle.
function generalize(p) {
  return p.split(/([\\/]+)/).map((seg, i) =>
    i % 2 ? seg : seg.replace(/^(.*?)(?:\*|\d+\.\d+).*$/, '$1*')).join('');
}
function expand(p) {
  const root = p.match(/^([A-Za-z]:[\\/]|[\\/]+)/)?.[0] ?? '';
  const mtime = h => { try { return statSync(h).mtimeMs; } catch { return 0; } };
  // Each hit carries the modification time of the folder its last `*` matched.
  let hits = [{ path: root || '.', time: 0 }];
  for (const seg of p.slice(root.length).split(/[\\/]+/).filter(Boolean)) {
    if (!seg.includes('*')) { hits = hits.map(h => ({ ...h, path: join(h.path, seg) })); continue; }
    const re = new RegExp(`^${seg.split('*').map(escapeRe).join('.*')}$`);
    hits = hits.flatMap(h => ls(h.path).filter(d => re.test(d))
      .map(d => ({ path: join(h.path, d), time: mtime(join(h.path, d)) })));
  }
  return hits.sort((a, b) => b.time - a.time || b.path.localeCompare(a.path, undefined, { numeric: true }))
    .map(h => h.path);
}
function appAssets() {
  const saved = existsSync(savedPath) ? expand(generalize(readFileSync(savedPath, 'utf8').trim())) : [];
  const resources = env.CLAUDE_DESKTOP_RESOURCES ? [env.CLAUDE_DESKTOP_RESOURCES] : [...saved, ...{
    linux: ['/usr/lib/claude-desktop/resources', '/opt/Claude/resources', '/opt/claude-desktop/resources',
      '/usr/lib/claude/resources'],
    darwin: ['/Applications/Claude.app/Contents/Resources', join(home, 'Applications/Claude.app/Contents/Resources')],
    // Squirrel install keeps one app-<version> folder per update; newest first.
    win32: ls(join(env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'AnthropicClaude'))
      .filter(d => d.startsWith('app-'))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      .map(d => join(env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'AnthropicClaude', d, 'resources')),
  }[process.platform] ?? []];
  for (const r of resources) {
    const packed = !existsSync(join(r, 'ion-dist')) && existsSync(join(r, 'ion-dist.asar'));
    const assets = join(packed ? unpackAsar(join(r, 'ion-dist.asar')) : join(r, 'ion-dist'), 'assets');
    const v = ls(assets).find(d => ls(join(assets, d)).some(f => f.startsWith('vendor-frame-')));
    if (v) return join(assets, v);
  }
  die(`Claude desktop app bundle not found (looked in: ${resources.join(', ') || 'nothing for ' + process.platform}). ` +
    `Find the app's resources folder (the one containing ion-dist or ion-dist.asar) and write its path to ${savedPath}.`);
}
const cacheRoot = env.LATEX_CHECK_CACHE ?? {
  win32: join(env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'claude-latex-check'),
  darwin: join(home, 'Library', 'Caches', 'claude-latex-check'),
}[process.platform] ?? join(env.XDG_CACHE_HOME ?? join(home, '.cache'), 'claude-latex-check');

if (flag !== 'on' && flag !== 'off') die(`--flag must be on or off, got ${flag}`);
if (surface !== 'code' && surface !== 'chat') die(`--surface must be code or chat, got ${surface}`);
const text = readFileSync(file ?? 0, 'utf8');

// Math delimiters outside code. Without any (and no stray \commands) there is nothing to render.
const prose = text.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`/g, '');
const hasDelimiters = /\$|\\\(|\\\[/.test(prose);
if (!hasDelimiters && !/\\[a-zA-Z]{2,}/.test(prose)) { console.log('ok: no math'); process.exit(0); }

const SRC = appAssets();
const jsFiles = readdirSync(SRC).filter(f => f.endsWith('.js'));
const read = (dir, f) => readFileSync(join(dir, f), 'utf8');
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
  for (const d of ls(cacheRoot)) if (!d.startsWith(`${ver}-`) && d !== asarDir) rmSync(join(cacheRoot, d), { recursive: true, force: true });
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  cpSync(SRC, dir, { recursive: true });
  const patch = (name, re, to, what) => {
    const s = read(dir, name);
    if (!re.test(s)) die(`can't ${what} in ${name}`);
    writeFileSync(join(dir, name), s.replace(re, to));
  };
  // Pin the inline-math flag. Older builds: the hook does `x=<flagFn>(),{display:...}=...`.
  // Newer builds: `x=<flagFn>()` in the hook, then x is passed as the second argument to the
  // function that returns {display, guardedInline, ...}.
  const flagFn = (() => {
    const s = read(dir, files.renderer);
    const direct = s.match(/([\w$]+)=([\w$]+)\(\),\{display:/)?.[2];
    if (direct) return direct;
    const gates = [...s.matchAll(/function ([\w$]+)\([\w$]+,[\w$]+\)\{[^{}]*return\{display:[^{}]*guardedInline:/g)];
    if (gates.length !== 1) return;
    const calls = [...s.matchAll(new RegExp(`(?<![\\w$.]|function )${escapeRe(gates[0][1])}\\([\\w$]+,([\\w$]+)\\)`, 'g'))];
    if (calls.length !== 1) return;
    // The flag variable is assigned shortly before the call, inside the hook.
    const before = s.slice(Math.max(0, calls[0].index - 600), calls[0].index);
    const assigns = [...before.matchAll(new RegExp(`[,;{ ]${escapeRe(calls[0][1])}=([\\w$]+)\\(\\)[,;]`, 'g'))];
    return assigns.at(-1)?.[1];
  })() ?? die('inline-math flag function not found');
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

// jsdom: the repo's own node_modules in a dev checkout, else the data folder (installed there once).
function loadJsdom() {
  try { return createRequire(import.meta.url)('jsdom'); } catch {}
  const req = createRequire(join(dataDir, 'package.json'));
  try { return req('jsdom'); } catch {}
  mkdirSync(dataDir, { recursive: true });
  console.error('claude-latex-check: installing jsdom into the data folder (one time)...');
  const r = spawnSync('npm', ['install', '--prefix', dataDir, '--no-audit', '--no-fund', '--silent', 'jsdom@24.1.3'],
    { stdio: ['ignore', 'ignore', 'inherit'], shell: process.platform === 'win32' });
  if (r.status !== 0) die(`couldn't install jsdom into ${dataDir} (npm exit ${r.status})`);
  return req('jsdom');
}
const { setupBrowser } = await import('./env.mjs');
setupBrowser(loadJsdom().JSDOM);
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
// --surface chat: the conversation view claude.ai chats and Cowork share renders text with its own
// markdown component (memo-wrapped, takes `text`, sets up the same in-house LaTeX plugin itself).
let ChatMarkdown;
if (surface === 'chat') {
  const chatFiles = jsFiles.filter(f => { const s = read(SRC, f); return s.includes('inHouseLatexPlugin:') && s.includes('normalizationMode:'); });
  const memos = (await Promise.all(chatFiles.map(f => import(pathToFileURL(join(dir, f)).href))))
    .flatMap(m => Object.entries(m)).filter(([, v]) => v?.$$typeof === Symbol.for('react.memo') && typeof v.type === 'function');
  [, ChatMarkdown] = pickOne(memos.map(([k, v]) => [k, v]),
    v => src(v.type).includes('inHouseLatexPlugin:') && src(v.type).includes('normalizationMode:'), 'chat markdown component');
}
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
  const node = surface === 'chat' ? jsx(ChatMarkdown, { text: md, typography: 'prose', isStreaming: false }) : jsx(Transcript, {});
  createRoot(el, { onUncaughtError: e => die(e?.stack ?? e) }).render(node);
  // Math plugins load lazily on first use; wait until math shows up or time runs out.
  for (let t = 0; waitForMath && t < 40 && !el.querySelector('.katex, .katex-error'); t++) await new Promise(r => setTimeout(r, 100));
  await new Promise(r => setTimeout(r, 300));
  return el;
}

// Canary: math that must render if the pipeline is assembled right (inline only with the flag on).
// Also loads the math plugins, so the real render below needs no waiting.
const canary = await render('Canary $a^2$ inline.\n\n$$b^2$$\n', true);
const canaryMath = [...canary.querySelectorAll('.katex annotation')].map(e => e.textContent.trim()).join(' ');
if (canaryMath !== (flag === 'on' || surface === 'chat' ? 'a^2 b^2' : 'b^2')) die(`canary rendered [${canaryMath}]; the pipeline no longer works`);

const el = await render(text, false);
if (!el.textContent.trim() && text.trim()) die('renderer produced no output');

const errors = [...el.querySelectorAll('.katex-error')];
// The app's KaTeX shows an unknown command literally (e.g. "\notacommand" as plain text inside the
// formula) instead of raising an error, so look for text runs that are just a \command.
const tex = k => k.querySelector('annotation')?.textContent.trim() ?? k.textContent.trim();
const unknown = [...el.querySelectorAll('.katex')].flatMap(k =>
  [...k.querySelectorAll('.katex-html .mord.text')].map(t => t.textContent.trim())
    .filter(t => /^\\[a-zA-Z]+$/.test(t)).map(cmd => [cmd, tex(k)]));
const rendered = el.querySelectorAll('.katex').length - new Set(unknown.map(([, t]) => t)).size;
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
for (const [cmd, t] of unknown) console.log(`FAIL  unknown command ${cmd} shown literally in ${t}`);
for (const s of leftover) console.log(`FAIL  shown as text: ${s}`);
const failed = errors.length + unknown.length + leftover.length;
console.log(failed ? `${failed} failed, ${rendered} rendered` : `ok: ${rendered} rendered`);
process.exit(failed ? 1 : 0);
