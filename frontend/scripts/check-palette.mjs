// SPDX-License-Identifier: Apache-2.0
// Build gate: WCAG contrast checks on the map palette (src/lib/mapPalette.ts). Exits 1 on any failure.
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const src = readFileSync(new URL('../src/lib/mapPalette.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const { paletteFailures, PALETTES, contrast } = await import(`data:text/javascript,${encodeURIComponent(js)}`);

const failures = paletteFailures();
for (const [theme, p] of Object.entries(PALETTES)) console.log(`palette ${theme}: place labels ${contrast(p.label, p.land).toFixed(1)}:1 on land`);
if (failures.length) {
  console.error(`Map palette contrast checks failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('Map palette contrast checks passed.');
