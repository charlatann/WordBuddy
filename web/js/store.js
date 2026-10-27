// 本地存储（localStorage）：学习进度、练习记录、设置
import { newProgress, apply } from './core/srs.js';
import { setCustom } from './core/content.js';

let KEY = 'wordbuddy.v1';
let memoryFallback = null;   // 私密浏览等不能写 localStorage 时退回内存
let state = null;

const empty = () => ({ progress: {}, records: [], custom: [], settings: { remindTime: '20:00', apiKey: '', model: '' } });

export function useNamespace(ns) { KEY = ns; state = null; read(); }

function read() {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    const saved = raw ? JSON.parse(raw) : {};
    state = { ...empty(), ...saved, settings: { ...empty().settings, ...(saved.settings || {}) } };
  } catch {
    state = memoryFallback || empty();
  }
  setCustom(state.custom);
  return state;
}

function write() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch { memoryFallback = state; }
}

export const Store = {
  progressList() { return Object.values(read().progress); },
  progress(id) { return read().progress[id] || null; },
  learnedIDs() { return new Set(Object.keys(read().progress)); },

  learnScene(scene, now = Date.now()) {
    const s = read();
    for (const w of scene.words) if (!s.progress[w.id]) s.progress[w.id] = newProgress(w.id, scene.id, now);
    write();
  },

  grade(wordID, grade, opts) {
    const p = read().progress[wordID];
    if (!p) return null;
    apply(grade, p, opts);
    write();
    return p;
  },

  /** 剧场答题反馈到复习计划：到期的词答对算一次复习，答错则 10 分钟内再复习 */
  storyAnswer(wordID, correct, now = Date.now()) {
    const p = read().progress[wordID];
    if (!p) return;
    if (correct) { if (p.nextReview <= now) apply('good', p, { now }); }
    else { p.stage = Math.max(0, p.stage - 1); p.nextReview = Math.min(p.nextReview, now + 10 * 60_000); }
    write();
  },

  addRecord(text, score, wordID) {
    const s = read();
    s.records.unshift({ text, score, date: Date.now() });
    s.records = s.records.slice(0, 200);
    if (wordID && s.progress[wordID]) {
      const p = s.progress[wordID];
      if (p.bestScore == null || score > p.bestScore) p.bestScore = score;
    }
    write();
  },
  records() { return read().records; },

  // ---- 我的单词（用户添加的场景）----
  customScenes() { return read().custom; },
  saveCustomScene(scene) {
    const s = read();
    const i = s.custom.findIndex(x => x.id === scene.id);
    if (i >= 0) s.custom[i] = scene; else s.custom.push(scene);
    setCustom(s.custom); write();
  },
  deleteCustomScene(id) {
    const s = read();
    const scene = s.custom.find(x => x.id === id);
    if (!scene) return;
    s.custom = s.custom.filter(x => x.id !== id);
    for (const w of scene.words) if (s.progress[w.id]?.sceneID === id) delete s.progress[w.id];
    setCustom(s.custom); write();
  },
  newCustomID() { return 'my-' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); },

  settings() { return read().settings; },
  setSetting(k, v) { read().settings[k] = v; write(); },

  /** 仅测试使用 */
  _mutate(fn) { fn(read()); write(); },
  reset() { state = empty(); setCustom([]); write(); },
};
