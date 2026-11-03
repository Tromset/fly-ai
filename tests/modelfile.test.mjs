import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
// Minimal Modelfile reader: FROM, REQUIRES, PARAMETER and the triple-quoted SYSTEM block.
function parse(text) {
  const system = text.match(/^SYSTEM """([\s\S]*?)"""/m)?.[1];
  const lines = text.replace(/^SYSTEM """[\s\S]*?"""/gm, '').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  const from = lines.filter(l => /^FROM /i.test(l)).map(l => l.slice(5).trim());
  const requires = lines.filter(l => /^REQUIRES /i.test(l)).map(l => l.slice(9).trim());
  const params = Object.fromEntries(lines.filter(l => /^PARAMETER /i.test(l)).map(l => l.split(/\s+/).slice(1)));
  const unknown = lines.filter(l => !/^(FROM|REQUIRES|PARAMETER) /i.test(l));
  return { from, requires, params, system, unknown };
}

const VARIANTS = [
  { file: 'Modelfile.ultra', name: 'fly1.0:ultra', from: 'mistral-large-4:cloud', title: 'Fly 1.0 ultra', base: 'Mistral Large 4 by Mistral AI',
    params: { temperature: '1', top_p: '0.95' }, requires: [] },
  { file: 'Modelfile.lite', name: 'fly1.0:lite', from: 'ministral-3:8b', title: 'Fly 1.0 lite', base: 'Ministral 3 8B by Mistral AI',
    params: { num_ctx: '8192', temperature: '0.05' }, requires: ['0.13.1'] }
];

for (const v of VARIANTS) {
  test(`${v.file} builds ${v.name} from ${v.from} with Mistral's sampling and the FlyCoder prompt`, () => {
    const m = parse(read(v.file));
    assert.deepEqual(m.from, [v.from]);
    assert.deepEqual(m.requires, v.requires);
    assert.deepEqual(m.unknown, []);
    assert.deepEqual(m.params, v.params);
    assert.ok(m.system.startsWith(`You are ${v.title}, `), 'the model knows its name');
    assert.ok(m.system.includes(v.base), 'the model knows its base');
    for (const rule of ['No placeholders, no "TODO"', 'Never invent functions', 'no hard-coded secrets', "write them in the user's language"])
      assert.ok(m.system.includes(rule), `${v.file}: ${rule}`);
  });
}

test('publish.sh publishes every Modelfile under its name, and the page lists them', () => {
  const publish = read('scripts/publish.sh'), page = read('docs/ollama/fly1.0.md'), readme = read('README.md');
  assert.match(publish, /^VERSION=1\.0$/m);
  for (const v of VARIANTS) {
    assert.match(publish, new RegExp(`^(MODELS=')?${v.file.replace('.', '\\.')} ${v.name}'?$`, 'm'), `publish.sh publishes ${v.file} as ${v.name}`);
    for (const doc of [page, readme]) assert.ok(doc.includes(`ollama run Tromset/${v.name}`), `${v.name} documented`);
  }
  execFileSync('sh', ['-n', new URL('../scripts/publish.sh', import.meta.url).pathname]);
});

test('the Mistral licenses are credited', () => {
  const readme = read('README.md');
  assert.match(readme, /Mistral Ecosystem Open-Weight License/);
  assert.match(readme, /Apache 2\.0/);
});
