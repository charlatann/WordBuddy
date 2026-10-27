import { UNITS, STORIES } from '../data.js';
import { contains } from './text.js';

export { UNITS, STORIES };

export const SCENES = UNITS.flatMap(u => u.scenes);
export const WORDS = SCENES.flatMap(s => s.words);
export const wordByID = Object.fromEntries(WORDS.map(w => [w.id, w]));
export const sceneByID = Object.fromEntries(SCENES.map(s => [s.id, s]));
export const sceneByWordID = Object.fromEntries(SCENES.flatMap(s => s.words.map(w => [w.id, s])));

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
