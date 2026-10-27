import { UNITS, STORIES, SCENES, WORDS, wordByID, sceneByID, sceneByWordID, KIND_LABEL, CUSTOM_UNIT, isKnownWord,
         voiceIndex, linesContaining, keyPhrase } from './core/content.js';
import { highlight, blank, escapeHTML as h, shuffle, relativeCN } from './core/text.js';
import { INTERVALS, LABELS, interval, isMastered, isDue } from './core/srs.js';
import { evaluate, level } from './core/scoring.js';
import { remix } from './core/generator.js';
import { loadDictionary, lookup, extractWords, normalizeWord } from './core/dict.js';
import { generateScene, chunkWords, emojiFor, MAX_WORDS_PER_SCENE, DEFAULT_MODEL } from './core/scenegen.js';
import { Store } from './store.js';
import { Speech, speak, speakAll, stopSpeaking, startTake, playURL, stopPlaying,
         recordingSupported, recognitionSupported, ttsSupported, voiceCount, pickMime } from './speech.js';

const $app = document.getElementById('app');
const $tabbar = document.getElementById('tabbar');
const S = {};                     // 当前页面的临时状态
let fresh = true;                 // 路由刚切换

// ============ 路由 ============

function parseRoute() {
  const raw = location.hash.replace(/^#/, '') || '/learn';
  const [path, query = ''] = raw.split('?');
  return { parts: path.split('/').filter(Boolean), q: Object.fromEntries(new URLSearchParams(query)) };
}

export function go(hash) { location.hash = hash; }

const VIEWS = {
  learn: viewLearn, lesson: viewLesson, review: viewReview, run: viewReviewRun,
  story: viewStory, play: viewPlay, speak: viewSpeak, practice: viewPractice, check: viewCheck, add: viewAdd,
};
const TAB_OF = { learn: 'learn', lesson: 'learn', add: 'learn', review: 'review', run: 'review', story: 'story', play: 'story',
                 speak: 'speak', practice: 'speak', check: 'speak' };

export function render({ keepScroll = false } = {}) {
  const { parts, q } = parseRoute();
  const name = VIEWS[parts[0]] ? parts[0] : 'learn';
  const y = window.scrollY;
  $app.innerHTML = VIEWS[name](parts.slice(1), q);
  $app.dataset.view = name;
  fresh = false;
  renderTabbar(TAB_OF[name]);
  markPlaying();
  window.scrollTo(0, keepScroll ? y : 0);
  afterRender.splice(0).forEach(fn => fn());
}
const refresh = () => render({ keepScroll: true });
const afterRender = [];

window.addEventListener('hashchange', () => {
  fresh = true;
  stopSpeaking();
  stopPlaying();
  render();
});

function renderTabbar(active) {
  const due = Store.progressList().filter(p => isDue(p)).length;
  const tabs = [['learn', '📖', '学习'], ['review', '🔁', '复习'], ['story', '🎭', '剧场'], ['speak', '🎙️', '发音']];
  $tabbar.innerHTML = tabs.map(([id, ico, label]) => `
    <a href="#/${id}" class="${active === id ? 'on' : ''}" data-tab="${id}">
      <span class="ico">${ico}</span>${label}
      ${id === 'review' && due ? `<span class="badge">${due}</span>` : ''}
    </a>`).join('');
}

// ============ 通用片段 ============

const sayBtn = (text, { slow = false, voice = 0, size = '' } = {}) =>
  `<button class="speak ${size}" data-act="say" data-say="${h(text)}" data-voice="${voice}" ${slow ? 'data-slow="1"' : ''} aria-label="${slow ? '慢速朗读' : '朗读'}">${slow ? '🐢' : '🔊'}</button>`;

const topbar = (title, back = '', right = '<span></span>') => `
  <div class="topbar">
    <button class="back" data-act="back" data-to="${h(back)}" aria-label="返回">‹</button>
    <h1>${h(title)}</h1>${right}
  </div>`;

const chip = (w, learned) => `<span class="chip">${w.emoji} ${h(w.id)}${learned ? '<span class="ok">✓</span>' : ''}</span>`;

function lineHTML(line, { words = [], right = false, showZh = true, voice = 0 } = {}) {
  const body = `${highlight(line.en, words)}${showZh ? `<div class="zh">${h(line.zh)}</div>` : ''}`;
  if (!line.speaker) {
    return `<div class="narr" data-act="say" data-say="${h(line.en)}" data-voice="${voice}">${body}</div>`;
  }
  return `<div class="bubble-wrap ${right ? 'right' : ''}">
      <div class="who">${h(line.speaker)}</div>
      <div class="bubble" data-act="say" data-say="${h(line.en)}" data-voice="${voice}">${body}</div>
    </div>`;
}

function sceneHTML(scene, { words, showZh = true } = {}) {
  const lines = scene.lines.map(l => {
    const vi = voiceIndex(scene.lines, l.speaker);
    return lineHTML(l, { words: words || scene.words.map(w => w.id), right: vi % 2 === 1, showZh, voice: vi });
  }).join('');
  return `<div class="stack">
      <div class="row">
        <b style="font-size:19px">${scene.emoji} ${h(scene.title)}</b><span class="tag">${KIND_LABEL[scene.kind]}</span>
        <span class="spacer"></span>
        <button class="link" data-act="toggleZh">${showZh ? '隐藏中文' : '显示中文'}</button>
      </div>
      <div class="lines">${lines}</div>
      <div class="row">
        <button class="btn-sm primary" data-act="playScene" data-scene="${scene.id}">▶︎ 播放全部</button>
        <span class="spacer"></span><span class="tiny muted">点任意一句单独播放</span>
      </div>
    </div>`;
}

function markPlaying() {
  const cur = Speech.speakingText;
  document.querySelectorAll('[data-say]').forEach(el => el.classList.toggle('playing', !!cur && el.dataset.say === cur));
}
Speech.onChange(markPlaying);

let toastTimer;
function toast(msg) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast fade-in'; t.textContent = msg;
  document.body.appendChild(t);
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 2600);
}

// ============ 学习 ============

function sceneCard(s, learned) {
  const done = s.words.every(w => learned.has(w.id));
  return `<a class="card scene-card" href="#/lesson/${s.id}" style="text-decoration:none;color:inherit" data-test="scene-${s.id}">
      <div class="head"><span class="emoji">${s.emoji}</span>
        <div><h3>${h(s.title)}</h3><span class="tiny muted">${KIND_LABEL[s.kind] || '对话'}${s.custom ? (s.source === 'ai' ? ' · AI 生成' : ' · 模板生成') : ''}</span></div>
        ${done ? '<span class="done-badge">✓ 已学</span>' : ''}</div>
      <div class="chips">${s.words.map(w => chip(w, learned.has(w.id))).join('')}</div>
    </a>`;
}

function viewLearn() {
  const learned = Store.learnedIDs();
  const list = Store.progressList();
  const due = list.filter(p => isDue(p)).length;
  const next = SCENES.find(s => !s.words.every(w => learned.has(w.id)));
  return `
    <h1 class="page-title">学新词</h1>
    <div class="stats">
      <div class="card stat"><div>📘</div><b>${learned.size}/${WORDS.length}</b><span>已学单词</span></div>
      <div class="card stat"><div>⏰</div><b>${due}</b><span>待复习</span></div>
      <div class="card stat"><div>⭐️</div><b>${list.filter(isMastered).length}</b><span>已掌握</span></div>
    </div>
    <div style="height:16px"></div>
    ${next ? `
      <a class="hero" href="#/lesson/${next.id}" style="text-decoration:none" data-test="next-lesson">
        <div class="emoji">${next.emoji}</div>
        <div><p class="small">下一课</p><h2>${h(next.title)}</h2><p>${next.words.map(w => h(w.id)).join(' · ')}</p></div>
        <div class="play">▶︎</div>
      </a>` : `<div class="card">🎉 全部 ${WORDS.length} 个单词都学完了！去复习和剧场巩固吧。</div>`}
    <div class="section-title">${CUSTOM_UNIT.emoji} ${CUSTOM_UNIT.title}</div>
    <div class="grid">
      <a class="card scene-card add-card" href="#/add" style="text-decoration:none;color:inherit" data-test="add-words">
        <div class="head"><span class="emoji">➕</span><div><h3>添加我要背的单词</h3>
          <span class="tiny muted">拍照识别或手动输入，自动生成使用场景</span></div></div>
      </a>
      ${CUSTOM_UNIT.scenes.map(s => sceneCard(s, learned)).join('')}
    </div>
    ${UNITS.map(u => `
      <div class="section-title">${u.emoji} 第${u.id}单元 · ${h(u.title)}</div>
      <div class="grid">
        ${u.scenes.map(s => {
          const done = s.words.every(w => learned.has(w.id));
          return `<a class="card scene-card" href="#/lesson/${s.id}" style="text-decoration:none;color:inherit" data-test="scene-${s.id}">
              <div class="head"><span class="emoji">${s.emoji}</span>
                <div><h3>${h(s.title)}</h3><span class="tiny muted">${KIND_LABEL[s.kind]}</span></div>
                ${done ? '<span class="done-badge">✓ 已学</span>' : ''}</div>
              <div class="chips">${s.words.map(w => chip(w, learned.has(w.id))).join('')}</div>
            </a>`;
        }).join('')}
      </div>`).join('')}`;
}

function viewLesson([id]) {
  const scene = sceneByID[id];
  if (!scene) return `${topbar('找不到课程', '#/learn')}<p class="muted">课程不存在。</p>`;
  if (fresh || !S.lesson || S.lesson.id !== id) {
    S.lesson = { id, phase: 'words', wi: 0, qi: 0, picked: null, correct: 0, showZh: true,
      quiz: shuffle(scene.words).map(w => ({ word: w,
        options: shuffle([w.meaning, ...[...new Set(shuffle(WORDS.filter(x => x.id !== w.id)).map(x => x.meaning))]
          .filter(m => m && m !== w.meaning).slice(0, 3)]) })) };
  }
  const L = S.lesson;
  const n = scene.words.length;
  const pct = { words: (L.wi + 1) / n * 35, scene: 50, quiz: 60 + L.qi / n * 35, done: 100 }[L.phase];
  let body = '';

  if (L.phase === 'words') {
    const w = scene.words[L.wi];
    const ex = linesContaining(scene, w.id)[0];
    body = `
      <p class="center muted small">新单词 ${L.wi + 1}/${scene.words.length}</p>
      <div class="card word-card fade-in" data-test="word-card">
        <div class="emoji">${w.emoji}</div>
        <div class="word">${h(w.id)}</div>
        <div class="phon">${h(w.phonetic)}  ${h(w.pos)}</div>
        <div class="mean">${h(w.meaning)}</div>
        <div class="btns">${sayBtn(w.id, { size: 'lg' })}${sayBtn(w.id, { slow: true, size: 'lg' })}</div>
      </div>
      ${ex ? `<div class="card"><div class="tiny muted" style="margin-bottom:6px">场景预告</div>
        <div class="row"><div class="spacer">${highlight(ex.en, [w.id])}<div class="small muted">${h(ex.zh)}</div></div>${sayBtn(ex.en, { size: 'sm' })}</div></div>` : ''}
      <div class="btn-row">
        ${L.wi > 0 ? '<button class="btn gray" data-act="lessonPrev">上一个</button>' : ''}
        <button class="btn" data-act="lessonNext" data-test="lesson-next">${L.wi < scene.words.length - 1 ? '下一个' : '进入场景 ▶︎'}</button>
      </div>`;
  } else if (L.phase === 'scene') {
    const kp = keyPhrase(scene);
    body = `
      <p class="center muted small">在场景里认识它们 👇</p>
      <div class="card ${L.showZh ? '' : 'hide-zh'}" data-test="scene">${sceneHTML(scene, { showZh: L.showZh })}</div>
      <div class="card">
        <div style="color:var(--orange);font-weight:700;margin-bottom:6px">💬 今日日常用语</div>
        <div class="row"><div class="spacer"><b style="font-size:19px">${h(kp.en)}</b><div class="small muted">${h(kp.zh)}</div></div>${sayBtn(kp.en)}</div>
      </div>
      ${scene.custom ? `<button class="btn gray" data-act="regenScene" data-scene="${scene.id}" ${S.regen ? 'disabled' : ''} data-test="regen">
        ${S.regen ? '正在生成新场景…' : '🔄 换一个场景'}</button>` : ''}
      <button class="btn" data-act="lessonQuiz" data-test="to-quiz">小测验 ▶︎</button>`;
  } else if (L.phase === 'quiz') {
    const item = L.quiz[L.qi];
    body = `
      <p class="center muted small">听发音，选出正确的意思（${L.qi + 1}/${L.quiz.length}）</p>
      <div class="card word-card ${L.picked ? '' : 'hidden-word'}" data-test="quiz-card">
        ${sayBtn(item.word.id, { size: 'lg' })}
        <div class="word">${L.picked ? h(item.word.id) : '?????'}</div>
        <div class="phon">${L.picked ? h(item.word.phonetic) : '点 🔊 再听一遍'}</div>
      </div>
      <div class="options">
        ${item.options.map(o => {
          const cls = !L.picked ? '' : o === item.word.meaning ? 'right' : o === L.picked ? 'wrong' : '';
          return `<button class="opt ${cls}" data-act="lessonPick" data-opt="${h(o)}" ${L.picked ? 'disabled' : ''}>${h(o)}</button>`;
        }).join('')}
      </div>
      ${L.picked ? `<button class="btn" data-act="lessonQuizNext" data-test="quiz-next">${L.qi < L.quiz.length - 1 ? '下一题' : '完成本课 🎉'}</button>` : ''}`;
  } else {
    const kp = keyPhrase(scene);
    body = `
      <div class="center fade-in" data-test="lesson-done"><div style="font-size:72px">🎉</div><h2 style="margin:4px 0">本课完成！</h2>
        <p class="muted">小测验答对 ${L.correct}/${L.quiz.length}</p></div>
      <div class="card"><b>📅 已加入复习计划</b>
        <p class="small muted" style="margin:6px 0 0">按艾宾浩斯遗忘曲线，第一次复习在 5 分钟后，之后是 30 分钟、12 小时、1、2、4、7、15、30 天。打开 App 时会提示你该复习的单词。</p></div>
      <a class="btn orange" href="#/practice?s=${scene.id}&l=${scene.keyLine}" style="text-decoration:none">🎙️ 跟读今日用语</a>
      <a class="btn gray" href="#/learn" style="text-decoration:none">返回</a>`;
  }
  const del = scene.custom ? `<button class="back" data-act="deleteScene" data-scene="${scene.id}" aria-label="删除这组单词" style="font-size:17px">🗑</button>` : '<span></span>';
  return `${topbar(`${scene.emoji} ${scene.title}`, '#/learn', del)}
    <div class="progress"><i style="width:${pct}%"></i></div>
    <div class="stack">${body}</div>`;
}

// ============ 添加我的单词 ============

const addState = () => (S.add ||= { mode: 'type', text: '', cands: [], dictError: '', ocr: { phase: 'idle' },
  gen: { phase: 'idle', done: [], errors: [] }, showUnknown: false, showSettings: false });

function candHTML(c, i, aiOn) {
  const known = isKnownWord(c.id);
  const where = known ? sceneByWordID[c.id] : null;
  const senses = c.entry?.senses || [];
  return `<div class="card cand ${c.sel ? 'on' : ''} ${known ? 'locked' : ''}" data-test="cand-${c.id}">
    <div class="row">
      <button class="check ${c.sel ? 'on' : ''}" data-act="candToggle" data-i="${i}" ${known ? 'disabled' : ''} aria-label="选择 ${h(c.id)}">${c.sel ? '✓' : ''}</button>
      <div class="spacer"><b style="font-size:19px">${h(c.id)}</b>
        <span class="small muted">${h(c.entry?.phonetic || '')}</span>
        ${c.raw && c.raw !== c.id ? `<span class="tiny muted">（${h(c.raw)} 的原形）</span>` : ''}</div>
      ${sayBtn(c.id, { size: 'sm' })}
    </div>
    ${known ? `<div class="tiny muted" style="margin-top:6px">已在词库中：${where ? `${where.emoji} ${h(where.title)}` : ''}</div>` : `
      ${senses.length ? `<div class="chips" style="margin-top:10px">${senses.map((sn, k) => `
        <button class="chip sense ${c.sense === k ? 'on' : ''}" data-act="candSense" data-i="${i}" data-k="${k}">${h(sn.pos)} ${h(sn.meaning)}</button>`).join('')}</div>`
        : `<div class="tiny" style="color:var(--orange);margin-top:6px">词典里没有这个词，请确认拼写${aiOn ? '；中文意思可留空，由 AI 补全' : '并填写中文意思'}</div>`}
      <input class="mean-input" data-i="${i}" value="${h(c.meaning || '')}" placeholder="中文意思${aiOn && !senses.length ? '（可留空）' : ''}" aria-label="${h(c.id)} 的中文意思">`}
  </div>`;
}

function viewAdd() {
  const A = addState();
  const st = Store.settings();
  const aiOn = !!st.apiKey;
  const mode = A.mode;
  const visible = A.cands.filter(c => A.showUnknown || c.entry || c.manual);
  const hiddenUnknown = A.cands.filter(c => !c.entry && !c.manual).length;
  const selected = A.cands.filter(c => c.sel && !isKnownWord(c.id));

  let input = '';
  if (mode === 'type') {
    input = `<div class="card stack">
      <b>✍️ 输入要背的单词</b>
      <textarea id="add-text" rows="3" placeholder="例如：apple, swim, happy&#10;多个单词用空格、逗号或换行分开；也可以直接粘贴一段英文" data-test="add-text">${h(A.text)}</textarea>
      <button class="btn" data-act="addLookup" data-test="add-lookup">🔍 查词</button>
    </div>`;
  } else {
    const o = A.ocr;
    input = `<div class="card stack">
      <b>📷 拍下课本、单词表或任何英文</b>
      <p class="small muted" style="margin:0">尽量拍正、拍清楚、光线充足。第一次使用需要联网下载识别组件（约 3 MB）。</p>
      <div class="btn-row">
        <label class="btn"><input type="file" accept="image/*" capture="environment" data-act="photo" hidden>📷 拍照</label>
        <label class="btn gray"><input type="file" accept="image/*" data-act="photo" hidden>🖼 从相册选</label>
      </div>
      ${o.preview ? `<img src="${o.preview}" alt="待识别的照片" style="width:100%;max-height:260px;object-fit:contain;border-radius:12px;background:var(--card-2)">` : ''}
      ${o.phase === 'working' ? `<div><div class="small muted">${h(o.stage || '准备中')} ${Math.round((o.progress || 0) * 100)}%</div>
        <div class="progress" style="margin:6px 0 0"><i style="width:${Math.round((o.progress || 0) * 100)}%"></i></div></div>` : ''}
      ${o.phase === 'done' ? `<div class="small muted">识别出 ${A.cands.filter(c => c.entry).length} 个单词，点选你想背的。</div>` : ''}
      ${o.phase === 'error' ? `<div class="notice err">${h(o.error)}</div>` : ''}
    </div>`;
  }

  const g = A.gen;
  const results = g.done.length ? `<div class="card stack fade-in" data-test="add-done">
      <b>✅ 已添加 ${g.done.reduce((n, id) => n + (sceneByID[id]?.words.length || 0), 0)} 个单词，生成 ${g.done.length} 个场景</b>
      ${g.errors.length ? `<div class="notice">AI 生成没成功，已改用内置模板：${h(g.errors[0])}</div>` : ''}
      ${g.done.map(id => sceneByID[id]).filter(Boolean).map(sc => `<div class="card" style="background:var(--card-2);box-shadow:none">
          ${sceneHTML(sc)}
          <div style="height:10px"></div>
          <a class="btn" href="#/lesson/${sc.id}" style="text-decoration:none" data-test="learn-${sc.id}">▶︎ 开始学习</a></div>`).join('')}
    </div>` : '';

  const settings = `<div class="card">
      <button class="row" style="width:100%" data-act="addSettings"><b>⚙️ 场景生成方式</b><span class="spacer"></span>
        <span class="small" style="color:${aiOn ? 'var(--green)' : 'var(--text-2)'}">${aiOn ? 'AI（Claude）' : '内置模板'}</span><span class="muted">${A.showSettings ? '▴' : '▾'}</span></button>
      ${A.showSettings ? `<div class="stack" style="margin-top:12px">
        <p class="small muted" style="margin:0">默认用内置模板生成，离线、免费。填入你自己的 Anthropic API 密钥后改用 AI 生成，场景更有趣，并能补全词典里没有的词。
          密钥只保存在这台设备的浏览器里，费用由你的 Anthropic 账户支付（每个场景约几分钱）。在 <a href="https://console.anthropic.com/" target="_blank" rel="noopener">console.anthropic.com</a> 获取密钥。</p>
        <input id="api-key" type="password" autocomplete="off" placeholder="sk-ant-..." value="${h(st.apiKey || '')}" aria-label="API 密钥">
        <input id="api-model" type="text" autocomplete="off" placeholder="模型（默认 ${DEFAULT_MODEL}）" value="${h(st.model || '')}" aria-label="模型">
        <div class="btn-row"><button class="btn-sm primary" style="flex:1;justify-content:center" data-act="saveAI">保存</button>
          <button class="btn-sm" style="flex:1;justify-content:center" data-act="clearAI">清除密钥</button></div>
      </div>` : ''}
    </div>`;

  return `${topbar('添加单词', '#/learn')}
    <div class="seg" style="grid-template-columns:1fr 1fr">${[['type', '✍️ 手动输入'], ['photo', '📷 拍照识别']].map(([m, l]) =>
      `<button class="${mode === m ? 'on' : ''}" data-act="addMode" data-m="${m}" data-test="mode-${m}">${l}</button>`).join('')}</div>
    <div class="stack ${selected.length ? 'has-sticky' : ''}">
      ${input}
      ${A.dictError ? `<div class="notice err">${h(A.dictError)}</div>` : ''}
      ${visible.length ? `<div class="row"><b>选择要背的单词</b><span class="spacer"></span>
        <button class="link" data-act="candAll">全选新词</button></div>` : ''}
      ${visible.map(c => candHTML(c, A.cands.indexOf(c), aiOn)).join('')}
      ${hiddenUnknown && !A.showUnknown ? `<button class="link" data-act="showUnknown">显示另外 ${hiddenUnknown} 个词典里没有的词（可能是识别错误）</button>` : ''}
      ${results}
      ${settings}
    </div>
    <div id="add-bar">${addBarHTML()}</div>`;
}

function addBarHTML() {
  const A = addState();
  const aiOn = !!Store.settings().apiKey;
  const selected = A.cands.filter(c => c.sel && !isKnownWord(c.id));
  const missing = selected.filter(c => !c.meaning?.trim() && !aiOn);
  const g = A.gen;
  if (g.phase === 'working') return `<div class="sticky-bottom"><div><button class="btn" disabled>正在生成场景 ${g.step}/${g.total}…</button></div></div>`;
  if (!selected.length) return '';
  return `<div class="sticky-bottom"><div>
      ${missing.length ? `<div class="tiny" style="color:var(--orange);margin-bottom:6px">请填写 ${missing.map(c => h(c.id)).join('、')} 的中文意思</div>` : ''}
      <button class="btn" data-act="addGenerate" ${missing.length ? 'disabled' : ''} data-test="add-generate">
        ✨ 生成场景并添加（${selected.length} 个词 → ${Math.ceil(selected.length / MAX_WORDS_PER_SCENE)} 个场景）</button></div></div>`;
}

function mergeCands(found, { manual = false } = {}) {
  const A = addState();
  const old = Object.fromEntries(A.cands.map(c => [c.id, c]));
  A.cands = found.map(f => {
    const prev = old[f.id];
    if (prev) return { ...prev, manual: prev.manual || manual };
    return { id: f.id, raw: f.raw, entry: f.entry, sense: f.entry ? 0 : -1, meaning: f.entry?.senses[0]?.meaning || '',
             sel: manual && !isKnownWord(f.id) && !!f.entry, manual };
  });
}

async function addLookup() {
  const A = addState();
  A.text = document.getElementById('add-text')?.value ?? A.text;
  A.dictError = '';
  try { await loadDictionary(); } catch (e) { A.dictError = `${e.message}。仍可手动填写中文意思。`; }
  const found = extractWords(A.text, { keepUnknown: true, minLength: 1, stop: false, prefer: false });
  if (!found.length) A.dictError ||= '没有找到英文单词，请检查输入。';
  mergeCands(found, { manual: true });
  A.cands.filter(c => !c.entry).forEach(c => { c.sel = true; });
  refresh();
}

async function runOCR(file) {
  const A = addState();
  A.ocr = { phase: 'working', stage: '准备识别组件', progress: 0, preview: URL.createObjectURL(file) };
  refresh();
  let lastPaint = 0;
  try {
    const [{ recognize }] = await Promise.all([import('./ocr.js'), loadDictionary()]);
    const { text } = await recognize(file, { onProgress: (stage, p) => {
      A.ocr.stage = stage; A.ocr.progress = p;
      if (Date.now() - lastPaint > 250 && $app.dataset.view === 'add') { lastPaint = Date.now(); refresh(); }
    } });
    A.ocr.phase = 'done';
    A.ocr.text = text;
    mergeCands(extractWords(text, { keepUnknown: true }));
    if (!A.cands.some(c => c.entry)) { A.ocr.phase = 'error'; A.ocr.error = '没有识别出英文单词，换个角度、靠近一点再拍一次吧。'; }
  } catch (e) {
    A.ocr.phase = 'error';
    A.ocr.error = e.message || String(e);
  }
  if ($app.dataset.view === 'add') refresh();
}

async function addGenerate() {
  const A = addState();
  const st = Store.settings();
  const picked = A.cands.filter(c => c.sel && !isKnownWord(c.id));
  if (!picked.length) return;
  const words = picked.map(c => {
    const sn = c.entry?.senses[c.sense] || null;
    const pos = sn?.pos || '';
    return { id: c.id, phonetic: c.entry?.phonetic || '', pos, meaning: (c.meaning || '').trim(), emoji: emojiFor(c.id, pos) };
  });
  const groups = chunkWords(words);
  A.gen = { phase: 'working', step: 1, total: groups.length, done: [], errors: [] };
  refresh();
  for (const [k, group] of groups.entries()) {
    A.gen.step = k + 1; refresh();
    const { scene, error } = await generateScene(group, { id: Store.newCustomID(), apiKey: st.apiKey, model: st.model || DEFAULT_MODEL });
    scene.words.forEach(w => { w.meaning ||= '（未填写）'; });
    Store.saveCustomScene(scene);
    A.gen.done.push(scene.id);
    if (error) A.gen.errors.push(error);
  }
  A.gen.phase = 'idle';
  A.cands = A.cands.filter(c => !isKnownWord(c.id));
  A.text = '';
  refresh();
  requestAnimationFrame(() => document.querySelector('[data-test="add-done"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

async function regenScene(id) {
  const old = sceneByID[id];
  if (!old?.custom || S.regen) return;
  S.regen = true; refresh();
  const st = Store.settings();
  const words = old.words.map(w => ({ ...w, emojiFixed: true }));
  const { scene, error } = await generateScene(words, { id, apiKey: st.apiKey, model: st.model || DEFAULT_MODEL });
  scene.words = old.words;
  Store.saveCustomScene(scene);
  S.regen = false;
  if (S.lesson?.id === id) S.lesson.showZh = true;
  refresh();
  toast(error ? `AI 生成失败，已用模板生成：${error}` : '已换成新场景');
}

// ============ 复习 ============

function viewReview() {
  const list = Store.progressList().sort((a, b) => a.nextReview - b.nextReview);
  const now = Date.now();
  const due = list.filter(p => isDue(p, now));
  let top;
  if (!list.length) {
    top = `<div style="font-size:54px">📚</div><h3>还没有学过的单词</h3><p class="muted small">先去「学习」页学一课，5 分钟后就能来复习了</p>`;
  } else if (!due.length) {
    top = `<div style="font-size:54px">✅</div><h3>暂时没有要复习的单词</h3>
      <p class="muted small">下一次复习：${relativeCN(list[0].nextReview, now)}</p>
      <a class="btn teal" href="#/run?early=1" style="text-decoration:none">⚡️ 提前练习最薄弱的单词</a>`;
  } else {
    top = `<div class="big-num">${due.length}</div><h3 style="margin:0 0 4px">个单词到了复习时间</h3>
      <p class="muted small">趁还没忘记，带着当初的场景巩固一下</p>
      <a class="btn orange" href="#/run" style="text-decoration:none" data-test="start-review">▶︎ 开始复习</a>`;
  }
  let rest = '';
  if (list.length) {
    const day0 = new Date(now); day0.setHours(0, 0, 0, 0);
    const days = Array.from({ length: 7 }, (_, i) => {
      const start = day0.getTime() + i * 86_400_000, end = start + 86_400_000;
      const count = list.filter(p => (i === 0 ? p.nextReview < end : p.nextReview >= start && p.nextReview < end)).length;
      const label = i === 0 ? '今天' : i === 1 ? '明天' : '周' + '日一二三四五六'[new Date(start).getDay()];
      return { label, count };
    });
    const max = Math.max(1, ...days.map(d => d.count));
    rest = `
      <div class="card"><b>未来 7 天复习量</b>
        <div class="bars">${days.map((d, i) => `<div class="bar ${i === 0 ? 'today' : ''}"><b>${d.count || ''}</b><i style="height:${d.count / max * 100}%"></i><span>${d.label}</span></div>`).join('')}</div>
      </div>
      <div class="card"><b>🧠 艾宾浩斯复习节奏</b>
        <p class="small muted" style="margin:6px 0 10px">记住了 → 进入下一个间隔；有点模糊 → 原间隔再来一次；忘记了 → 从头开始。</p>
        <div class="chips">${LABELS.map((l, i) => `<span class="chip" style="background:rgba(91,79,224,${0.06 + i * 0.035})">${l} · ${list.filter(p => p.stage === i).length}词</span>`).join('')}
          <span class="chip" style="background:var(--green-soft)">已掌握 · ${list.filter(isMastered).length}词</span></div>
      </div>
      <div class="card"><b>我的单词本（${list.length}）</b>
        ${list.map(p => { const w = wordByID[p.wordID]; return `
          <div class="list-row"><span style="font-size:24px">${w.emoji}</span>
            <div class="spacer"><b>${h(w.id)}</b><div class="tiny muted">${h(w.meaning)}</div></div>
            <div style="text-align:right"><span class="dots">${INTERVALS.map((_, i) => `<i class="${i < p.stage ? 'on' : ''}"></i>`).join('')}</span>
              <div class="tiny" style="color:${isDue(p, now) ? 'var(--orange)' : 'var(--text-2)'}">${isDue(p, now) ? '待复习' : relativeCN(p.nextReview, now)}</div></div>
            ${sayBtn(w.id, { size: 'sm' })}</div>`; }).join('')}
      </div>`;
  }
  return `<h1 class="page-title">复习</h1>
    <div class="stack"><div class="card center stack" style="padding:24px">${top}</div>${rest}</div>`;
}

function viewReviewRun(_, q) {
  const early = q.early === '1';
  if (fresh || !S.review) {
    const list = Store.progressList();
    const ids = early
      ? list.sort((a, b) => a.stage - b.stage || b.lapseCount - a.lapseCount).slice(0, 10).map(p => p.wordID)
      : list.filter(p => isDue(p)).map(p => p.wordID);
    S.review = { ids: shuffle(ids), early, i: 0, revealed: false, showScene: false, tally: { good: 0, hard: 0, forgot: 0 } };
    afterRender.push(() => { const w = S.review.ids[0]; if (w) speak(w); });
  }
  const R = S.review;
  const head = `${topbar(early ? '提前练习' : '复习', '#/review')}<div class="progress"><i style="width:${R.i / Math.max(1, R.ids.length) * 100}%;background:var(--orange)"></i></div>`;

  if (R.i >= R.ids.length) {
    return `${head}<div class="stack center" data-test="review-done">
      <div style="font-size:72px">💪</div><h2 style="margin:0">复习完成！</h2>
      <div class="stats">
        <div class="card stat"><b style="color:var(--green)">${R.tally.good}</b><span>记住了</span></div>
        <div class="card stat"><b style="color:var(--orange)">${R.tally.hard}</b><span>有点模糊</span></div>
        <div class="card stat"><b style="color:var(--red)">${R.tally.forgot}</b><span>忘记了</span></div></div>
      <p class="small muted">${early ? '提前练习不会打乱复习计划（忘记的词会重新安排）。' : '下一轮复习时间已按遗忘曲线自动安排。'}</p>
      <a class="btn orange" href="#/review" style="text-decoration:none">完成</a></div>`;
  }
  const w = wordByID[R.ids[R.i]];
  const scene = sceneByWordID[w.id];
  const p = Store.progress(w.id);
  const nextLabel = early ? '保持计划' : (p.stage + 1 < LABELS.length ? `${LABELS[p.stage + 1]}后` : '已掌握');
  return `${head}<div class="stack">
    <p class="center muted small">${R.i + 1} / ${R.ids.length}</p>
    <div class="card word-card" data-test="review-card">
      <div class="word">${h(w.id)}</div><div class="phon">${h(w.phonetic)}</div>
      <div class="btns" style="margin-top:12px">${sayBtn(w.id)}${sayBtn(w.id, { slow: true })}</div>
      ${R.revealed ? `<div class="mean fade-in" style="margin-top:14px">${w.emoji} ${h(w.pos)} ${h(w.meaning)}</div>` : ''}
    </div>
    <div class="card">
      <div class="row" style="margin-bottom:10px"><b style="color:var(--accent);font-size:15px">📍 来自场景：${scene.emoji} ${h(scene.title)}</b>
        <span class="spacer"></span><button class="link" data-act="reviewScene">${R.showScene ? '收起' : '回看完整场景'}</button></div>
      ${R.showScene ? `<div class="${R.revealed ? '' : 'hide-zh'}">${sceneHTML(scene, { words: [w.id] })}</div>` :
        linesContaining(scene, w.id).map(l => `<div class="row" style="margin:8px 0"><div class="spacer">
          ${l.speaker ? `<span class="tiny muted"><b>${h(l.speaker)}:</b></span> ` : ''}${highlight(l.en, [w.id])}
          ${R.revealed ? `<div class="small muted">${h(l.zh)}</div>` : ''}</div>${sayBtn(l.en, { size: 'sm', voice: voiceIndex(scene.lines, l.speaker) })}</div>`).join('')}
      ${R.revealed ? '' : '<p class="small muted" style="margin:6px 0 0">💡 想一想：它在这个场景里是什么意思？</p>'}
    </div>
    ${R.revealed ? `<b class="center">你记得怎么样？</b>
      <div class="grades">
        <button class="grade forgot" data-act="grade" data-g="forgot">忘记了<small>从头再来</small></button>
        <button class="grade hard" data-act="grade" data-g="hard">有点模糊<small>原间隔再来</small></button>
        <button class="grade good" data-act="grade" data-g="good">记住了<small>${nextLabel}</small></button>
      </div>` : '<button class="btn orange" data-act="reveal" data-test="reveal">显示答案</button>'}
  </div>`;
}

// ============ 剧场 ============

function viewStory() {
  const learned = Store.learnedIDs();
  const can = learned.size >= 3;
  const t = Store.settings().remindTime || '20:00';
  return `<h1 class="page-title">互动剧场</h1>
    <div class="stack">
      <div class="hero pink" style="flex-direction:column;align-items:stretch">
        <div class="row"><div class="emoji">🎲</div><div><h2>随机小剧场</h2>
          <p>${can ? '用你学过的单词即兴生成一段互动短剧，优先安排快要忘记的词' : `再学 ${3 - learned.size} 个单词就能解锁`}</p></div></div>
        <button class="btn" style="background:#fff;color:var(--pink);margin-top:14px" data-act="remix" ${can ? '' : 'disabled'} data-test="remix">▶︎ 开演！</button>
      </div>
      <div class="section-title" style="margin-top:12px">🎭 短剧场</div>
      <div class="grid">
        ${STORIES.map(s => {
          const n = s.wordIDs.filter(id => learned.has(id)).length;
          const open = n === s.wordIDs.length;
          return `<${open ? 'a' : 'div'} class="card scene-card ${open ? '' : 'locked'}" ${open ? `href="#/play/${s.id}"` : ''} style="text-decoration:none;color:inherit" data-test="story-${s.id}">
              <div class="head"><span class="emoji">${s.emoji}</span><div><h3>${h(s.title)}</h3><span class="tiny muted">${h(s.intro)}</span></div>
                <span class="done-badge" style="color:${open ? 'var(--pink)' : 'var(--text-3)'};font-size:20px">${open ? '▶︎' : '🔒'}</span></div>
              <div class="chips">${s.wordIDs.map(id => chip(wordByID[id], learned.has(id))).join('')}</div>
              ${open ? '' : `<p class="tiny" style="color:var(--orange);margin:10px 0 0">已学 ${n}/${s.wordIDs.length}，学完这些单词即可解锁</p>`}
            </${open ? 'a' : 'div'}>`;
        }).join('')}
      </div>
      <div class="card">
        <b>🔔 每日学习提醒</b>
        <p class="small muted" style="margin:6px 0 12px">网页无法在关闭时推送通知。可以把每日提醒添加到 iPhone「日历」，到点会响铃提醒你回来复习和接戏。</p>
        <div class="row"><span>提醒时间</span><span class="spacer"></span>
          <input type="time" value="${h(t)}" data-act="remindTime" style="font:inherit;padding:6px 10px;border-radius:10px;border:1px solid var(--line);background:var(--card-2);color:var(--text)"></div>
        <div style="height:12px"></div>
        <button class="btn gray" data-act="addCalendar">📅 添加到日历</button>
      </div>
    </div>`;
}

function viewPlay([id]) {
  if (fresh || !S.play || (id !== 'remix' && S.play.story.id !== id)) {
    const story = id === 'remix' ? S.remixStory : STORIES.find(s => s.id === id);
    if (!story) return `${topbar('剧场', '#/story')}<p class="muted">这段短剧不存在了，回剧场再开一段吧。</p>`;
    S.play = { story, cur: 0, answers: {}, shuffled: {}, scores: {}, finished: false };
    afterRender.push(() => autoSpeak(0));
  }
  const P = S.play, st = P.story;
  const speakers = [];
  st.steps.forEach(s => { if (s.speaker && !speakers.includes(s.speaker)) speakers.push(s.speaker); });
  const vi = sp => (sp ? speakers.indexOf(sp) + 1 : 0);

  const steps = st.steps.slice(0, P.cur + 1).map((s, i) => {
    if (s.type === 'line') return lineHTML(s, { words: st.wordIDs, right: vi(s.speaker) % 2 === 0, voice: vi(s.speaker) });
    if (s.type === 'fill') {
      P.shuffled[i] ||= shuffle(s.options);
      const picked = P.answers[i];
      return `<div class="card fill-card" data-test="fill-${i}">
        <div class="row"><span class="label">🧩 选词填空</span><span class="spacer"></span>
          ${picked ? `<b class="small" style="color:${picked === s.answer ? 'var(--green)' : 'var(--red)'}">${picked === s.answer ? '✅ 答对了' : `❌ 正确答案：${h(s.answer)}`}</b>` : ''}</div>
        ${s.speaker ? `<div class="tiny muted" style="margin-top:6px"><b>${h(s.speaker)}</b></div>` : ''}
        <div class="sent">${picked ? highlight(s.en, [s.answer]) : h(blank(s.en, s.answer))}</div>
        <div class="small muted" style="margin-bottom:12px">${h(s.zh)}</div>
        <div class="options">${P.shuffled[i].map(o => {
          const cls = !picked ? '' : o === s.answer ? 'right' : o === picked ? 'wrong' : '';
          return `<button class="opt ${cls}" data-act="fill" data-i="${i}" data-opt="${h(o)}" ${picked ? 'disabled' : ''}>${h(o)}</button>`;
        }).join('')}</div></div>`;
    }
    return `<div class="card stack" data-test="speak-${i}">
      <b style="color:var(--pink)">🎭 轮到你说台词了！</b>
      <div class="row"><div class="spacer"><b style="font-size:19px">${h(s.en)}</b><div class="small muted">${h(s.zh)}</div></div>${sayBtn(s.en)}</div>
      ${panelHTML('story-' + i, s.en)}</div>`;
  }).join('');

  const fills = st.steps.map((s, i) => [s, i]).filter(([s]) => s.type === 'fill');
  const right = fills.filter(([s, i]) => P.answers[i] === s.answer).length;
  const scores = Object.values(P.scores);
  const end = P.finished ? `<div class="card stack center fade-in" data-test="story-end">
      <h2 style="margin:0">🎬 剧终</h2>
      <div class="end-stats"><div><b>${right}/${fills.length}</b>填空答对</div>
        <div><b>${scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : '—'}</b>台词得分</div></div>
      <div class="small muted">本场出演的单词</div>
      <div class="chips" style="justify-content:center">${st.wordIDs.map(id => chip(wordByID[id])).join('')}</div>
      ${st.isRemix ? '<button class="btn pink" data-act="remix">🎲 再来一段</button>' : ''}
      <a class="btn gray" href="#/story" style="text-decoration:none">完成</a></div>` : '';

  const s = st.steps[P.cur];
  const can = s.type !== 'fill' || P.answers[P.cur] != null;
  const label = !can ? '先选一个答案' : P.cur === st.steps.length - 1 ? '谢幕 🎬' : s.type === 'speak' ? (P.scores[P.cur] == null ? '跳过，继续' : '继续') : '继续 ▶︎';
  const bar = P.finished ? '' : `<div class="sticky-bottom"><div>
      <div class="progress" style="margin:0 0 8px"><i style="width:${(P.cur + 1) / st.steps.length * 100}%;background:var(--pink)"></i></div>
      <button class="btn pink" data-act="storyNext" ${can ? '' : 'disabled'} data-test="story-next">${label}</button></div></div>`;

  return `${topbar(`${st.emoji} ${st.title}`, '#/story')}
    <div class="center" style="margin:6px 0 16px"><div style="font-size:48px">${st.emoji}</div><h2 style="margin:4px 0">${h(st.title)}</h2>
      <div class="small muted">${h(st.intro)}</div></div>
    <div class="lines ${P.finished ? '' : 'has-sticky'}">${steps}${end}</div>${bar}`;
}

function autoSpeak(i) {
  const st = S.play?.story; const s = st?.steps[i];
  if (!s || s.type !== 'line') return;
  const speakers = [];
  st.steps.forEach(x => { if (x.speaker && !speakers.includes(x.speaker)) speakers.push(x.speaker); });
  speak(s.en, { voice: s.speaker ? speakers.indexOf(s.speaker) + 1 : 0 });
}

// ============ 发音 ============

function practiceItems() {
  const prog = Store.progressList().sort((a, b) => a.learnedAt - b.learnedAt);
  const words = prog.length ? prog.map(p => ({ w: wordByID[p.wordID], p })) : UNITS[0].scenes.flatMap(s => s.words).map(w => ({ w, p: null }));
  const ids = new Set(prog.map(p => p.sceneID));
  const scenes = prog.length ? SCENES.filter(s => ids.has(s.id)) : UNITS[0].scenes;
  return { words, scenes, empty: !prog.length };
}

function viewSpeak() {
  const mode = S.speakMode || 'words';
  const { words, scenes, empty } = practiceItems();
  let body = '';
  if (mode === 'words') {
    body = `<div class="tiles">${words.map(({ w, p }) => `
      <a class="card tile" href="#/practice?w=${w.id}" style="text-decoration:none;color:inherit" data-test="tile-${w.id}">
        <div class="emoji">${w.emoji}</div><b>${h(w.id)}</b><div class="tiny muted">${h(w.phonetic)}</div>
        <div class="tiny" style="margin-top:4px;font-weight:700;color:${p?.bestScore != null ? (p.bestScore >= 75 ? 'var(--green)' : 'var(--orange)') : 'var(--text-3)'}">
          ${p?.bestScore != null ? `最佳 ${p.bestScore} 分` : '未练习'}</div></a>`).join('')}</div>`;
  } else if (mode === 'phrases') {
    body = scenes.map(s => `<div class="card" style="margin-bottom:14px"><b>${s.emoji} ${h(s.title)}</b>
      ${s.lines.map((l, i) => `<a class="list-row" href="#/practice?s=${s.id}&l=${i}" style="text-decoration:none;color:inherit">
        <div class="spacer"><div style="font-weight:${i === s.keyLine ? 700 : 400}">${h(l.en)}</div><div class="tiny muted">${h(l.zh)}</div></div>
        ${i === s.keyLine ? '<span class="tag">常用</span>' : ''}<span style="font-size:22px">🎙️</span></a>`).join('')}</div>`).join('');
  } else {
    const recs = Store.records();
    if (!recs.length) body = '<div class="card muted">还没有练习记录。录一段跟读，就能在这里看到自己的进步曲线。</div>';
    else {
      const recent = recs.slice(0, 30).reverse();
      const avg = Math.round(recent.reduce((a, r) => a + r.score, 0) / recent.length);
      const W = 320, H = 120, x = i => 10 + i * (W - 20) / Math.max(1, recent.length - 1), y = v => H - 10 - v / 100 * (H - 20);
      body = `<div class="card"><div class="row"><b>最近 ${recent.length} 次平均</b><span class="spacer"></span><b style="font-size:24px;color:var(--accent)">${avg} 分</b></div>
        <svg viewBox="0 0 ${W} ${H}" width="100%" style="margin-top:8px" aria-label="分数变化">
          <line x1="10" x2="${W - 10}" y1="${y(75)}" y2="${y(75)}" stroke="var(--line)" stroke-dasharray="4 3"/>
          <polyline fill="none" stroke="var(--accent)" stroke-width="2.5" points="${recent.map((r, i) => `${x(i)},${y(r.score)}`).join(' ')}"/>
          ${recent.map((r, i) => `<circle cx="${x(i)}" cy="${y(r.score)}" r="3.5" fill="${r.score >= 75 ? 'var(--green)' : 'var(--orange)'}"/>`).join('')}
        </svg><div class="tiny muted">虚线 = 75 分（“很好”）</div></div>
        <div class="card" style="margin-top:14px"><b>练习记录</b>${recs.slice(0, 50).map(r => `
          <div class="list-row"><div class="spacer"><div>${h(r.text)}</div><div class="tiny muted">${new Date(r.date).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div></div>
          <b style="color:${r.score >= 75 ? 'var(--green)' : r.score >= 50 ? 'var(--orange)' : 'var(--red)'}">${r.score}</b></div>`).join('')}</div>`;
    }
  }
  return `<div class="row" style="align-items:flex-end"><h1 class="page-title">发音练习</h1><span class="spacer"></span>
      <a href="#/check" class="link" style="margin-bottom:24px" data-test="to-check">设备自检</a></div>
    <div class="seg">${[['words', '单词'], ['phrases', '日常用语'], ['history', '我的进步']].map(([m, l]) =>
      `<button class="${mode === m ? 'on' : ''}" data-act="speakMode" data-m="${m}">${l}</button>`).join('')}</div>
    ${empty && mode !== 'history' ? '<p class="small muted">还没学过单词，先用第一单元的内容练练吧～</p>' : ''}
    ${body}`;
}

function practiceTarget(q) {
  if (q.w && wordByID[q.w]) { const w = wordByID[q.w]; return { text: w.id, zh: w.meaning, phon: w.phonetic, wordID: w.id }; }
  const s = sceneByID[q.s]; const l = s?.lines[Number(q.l)];
  if (l) return { text: l.en, zh: l.zh };
  return { text: 'Good morning!', zh: '早上好！' };
}

function viewPractice(_, q) {
  const t = practiceTarget(q);
  return `${topbar('跟读打分', '#/speak')}
    <div class="stack">
      <div class="card word-card">
        <div class="word" style="font-size:${t.text.length < 14 ? 44 : 26}px">${h(t.text)}</div>
        ${t.phon ? `<div class="phon">${h(t.phon)}</div>` : ''}
        <div class="mean muted" style="font-weight:500">${h(t.zh)}</div>
        <div class="btns">${sayBtn(t.text, { size: 'lg' })}${sayBtn(t.text, { slow: true, size: 'lg' })}</div>
        <div class="tiny muted" style="margin-top:8px">🔊 标准 · 🐢 慢速</div>
      </div>
      <div class="card">${panelHTML('practice', t.text, t.wordID)}</div>
      <p class="tiny muted center">评分基于 Safari 语音识别：能被准确识别的单词越多、越清晰，分数越高。结果仅供参考，多听多练最重要！</p>
    </div>`;
}

// ---- 跟读面板（练习页、剧场共用）----
const panels = {};
function panelHTML(id, text, wordID = '') {
  const P = panels[id] ||= { phase: 'idle' };
  const unsupported = !recordingSupported();
  const status = { idle: '先听标准音，再点麦克风跟读', recording: '录音中… 说完点击停止', analyzing: '正在分析你的发音…',
                   result: '点击麦克风可以再录一次', error: '点击麦克风重试' }[P.phase];
  let res = '';
  if (P.phase === 'result' && P.result) {
    const r = P.result, lv = level(r.score);
    const col = lv.tone === 'good' ? 'var(--green)' : lv.tone === 'ok' ? 'var(--orange)' : 'var(--red)';
    res = `<div class="result ${lv.tone} fade-in" data-test="score">
      <div class="row" style="align-items:center;gap:16px">
        <div class="ring" style="--p:${r.score};--c:${col}"><div><b>${r.score}</b><small>分</small></div></div>
        <div class="spacer stack" style="gap:6px"><b>${lv.emoji} ${lv.title}</b>
          ${[['准确度', r.accuracy], ['清晰度', r.clarity], ['流利度', r.fluency]].map(([n, v]) =>
            `<div class="metric" style="color:${col}"><span style="color:var(--text-2)">${n}</span><span class="track"><i style="width:${Math.round(v * 100)}%"></i></span><span style="color:var(--text-2)">${Math.round(v * 100)}</span></div>`).join('')}
        </div></div>
      <div style="margin-top:12px">${r.words.map(w => `<span class="wtok ${w.matched ? 'ok' : 'miss'}">${h(w.text)}</span>`).join('')}</div>
      ${r.recognized ? `<div class="small muted" style="margin-top:6px">我听到的是：${h(r.recognized)}</div>` : ''}
      <div class="tiny muted" style="margin-top:4px">绿色 = 读对 · 红色 = 没听清</div></div>`;
  }
  return `<div class="rec-wrap" data-panel="${id}">
    ${unsupported ? '<div class="notice err">这个浏览器不支持录音，请用 iPhone 自带的 Safari 打开。</div>' : `
    <button class="rec ${P.phase === 'recording' ? 'on' : ''} ${P.phase === 'analyzing' ? 'busy' : ''}" id="rec-${id}"
      data-act="rec" data-panel="${id}" data-text="${h(text)}" data-word="${h(wordID)}" aria-label="${P.phase === 'recording' ? '停止录音' : '开始录音'}" data-test="rec">
      ${P.phase === 'recording' ? '■' : P.phase === 'analyzing' ? '…' : '🎙️'}</button>
    <div class="small muted">${status}</div>`}
    ${P.phase === 'error' ? `<div class="notice err">${h(P.error)}</div>` : ''}
    ${res}
    ${P.url && P.phase !== 'recording' && P.phase !== 'analyzing' ? `<div class="btn-row" style="width:100%">
      <button class="btn-sm" style="flex:1;justify-content:center" data-act="playMine" data-panel="${id}">▶︎ 我的录音</button>
      <button class="btn-sm" style="flex:1;justify-content:center" data-act="compare" data-panel="${id}" data-text="${h(text)}">⇄ 对比听</button></div>` : ''}
  </div>`;
}

async function toggleRecord(d) {
  const P = panels[d.panel] ||= { phase: 'idle' };
  if (P.phase === 'recording') return finishTake(P, d);
  try {
    P.take = await startTake({ onLevel: v => document.getElementById('rec-' + d.panel)?.style.setProperty('--lvl', v) });
    P.phase = 'recording';
    P.timer = setTimeout(() => { if (P.phase === 'recording') finishTake(P, d); }, 15000);
  } catch (e) {
    P.phase = 'error';
    P.error = e?.name === 'NotAllowedError' ? '没有麦克风权限：请在「设置 › Safari › 麦克风」中允许，或点地址栏左侧「大小」图标 › 网站设置。'
                                           : `无法开始录音：${e?.message || e}`;
  }
  refresh();
}

async function finishTake(P, d) {
  clearTimeout(P.timer);
  P.phase = 'analyzing'; refresh();
  const r = await P.take.stop();
  P.url = r.url;
  if (r.duration < 0.5) { P.phase = 'error'; P.error = '录音太短了，请说完整句再停止。'; return refresh(); }
  if (!r.alternatives.length) {
    P.phase = 'error';
    P.error = r.recognitionError === 'unsupported' ? '这个浏览器不支持语音识别，可以回放录音自己对比。'
      : r.recognitionError === 'not-allowed' || r.recognitionError === 'service-not-allowed'
        ? '没有语音识别权限：请在「设置 › 隐私与安全性 › 语音识别」中允许 Safari，并确认已开启 Siri 与听写。'
        : '没有听清，靠近麦克风、说大声一点再试一次。';
    return refresh();
  }
  const res = evaluate(d.text, r.alternatives, Math.max(0.3, r.duration - 0.6));
  P.phase = 'result'; P.result = res;
  Store.addRecord(d.text, res.score, d.word || null);
  if (d.panel.startsWith('story-')) S.play.scores[Number(d.panel.slice(6))] = res.score;
  refresh();
}

// ============ 设备自检（在你的 iPhone 上运行）============

function viewCheck() {
  const C = S.check ||= { tts: null };
  const CP = panels.check;
  C.rec = CP?.phase === 'result' ? true : CP?.phase === 'error' ? false : null;
  C.recText = CP?.phase === 'result' ? `识别到 “${CP.result.recognized}”，得分 ${CP.result.score}` : CP?.phase === 'error' ? CP.error : '';
  const standalone = window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  let storageOK = false;
  try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); storageOK = true; } catch { /* 私密浏览 */ }
  const checks = [
    ['朗读（标准发音）', ttsSupported(), ttsSupported() ? `可用，英语声音 ${voiceCount()} 个` : '不支持'],
    ['录音', recordingSupported(), recordingSupported() ? `可用，格式 ${pickMime() || '默认'}` : '不支持'],
    ['语音识别（打分）', recognitionSupported(), recognitionSupported() ? '可用（需开启 Siri 与听写）' : '不支持'],
    ['本地保存进度', storageOK, storageOK ? '可用' : '不可用（是否开了无痕浏览？）'],
    ['离线使用', 'serviceWorker' in navigator, 'serviceWorker' in navigator ? '支持' : '不支持'],
    ['已添加到主屏幕', standalone, standalone ? '是' : '否（Safari 分享 › 添加到主屏幕）'],
  ];
  const mark = v => (v === true ? '✅' : v === false ? '⚠️' : '⏳');
  return `${topbar('设备自检', '#/speak')}
    <div class="stack">
      <div class="card"><b>功能支持</b>${checks.map(([n, ok, d]) => `<div class="check-row"><span>${mark(ok)}</span><div><b>${n}</b><div class="small muted">${h(d)}</div></div></div>`).join('')}</div>
      <div class="card stack"><b>实际测试</b>
        <div class="check-row"><span>${mark(C.tts)}</span><div><b>1. 朗读</b><div class="small muted">${C.tts == null ? '点下方按钮，应该听到 “Hello, welcome to WordBuddy!”' : C.tts ? '朗读正常结束' : '没有检测到朗读结束，请确认手机没有静音、音量已调高'}</div></div></div>
        <button class="btn gray" data-act="checkTTS">🔊 测试朗读</button>
        <div class="check-row"><span>${mark(C.rec)}</span><div><b>2. 录音与打分</b><div class="small muted">${C.rec == null ? '点麦克风说 “Good morning”，再点一次停止' : h(C.recText)}</div></div></div>
        ${panelHTML('check', 'Good morning')}
      </div>
      <div class="card"><b>设备信息</b><div class="small muted" style="word-break:break-all;margin-top:6px">${h(navigator.userAgent)}<br>屏幕 ${screen.width}×${screen.height} · 视口 ${innerWidth}×${innerHeight} · DPR ${devicePixelRatio}</div></div>
      <button class="btn" data-act="copyCheck">📋 复制自检结果</button>
    </div>`;
}

// ============ 动作 ============

const ACTIONS = {
  back: d => (history.length > 1 ? history.back() : go(d.to || '#/learn')),
  say: d => speak(d.say, { slow: !!d.slow, voice: Number(d.voice) || 0 }),
  toggleZh: (d, el) => {
    if (!(S.lesson && $app.dataset.view === 'lesson')) {
      const box = el.closest('.stack');
      box.classList.toggle('hide-zh');
      el.textContent = box.classList.contains('hide-zh') ? '显示中文' : '隐藏中文';
      return;
    }
    if (S.lesson && $app.dataset.view === 'lesson') S.lesson.showZh = !S.lesson.showZh;
    else return;
    refresh();
  },
  playScene: d => {
    if (Speech.speakingText) return stopSpeaking();
    const s = sceneByID[d.scene];
    speakAll(s.lines.map(l => ({ text: l.en, voice: voiceIndex(s.lines, l.speaker) })));
  },
  lessonPrev: () => { S.lesson.wi--; refresh(); speak(sceneByID[S.lesson.id].words[S.lesson.wi].id); },
  lessonNext: () => {
    const L = S.lesson, scene = sceneByID[L.id];
    if (L.wi < scene.words.length - 1) { L.wi++; refresh(); speak(scene.words[L.wi].id); }
    else { L.phase = 'scene'; render(); }
  },
  lessonQuiz: () => { S.lesson.phase = 'quiz'; render(); speak(S.lesson.quiz[0].word.id); },
  lessonPick: d => {
    const L = S.lesson, item = L.quiz[L.qi];
    L.picked = d.opt;
    if (d.opt === item.word.meaning) L.correct++;
    navigator.vibrate?.(d.opt === item.word.meaning ? 20 : [30, 40, 30]);
    refresh();
  },
  lessonQuizNext: () => {
    const L = S.lesson;
    L.picked = null;
    if (L.qi < L.quiz.length - 1) { L.qi++; refresh(); speak(L.quiz[L.qi].word.id); }
    else { Store.learnScene(sceneByID[L.id]); L.phase = 'done'; render(); }
  },
  reveal: () => { S.review.revealed = true; refresh(); },
  reviewScene: () => { S.review.showScene = !S.review.showScene; refresh(); },
  grade: d => {
    const R = S.review;
    Store.grade(R.ids[R.i], d.g, { early: R.early });
    R.tally[d.g]++; R.i++; R.revealed = false; R.showScene = false;
    render();
    if (R.ids[R.i]) speak(R.ids[R.i]);
  },
  remix: () => {
    const story = remix(Store.progressList());
    if (!story) return toast('再多学几个单词就能开演啦');
    S.remixStory = story;
    if (location.hash === '#/play/remix') { fresh = true; render(); } else go('#/play/remix');
  },
  fill: d => {
    const P = S.play, i = Number(d.i), s = P.story.steps[i];
    if (P.answers[i] != null) return;
    P.answers[i] = d.opt;
    const ok = d.opt === s.answer;
    Store.storyAnswer(s.answer, ok);
    navigator.vibrate?.(ok ? 20 : [30, 40, 30]);
    refresh();
    const speakers = [];
    P.story.steps.forEach(x => { if (x.speaker && !speakers.includes(x.speaker)) speakers.push(x.speaker); });
    speak(s.en, { voice: s.speaker ? speakers.indexOf(s.speaker) + 1 : 0 });
  },
  storyNext: () => {
    const P = S.play;
    stopSpeaking();
    if (P.cur < P.story.steps.length - 1) { P.cur++; refresh(); autoSpeak(P.cur); }
    else { P.finished = true; refresh(); }
    requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
  },
  speakMode: d => { S.speakMode = d.m; render(); },
  addMode: d => { addState().mode = d.m; refresh(); },
  addLookup: () => addLookup(),
  candToggle: d => { const c = addState().cands[Number(d.i)]; c.sel = !c.sel; refresh(); },
  candSense: d => {
    const c = addState().cands[Number(d.i)]; const k = Number(d.k);
    c.sense = k; c.meaning = c.entry.senses[k].meaning; c.sel = true; refresh();
  },
  candAll: () => { const A = addState(); A.cands.forEach(c => { if (!isKnownWord(c.id) && (c.entry || c.manual || A.showUnknown)) c.sel = true; }); refresh(); },
  showUnknown: () => { addState().showUnknown = true; refresh(); },
  addSettings: () => { const A = addState(); A.showSettings = !A.showSettings; refresh(); },
  saveAI: () => {
    Store.setSetting('apiKey', (document.getElementById('api-key')?.value || '').trim());
    Store.setSetting('model', (document.getElementById('api-model')?.value || '').trim());
    toast(Store.settings().apiKey ? '已保存，之后用 AI 生成场景' : '已保存，使用内置模板');
    refresh();
  },
  clearAI: () => { Store.setSetting('apiKey', ''); toast('已清除密钥，使用内置模板'); refresh(); },
  addGenerate: () => addGenerate(),
  regenScene: d => regenScene(d.scene),
  deleteScene: d => {
    const sc = sceneByID[d.scene];
    if (!sc || !confirm(`删除「${sc.title}」？这组单词的学习进度也会一起删除。`)) return;
    Store.deleteCustomScene(sc.id);
    go('#/learn');
  },
  rec: d => toggleRecord(d),
  playMine: d => { const P = panels[d.panel]; if (P?.url) playURL(P.url); },
  compare: async d => { const P = panels[d.panel]; await speak(d.text); if (P?.url) playURL(P.url); },
  addCalendar: () => downloadICS(Store.settings().remindTime || '20:00'),
  checkTTS: async () => {
    const ok = await speak('Hello, welcome to WordBuddy!');
    S.check.tts = ok; refresh();
  },
  copyCheck: async () => {
    const text = [...document.querySelectorAll('.check-row')].map(r => r.innerText.replace(/\n+/g, ' ')).join('\n') + '\n' + navigator.userAgent;
    try { await navigator.clipboard.writeText(text); toast('已复制，可以粘贴发给我'); } catch { toast('复制失败，请截图发给我'); }
  },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'INPUT') return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el.dataset, el); }
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.classList?.contains('mean-input') && S.add) {
    const c = S.add.cands[Number(el.dataset.i)];
    if (c) {
      c.meaning = el.value;
      if (el.value.trim() && !c.sel) {
        c.sel = true;
        const card = el.closest('.cand'); card?.classList.add('on');
        const box = card?.querySelector('.check'); if (box) { box.classList.add('on'); box.textContent = '✓'; }
      }
      const bar = document.getElementById('add-bar'); if (bar) bar.innerHTML = addBarHTML();
    }
  }
  if (el.id === 'add-text' && S.add) S.add.text = el.value;
});
document.addEventListener('change', e => {
  if (e.target.dataset?.act === 'photo' && e.target.files?.[0]) { runOCR(e.target.files[0]); e.target.value = ''; return; }
  if (e.target.dataset?.act === 'remindTime') Store.setSetting('remindTime', e.target.value);
});

function downloadICS(time) {
  const [hh, mm] = time.split(':');
  const d = new Date(); d.setDate(d.getDate() + (d.getHours() * 60 + d.getMinutes() >= Number(hh) * 60 + Number(mm) ? 1 : 0));
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const url = location.href.split('#')[0];
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//WordBuddy//CN', 'BEGIN:VEVENT',
    `UID:wordbuddy-daily-${Date.now()}@wordbuddy`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART:${ymd}T${hh}${mm}00`, 'DURATION:PT15M', 'RRULE:FREQ=DAILY',
    'SUMMARY:🧠 单词伙伴：复习单词 + 剧场接戏', `DESCRIPTION:打开单词伙伴，复习到期的单词，再演一段小剧场。\\n${url}`, `URL:${url}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:该复习单词啦', 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  a.download = 'wordbuddy-reminder.ics';
  document.body.appendChild(a); a.click(); a.remove();
  toast('在弹出的日历页面点「添加」即可');
}

// ============ 启动 ============

export function start() {
  Store.customScenes();          // 先载入“我的单词”，再渲染
  render();
  if ('serviceWorker' in navigator && !/selftest/.test(location.search)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  // 打开时提示到期复习（代替网页无法实现的定时推送）
  const due = Store.progressList().filter(p => isDue(p)).length;
  if (due && !location.hash.startsWith('#/run')) setTimeout(() => toast(`🧠 有 ${due} 个单词到了复习时间`), 600);
}

export const _internals = { S, panels, ACTIONS, render, go, Store, runOCR, addLookup };
