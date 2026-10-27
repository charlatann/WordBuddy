// 发音评分：语音识别结果与目标句逐词对齐（与 iOS 版算法一致）
// 综合分 = 准确度 60% + 清晰度 30% + 流利度 10%

const NUMBER_WORDS = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8',
  nine: '9', ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15',
  sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19', twenty: '20',
};

export function normalize(s) {
  const t = s.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (NUMBER_WORDS[t]) return NUMBER_WORDS[t];
  if (t === 'okay') return 'ok';
  return t;
}

function levenshtein(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

const same = (a, b) => a === b || (a.length >= 5 && levenshtein(a, b) <= 1);

/** 最长公共子序列对齐，返回 [a 中被匹配的标记, b 中被匹配的标记] */
export function align(a, b) {
  const n = a.length, m = b.length;
  const am = Array(n).fill(false), bm = Array(m).fill(false);
  if (!n || !m) return [am, bm];
  const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = same(a[i], b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (same(a[i], b[j])) { am[i] = bm[j] = true; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return [am, bm];
}

export function combinedScore(accuracy, clarity, fluency) {
  let s = 100 * (0.6 * accuracy + 0.3 * clarity + 0.1 * fluency);
  if (accuracy === 0) s = Math.min(s, 10);
  return Math.round(Math.max(0, Math.min(100, s)));
}

/**
 * @param expected 目标句
 * @param alternatives 识别候选 [{transcript, confidence}]，按可信度排序
 * @param durationSec 说话时长（秒），用于估算语速
 */
export function evaluate(expected, alternatives, durationSec = 0) {
  const display = expected.split(' ').filter(Boolean);
  const norm = display.map(normalize);
  const scoredIdx = norm.map((t, i) => (t ? i : -1)).filter(i => i >= 0);
  const target = scoredIdx.map(i => norm[i]);

  let best = null;
  alternatives.slice(0, 3).forEach((alt, rank) => {
    const spoken = alt.transcript.split(/\s+/).map(normalize).filter(Boolean);
    const [am] = align(target, spoken);
    let acc = target.length ? am.filter(Boolean).length / target.length : 0;
    if (rank > 0) acc *= 0.85;                     // 非首选结果打折，避免放水
    if (!best || acc > best.acc) best = { acc, am, spoken, alt };
  });

  if (!best) {
    return { score: 0, accuracy: 0, clarity: 0, fluency: 0, recognized: '',
             words: display.map(text => ({ text, matched: false })) };
  }
  const matched = display.map(() => true);
  scoredIdx.forEach((di, k) => { matched[di] = best.am[k]; });

  const conf = Number(best.alt.confidence);
  const clarity = best.acc === 0 ? 0 : (conf > 0 ? conf : best.acc);   // 部分浏览器不给置信度时退化为准确度

  let fluency = best.acc > 0 ? 1 : 0;
  if (best.spoken.length >= 2 && durationSec > 0) {
    const wps = best.spoken.length / Math.max(0.3, durationSec);
    if (wps < 1) fluency *= Math.max(0.3, wps);
    if (wps > 4) fluency *= Math.max(0.5, 4 / wps);
  }
  return {
    score: combinedScore(best.acc, clarity, fluency),
    accuracy: best.acc, clarity, fluency,
    recognized: best.alt.transcript,
    words: display.map((text, i) => ({ text, matched: matched[i] })),
  };
}

export function level(score) {
  if (score >= 90) return { emoji: '🌟', title: '太棒了，接近母语！', tone: 'good' };
  if (score >= 75) return { emoji: '👍', title: '很好，继续保持！', tone: 'good' };
  if (score >= 60) return { emoji: '🙂', title: '不错，再练练会更好', tone: 'ok' };
  if (score >= 40) return { emoji: '💪', title: '加油，多听几遍标准音', tone: 'ok' };
  return { emoji: '🎧', title: '没太听清，再试一次吧', tone: 'bad' };
}
