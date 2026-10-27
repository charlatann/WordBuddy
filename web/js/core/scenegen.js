// 为用户自己添加的单词生成使用场景：内置模板（离线、免费）或 AI（用户自己的 Anthropic API 密钥）
import { contains, shuffle } from './text.js';

export const MAX_WORDS_PER_SCENE = 4;

// ---------------- 单词的 emoji ----------------
const EMOJI = {
  apple: '🍎', banana: '🍌', orange: '🍊', grape: '🍇', lemon: '🍋', pear: '🍐', peach: '🍑', cherry: '🍒',
  strawberry: '🍓', watermelon: '🍉', tomato: '🍅', potato: '🥔', carrot: '🥕', corn: '🌽', bread: '🍞', rice: '🍚',
  noodle: '🍜', pizza: '🍕', cake: '🍰', cookie: '🍪', candy: '🍬', chocolate: '🍫', milk: '🥛', tea: '🍵',
  coffee: '☕️', juice: '🧃', water: '💧', egg: '🥚', meat: '🥩', chicken: '🐔', fish: '🐟', soup: '🍲', salad: '🥗',
  sandwich: '🥪', hamburger: '🍔', ice: '🧊', cat: '🐱', dog: '🐶', bird: '🐦', duck: '🦆', pig: '🐷', cow: '🐮',
  horse: '🐴', sheep: '🐑', monkey: '🐵', tiger: '🐯', lion: '🦁', bear: '🐻', panda: '🐼', rabbit: '🐰', mouse: '🐭',
  elephant: '🐘', giraffe: '🦒', snake: '🐍', frog: '🐸', bee: '🐝', butterfly: '🦋', house: '🏠', home: '🏡',
  school: '🏫', hospital: '🏥', bank: '🏦', shop: '🏪', park: '🏞️', beach: '🏖️', mountain: '⛰️', river: '🏞️',
  sea: '🌊', city: '🏙️', car: '🚗', bus: '🚌', train: '🚆', plane: '✈️', bike: '🚲', bicycle: '🚲', ship: '🚢',
  boat: '⛵️', taxi: '🚕', book: '📖', pen: '🖊️', pencil: '✏️', paper: '📄', bag: '🎒', desk: '🪑', chair: '🪑',
  table: '🍽️', bed: '🛏️', door: '🚪', window: '🪟', key: '🔑', phone: '📱', computer: '💻', television: '📺',
  tv: '📺', camera: '📷', clock: '🕰️', watch: '⌚️', money: '💰', gift: '🎁', ball: '⚽️', game: '🎮', music: '🎵',
  song: '🎶', movie: '🎬', picture: '🖼️', photo: '📸', flower: '🌸', tree: '🌳', grass: '🌱', sun: '☀️', moon: '🌙',
  star: '⭐️', rain: '🌧️', snow: '❄️', wind: '💨', cloud: '☁️', fire: '🔥', hat: '🎩', shirt: '👕', dress: '👗',
  shoe: '👟', sock: '🧦', coat: '🧥', jacket: '🧥', umbrella: '☂️', glasses: '👓', friend: '🤝', family: '👨‍👩‍👧',
  mother: '👩', mom: '👩', father: '👨', dad: '👨', baby: '👶', boy: '👦', girl: '👧', teacher: '👩‍🏫',
  student: '🧑‍🎓', doctor: '🧑‍⚕️', nurse: '🧑‍⚕️', police: '👮', cook: '🧑‍🍳', heart: '❤️', head: '🙂', eye: '👀',
  ear: '👂', nose: '👃', mouth: '👄', hand: '✋', foot: '🦶', leg: '🦵', tooth: '🦷', hair: '💇', morning: '🌅',
  night: '🌙', birthday: '🎂', holiday: '🏖️', party: '🎉', letter: '✉️', map: '🗺️', ticket: '🎫', box: '📦',
  run: '🏃', walk: '🚶', swim: '🏊', jump: '🦘', dance: '💃', sing: '🎤', read: '📖', write: '✍️', draw: '🎨',
  eat: '🍽️', drink: '🥤', sleep: '😴', cry: '😢', laugh: '😂', smile: '😊', play: '🎲', study: '📚', learn: '📚',
  work: '💼', drive: '🚗', fly: '🕊️', open: '📂', close: '🔒', buy: '🛒', sell: '🏷️', wash: '🧼', clean: '🧹',
  love: '❤️', like: '👍', think: '🤔', listen: '👂', speak: '🗣️', talk: '💬', call: '📞', wait: '⏳', help: '🆘',
  happy: '😄', sad: '😢', angry: '😠', tired: '🥱', hungry: '😋', thirsty: '🥤', hot: '🥵', cold: '🥶', warm: '🔥',
  big: '🐘', small: '🐭', tall: '🦒', short: '📏', fast: '⚡️', slow: '🐢', new: '✨', old: '👴', beautiful: '🌸',
  ugly: '👹', good: '👍', bad: '👎', easy: '😌', difficult: '😵', hard: '🪨', funny: '🤣', busy: '🏃', quiet: '🤫',
  loud: '📢', dirty: '🧽', rich: '💰', poor: '🪙', strong: '💪', weak: '🥀', sweet: '🍬', sour: '🍋',
};
const POS_EMOJI = { 'n.': '📦', 'v.': '🏃', 'adj.': '🎨', 'adv.': '💨' };
export const emojiFor = (id, pos = '') => EMOJI[id] || POS_EMOJI[pos] || '📝';

// ---------------- 模板 ----------------
const PAIRS = [['Amy', 'Ben'], ['Lily', 'Max'], ['Mia', 'Leo'], ['Zoe', 'Sam'], ['Anna', 'Tom']];

const OPENINGS = [
  ['Bobo the robot is learning new words today.', '机器人波波今天要学新单词。'],
  ['It is a busy day at the English club.', '英语角今天特别热闹。'],
  ['Two friends meet at the park.', '两个好朋友在公园见面了。'],
];
const ENDINGS = [
  ['Bobo writes the words in his notebook. Then he eats the notebook.', '波波把单词写进本子里，然后把本子吃掉了。'],
  ['Everyone laughs. Bobo laughs the loudest.', '大家都笑了，波波笑得最大声。'],
  ['A bird repeats every word. Now the bird speaks English!', '一只小鸟把每个词都学了一遍。现在它会说英语了！'],
];

// [A 的台词, A 的中文, B 的台词, B 的中文]；{w} = 单词，{z} = 中文意思
const T = {
  'n.': [
    ['Look at the {w}!', '快看那个{z}！', 'Wow, I love the {w}!', '哇，我好喜欢这个{z}！'],
    ['Where is my {w}?', '我的{z}在哪儿？', 'Your {w}? It is under the bed!', '你的{z}？在床底下！'],
    ['This is my new {w}.', '这是我新买的{z}。', 'Your new {w}? It looks very old!', '你的新{z}？看起来好旧啊！'],
    ['Can I have the {w}, please?', '可以把{z}给我吗？', 'Sorry, Bobo took the {w}.', '抱歉，{z}被波波拿走了。'],
  ],
  'v.': [
    ['Can you {w}?', '你会{z}吗？', 'Yes! I {w} every day.', '会啊！我每天都{z}。'],
    ["Let's {w} together!", '我们一起{z}吧！', 'OK, but you {w} first.', '好啊，不过你先{z}。'],
    ["I don't want to {w} today.", '我今天不想{z}。', 'Then I will {w} for you!', '那我替你{z}！'],
    ["Bobo, please don't {w} here!", '波波，请不要在这里{z}！', 'But I love to {w}!', '可是我超爱{z}的！'],
  ],
  'adj.': [
    ["Wow, it's so {w}!", '哇，它好{z}！', 'Yes, very {w}. Just like me!', '是啊，非常{z}。跟我一样！'],
    ['Why are you so {w} today?', '你今天怎么这么{z}？', "I'm always {w} on Mondays!", '我每个星期一都很{z}！'],
    ['Is the cake {w}?', '蛋糕{z}吗？', 'Very {w}! And now it is gone.', '非常{z}！然后就被吃光了。'],
  ],
  'adv.': [
    ['Please walk {w}.', '请{z}走路。', "OK, I'm walking {w}. Like a cat!", '好的，我正在{z}走。像只猫一样！'],
    ['Bobo always talks {w}.', '波波说话总是{z}。', 'Yes, he does everything {w}!', '对，他做什么都{z}！'],
  ],
  other: [
    ['Teacher, what does "{w}" mean?', '老师，“{w}”是什么意思？', '"{w}" means "{z}". Say it: {w}!', '“{w}”的意思是“{z}”。跟我读：{w}！'],
  ],
};

const firstSense = m => String(m || '').split(/[；;，,]/)[0].trim();
function zhFor(word) {
  let z = firstSense(word.meaning) || word.id;
  if (word.pos === 'adj.') z = z.replace(/的$/, '');
  if (word.pos === 'adv.') z = z.replace(/地$/, '');
  return z;
}
export const wordsTitle = words => (words.length <= 2
  ? `学新词：${words.map(w => w.id).join('、')}`
  : `学新词：${words[0].id}、${words[1].id} 等 ${words.length} 个`);
const fill = (s, word, z) => s.replaceAll('{w}', word.id).replaceAll('{z}', z);
const pick = (arr, rand) => arr[Math.floor(rand() * arr.length)];

/**
 * 模板生成：开场旁白 + 每个单词一组两人对话 + 有反转的结尾
 * @param words [{id, phonetic, pos, meaning, emoji}]，最多 4 个
 */
export function templateScene(words, { id, rand = Math.random } = {}) {
  const [a, b] = pick(PAIRS, rand);
  const [oEn, oZh] = pick(OPENINGS, rand);
  const lines = [{ speaker: null, en: oEn, zh: oZh }];
  const used = new Set();
  words.forEach((w, i) => {
    const pool = T[w.pos] || T.other;
    let k = Math.floor(rand() * pool.length);
    for (let n = 0; n < pool.length && used.has(`${w.pos}${k}`); n++) k = (k + 1) % pool.length;
    used.add(`${w.pos}${k}`);
    const [aEn, aZh, bEn, bZh] = pool[k];
    const z = zhFor(w);
    const [s1, s2] = i % 2 ? [b, a] : [a, b];
    lines.push({ speaker: s1, en: fill(aEn, w, z), zh: fill(aZh, w, z) });
    lines.push({ speaker: s2, en: fill(bEn, w, z), zh: fill(bZh, w, z) });
  });
  const [eEn, eZh] = pick(ENDINGS, rand);
  lines.push({ speaker: null, en: eEn, zh: eZh });
  return {
    id, custom: true, source: 'template',
    title: wordsTitle(words),
    emoji: words[0]?.emoji || '⭐️', kind: 'dialogue',
    words, lines, keyLine: 1,
  };
}

// ---------------- 校验（AI 结果和模板结果都要通过） ----------------

export function validateScene(scene, wordIDs) {
  const problems = [];
  if (!scene || !Array.isArray(scene.lines)) return ['缺少台词'];
  if (scene.lines.length < 3 || scene.lines.length > 12) problems.push(`台词数 ${scene.lines.length} 不在 3–12 之间`);
  for (const l of scene.lines) {
    if (typeof l.en !== 'string' || !l.en.trim()) problems.push('有空台词');
    else if (l.en.split(/\s+/).length > 16) problems.push(`句子太长：${l.en}`);
    if (typeof l.zh !== 'string' || !l.zh.trim()) problems.push(`缺少翻译：${l.en}`);
  }
  for (const w of wordIDs) if (!scene.lines.some(l => typeof l.en === 'string' && contains(l.en, w))) problems.push(`单词 ${w} 没有出现在场景中`);
  if (!(Number.isInteger(scene.keyLine) && scene.keyLine >= 0 && scene.keyLine < scene.lines.length)) problems.push('keyLine 无效');
  return problems;
}

// ---------------- AI 生成 ----------------

export const DEFAULT_MODEL = 'claude-haiku-5-5';

const SYSTEM = `你是给中国英语初学者写学习材料的编剧。根据给定单词写一个非常短、有趣、便于记忆的英语小场景。
要求：
- 场景是两个人的对话（kind 为 "dialogue"）或带旁白的小故事（kind 为 "story"），4–8 句台词。
- 每句英文不超过 12 个词，只用 A1–A2 级别的简单词汇和日常用语。
- 每个目标单词都要以原形原样（拼写完全一致）出现在至少一句台词里。
- 结尾要有一个让人会心一笑的小反转。
- 每句都配自然的中文翻译。
- 选出最值得背下来的一句日常用语，把它的下标放在 keyLine。
- 同时给出每个单词的音标、词性（n. v. adj. adv. 等）、简短中文释义（最常用的 1–2 个意思）和一个 emoji。
只输出 JSON，不要任何其他文字，格式：
{"title":"不超过 8 个字的中文标题","emoji":"🙂","kind":"dialogue","words":[{"id":"apple","phonetic":"/ˈæpl/","pos":"n.","meaning":"苹果","emoji":"🍎"}],"lines":[{"speaker":"Amy","en":"...","zh":"..."},{"speaker":null,"en":"...","zh":"..."}],"keyLine":1}`;

export function buildPrompt(words) {
  return '目标单词：\n' + words.map(w => `- ${w.id}${w.meaning ? `（${w.pos || ''} ${w.meaning}）` : ''}`).join('\n');
}

export function parseAIResponse(text) {
  const s = String(text).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = s.indexOf('{'), end = s.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI 没有返回 JSON');
  return JSON.parse(s.slice(start, end + 1));
}

/** 调用 Anthropic Messages API；任何错误都会抛出，由调用方回退到模板 */
export async function aiScene(words, { id, apiKey, model = DEFAULT_MODEL, fetchImpl = fetch, timeoutMs = 45000 } = {}) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl && setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl?.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model, max_tokens: 1500, system: SYSTEM, messages: [{ role: 'user', content: buildPrompt(words) }] }),
    });
  } finally { if (timer) clearTimeout(timer); }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j?.error?.message || msg; } catch { /* 非 JSON */ }
    if (res.status === 401) msg = 'API 密钥无效';
    throw new Error(msg);
  }
  const data = await res.json();
  const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  const raw = parseAIResponse(text);

  // 单词信息：用户选定的释义优先，AI 只补充缺失的部分
  const info = Object.fromEntries((raw.words || []).map(w => [String(w.id || '').toLowerCase(), w]));
  const merged = words.map(w => {
    const ai = info[w.id] || {};
    return {
      id: w.id,
      phonetic: w.phonetic || ai.phonetic || '',
      pos: w.pos || ai.pos || '',
      meaning: w.meaning || ai.meaning || '',
      emoji: w.emojiFixed ? w.emoji : (ai.emoji || w.emoji || emojiFor(w.id, w.pos || ai.pos)),
    };
  });
  const scene = {
    id, custom: true, source: 'ai',
    title: String(raw.title || '').slice(0, 16) || wordsTitle(words),
    emoji: raw.emoji || merged[0].emoji,
    kind: raw.kind === 'story' ? 'story' : 'dialogue',
    words: merged,
    lines: (raw.lines || []).map(l => ({ speaker: l.speaker ? String(l.speaker) : null, en: String(l.en || '').trim(), zh: String(l.zh || '').trim() })),
    keyLine: Number(raw.keyLine),
  };
  if (!Number.isInteger(scene.keyLine) || !scene.lines[scene.keyLine]) scene.keyLine = Math.min(1, scene.lines.length - 1);
  const problems = validateScene(scene, words.map(w => w.id));
  if (problems.length) throw new Error('AI 场景不符合要求：' + problems[0]);
  return scene;
}

/**
 * 生成场景：有密钥时先试 AI，失败则回退到模板。
 * @returns { scene, usedAI, error }
 */
export async function generateScene(words, { id, apiKey, model, fetchImpl, rand } = {}) {
  if (apiKey) {
    try { return { scene: await aiScene(words, { id, apiKey, model, fetchImpl }), usedAI: true, error: null }; }
    catch (e) { return { scene: templateScene(words, { id, rand }), usedAI: false, error: e.message || String(e) }; }
  }
  return { scene: templateScene(words, { id, rand }), usedAI: false, error: null };
}

/** 把一批单词按每组最多 4 个拆开 */
export function chunkWords(words, size = MAX_WORDS_PER_SCENE) {
  const out = [];
  for (let i = 0; i < words.length; i += size) out.push(words.slice(i, i + size));
  return out;
}

export { shuffle };
