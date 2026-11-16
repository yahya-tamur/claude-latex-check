// Stop hook, run after every turn by the plugin's hooks/hooks.json where hooks run (Claude Code and
// Cowork; claude.ai's chat has no hooks). It reads the hook's input on stdin: last_assistant_message
// is the reply, stop_hook_active is set when the turn was itself started by this hook.
//
// In a session that loaded the Code tab skill, a reply with math is copied, after the user's
// message, into a conversation document, math-notes/<session>.md in the working directory, through
// check.mjs --fix --append: its formulas are rewritten into forms the Code tab renders and checked
// with the app's own renderer before they're added. The session writes each answer once, in chat;
// the user reads it rendered in the document (skill-loaded.mjs told the session its path, to link
// it). If a copy still has a formula the script couldn't fix, the session is asked to fix it in
// the draft.
//
// Elsewhere (Cowork), the reply is checked as the chat view renders it, with this skill's rules and
// KaTeX, and if some math won't render the session is asked once to send a corrected reply.
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { commonRules, findSpans, fixText, katexProblem, loadKatex } from './math-spans.mjs';

let input;
try { input = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }
const reply = input.last_assistant_message ?? '';
if (input.stop_hook_active || !/\$|\\\(|\\\[/.test(reply)) process.exit(0);
let transcript = '';
try { transcript = readFileSync(input.transcript_path, 'utf8'); } catch {}
const block = reason => { process.stdout.write(JSON.stringify({ decision: 'block', reason })); process.exit(0); };

if (transcript.includes('"latex-check:latex-check"')) {
  const here = dirname(fileURLToPath(import.meta.url));
  const check = join(here, '..', '..', 'latex-check', 'scripts', 'check.mjs');
  const doc = join(input.cwd ?? process.cwd(), 'math-notes', `${String(input.session_id ?? 'session').slice(0, 8)}.md`);
  const prompt = lastPrompt(transcript);
  const first = !existsSync(doc);   // the first entry gets a title
  const quote = prompt.trim().split('\n').map(l => `> ${l}`.trimEnd()).join('\n');
  const title = first ? `# ${prompt.trim().split('\n')[0].slice(0, 70)}\n\n` : '';
  const args = [check, '--fix', '--append', doc, ...(process.env.CLAUDE_PLUGIN_DATA ? ['--data', process.env.CLAUDE_PLUGIN_DATA] : [])];
  const r = spawnSync(process.execPath, args, { input: `${title}${quote}\n\n${reply.trim()}\n`, encoding: 'utf8', timeout: 25000 });
  if (r.status === 1) block(`The copy of your last answer in ${doc} has formulas that still won't render:\n${r.stdout.trim()}\nFix only the flagged spans in the draft it names, then run: node "${check}" --fix --append "${doc}" <draft>. Don't send the answer again.`);
  process.exit(0);
}

// The last message the user typed: a user entry with text, not a tool result or a skill's text.
function lastPrompt(jsonl) {
  let found = '';
  for (const line of jsonl.split('\n')) {
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    if (o.type !== 'user' || o.isMeta) continue;
    const c = o.message?.content;
    const text = typeof c === 'string' ? c
      : Array.isArray(c) && !c.some(b => b?.type === 'tool_result') ? c.filter(b => b?.type === 'text').map(b => b.text).join('\n') : '';
    if (text.trim() && !text.startsWith('<') && !text.startsWith('Base directory for this skill')) found = text;
  }
  return found;
}

let katex;
try { katex = loadKatex(); } catch { process.exit(0); }
function problems(text) {
  const found = [];
  for (const s of findSpans(text)) {
    for (const p of commonRules(s)) found.push(`${p}: ${s.span}`);
    if (s.type === 'midDisplay' && !s.ownLine) found.push(`$$...$$ mid-sentence shows as text: ${s.span}`);
    if (s.type === 'inline' && s.multiline) found.push(`$...$ split across lines shows as text: ${s.span}`);
    const display = s.type === 'display' || (s.type === 'midDisplay' && s.ownLine);
    if (display || s.type === 'paren' || (s.type === 'inline' && !s.multiline)) {
      const p = katexProblem(katex, s.tex, display);
      if (p) found.push(p);
    }
  }
  return found;
}
const found = problems(reply);
if (!found.length) process.exit(0);
// The script's rewrites may fix it all; then the session only has to send that text.
const fixed = fixText(reply, katex).text;
const ready = fixed !== reply && !problems(fixed).length;
block([
  'Some math in the reply you just sent will not render:',
  ...found.map(p => `- ${p}`),
  '',
  'Send the whole reply again as a new message, corrected, and change nothing else. Start it with one short line saying it repeats the answer with the formulas fixed.',
  ...(ready ? ['', 'This version already fixes them; send it exactly, after that line:', '', fixed] : []),
].join('\n'));
