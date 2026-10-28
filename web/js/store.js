// 本地存储（localStorage）：学习进度、练习记录、设置
import { newProgress, apply } from './core/srs.js';
import { setCustom } from './core/content.js';
import { syncable } from './core/sync.js';

let KEY = 'wordbuddy.v1';
let memoryFallback = null;   // 私密浏览等不能写 localStorage 时退回内存
let state = null;

const empty = () => ({ progress: {}, records: [], custom: [], tomb: { progress: {}, custom: {} },
  shared: { remindTime: '20:00', updatedAt: 0 }, settings: { remindTime: '20:00', apiKey: '', model: '' } });
const listeners = new Set();
let silent = false;

export function useNamespace(ns) { KEY = ns; state = null; read(); }
export const namespace = () => KEY;

function read() {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    const saved = raw ? JSON.parse(raw) : {};
    state = { ...empty(), ...saved, settings: { ...empty().settings, ...(saved.settings || {}) } };
    state.tomb = { progress: {}, custom: {}, ...(saved.tomb || {}) };
  } catch {
    state = memoryFallback || empty();
  }
  setCustom(state.custom);
  return state;
}

function write() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch { memoryFallback = state; }
  if (!silent) listeners.forEach(fn => fn());
}
const touch = (p, now = Date.now()) => { if (p) p.updatedAt = Math.max(now, (p.updatedAt || 0) + 1); return p; };

export const Store = {
  progressList() { return Object.values(read().progress); },
  progress(id) { return read().progress[id] || null; },
  learnedIDs() { return new Set(Object.keys(read().progress)); },

  learnScene(scene, now = Date.now()) {
    const s = read();
    for (const w of scene.words) if (!s.progress[w.id]) s.progress[w.id] = touch(newProgress(w.id, scene.id, now), now);
    write();
  },

  grade(wordID, grade, opts) {
    const p = read().progress[wordID];
    if (!p) return null;
    apply(grade, p, opts);
    touch(p);
    write();
    return p;
  },

  /** 剧场答题反馈到复习计划：到期的词答对算一次复习，答错则 10 分钟内再复习 */
  storyAnswer(wordID, correct, now = Date.now()) {
    const p = read().progress[wordID];
    if (!p) return;
    if (correct) { if (p.nextReview <= now) apply('good', p, { now }); }
    else { p.stage = Math.max(0, p.stage - 1); p.nextReview = Math.min(p.nextReview, now + 10 * 60_000); }
    touch(p, now);
    write();
  },

  addRecord(text, score, wordID) {
    const s = read();
    s.records.unshift({ text, score, date: Date.now() });
    s.records = s.records.slice(0, 200);
    if (wordID && s.progress[wordID]) {
      const p = s.progress[wordID];
      if (p.bestScore == null || score > p.bestScore) { p.bestScore = score; touch(p); }
    }
    write();
  },
  records() { return read().records; },

  // ---- 我的单词（用户添加的场景）----
  customScenes() { return read().custom; },
  saveCustomScene(scene) {
    const s = read();
    const i = s.custom.findIndex(x => x.id === scene.id);
    scene.createdAt ||= (i >= 0 && s.custom[i].createdAt) || Date.now();
    touch(scene);
    if (i >= 0) s.custom[i] = scene; else s.custom.push(scene);
    setCustom(s.custom); write();
  },
  deleteCustomScene(id) {
    const s = read();
    const scene = s.custom.find(x => x.id === id);
    if (!scene) return;
    const now = Date.now();
    s.custom = s.custom.filter(x => x.id !== id);
    s.tomb.custom[id] = Math.max(now, (scene.updatedAt || 0) + 1);
    for (const w of scene.words) if (s.progress[w.id]?.sceneID === id) {
      s.tomb.progress[w.id] = Math.max(now, (s.progress[w.id].updatedAt || 0) + 1);
      delete s.progress[w.id];
    }
    setCustom(s.custom); write();
  },
  newCustomID() { return 'my-' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); },

  settings() { return read().settings; },
  setSetting(k, v) {
    const s = read();
    s.settings[k] = v;
    if (k === 'remindTime') s.shared = { remindTime: v, updatedAt: Date.now() };
    write();
  },

  // ---- 云同步 ----
  onWrite(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  exportSync() { return JSON.parse(JSON.stringify(syncable(read()))); },
  /** 用合并后的云端数据替换本地（不会再次触发同步） */
  importSync(data) {
    const s = read();
    s.progress = data.progress || {};
    s.custom = data.custom || [];
    s.records = data.records || [];
    s.tomb = data.tomb || { progress: {}, custom: {} };
    s.shared = data.shared || s.shared;
    if (s.shared?.remindTime) s.settings.remindTime = s.shared.remindTime;
    setCustom(s.custom);
    silent = true;
    try { write(); } finally { silent = false; }
  },

  /** 仅测试使用 */
  _mutate(fn) { fn(read()); write(); },
  reset() { state = empty(); setCustom([]); write(); },
};
