import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { digest, ruleRoute, route, profiles, Memory } from '../brain/router.mjs';
import { createFlyBrain, Scheduler } from '../brain/flybrain.mjs';

const user = content => ({ messages: [{ role: 'user', content }] });
const level = body => ruleRoute(digest(body)).level;

test('rules: short questions are simple, agents and long or detailed requests are hard', () => {
  for (const q of ["Qu'est-ce qu'une closure en JavaScript ?", 'How do I reverse a list in Python?', 'Explique la différence entre let et const.'])
    assert.equal(level(user(q)), 'simple', q);
  assert.equal(level({ ...user('salut'), tools: [{ type: 'function', function: { name: 'read' } }] }), 'hard');
  assert.equal(level(user('x'.repeat(7000))), 'hard');
  assert.equal(level(user('Pourquoi ce code plante ?\n```py\na()\n```\n```\nTraceback\n```')), 'hard');
  assert.equal(level(user('Trouve la vulnérabilité dans ce login')), 'hard');
  assert.equal(level(user('Écris une fonction qui met une chaîne en majuscules')), 'unsure');
});

test('digest reads native, OpenAI and Anthropic shapes', () => {
  assert.equal(digest({ prompt: 'hello' }).last, 'hello');
  assert.equal(digest({ messages: [{ role: 'user', content: [{ type: 'text', text: 'a' }, { type: 'image_url' }] }] }).last, 'a\n');
  const anthropic = digest({ system: [{ type: 'text', text: 'sys' }], messages: [{ role: 'user', content: 'first' }, { role: 'assistant', content: 'ok' }, { role: 'user', content: [{ type: 'tool_result', content: 'out' }] }] });
  assert.deepEqual([anthropic.first, anthropic.last, anthropic.turns], ['first', 'out', 2]);
});

test('route: simple to lite, hard and unclear to ultra, never a micro-model', async () => {
  const profile = profiles()['fly1.0'];
  const never = () => assert.fail('no micro-model in Fly 1.0');
  assert.equal((await route('fly1.0', user('How do I reverse a list in Python?'), { profile, askRouter: never })).expert, 'fly1.0:lite');
  assert.equal((await route('fly1.0', user('Débogue cette fonction'), { profile, askRouter: never })).expert, 'fly1.0:ultra');
  const unclear = await route('fly1.0', user('Écris une fonction qui met une chaîne en majuscules'), { profile, askRouter: never });
  assert.deepEqual([unclear.expert, unclear.reason], ['fly1.0:ultra', 'unclear, keeping quality']);
});

test('route: a conversation keeps its expert and can only move up', async () => {
  const profile = profiles()['fly1.0'], memory = new Memory();
  const first = [{ role: 'user', content: 'Explique les closures.' }];
  assert.equal((await route('fly1.0', { messages: first }, { profile, memory })).level, 'simple');
  const turn2 = [...first, { role: 'assistant', content: '...' }, { role: 'user', content: 'Débogue ce code maintenant.' }];
  assert.equal((await route('fly1.0', { messages: turn2 }, { profile, memory })).level, 'hard');
  const turn3 = [...turn2, { role: 'assistant', content: '...' }, { role: 'user', content: 'Merci, et pourquoi ?' }];
  assert.equal((await route('fly1.0', { messages: turn3 }, { profile, memory })).level, 'hard');
});

test('profiles: names, prefix for published models, ultra is the cloud expert', () => {
  const published = profiles('Tromset/');
  for (const n of ['fly', 'fly1.0', 'fly1.0:latest', 'Tromset/fly1.0', 'Tromset/fly1.0:latest'])
    assert.deepEqual([published[n].simple, published[n].hard], ['Tromset/fly1.0:lite', 'Tromset/fly1.0:ultra'], n);
  assert.deepEqual(published['fly1.0'].cloud, ['Tromset/fly1.0:ultra']);
  assert.equal(published['Tromset/fly1.0:ultra'], undefined, 'experts called by name are passed through');
  assert.equal(published['Tromset/fly1.0:lite'], undefined);
});

test('scheduler: a different expert waits for running requests, then the old one is unloaded', async () => {
  const unloaded = [];
  const s = new Scheduler(async m => { unloaded.push(m); });
  const releaseA = await s.acquire('a');
  const b = s.acquire('b');
  releaseA();
  (await b)();
  assert.deepEqual(unloaded, ['a']);
  assert.equal(s.current, 'b');
});

// A fake Ollama that records requests and the models it holds in memory.
async function fakeOllama() {
  const seen = [], loaded = new Set();
  const server = http.createServer(async (req, res) => {
    let raw = ''; for await (const c of req) raw += c;
    const body = raw ? JSON.parse(raw) : {};
    seen.push({ path: req.url, ...body });
    if (body.keep_alive === 0) { loaded.delete(body.model); return res.end('{}'); }
    if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [] }));
    if (req.url === '/api/show') return res.end(JSON.stringify({ model: body.model }));
    loaded.add(body.model);
    res.writeHead(200, { 'content-type': 'application/x-ndjson' });
    res.write(JSON.stringify({ model: body.model, message: { content: 'hi' }, done: false }) + '\n');
    res.end(JSON.stringify({ model: body.model, done: true }) + '\n');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, seen, loaded, close: () => server.close() };
}

test('FlyBrain server: lite for simple, ultra in the cloud for hard, lite stays loaded', async () => {
  const ollama = await fakeOllama();
  const brain = createFlyBrain({ ollama: ollama.url, prefix: 'Tromset/', log: () => {} });
  await new Promise(r => brain.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${brain.address().port}`;
  const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const simple = await post('/api/chat', { model: 'fly1.0', ...user('How do I reverse a list in Python?') });
    assert.equal(simple.headers.get('x-flybrain-expert'), 'Tromset/fly1.0:lite');
    assert.match(await simple.text(), /"done":true/);
    assert.equal(ollama.seen.at(-1).think, undefined, 'thinking is left to the client: Ministral 3 8B has none');

    const hard = await post('/v1/messages', { model: 'fly', max_tokens: 10, tools: [{ name: 'read', input_schema: {} }], messages: [{ role: 'user', content: 'hi' }] });
    assert.equal(hard.headers.get('x-flybrain-expert'), 'Tromset/fly1.0:ultra');
    await hard.text();
    assert.ok(ollama.loaded.has('Tromset/fly1.0:lite'), 'the cloud expert does not unload the local one');
    assert.ok(!ollama.seen.some(r => r.keep_alive === 0), 'nothing was unloaded');

    const show = await post('/api/show', { model: 'fly1.0' });
    assert.equal((await show.json()).model, 'Tromset/fly1.0:ultra');
    const other = await post('/api/chat', { model: 'llama3', ...user('hi') });
    assert.equal(other.headers.get('x-flybrain-expert'), null);
    await other.text();
    assert.equal(ollama.seen.at(-1).model, 'llama3', 'other models pass through untouched');
    assert.equal((await fetch(base + '/api/tags')).status, 200);
  } finally { brain.close(); ollama.close(); }
});
