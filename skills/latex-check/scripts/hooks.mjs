// Module loader hooks, registered by check.mjs: serve the app's chunks straight from its bundle,
// with check.mjs's patches applied, under file URLs inside the bundle (for a packed app, as if
// ion-dist.asar were a folder). Nothing is unpacked or written, and each chunk's import.meta.url
// is the address it would have in a copy. Everything else loads normally.
import { openBundle } from './bundle.mjs';

let prefix, bundle, patched;
export function initialize(data) {
  ({ prefix, patched } = data);
  bundle = openBundle(data.root);
}

export async function resolve(specifier, context, next) {
  // Node's own resolver would insist the file exists on disk.
  const url = specifier.startsWith(prefix) ? specifier
    : context.parentURL?.startsWith(prefix) && /^\.{0,2}\//.test(specifier) ? new URL(specifier, context.parentURL).href
    : null;
  return url ? { url, shortCircuit: true } : next(specifier, context);
}

export async function load(url, context, next) {
  if (!url.startsWith(prefix)) return next(url, context);
  const rel = decodeURIComponent(new URL(url).pathname.slice(new URL(prefix).pathname.length));
  return { format: rel.endsWith('.json') ? 'json' : 'module', source: patched[rel] ?? bundle.read(rel), shortCircuit: true };
}
