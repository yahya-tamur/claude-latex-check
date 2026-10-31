// Reading the app's ion-dist in place, packed (ion-dist.asar) or as a folder, without unpacking or
// copying it. Used by check.mjs and by its module loader hooks (hooks.mjs).
import { openSync, readSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// { list(dir), read(rel) } for paths relative to the ion-dist root, like "assets/v1/x.js".
export function openBundle(root) {
  if (statSync(root).isDirectory()) return {
    list: dir => { try { return readdirSync(join(root, dir)); } catch { return []; } },
    read: rel => readFileSync(join(root, rel), 'utf8'),
  };
  // asar format: [4][header pickle size] [4][payload size][4][json length][json] then file data,
  // stored uncompressed at the offsets the JSON gives.
  const fd = openSync(root, 'r');
  const head = Buffer.alloc(16);
  readSync(fd, head, 0, 16, 0);
  const json = Buffer.alloc(head.readUInt32LE(12));
  readSync(fd, json, 0, json.length, 16);
  const base = 8 + head.readUInt32LE(4);
  const tree = JSON.parse(json.toString('utf8'));
  const entry = rel => rel.split(/[\\/]/).filter(Boolean).reduce((node, name) => node?.files?.[name], tree);
  return {
    list: dir => Object.keys(entry(dir)?.files ?? {}),
    read: rel => {
      const e = entry(rel);
      if (!e || e.files || e.link) throw new Error(`no file ${rel} in ${root}`);
      if (e.unpacked) return readFileSync(join(`${root}.unpacked`, rel), 'utf8');
      const buf = Buffer.alloc(e.size);
      if (e.size) readSync(fd, buf, 0, e.size, base + Number(e.offset));
      return buf.toString('utf8');
    },
  };
}
