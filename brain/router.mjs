// FlyBrain routing for Fly 1.0, taken from FlyCoder and modelled on the fly's mushroom body: cheap sparse cues
// (Kenyon cells) settle most requests for free; only the unclear ones go to a
// micro-model (the output neurons), and then a single expert "lobe" is loaded.

const HARD_WORDS = /\b(debug\w*|d[ée]bog\w*|bug\w*|crash\w*|stack ?trace|traceback|segfault|fuite|leak\w*|refactor\w*|r[ée]usin\w*|architect\w*|algorithm\w*|algorithme\w*|complexit\w*|optimi[sz]\w*|perf\w*|concurren\w*|thread\w*|async\w*|deadlock|race condition|mutex|s[ée]curit\w*|secur\w*|vuln\w*|crypt\w*|injection|pars(e|er|eur|ing)|compil\w*|interpr[eé]t\w*|[ée]valuat\w*|dijkstra|graph[es]?|graphe\w*|dynamic programming|programmation dynamique|recurs\w*|r[ée]curs\w*|cache|lru|regex\w*|migration|schema|sch[ée]ma|prove|proof|prouve\w*|preuve|implement\w*|impl[ée]ment\w*|errors?|erreurs?|exceptions?|[ée]choue\w*|fail\w*|infinite loop|boucle infinie|en boucle|ne marche pas|not working|doesn.t work)\b/i;
const SIMPLE_WORDS = /^(what|what's|why|how do i|how to|when|which|is there|can i|explain|define|difference|qu'est-ce|qu’est-ce|c'est quoi|pourquoi|comment (on|faire|je)|quelle?s?|explique|d[ée]finis|diff[ée]rence|traduis|translate|rename|renomme)\b/i;

// Plain text of a message in any of the shapes Ollama accepts
// (native, OpenAI chat completions, Anthropic messages).
function text(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(part => typeof part === 'string' ? part : part?.text ?? (part?.type === 'tool_result' ? text(part.content) : '')).join('\n');
}

export function digest(body = {}) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const users = messages.filter(m => m?.role === 'user').map(m => text(m.content));
  if (typeof body.prompt === 'string') users.push(body.prompt);
  const system = text(body.system) + messages.filter(m => m?.role === 'system').map(m => text(m.content)).join('\n');
  const last = users.at(-1) ?? '';
  return { first: users[0] ?? '', last, turns: users.length, hasTools: Array.isArray(body.tools) && body.tools.length > 0,
    chars: system.length + messages.reduce((n, m) => n + text(m?.content).length, 0) + (body.prompt?.length ?? 0) };
}

// 'simple' | 'hard' | 'unsure', with the cue that decided it.
export function ruleRoute(d) {
  const fences = (d.last.match(/```/g) || []).length / 2;
  const specLines = (d.last.match(/^\s*([-*•]|\d+[.)])\s+/gm) || []).length;
  if (d.hasTools) return { level: 'hard', reason: 'tools' };
  if (d.chars > 6000) return { level: 'hard', reason: 'long context' };
  if (fences >= 2) return { level: 'hard', reason: 'several code blocks' };
  if (specLines >= 3) return { level: 'hard', reason: 'detailed specification' };
  if (HARD_WORDS.test(d.last)) return { level: 'hard', reason: 'hard keyword' };
  if (d.last.length < 300 && fences === 0 && SIMPLE_WORDS.test(d.last.trim())) return { level: 'simple', reason: 'short question' };
  return { level: 'unsure', reason: 'no clear cue' };
}

// Experts behind each name FlyBrain answers to. `prefix` lets the published
// models be used directly, e.g. prefix 'Tromset/' for Tromset/fly1.0:ultra.
// Simple requests go to the local fly1.0:lite (Ministral 3 8B, 6 GB); hard ones, agents and long
// contexts go to fly1.0:ultra (Le Chonk, in Ollama's cloud). There is no micro-model: an unclear
// request goes to ultra, which costs no local memory. fly1.0:ultra and fly1.0:lite called by
// their full name are not routed: FlyBrain passes them through like any other model.
export function profiles(prefix = '') {
  const name = n => `${prefix}${n}`;
  const fly = { simple: name('fly1.0:lite'), hard: name('fly1.0:ultra'), router: null, think: false, cloud: [name('fly1.0:ultra')] };
  const table = {};
  for (const n of ['fly', 'fly1.0']) table[n] = table[`${n}:latest`] = table[name(n)] = table[`${name(n)}:latest`] = fly;
  return table;
}

export class Memory {
  constructor(limit = 500) { this.limit = limit; this.map = new Map(); }
  key(model, d) { let h = 2166136261; for (const c of `${model}\0${d.first}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  get(model, d) { return d.turns > 1 ? this.map.get(this.key(model, d)) : undefined; }
  set(model, d, level) {
    const key = this.key(model, d);
    this.map.delete(key); this.map.set(key, level);
    if (this.map.size > this.limit) this.map.delete(this.map.keys().next().value);
  }
}

const LEVELS = ['simple', 'hard'];
const higher = (a, b) => (LEVELS.indexOf(a) >= LEVELS.indexOf(b) ? a : b);

// Picks the expert for one request. askRouter(model, text) resolves to 'simple' | 'hard'
// and may throw; any failure or unreadable answer goes to the hard expert.
export async function route(model, body, { profile, memory, askRouter, loaded } = {}) {
  const d = digest(body);
  const rule = ruleRoute(d);
  const remembered = memory?.get(model, d);
  let level = rule.level, reason = rule.reason;
  if (level === 'unsure') {
    if (remembered) [level, reason] = [remembered, 'same conversation'];
    else if (loaded === profile.hard) [level, reason] = ['hard', 'hard expert already loaded'];
    else if (!profile.router) [level, reason] = ['hard', 'unclear, keeping quality'];
    else {
      try {
        const answer = await askRouter(profile.router, d.last.slice(0, 2000));
        [level, reason] = LEVELS.includes(answer) ? [answer, 'micro-model'] : ['hard', 'micro-model unreadable'];
      } catch { [level, reason] = ['hard', 'micro-model failed']; }
    }
  }
  // A conversation can move up to the stronger expert, never back down: switching costs a reload and a full re-read.
  if (remembered && higher(remembered, level) !== level) [level, reason] = [remembered, 'same conversation'];
  memory?.set(model, d, level);
  return { level, reason, expert: profile[level] };
}
