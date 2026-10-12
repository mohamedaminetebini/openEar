import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseFixedBandEq } from '../src/features/corrections/parse.ts';

function option(name: string, fallback?: string): string {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (value) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing ${name}.`);
}
function directories(path: string): string[] {
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

const autoeq = resolve(option('--autoeq'));
const sources = option('--sources')
  .split(',')
  .map((source) => source.trim())
  .filter(Boolean);
const out = resolve(option('--out', 'public/corrections'));
const commit = execFileSync('git', ['-C', autoeq, 'rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const license = readFileSync(join(autoeq, 'LICENSE'), 'utf8');

const entries: [string, string, string, number[]][] = [];
let skipped = 0;
let clamped = 0;
for (const source of sources) {
  const sourceDir = join(autoeq, 'results', source);
  if (!existsSync(sourceDir)) {
    skipped++;
    continue;
  }
  for (const type of directories(sourceDir)) {
    for (const model of directories(join(sourceDir, type))) {
      const file = join(sourceDir, type, model, `${model} FixedBandEQ.txt`);
      const parsed = existsSync(file) ? parseFixedBandEq(readFileSync(file, 'utf8')) : null;
      if (!parsed) {
        skipped++;
        continue;
      }
      if (parsed.clamped) clamped++;
      entries.push([model, source, type, parsed.bands]);
    }
  }
}
entries.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'index.json'), JSON.stringify({ commit, entries }));
writeFileSync(
  join(out, 'ATTRIBUTION.md'),
  [
    '# Headphone corrections',
    '',
    'Corrections are fixed-band EQ results from the AutoEq project: https://github.com/jaakkopasanen/AutoEq',
    '',
    `Commit: ${commit}`,
    '',
    `Measurement sources included: ${sources.join(', ')}`,
    '',
    'Each source keeps its own terms. AutoEq is released under the MIT license:',
    '',
    license.trimEnd(),
    '',
  ].join('\n'),
);
console.log(`entries ${entries.length}, skipped ${skipped}, clamped ${clamped}`);
