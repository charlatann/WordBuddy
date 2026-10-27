import { UNITS, STORIES } from '../data.js';
import { contains } from './text.js';

export { UNITS, STORIES };

// 内置内容（固定不变）
export const BUILTIN_SCENES = UNITS.flatMap(u => u.scenes);
export const BUILTIN_WORD_IDS = new Set(BUILTIN_SCENES.flatMap(s => s.words.map(w => w.id)));

// 当前可用的全部内容 = 内置 + 用户自己添加的（“我的单词”）。下面这些数组和映射会被 setCustom 原地更新。
export const SCENES = [...BUILTIN_SCENES];
export const WORDS = SCENES.flatMap(s => s.words);
export const wordByID = Object.fromEntries(WORDS.map(w => [w.id, w]));
export const sceneByID = Object.fromEntries(SCENES.map(s => [s.id, s]));
export const sceneByWordID = Object.fromEntries(SCENES.flatMap(s => s.words.map(w => [w.id, s])));
export const CUSTOM_UNIT = { id: 'my', title: '我的单词', emoji: '⭐️', scenes: [] };

const clear = obj => Object.keys(obj).forEach(k => delete obj[k]);

/** 用用户自己添加的场景刷新内容（内置单词不会被覆盖） */
export function setCustom(customScenes) {
  const list = (customScenes || []).filter(s => s && Array.isArray(s.words) && Array.isArray(s.lines));
  CUSTOM_UNIT.scenes = list;
  SCENES.length = 0; SCENES.push(...BUILTIN_SCENES, ...list);
  WORDS.length = 0; WORDS.push(...SCENES.flatMap(s => s.words));
  clear(wordByID); clear(sceneByID); clear(sceneByWordID);
  for (const s of SCENES) {
    sceneByID[s.id] = s;
    for (const w of s.words) {
      if (wordByID[w.id]) continue;
      wordByID[w.id] = w; sceneByWordID[w.id] = s;
    }
  }
}

export const isKnownWord = id => !!wordByID[id];

export const KIND_LABEL = { dialogue: '对话', story: '小故事' };

/** 场景中出场的角色（按顺序），用于给不同角色分配不同声音 */
export function speakersOf(lines) {
  const seen = [];
  for (const l of lines) if (l.speaker && !seen.includes(l.speaker)) seen.push(l.speaker);
  return seen;
}

export function voiceIndex(lines, speaker) {
  if (!speaker) return 0;
  const i = speakersOf(lines).indexOf(speaker);
  return i < 0 ? 0 : i;
}

export function linesContaining(scene, wordID) {
  return scene.lines.filter(l => contains(l.en, wordID));
}

export function keyPhrase(scene) {
  return scene.lines[scene.keyLine];
}
