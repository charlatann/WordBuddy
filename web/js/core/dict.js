// 离线小词典（由 ECDICT 生成，约 1.3 万常用词）：查词、词形还原、从一段文字里提取单词

let DATA = null;          // { map: Map(word → [word, phonetic, senses]), forms: {inflected: lemma} }
let loading = null;

/** 浏览器里按需加载 data/dict.json；测试时可直接传入数据 */
export function useDictionary(raw) {
  DATA = { map: new Map(raw.w.map(r => [r[0], r])), forms: raw.f || {} };
  return DATA;
}

export function loadDictionary(url = 'data/dict.json') {
  if (DATA) return Promise.resolve(DATA);
  loading ||= fetch(url).then(r => {
    if (!r.ok) throw new Error(`词典加载失败（${r.status}）`);
    return r.json();
  }).then(useDictionary).catch(e => { loading = null; throw e; });
  return loading;
}

export const dictionaryReady = () => !!DATA;
/** 仅测试使用：清空已加载的词典 */
export function resetDictionary() { DATA = null; loading = null; }

/**
 * 还原词形：went → go，apples → apple；不认识时原样返回
 * @param prefer true：即使变形本身也收录在词典里（如 running），也还原成更常用的原形
 */
export function lemma(word, { prefer = true } = {}) {
  const w = word.toLowerCase();
  if (!DATA) return w;
  if (DATA.forms[w] && (prefer || !DATA.map.has(w))) return DATA.forms[w];
  if (DATA.map.has(w)) return w;
  for (const [suf, rep] of [['ies', 'y'], ['es', ''], ['s', ''], ['ed', ''], ['ed', 'e'], ['ing', ''], ['ing', 'e']]) {
    if (w.endsWith(suf) && w.length > suf.length + 2) {
      const base = w.slice(0, -suf.length) + rep;
      if (DATA.map.has(base)) return base;
    }
  }
  return w;
}

/** 查词：返回 { id, phonetic, senses:[{pos, meaning}] } 或 null */
export function lookup(word) {
  if (!DATA) return null;
  const r = DATA.map.get(word.toLowerCase()) || DATA.map.get(lemma(word));
  if (!r) return null;
  return { id: r[0], phonetic: r[1], senses: r[2].map(([pos, meaning]) => ({ pos, meaning })) };
}

const STOP = new Set(('a an the i me my mine you your yours he him his she her hers it its we us our they them their ' +
  'is am are was were be been being do does did done have has had not no yes or and but so if than then ' +
  'to of in on at by for with from as into onto about this that these those there here what who whom whose which ' +
  'can could will would shall should may might must let lets s t d ll re ve m').split(' '));

/** 只保留英文字母组成的单词（允许 don't → dont 之外的撇号被去掉），统一小写 */
export function normalizeWord(s) {
  return String(s).toLowerCase().replace(/[’']/g, '').replace(/[^a-z]/g, '');
}

/**
 * 从一段文字（手动输入或拍照识别结果）中提取候选单词，按出现顺序去重。
 * @returns [{ id, raw, entry }]  entry 为词典结果（找不到时为 null）
 */
export function extractWords(text, { keepUnknown = true, minLength = 2, stop = true, prefer = true } = {}) {
  const seen = new Set();
  const out = [];
  for (const m of String(text).matchAll(/[A-Za-z][A-Za-z’'-]*/g)) {
    for (const part of m[0].split('-')) {
      const raw = normalizeWord(part);
      if (raw.length < minLength || (stop && STOP.has(raw))) continue;
      const id = lemma(raw, { prefer });
      if (seen.has(id)) continue;
      const entry = lookup(id);
      if (!entry && !keepUnknown) continue;
      seen.add(id);
      out.push({ id, raw, entry });
    }
  }
  return out;
}
