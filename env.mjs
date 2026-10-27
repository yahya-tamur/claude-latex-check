import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><div id=root></div>', { url: 'https://claude.ai/', pretendToBeVisual: true });
const w = dom.window;
w.matchMedia = () => ({ matches:false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
for (const k of Object.getOwnPropertyNames(w)) if (!(k in globalThis)) try { globalThis[k] = w[k]; } catch {}
globalThis.window = w; globalThis.self = w;
w.performance.getEntriesByName ??= () => [];
