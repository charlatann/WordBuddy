// 艾宾浩斯遗忘曲线复习计划（与 iOS 版一致）

export const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
export const INTERVALS = [5 * MIN, 30 * MIN, 12 * HOUR, 1 * DAY, 2 * DAY, 4 * DAY, 7 * DAY, 15 * DAY, 30 * DAY];
export const LABELS = ['5分钟', '30分钟', '12小时', '1天', '2天', '4天', '7天', '15天', '30天'];
export const MASTERED_INTERVAL = 60 * DAY;

export const interval = stage => (stage < INTERVALS.length ? INTERVALS[Math.max(0, stage)] : MASTERED_INTERVAL);
export const isMastered = p => p.stage >= INTERVALS.length;
export const isDue = (p, now = Date.now()) => p.nextReview <= now;

export function newProgress(wordID, sceneID, now = Date.now()) {
  return { wordID, sceneID, stage: 0, learnedAt: now, nextReview: now + interval(0),
           lastReviewed: null, reviewCount: 0, lapseCount: 0, bestScore: null };
}

/**
 * good：进入下一个间隔；hard：保持当前间隔；forgot：回到起点。
 * early（提前复习）只有 forgot 会改变计划。直接修改并返回 p。
 */
export function apply(grade, p, { early = false, now = Date.now() } = {}) {
  p.reviewCount += 1;
  p.lastReviewed = now;
  if (early && grade !== 'forgot') return p;
  if (grade === 'good') p.stage += 1;
  if (grade === 'forgot') { p.stage = 0; p.lapseCount += 1; }
  p.nextReview = now + interval(p.stage);
  return p;
}

export function stageLabel(stage) {
  return stage >= INTERVALS.length ? '已掌握' : `第${stage + 1}轮 · 间隔${LABELS[stage]}`;
}
