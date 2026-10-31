// Minimal browser globals for running the app's renderer in Node. jsdom is passed in because it
// may live in the plugin's data folder rather than next to this file.
export function setupBrowser(JSDOM) {
  const dom = new JSDOM('<!doctype html><div id=root></div>', { url: 'https://claude.ai/', pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = () => ({ matches:false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
  for (const k of Object.getOwnPropertyNames(w)) if (!(k in globalThis)) try { globalThis[k] = w[k]; } catch {}
  globalThis.window = w; globalThis.self = w;
  w.performance.getEntriesByName ??= () => [];
}
