// 在 Node 中运行逻辑测试：node web/tests/run-node.mjs
import { runSuites } from '../js/tests/suites.js';

const results = await runSuites();

// 真实词典文件检查（只在 Node 中运行）
import { readFileSync } from 'node:fs';
import { useDictionary, resetDictionary, lookup, lemma, extractWords } from '../js/core/dict.js';
const dictChecks = [
  ['词典文件：收录 1 万个以上常用词', d => { if (d.map.size < 10000) throw new Error(`只有 ${d.map.size} 个词`); }],
  ['词典文件：初学者常用词都能查到', () => {
    const miss = 'apple banana happy swim study library giraffe beautiful because under computer teacher yellow window'.split(' ').filter(w => !lookup(w));
    if (miss.length) throw new Error('查不到：' + miss.join(', '));
  }],
  ['词典文件：常见变形能还原', () => {
    const pairs = [['went', 'go'], ['children', 'child'], ['studies', 'study'], ['played', 'play'], ['apples', 'apple']];
    const bad = pairs.filter(([a, b]) => lemma(a) !== b);
    if (bad.length) throw new Error(bad.map(([a, b]) => `${a}→${lemma(a)}（应为 ${b}）`).join(', '));
  }],
  ['词典文件：常用词的默认义项合理', () => {
    const exp = { fast: 'adj.', swim: 'v.', happy: 'adj.', quickly: 'adv.', apple: 'n.', open: 'v.' };
    const bad = Object.entries(exp).filter(([w, p]) => lookup(w).senses[0].pos !== p);
    if (bad.length) throw new Error(bad.map(([w]) => `${w}: ${lookup(w).senses[0].pos}`).join(', '));
  }],
  ['词典文件：从课本句子中提取单词', () => {
    const ids = extractWords('Tom went to the library with his children. They were studying giraffes!', { keepUnknown: false }).map(x => x.id);
    for (const w of ['go', 'library', 'child', 'study', 'giraffe']) if (!ids.includes(w)) throw new Error(`缺少 ${w}：${ids}`);
  }],
];
const d = useDictionary(JSON.parse(readFileSync(new URL('../data/dict.json', import.meta.url), 'utf8')));
for (const [name, fn] of dictChecks) {
  try { fn(d); results.push({ suite: '离线词典文件', name, ok: true }); }
  catch (e) { results.push({ suite: '离线词典文件', name, ok: false, error: e.message }); }
}
resetDictionary();
let suite = '';
for (const r of results) {
  if (r.suite !== suite) { suite = r.suite; console.log(`\n${suite}`); }
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
}
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} 通过`);
process.exit(failed ? 1 : 0);
