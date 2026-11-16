// PostToolUse hook for the Skill tool, from the plugin's hooks/hooks.json. When this skill loads, it
// starts the checker's background browser (so the first answer's check doesn't wait for it), and it
// tells the session where this session's conversation document will be, so the first answer can
// link it without an extra turn. Other skills: nothing.
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

let input;
try { input = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }
if (input.tool_input?.skill !== 'latex-check:latex-check') process.exit(0);
const here = dirname(fileURLToPath(import.meta.url));
spawn(process.execPath, [join(here, 'check.mjs'), '--warm', ...(process.env.CLAUDE_PLUGIN_DATA ? ['--data', process.env.CLAUDE_PLUGIN_DATA] : [])],
  { detached: true, stdio: 'ignore', windowsHide: true }).unref();
const doc = join('math-notes', `${String(input.session_id ?? 'session').slice(0, 8)}.md`);
process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse',
  additionalContext: `This session's conversation document is ${doc} in the working directory: replies with math are copied there with their formulas fixed. End your first reply that has math with one short sentence saying the rendered answer is in [${doc}](${doc}).` } }));
