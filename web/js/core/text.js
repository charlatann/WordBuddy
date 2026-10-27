// 文本工具：单词变形匹配、高亮、挖空（与 iOS 版 TextTools 行为一致）

const SUFFIXES = ['', 's', 'es', 'ed', 'd', 'ing'];
const letters = s => s.toLowerCase().replace(/[^a-z]/g, '');

export function tokenMatches(token, word) {
  const t = letters(token);
  return SUFFIXES.some(s => t === word + s);
}

export function contains(sentence, word) {
  return sentence.split(' ').some(t => tokenMatches(t, word));
}

export function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** 返回 HTML：目标单词的字母部分加 <mark>，标点不着色 */
export function highlight(sentence, words) {
  return sentence.split(' ').map(tok => {
    if (!words.some(w => tokenMatches(tok, w))) return escapeHTML(tok);
    const m = tok.match(/^([^A-Za-z]*)(.*?)([^A-Za-z]*)$/);
    return `${escapeHTML(m[1])}<mark>${escapeHTML(m[2])}</mark>${escapeHTML(m[3])}`;
  }).join(' ');
}

/** 挖空第一个目标单词，保留前后标点 */
export function blank(sentence, word) {
  let done = false;
  return sentence.split(' ').map(tok => {
    if (done || !tokenMatches(tok, word)) return tok;
    done = true;
    const m = tok.match(/^([^A-Za-z]*)(.*?)([^A-Za-z]*)$/);
    return `${m[1]}_____${m[3]}`;
  }).join(' ');
}

export function shuffle(arr, rand = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** “5分钟后 / 3天后 / 现在” */
export function relativeCN(ts, now = Date.now()) {
  const d = ts - now;
  if (d <= 0) return '现在';
  const min = Math.round(d / 60000);
  if (min < 60) return `${Math.max(1, min)}分钟后`;
  const h = Math.round(d / 3600000);
  if (h < 24) return `${h}小时后`;
  return `${Math.round(d / 86400000)}天后`;
}
