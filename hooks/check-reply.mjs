// Stop hook, run after every turn by hooks.json next to this file. It acts only in sessions that
// loaded the Code tab skill; anywhere else (Cowork, or a session without math) it exits at once.
// It reads the hook's input on stdin: last_assistant_message is the reply, stop_hook_active is set
// when the turn was itself started by this hook.
//
// A reply with math is copied, after the user's message, into a conversation document,
// math-notes/<session>.md in the working directory, through check.mjs --fix --append: its formulas
// are rewritten into forms the Code tab renders and checked with the app's own renderer before
// they're added. The session writes each answer once, in chat; the user reads it rendered in the
// document (skill-loaded.mjs told the session its path, to link it). If a copy still has a formula
// the script couldn't fix, the session is asked to fix it in the draft. If the checker can't run
// (no app, or an app update broke it), the rules lint does the same rewrites and adds the copy
// unchecked by the renderer.
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

let input;
try { input = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }
const reply = input.last_assistant_message ?? '';
if (input.stop_hook_active || !/\$|\\\(|\\\[/.test(reply)) process.exit(0);
let transcript = '';
try { transcript = readFileSync(input.transcript_path, 'utf8'); } catch {}
if (!transcript.includes('"latex-check:latex-check"')) process.exit(0);

const here = dirname(fileURLToPath(import.meta.url));
const scripts = join(here, '..', 'skills', 'latex-check', 'scripts');
const check = join(scripts, 'check.mjs');
const doc = join(input.cwd ?? process.cwd(), 'math-notes', `${String(input.session_id ?? 'session').slice(0, 8)}.md`);
const prompt = lastPrompt(transcript);
const first = !existsSync(doc);   // the first entry gets a title
const quote = prompt.trim().split('\n').map(l => `> ${l}`.trimEnd()).join('\n');
const title = first ? `# ${prompt.trim().split('\n')[0].slice(0, 70)}\n\n` : '';
const entry = `${title}${quote}\n\n${reply.trim()}\n`;
const args = [check, '--fix', '--append', doc, ...(process.env.CLAUDE_PLUGIN_DATA ? ['--data', process.env.CLAUDE_PLUGIN_DATA] : [])];
let r = spawnSync(process.execPath, args, { input: entry, encoding: 'utf8', timeout: 25000 });
if (r.status === 2) r = spawnSync(process.execPath, [join(scripts, 'lint.mjs'), '--fix', '--append', doc], { input: entry, encoding: 'utf8', timeout: 25000 });
if (r.status === 1) process.stdout.write(JSON.stringify({ decision: 'block',
  reason: `The copy of your last answer in ${doc} has formulas that still won't render:\n${r.stdout.trim()}\nFix only the flagged spans in the draft it names, then run: node "${check}" --fix --append "${doc}" <draft>. Don't send the answer again.` }));

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
