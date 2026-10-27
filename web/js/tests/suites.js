// 逻辑测试用例：Node 和 iPhone Safari 中运行同一套
import { UNITS, STORIES, SCENES, WORDS, wordByID, sceneByID, sceneByWordID, speakersOf, voiceIndex, linesContaining } from '../core/content.js';
import { tokenMatches, contains, blank, highlight } from '../core/text.js';
import { INTERVALS, LABELS, MASTERED_INTERVAL, interval, newProgress, apply, isMastered, stageLabel, MIN, HOUR } from '../core/srs.js';
import { normalize, align, combinedScore, evaluate, level } from '../core/scoring.js';
import { remix } from '../core/generator.js';
import { setCustom, BUILTIN_SCENES } from '../core/content.js';
import { useDictionary, resetDictionary, lookup, lemma, extractWords } from '../core/dict.js';
import { templateScene, validateScene, aiScene, generateScene, parseAIResponse, chunkWords, emojiFor } from '../core/scenegen.js';

const DICT_FIXTURE = { w: [
  ['apple', '/ˈæpl/', [['n.', '苹果']]], ['go', '/gəʊ/', [['v.', '去；走']]], ['happy', '/ˈhæpi/', [['adj.', '快乐的']]],
  ['study', '/ˈstʌdi/', [['v.', '学习'], ['n.', '研究']]], ['quickly', '/ˈkwɪkli/', [['adv.', '很快地']]],
  ['giraffe', '/dʒəˈrɑːf/', [['n.', '长颈鹿']]], ['under', '/ˈʌndə/', [['prep.', '在…下面']]], ['library', '/ˈlaɪbrəri/', [['n.', '图书馆']]],
], f: { went: 'go', apples: 'apple', studied: 'study' } };
const W = (id, pos, meaning) => ({ id, phonetic: '', pos, meaning, emoji: emojiFor(id, pos) });
const SAMPLE = [W('giraffe', 'n.', '长颈鹿'), W('study', 'v.', '学习'), W('happy', 'adj.', '快乐的'), W('quickly', 'adv.', '很快地'),
                W('under', 'prep.', '在…下面'), W('library', 'n.', '图书馆'), W('swim', 'v.', '游泳'), W('zzz', '', '')];
const mockFetch = (status, body) => async () => ({ ok: status < 300, status, json: async () => body });
const aiBody = scene => ({ content: [{ type: 'text', text: JSON.stringify(scene) }] });
const GOOD_AI = { title: '图书馆里的长颈鹿', emoji: '🦒', kind: 'dialogue',
  words: [{ id: 'giraffe', phonetic: '/dʒəˈrɑːf/', pos: 'n.', meaning: '长颈鹿', emoji: '🦒' }, { id: 'library', phonetic: '/ˈlaɪbrəri/', pos: 'n.', meaning: '图书馆', emoji: '📚' }],
  lines: [{ speaker: 'Amy', en: 'Look! A giraffe in the library!', zh: '看！图书馆里有只长颈鹿！' },
          { speaker: 'Ben', en: 'Shh! It is reading a tall book.', zh: '嘘！它在看一本很高的书。' },
          { speaker: 'Amy', en: 'Why is the giraffe so quiet?', zh: '长颈鹿为什么这么安静？' },
          { speaker: 'Ben', en: 'Because the library has rules!', zh: '因为图书馆有规定！' }], keyLine: 0 };

class AssertionError extends Error {}
const t = {
  ok(v, msg = '应为真') { if (!v) throw new AssertionError(msg); },
  eq(a, b, msg = '') { if (a !== b) throw new AssertionError(`${msg} 期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`.trim()); },
  deep(a, b, msg = '') { if (JSON.stringify(a) !== JSON.stringify(b)) throw new AssertionError(`${msg} 期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`.trim()); },
};
const T0 = 1_800_000_000_000;

const checkFill = (s, where) => {
  t.ok(contains(s.en, s.answer), `${where}：答案 ${s.answer} 不在句子中`);
  t.ok(s.options.includes(s.answer), `${where}：选项缺少答案`);
  t.eq(s.options.length, 4, `${where}：选项数`);
  t.eq(new Set(s.options).size, 4, `${where}：选项重复`);
  t.ok(blank(s.en, s.answer) !== s.en, `${where}：挖空失败`);
  for (const o of s.options) if (o !== s.answer) t.ok(!contains(s.en, o), `${where}：干扰项 ${o} 也在句中`);
};
function shuffleSample(arr, n) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); }
const learnedAll = ids => ids.map(id => newProgress(id, sceneByWordID[id].id, T0));

export const suites = [
  { name: '词库与场景数据', tests: [
    ['单元/场景/单词数量', () => { t.eq(UNITS.length, 6); t.eq(SCENES.length, 12); t.eq(WORDS.length, 48); }],
    ['单词不重复且为小写', () => { t.eq(new Set(WORDS.map(w => w.id)).size, 48); WORDS.forEach(w => t.ok(/^[a-z]+$/.test(w.id), w.id)); }],
    ['每个单词都出现在自己的场景里', () => SCENES.forEach(s => s.words.forEach(w => t.ok(linesContaining(s, w.id).length > 0, `${w.id} 不在「${s.title}」`)))],
    ['音标/释义/词性/emoji 齐全', () => WORDS.forEach(w => { t.ok(/^\/.+\/$/.test(w.phonetic), w.id); t.ok(w.meaning && w.pos && w.emoji, w.id); })],
    ['场景简短（4–7 句，每句 ≤12 词）', () => SCENES.forEach(s => {
      t.eq(s.words.length, 4, s.title); t.ok(s.lines.length >= 4 && s.lines.length <= 7, s.title);
      t.ok(s.keyLine >= 0 && s.keyLine < s.lines.length, `${s.title} keyLine`);
      s.lines.forEach(l => { t.ok(l.en.split(' ').length <= 12, l.en); t.ok(l.zh, l.en); });
    })],
    ['对话至少 2 个角色，故事有旁白', () => SCENES.forEach(s => (s.kind === 'dialogue'
      ? t.ok(speakersOf(s.lines).length >= 2, s.title) : t.ok(s.lines.some(l => !l.speaker), s.title)))],
    ['角色声音分配稳定', () => { const s = sceneByID.s1; t.deep(speakersOf(s.lines), ['Mom', 'Tom']); t.eq(voiceIndex(s.lines, 'Tom'), 1); t.eq(voiceIndex(s.lines, null), 0); }],
  ]},
  { name: '艾宾浩斯复习计划', tests: [
    ['间隔符合设计', () => { t.deep(INTERVALS, [5 * MIN, 30 * MIN, 12 * HOUR, 86400e3, 2 * 86400e3, 4 * 86400e3, 7 * 86400e3, 15 * 86400e3, 30 * 86400e3]); t.eq(LABELS.length, INTERVALS.length); }],
    ['新词 5 分钟后第一次复习', () => { const p = newProgress('coffee', 's1', T0); t.eq(p.stage, 0); t.eq(p.nextReview - T0, 5 * MIN); }],
    ['“记住了”逐级推进直至已掌握', () => {
      const p = newProgress('coffee', 's1', T0); let now = T0;
      for (let st = 1; st < INTERVALS.length; st++) { now += 1000; apply('good', p, { now }); t.eq(p.stage, st); t.eq(p.nextReview - now, INTERVALS[st]); }
      t.ok(!isMastered(p)); apply('good', p, { now }); t.ok(isMastered(p)); t.eq(p.nextReview - now, MASTERED_INTERVAL);
    }],
    ['“有点模糊”保持当前间隔', () => { const p = newProgress('coffee', 's1', T0); apply('good', p, { now: T0 }); apply('good', p, { now: T0 }); apply('hard', p, { now: T0 }); t.eq(p.stage, 2); t.eq(p.nextReview - T0, 12 * HOUR); }],
    ['“忘记了”回到起点并记录遗忘', () => { const p = newProgress('coffee', 's1', T0); for (let i = 0; i < 5; i++) apply('good', p, { now: T0 }); apply('forgot', p, { now: T0 }); t.eq(p.stage, 0); t.eq(p.lapseCount, 1); t.eq(p.nextReview - T0, 5 * MIN); }],
    ['提前复习不打乱计划，忘记仍会重置', () => {
      const p = newProgress('coffee', 's1', T0); const next = p.nextReview;
      apply('good', p, { early: true, now: T0 }); apply('hard', p, { early: true, now: T0 }); t.eq(p.stage, 0); t.eq(p.nextReview, next); t.eq(p.reviewCount, 2);
      apply('good', p, { now: T0 }); apply('forgot', p, { early: true, now: T0 }); t.eq(p.stage, 0); t.eq(p.lapseCount, 1);
    }],
    ['阶段文字与边界', () => { t.eq(stageLabel(0), '第1轮 · 间隔5分钟'); t.eq(stageLabel(99), '已掌握'); t.eq(interval(-3), 5 * MIN); }],
  ]},
  { name: '文本工具', tests: [
    ['单词变形匹配', () => { t.ok(tokenMatches('waits.', 'wait')); t.ok(tokenMatches('sleeps', 'sleep')); t.ok(tokenMatches('Morning,', 'morning')); t.ok(tokenMatches('...Water!', 'water')); t.ok(!tokenMatches('snowman', 'snow')); t.ok(!tokenMatches('catch', 'cat')); }],
    ['挖空保留标点，只挖第一个', () => { t.eq(blank("I'm late! I have to hurry!", 'late'), "I'm _____! I have to hurry!"); t.eq(blank('...Water! Water, please!', 'water'), '..._____! Water, please!'); }],
    ['高亮只标字母、转义 HTML', () => { t.eq(highlight('Hurry, hurry!', ['hurry']), '<mark>Hurry</mark>, <mark>hurry</mark>!'); t.eq(highlight('a <b>', []), 'a &lt;b&gt;'); }],
  ]},
  { name: '发音评分算法', tests: [
    ['文本归一化', () => { t.eq(normalize("It's"), 'its'); t.eq(normalize('8:30.'), '830'); t.eq(normalize('One'), '1'); t.eq(normalize('Okay'), 'ok'); t.eq(normalize('—'), ''); }],
    ['逐词对齐：漏读与多读', () => { const [a, b] = align(['i', 'have', 'to', 'hurry'], ['uh', 'i', 'to', 'hurt']); t.deep(a, [true, false, true, false]); t.deep(b, [false, true, true, false]); }],
    ['长词允许 1 字母误差，短词不允许', () => { t.deep(align(['jacket'], ['jackets'])[0], [true]); t.deep(align(['pay'], ['pie'])[0], [false]); }],
    ['综合分公式与 0–100 边界', () => { t.eq(combinedScore(1, 1, 1), 100); t.eq(combinedScore(0.5, 0.8, 1), 64); t.ok(combinedScore(0, 1, 1) <= 10); t.eq(combinedScore(2, 2, 2), 100); }],
    ['完整打分：读对 / 读错 / 没识别', () => {
      const good = evaluate('I have to hurry!', [{ transcript: 'I have to hurry', confidence: 0.92 }], 1.6);
      t.ok(good.score >= 90, '读对应 ≥90，实际 ' + good.score); t.ok(good.words.every(w => w.matched));
      const half = evaluate('I have to hurry!', [{ transcript: 'I have to hairy', confidence: 0.6 }], 1.6);
      t.ok(half.score < good.score && half.score > 40, '部分读错分数居中，实际 ' + half.score); t.eq(half.words[3].matched, false);
      t.eq(evaluate('Hello', [], 1).score, 0);
    }],
    ['候选结果打折，避免放水', () => {
      const r = evaluate('cake', [{ transcript: 'take', confidence: 0.9 }, { transcript: 'cake', confidence: 0.4 }], 1);
      t.ok(r.accuracy <= 0.85 + 1e-9, '备选结果准确度应打 85 折');
    }],
    ['分数等级', () => { t.eq(level(95).emoji, '🌟'); t.eq(level(80).emoji, '👍'); t.eq(level(65).emoji, '🙂'); t.eq(level(45).emoji, '💪'); t.eq(level(10).emoji, '🎧'); }],
  ]},
  { name: '互动短剧', tests: [
    ['预置短剧使用词库中的词', () => { t.eq(STORIES.length, 3); STORIES.forEach(s => s.wordIDs.forEach(id => t.ok(wordByID[id], `${s.title}: ${id}`))); }],
    ['预置短剧的填空都合法', () => STORIES.forEach(s => s.steps.forEach((st, i) => {
      if (st.type !== 'fill') return; checkFill(st, `${s.title} 第${i + 1}步`); t.ok(s.wordIDs.includes(st.answer), `${s.title}: 答案不在解锁词表`);
    }))],
    ['每部短剧至少 4 个填空和 1 次开口', () => STORIES.forEach(s => { t.ok(s.steps.filter(x => x.type === 'fill').length >= 4, s.title); t.ok(s.steps.some(x => x.type === 'speak'), s.title); t.eq(s.steps[0].type, 'line'); })],
    ['已学不足 3 词时不生成', () => { t.eq(remix([]), null); t.eq(remix(learnedAll(['coffee', 'late'])), null); }],
    ['恰好 3 词时自动补足选项', () => { const s = remix(learnedAll(['coffee', 'late', 'hurry']), { now: T0 }); t.ok(s); t.deep([...s.wordIDs].sort(), ['coffee', 'hurry', 'late']); s.steps.filter(x => x.type === 'fill').forEach((x, i) => checkFill(x, `填空${i + 1}`)); }],
    ['随机生成 100 次全部合法', () => {
      const all = learnedAll(WORDS.map(w => w.id));
      for (let k = 0; k < 100; k++) {
        const s = remix(all, { now: T0 });
        t.ok(s.wordIDs.length <= 5 && new Set(s.wordIDs).size === s.wordIDs.length, '单词重复或过多');
        const fills = s.steps.filter(x => x.type === 'fill'); t.eq(fills.length, s.wordIDs.length);
        fills.forEach((x, i) => checkFill(x, `第${k + 1}次 填空${i + 1}`));
        t.eq(s.steps.filter(x => x.type === 'speak').length, 1); t.eq(s.steps.at(-1).type, 'line');
      }
    }],
    ['到期单词优先出演', () => {
      const due = new Set(['cat', 'snow', 'menu', 'map', 'egg']);
      const all = learnedAll(WORDS.map(w => w.id)).map(p => ({ ...p, stage: 3, nextReview: due.has(p.wordID) ? T0 - 1 : T0 + 86400e3 * 10 }));
      for (let k = 0; k < 20; k++) t.deep([...remix(all, { now: T0 }).wordIDs].sort(), [...due].sort());
    }],
  ]},
  { name: '我的单词（添加单词与生成场景）', tests: [
    ['词典：查词与词形还原', () => {
      useDictionary(DICT_FIXTURE);
      try {
        t.eq(lookup('apple').senses[0].meaning, '苹果'); t.eq(lemma('went'), 'go'); t.eq(lemma('apples'), 'apple');
        t.eq(lemma('libraries'), 'library'); t.eq(lookup('studied').id, 'study'); t.eq(lookup('xyzzy'), null);
      } finally { resetDictionary(); }
    }],
    ['从一段文字中提取单词（去重、过滤虚词、还原词形）', () => {
      useDictionary(DICT_FIXTURE);
      try {
        const r = extractWords("I went to the library. The happy giraffe studied apples, Apples! qwz", { keepUnknown: false });
        t.deep(r.map(x => x.id), ['go', 'library', 'happy', 'giraffe', 'study', 'apple']);
        const all = extractWords('the giraffe qwz', { keepUnknown: true, minLength: 1, stop: false });
        t.deep(all.map(x => [x.id, !!x.entry]), [['the', false], ['giraffe', true], ['qwz', false]]);
      } finally { resetDictionary(); }
    }],
    ['模板场景：各种词性都能生成合格场景', () => {
      for (let k = 0; k < 200; k++) {
        const words = shuffleSample(SAMPLE, 1 + (k % 4));
        const sc = templateScene(words, { id: 'my-t' + k });
        t.deep(validateScene(sc, words.map(w => w.id)), [], `第${k + 1}次`);
        t.ok(sc.lines.length <= 10, '台词太多');
        sc.lines.forEach(l => { t.ok(l.en.split(' ').length <= 12, l.en); t.ok(!/[{}]/.test(l.en + l.zh), '模板占位符没有替换：' + l.en); });
        t.eq(sc.custom, true); t.eq(sc.source, 'template');
      }
    }],
    ['模板场景：形容词/副词的中文去掉“的/地”', () => {
      const sc = templateScene([W('happy', 'adj.', '快乐的')], { id: 'x', rand: () => 0 });
      t.ok(sc.lines.some(l => l.zh.includes('好快乐！')), sc.lines.map(l => l.zh).join(' | '));
    }],
    ['AI 场景：正常返回时采用 AI 结果，保留用户选定的释义', async () => {
      const words = [W('giraffe', 'n.', '长颈鹿'), W('library', 'n.', '我自己的释义')];
      const r = await generateScene(words, { id: 'my-ai', apiKey: 'k', fetchImpl: mockFetch(200, aiBody(GOOD_AI)) });
      t.eq(r.usedAI, true); t.eq(r.error, null); t.eq(r.scene.source, 'ai'); t.eq(r.scene.title, '图书馆里的长颈鹿');
      t.eq(r.scene.words[1].meaning, '我自己的释义'); t.eq(r.scene.words[0].emoji, '🦒');
    }],
    ['AI 场景：漏掉单词、密钥错误、网络错误时回退到模板', async () => {
      const words = [W('giraffe', 'n.', '长颈鹿'), W('swim', 'v.', '游泳')];
      const bad = await generateScene(words, { id: 'a', apiKey: 'k', fetchImpl: mockFetch(200, aiBody(GOOD_AI)) });
      t.eq(bad.usedAI, false); t.ok(/swim/.test(bad.error), bad.error); t.deep(validateScene(bad.scene, ['giraffe', 'swim']), []);
      const k401 = await generateScene(words, { id: 'b', apiKey: 'k', fetchImpl: mockFetch(401, { error: { message: 'invalid x-api-key' } }) });
      t.eq(k401.error, 'API 密钥无效'); t.eq(k401.scene.source, 'template');
      const net = await generateScene(words, { id: 'c', apiKey: 'k', fetchImpl: async () => { throw new Error('Load failed'); } });
      t.eq(net.error, 'Load failed');
      const none = await generateScene(words, { id: 'd' });
      t.eq(none.usedAI, false); t.eq(none.error, null);
    }],
    ['AI 场景：请求格式正确，能解析带代码块的回复', async () => {
      let sent = null;
      await aiScene([W('giraffe', 'n.', '长颈鹿'), W('library', 'n.', '图书馆')], { id: 'z', apiKey: 'sk-test', model: 'm1',
        fetchImpl: async (url, opt) => { sent = { url, opt }; return { ok: true, status: 200, json: async () => aiBody(GOOD_AI) }; } });
      t.eq(sent.url, 'https://api.anthropic.com/v1/messages'); t.eq(sent.opt.headers['x-api-key'], 'sk-test');
      t.eq(sent.opt.headers['anthropic-dangerous-direct-browser-access'], 'true');
      const body = JSON.parse(sent.opt.body); t.eq(body.model, 'm1'); t.ok(/giraffe/.test(body.messages[0].content));
      t.eq(parseAIResponse('```json\n{"a":1}\n```').a, 1);
    }],
    ['按每组最多 4 个词拆分场景', () => { t.deep(chunkWords([1, 2, 3, 4, 5, 6, 7, 8, 9]).map(c => c.length), [4, 4, 1]); }],
    ['注册我的单词后可用于复习、剧场；不会覆盖内置单词', () => {
      try {
        const sc = templateScene([W('giraffe', 'n.', '长颈鹿'), W('coffee', 'n.', '假的'), W('swim', 'v.', '游泳')], { id: 'my-reg' });
        setCustom([sc]);
        t.eq(SCENES.length, BUILTIN_SCENES.length + 1); t.ok(sceneByID['my-reg']); t.eq(sceneByWordID.giraffe.id, 'my-reg');
        t.eq(wordByID.coffee.meaning, '咖啡', '内置单词被覆盖了'); t.eq(sceneByWordID.coffee.id, 's1');
        const st = remix(['giraffe', 'swim', 'late', 'hurry'].map(id => newProgress(id, sceneByWordID[id].id, T0)), { now: T0 });
        t.ok(st && st.steps.filter(x => x.type === 'fill').every(x => contains(x.en, x.answer)), '随机剧场使用自定义单词出错');
      } finally { setCustom([]); }
      t.eq(WORDS.length, 48); t.eq(sceneByID['my-reg'], undefined);
    }],
  ]},
];

/** 运行全部用例（支持异步用例），返回 [{suite, name, ok, error, ms}] */
export async function runSuites() {
  const out = [];
  const now = () => (typeof performance !== 'undefined' ? performance : Date).now();
  for (const s of suites) for (const [name, fn] of s.tests) {
    const t0 = now();
    try { await fn(); out.push({ suite: s.name, name, ok: true }); }
    catch (e) { out.push({ suite: s.name, name, ok: false, error: e.message }); }
    out.at(-1).ms = Math.round((now() - t0) * 10) / 10;
  }
  return out;
}
