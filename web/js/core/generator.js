// 根据已学单词即时生成“随机小剧场”
import { WORDS, wordByID, sceneByID, linesContaining } from './content.js';
import { contains, shuffle } from './text.js';

const INTROS = [
  ["Welcome to Memory Theater! Tonight's show is made of YOUR words.", '欢迎来到记忆剧场！今晚的演出全部由你的单词组成。'],
  ['Bobo the robot finds an old diary. Let\'s read it together!', '机器人波波找到一本旧日记，我们一起读读吧！'],
  ['Bobo the robot has a strange dream. Everyone in it speaks English!', '机器人波波做了个怪梦，梦里每个人都说英语！'],
];
const OUTROS = [
  ['The curtain falls. Bobo says: "Great job!"', '大幕落下，波波说：“干得漂亮！”'],
  ['Bobo closes the diary and smiles.', '波波合上日记，笑了。'],
  ['Bobo wakes up. "What a dream!"', '波波醒了过来：“好奇妙的梦！”'],
];

const pick = (arr, rand) => arr[Math.floor(rand() * arr.length)];

export function distractors(answer, sentence, pool, rand = Math.random) {
  const options = [answer];
  options.push(...shuffle(pool.filter(w => w !== answer && !contains(sentence, w)), rand).slice(0, 3));
  if (options.length < 4) {
    const extra = shuffle(WORDS.map(w => w.id).filter(w => !options.includes(w) && !contains(sentence, w)), rand);
    options.push(...extra.slice(0, 4 - options.length));
  }
  return options;
}

/**
 * @param progress 已学单词进度数组
 * @returns 互动短剧，或 null（已学不足 3 个词）
 */
export function remix(progress, { maxWords = 5, now = Date.now(), rand = Math.random } = {}) {
  const candidates = progress
    .filter(p => wordByID[p.wordID] && sceneByID[p.sceneID])
    .map(p => {
      let weight = rand();
      if (p.nextReview <= now) weight += 2;
      weight += Math.max(0, 4 - p.stage) * 0.3;
      return { word: wordByID[p.wordID], scene: sceneByID[p.sceneID], weight };
    })
    .sort((a, b) => b.weight - a.weight);
  if (candidates.length < 3) return null;

  const picked = candidates.slice(0, maxWords);
  const pool = candidates.map(c => c.word.id);
  const [introEn, introZh] = pick(INTROS, rand);
  const steps = [{ type: 'line', speaker: null, en: introEn, zh: introZh }];
  let speakAdded = false;

  picked.forEach(({ word, scene }, i) => {
    const sentences = linesContaining(scene, word.id);
    const target = pick(sentences, rand);
    steps.push({ type: 'line', speaker: null, en: `Scene ${i + 1}!`, zh: `第${i + 1}幕：${scene.emoji} ${scene.title}` });
    const idx = scene.lines.indexOf(target);
    if (idx > 0) {
      const prev = scene.lines[idx - 1];
      steps.push({ type: 'line', speaker: prev.speaker, en: prev.en, zh: prev.zh });
    }
    steps.push({ type: 'fill', speaker: target.speaker, en: target.en, zh: target.zh, answer: word.id,
                 options: distractors(word.id, target.en, pool, rand) });
    if (!speakAdded && i >= 1) {
      steps.push({ type: 'speak', en: target.en, zh: target.zh });
      speakAdded = true;
    }
  });
  const [outEn, outZh] = pick(OUTROS, rand);
  steps.push({ type: 'line', speaker: null, en: outEn, zh: outZh });

  return { id: 'remix-' + Math.floor(rand() * 1e9).toString(36), title: '随机小剧场', emoji: '🎲',
           intro: `由你学过的 ${picked.length} 个单词即兴生成`, wordIDs: picked.map(c => c.word.id), steps, isRemix: true };
}
