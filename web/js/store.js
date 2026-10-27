// 本地存储（localStorage）：学习进度、练习记录、设置
import { newProgress, apply } from './core/srs.js';

let KEY = 'wordbuddy.v1';
let memoryFallback = null;   // 私密浏览等不能写 localStorage 时退回内存
let state = null;

const empty = () => ({ progress: {}, records: [], settings: { remindTime: '20:00' } });

export function useNamespace(ns) { KEY = ns; state = null; }

function read() {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? { ...empty(), ...JSON.parse(raw) } : empty();
  } catch {
    state = memoryFallback || empty();
  }
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

  settings() { return read().settings; },
  setSetting(k, v) { read().settings[k] = v; write(); },

  /** 仅测试使用 */
  _mutate(fn) { fn(read()); write(); },
  reset() { state = empty(); write(); },
};
