// 逻辑测试用例：Node 和 iPhone Safari 中运行同一套
import { UNITS, STORIES, SCENES, WORDS, wordByID, sceneByID, sceneByWordID, speakersOf, voiceIndex, linesContaining } from '../core/content.js';
import { tokenMatches, contains, blank, highlight } from '../core/text.js';
import { INTERVALS, LABELS, MASTERED_INTERVAL, interval, newProgress, apply, isMastered, stageLabel, MIN, HOUR } from '../core/srs.js';
import { normalize, align, combinedScore, evaluate, level } from '../core/scoring.js';
import { remix } from '../core/generator.js';

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
];

/** 运行全部用例，返回 [{suite, name, ok, error, ms}] */
export function runSuites() {
  const out = [];
  for (const s of suites) for (const [name, fn] of s.tests) {
    const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
    try { fn(); out.push({ suite: s.name, name, ok: true }); }
    catch (e) { out.push({ suite: s.name, name, ok: false, error: e.message }); }
    out.at(-1).ms = Math.round(((typeof performance !== 'undefined' ? performance : Date).now() - t0) * 10) / 10;
  }
  return out;
}
