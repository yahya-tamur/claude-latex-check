// Check that LaTeX in a markdown reply renders as math in the Claude desktop app's Code tab.
//
// Runs the installed desktop app's own transcript renderer in jsdom:
// the same markdown hook + react-markdown + KaTeX the Code tab uses. Prints only problems: every
// $...$, $$...$$, \(...\) or \[...\] left as plain text, and every KaTeX error.
//
// usage: node check.mjs [--flag on|off] [--data <folder>] [file.md ...]   (reads stdin when no file)
//   Several files are checked in one run, each preceded by a "== <file>" line.
//   --data  folder for per-machine state; the plugin passes ${CLAUDE_PLUGIN_DATA}. Default: next to
//           this script.
//   --show-fixes, --add-fix "<text>": print or append to fixes.local.md in the data folder, then
//           exit.
//   --flag  state of the app's inline-math feature flag. Default "on" (single-$ math renders in
//           the Code tab). "off" = only $$ blocks render.
// exit 0 = everything rendered, 1 = something didn't, 2 = harness broke (app not found or changed).
//
// Finding the app: the running desktop app's resources folder (the one containing ion-dist or
// ion-dist.asar), else a few common install locations.
//
// Environment overrides:
//   CLAUDE_DESKTOP_RESOURCES  the app's resources folder, ahead of everything else
//   LATEX_CHECK_CACHE         where the per-version index of bundle files is kept
//
// Bundle file names and minified export names change between app versions, so modules are found
// by what they contain and exports by what their code does. The app's code is read in place, from
// ion-dist.asar or the ion-dist folder, and patched in memory: hooks.mjs serves it to import().
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, rmSync, statSync, readlinkSync } from 'fs';
import { createHash } from 'crypto';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import nodeModule, { createRequire } from 'module';
import { spawnSync, execFileSync } from 'child_process';
import { openBundle } from './bundle.mjs';

const die = msg => { console.error(`claude-latex-check harness error: ${String(msg).slice(0, 500)}`); process.exit(2); };
// Any crash is the harness's fault, not the reply's: keep it out of exit code 1.
process.on('uncaughtException', e => die(e?.stack ?? e));
process.on('unhandledRejection', e => die(e?.stack ?? e));

const home = homedir(), env = process.env;
const ls = d => { try { return readdirSync(d); } catch { return []; } };
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const args = process.argv.slice(2);
let flag = 'on', dataDir;
const inputs = [];
let showFixes = false, addFix, surface = 'code';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--flag') flag = args[++i];
  else if (args[i] === '--data') dataDir = args[++i];
  else if (args[i] === '--surface') surface = args[++i];
  else if (args[i] === '--show-fixes') showFixes = true;
  else if (args[i] === '--add-fix') addFix = args[++i];
  else inputs.push(args[i]);
}
// Per-machine state (fixes.local.md, and jsdom when this isn't a dev checkout) lives in the data
// folder: the plugin passes ${CLAUDE_PLUGIN_DATA}, which survives plugin updates.
const here = dirname(fileURLToPath(import.meta.url));
dataDir ||= here;

// State commands, so Claude never has to touch the data folder directly (it sits under ~/.claude,
// where file edits need approval): print or add local fixes.
const fixesPath = join(dataDir, 'fixes.local.md');
if (showFixes || addFix !== undefined) {
  mkdirSync(dataDir, { recursive: true });
  if (addFix !== undefined) {
    if (!existsSync(fixesPath)) writeFileSync(fixesPath, '# LaTeX fixes found on this machine\n\n');
    writeFileSync(fixesPath, readFileSync(fixesPath, 'utf8') + `- ${addFix.trim()}\n`);
    console.log(`saved to ${fixesPath}`);
  }
  if (showFixes) console.log(existsSync(fixesPath) ? readFileSync(fixesPath, 'utf8').trim() : 'no local fixes yet');
  process.exit(0);
}
// The resources folder of the running desktop app, next to its executable. The app runs whenever
// the Code tab is in use, and its path is always the current version. Claude Code's own CLI is also
// called claude, but has no resources folder; appBundle() skips folders without the app's code.
function runningApp() {
  try {
    if (process.platform === 'linux') {
      return readdirSync('/proc').filter(d => /^\d+$/.test(d)).flatMap(pid => {
        try { const exe = readlinkSync(`/proc/${pid}/exe`); return /claude/i.test(exe) ? [join(dirname(exe), 'resources')] : []; }
        catch { return []; }
      });
    }
    if (process.platform === 'darwin') {
      return execFileSync('ps', ['-axo', 'comm='], { encoding: 'utf8', timeout: 5000 }).split('\n')
        .map(l => l.match(/^(.*\.app)\/Contents\/MacOS\//)?.[1]).filter(a => a && /claude/i.test(a))
        .map(a => join(a, 'Contents', 'Resources'));
    }
    if (process.platform === 'win32') {
      return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        'Get-Process -Name Claude -ErrorAction SilentlyContinue | ForEach-Object { $_.Path }'],
        { encoding: 'utf8', timeout: 10000 }).split(/\r?\n/).filter(Boolean).map(p => join(dirname(p), 'resources'));
    }
  } catch {}
  return [];
}
// The app's ion-dist: { root, key }, root being the ion-dist folder or ion-dist.asar, and key
// changing with every app version.
function appBundle() {
  const sha = s => createHash('sha1').update(s).digest('hex').slice(0, 12);
  const found = env.CLAUDE_DESKTOP_RESOURCES ? [env.CLAUDE_DESKTOP_RESOURCES] : [...runningApp(), ...{
    linux: ['/usr/lib/claude-desktop/resources', '/opt/Claude/resources', '/opt/claude-desktop/resources',
      '/usr/lib/claude/resources'],
    darwin: ['/Applications/Claude.app/Contents/Resources', join(home, 'Applications/Claude.app/Contents/Resources')],
    // Squirrel install keeps one app-<version> folder per update; newest first.
    win32: ls(join(env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'AnthropicClaude'))
      .filter(d => d.startsWith('app-'))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      .map(d => join(env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'AnthropicClaude', d, 'resources')),
  }[process.platform] ?? []];
  const resources = [...new Set(found)];
  for (const r of resources) {
    const folder = join(r, 'ion-dist'), asar = join(r, 'ion-dist.asar');
    if (existsSync(join(folder, 'assets'))) return { root: folder, key: sha(ls(join(folder, 'assets')).flatMap(v => ls(join(folder, 'assets', v))).sort().join()) };
    if (existsSync(asar)) { const st = statSync(asar); return { root: asar, key: sha(`${asar}:${st.size}:${st.mtimeMs}`) }; }
  }
  die(`Claude desktop app bundle not found (looked in: ${resources.join(', ') || 'nothing for ' + process.platform}).`);
}
const cacheRoot = env.LATEX_CHECK_CACHE ?? {
  win32: join(env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'claude-latex-check'),
  darwin: join(home, 'Library', 'Caches', 'claude-latex-check'),
}[process.platform] ?? join(env.XDG_CACHE_HOME ?? join(home, '.cache'), 'claude-latex-check');

if (flag !== 'on' && flag !== 'off') die(`--flag must be on or off, got ${flag}`);
if (surface !== 'code' && surface !== 'chat') die(`--surface must be code or chat, got ${surface}`);
const texts = (inputs.length ? inputs : [0]).map(f => readFileSync(f, 'utf8'));
const header = i => { if (inputs.length > 1) console.log(`== ${inputs[i]}`); };

// Math delimiters outside code. Without any (and no stray \commands) there is nothing to render.
const proseOf = text => text.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`/g, '');
const hasMath = text => /\$|\\\(|\\\[|\\[a-zA-Z]{2,}/.test(proseOf(text));
if (!texts.some(hasMath)) {
  texts.forEach((_, i) => { header(i); console.log('ok: no math'); });
  process.exit(0);
}

const app = appBundle();
const bundle = openBundle(app.root);
// The web UI's chunks: <ion-dist>/assets/<v>/*.js.
const assets = (v => v && `assets/${v}`)(bundle.list('assets').find(d => bundle.list(`assets/${d}`).some(f => f.startsWith('vendor-frame-'))))
  ?? die(`no app bundle in ${app.root}`);
const jsFiles = bundle.list(assets).filter(f => f.endsWith('.js'));
const read = f => bundle.read(`${assets}/${f}`);

// Which chunks hold what the checker needs. Finding them means reading every chunk, so the result
// is saved per app version, in a small index in the cache folder, once a run has fully succeeded.
const gbRe = /if\(!([\w$]+)\)throw [\w$]+\(Error\("Missing or invalid GrowthBookProvider"\)[^;]*;/;
const markers = {
  renderer: ['guardedInline:', s => s.includes('guardedInline:')],      // Code-tab markdown hook (math gating + plugins)
  preload: ['the chunk preloader', s => s.includes('=function(e,t,n){let r=globalThis.__antChunkLoadCtx')],  // vite chunk preloader
  react: ['e.createRoot=function', s => s.includes('e.createRoot=function')],  // react + react-dom
  markdown: ['.runSync(x.parse(', s => /\.runSync\([\w$]+\.parse\(/.test(s)],  // react-markdown
  growthBook: ['the GrowthBook provider check', s => gbRe.test(s)],      // feature flags
  chat: ['the chat markdown component', s => s.includes('inHouseLatexPlugin:') && s.includes('normalizationMode:')],
};
const indexPath = join(cacheRoot, `${app.key}.json`);
let index;
try { index = JSON.parse(readFileSync(indexPath, 'utf8')); } catch {}
const fresh = !index;
if (fresh) {
  index = Object.fromEntries(Object.keys(markers).map(k => [k, []]));
  for (const f of jsFiles) {
    const s = read(f);
    for (const [k, [, test]] of Object.entries(markers)) if (test(s)) index[k].push(f);
  }
  for (const k of ['renderer', 'preload', 'react', 'markdown']) {
    if (index[k].length !== 1) die(`expected one bundle file containing ${markers[k][0]}, found ${index[k].length}`);
    index[k] = index[k][0];
  }
  if (!index.growthBook.length) die('GrowthBook provider check not found');
}
const files = index;

// Patches, applied in memory as hooks.mjs serves the chunks: { "assets/<v>/<file>": source }.
const patched = {};
const patch = (name, re, to, what) => {
  const s = patched[`${assets}/${name}`] ?? read(name);
  if (!re.test(s)) die(`can't ${what} in ${name}`);
  patched[`${assets}/${name}`] = s.replace(re, to);
};
{
  // Make the inline-math flag follow --flag (a global set below). Older builds: the hook does `x=<flagFn>(),{display:...}=...`.
  // Newer builds: `x=<flagFn>()` in the hook, then x is passed as the second argument to the
  // function that returns {display, guardedInline, ...}.
  const flagFn = (() => {
    const s = read(files.renderer);
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
    `function ${flagFn}(){return globalThis.__latexCheckInlineMath!==!1}`, 'pin the inline-math flag');
  // No GrowthBook provider outside the app: treat every other flag as absent instead of throwing.
  for (const f of files.growthBook)
    patch(f, gbRe, 'if(!$1)return{on:!1,off:!0,value:null,source:"unknownFeature"};', 'stub GrowthBook');
  // Vite's preloader waits on <link> loads that never fire in jsdom: export a pass-through instead.
  const preloadFn = read(files.preload).match(/([\w$]+)=function\(e,t,n\)\{let r=globalThis\.__antChunkLoadCtx/)?.[1]
    ?? die('chunk preloader not found');
  patch(files.preload, new RegExp(`export\\{([^}]*)\\b${escapeRe(preloadFn)} as `),
    'const __pass=f=>f();export{$1__pass as ', 'replace the chunk preloader');
}
// Serve the bundle's chunks to import() under file URLs inside the bundle.
const prefix = pathToFileURL(app.root).href + '/';
if (!nodeModule.register) die(`needs Node 18.19 or newer for module loader hooks, found ${process.version}`);
nodeModule.register('./hooks.mjs', import.meta.url, { data: { prefix, root: app.root, patched } });

// jsdom: the repo's own node_modules in a dev checkout, else the data folder (installed there once).
// Only these exact folders count: Node's normal lookup would also take a jsdom of any version from
// a parent folder, such as the user's home. In a clone, jsdom sits at the repository root, three
// levels up, recognized by this project's package.json.
function loadJsdom() {
  const req = createRequire(import.meta.url);
  const root = join(here, '..', '..', '..');
  let isRepo = false;
  try { isRepo = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name === 'claude-latex-check'; } catch {}
  for (const base of [...(isRepo ? [root] : []), here, dataDir]) {
    const pkg = join(base, 'node_modules', 'jsdom');
    if (existsSync(join(pkg, 'package.json'))) return req(pkg);
  }
  mkdirSync(dataDir, { recursive: true });
  console.error('claude-latex-check: installing jsdom into the data folder (one time)...');
  const r = spawnSync('npm', ['install', '--prefix', dataDir, '--no-audit', '--no-fund', '--silent', 'jsdom@24.1.3'],
    { stdio: ['ignore', 'ignore', 'inherit'], shell: process.platform === 'win32' });
  if (r.status !== 0) die(`couldn't install jsdom into ${dataDir} (npm exit ${r.status})`);
  return req(join(dataDir, 'node_modules', 'jsdom'));
}
globalThis.__latexCheckInlineMath = flag === 'on';
const { setupBrowser } = await import('./env.mjs');
setupBrowser(loadJsdom().JSDOM);
const quiet = console.log;
console.log = console.warn = console.info = console.debug = () => {};
// [exportName, fn] pairs of a bundle file.
const chunk = f => import(`${prefix}${assets}/${f}`);
const load = async f => Object.entries(await chunk(f)).filter(([, v]) => typeof v === 'function');
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
  const memos = (await Promise.all(files.chat.map(chunk)))
    .flatMap(m => Object.entries(m)).filter(([, v]) => v?.$$typeof === Symbol.for('react.memo') && typeof v.type === 'function');
  [, ChatMarkdown] = pickOne(memos.map(([k, v]) => [k, v]),
    v => src(v.type).includes('inHouseLatexPlugin:') && src(v.type).includes('normalizationMode:'), 'chat markdown component');
}
console.log = quiet;

// Wiring check, once per app version: some component must still call this hook the way the Code
// tab transcript does, hook(text, "chat", true, ...). Otherwise the app has moved to another renderer.
if (fresh) {
  const importRe = new RegExp(`import\\{[^}]*\\b${escapeRe(hookName)} as ([\\w$]+)[^}]*\\}from"\\./${escapeRe(files.renderer)}"`);
  const wired = jsFiles.some(f => {
    const s = read(f), alias = s.match(importRe)?.[1];
    return alias && new RegExp(`(?<![\\w$.])${escapeRe(alias)}\\([\\w$]+,"chat",!0[,)]`).test(s);
  });
  if (!wired) die('no app component calls the markdown hook as hook(text, "chat", true) any more');
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
if (fresh) {
  // Everything checked out: save the index, replacing whatever older app versions left.
  for (const d of ls(cacheRoot)) rmSync(join(cacheRoot, d), { recursive: true, force: true });
  mkdirSync(cacheRoot, { recursive: true });
  writeFileSync(indexPath, JSON.stringify(index));
}

let anyFailed = false;
for (const [i, text] of texts.entries()) {
  header(i);
  if (!hasMath(text)) { console.log('ok: no math'); continue; }
  const prose = proseOf(text);
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
  anyFailed ||= failed > 0;
}
process.exit(anyFailed ? 1 : 0);
