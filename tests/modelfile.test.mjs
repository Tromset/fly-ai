import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
// Minimal Modelfile reader: FROM, REQUIRES, PARSER, PARAMETER, the triple-quoted SYSTEM and TEMPLATE blocks,
// and the "# Weights: <url> sha256:<hash>" comment of a model built from a local GGUF.
function parse(text) {
  const block = name => text.match(new RegExp(`^${name} """([\\s\\S]*?)"""`, 'm'))?.[1];
  const lines = text.replace(/^(SYSTEM|TEMPLATE) """[\s\S]*?"""/gm, '').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  const values = command => lines.filter(l => l.toUpperCase().startsWith(`${command} `)).map(l => l.slice(command.length + 1).trim());
  const params = Object.fromEntries(values('PARAMETER').map(l => l.split(/\s+/)));
  const unknown = lines.filter(l => !/^(FROM|REQUIRES|PARSER|PARAMETER) /i.test(l));
  const weights = text.match(/^# Weights: (https:\/\/\S+\.gguf) sha256:([0-9a-f]{64})$/m)?.slice(1);
  return { from: values('FROM'), requires: values('REQUIRES'), parser: values('PARSER'), params, system: block('SYSTEM'), template: block('TEMPLATE'), unknown, weights };
}

const VARIANTS = [
  { file: 'Modelfile.ultra', name: 'fly1.0:ultra', from: 'mistral-large-4:cloud', title: 'Fly 1.0 ultra', base: 'Mistral Large 4 by Mistral AI',
    params: { temperature: '1', top_p: '0.95' }, requires: [] },
  { file: 'Modelfile.lite', name: 'fly1.1:lite', from: './models/Ministral-3-8B-Instruct-2512-IQ4_XS.gguf', title: 'Fly 1.1 lite', base: 'Ministral 3 8B by Mistral AI',
    params: { num_ctx: '8192', temperature: '0.05' }, requires: ['0.13.1'], parser: ['ministral'] }
];

for (const v of VARIANTS) {
  test(`${v.file} builds ${v.name} from ${v.from} with Mistral's sampling and the FlyCoder prompt`, () => {
    const m = parse(read(v.file));
    assert.deepEqual(m.from, [v.from]);
    assert.deepEqual(m.requires, v.requires);
    assert.deepEqual(m.parser, v.parser ?? []);
    assert.deepEqual(m.unknown, []);
    assert.deepEqual(m.params, v.params);
    assert.ok(m.system.startsWith(`You are ${v.title}, `), 'the model knows its name');
    assert.ok(m.system.includes(v.base), 'the model knows its base');
    for (const rule of ['No placeholders, no "TODO"', 'Never invent functions', 'no hard-coded secrets', "write them in the user's language"])
      assert.ok(m.system.includes(rule), `${v.file}: ${rule}`);
  });
}

test('lite is built from a checked, text-only IQ4_XS GGUF of Ministral 3 8B', () => {
  const m = parse(read('Modelfile.lite'));
  const [url, sha] = m.weights ?? [];
  assert.ok(url, 'Modelfile.lite has a # Weights: line');
  assert.equal(url.split('/').at(-1), m.from[0].split('/').at(-1), 'the URL downloads the file FROM names');
  assert.match(url, /^https:\/\/huggingface\.co\/unsloth\/Ministral-3-8B-Instruct-2512-GGUF\/resolve\/main\//);
  assert.equal(sha.length, 64);
  assert.ok(!/mmproj/i.test(read('Modelfile.lite').replace(/^#.*$/gm, '')), 'no image projector: lite reads text only');
  for (const token of ['[SYSTEM_PROMPT]', '[INST]', '[/INST]', '[AVAILABLE_TOOLS]', '[TOOL_CALLS]', '[TOOL_RESULTS]', '</s>'])
    assert.ok(m.template.includes(token), `template keeps ${token}`);
  assert.ok(!m.template.includes('Le Chat'), "Le Chat's default system prompt is dropped: SYSTEM replaces it");
  assert.ok(m.system.includes('text only'), 'lite knows it cannot read images');
  assert.ok(m.system.length < 1500, `lite's system prompt stays short (${m.system.length} chars)`);
  execFileSync('sh', ['-n', new URL('../scripts/weights.sh', import.meta.url).pathname]);
  assert.match(read('.gitignore'), /^models\/$/m, 'the weights are not committed');
});

test('publish.sh publishes every Modelfile under its name, and the page lists them', () => {
  const publish = read('scripts/publish.sh'), page = read('docs/ollama/fly1.0.md'), readme = read('README.md');
  assert.match(publish, /^VERSION=1\.1$/m);
  for (const v of VARIANTS) {
    assert.match(publish, new RegExp(`^(MODELS=')?${v.file.replace('.', '\\.')} ${v.name}'?$`, 'm'), `publish.sh publishes ${v.file} as ${v.name}`);
    for (const doc of [page, readme]) assert.ok(doc.includes(`ollama run Tromset/${v.name}`), `${v.name} documented`);
  }
  for (const name of ['fly1.1:lite', 'fly1.1']) assert.ok(read('docs/ollama/fly1.1.md').includes(`ollama run Tromset/${name} `), `fly1.1 page: ${name}`);
  execFileSync('sh', ['-n', new URL('../scripts/publish.sh', import.meta.url).pathname]);
});

test('the Mistral licenses are credited', () => {
  const readme = read('README.md');
  assert.match(readme, /Mistral Ecosystem Open-Weight License/);
  assert.match(readme, /Apache 2\.0/);
});
