// 页面内自检程序：在 iPhone Safari（或 iOS 模拟器的 Safari）中打开 ?selftest 运行
//   ?selftest     结果显示在页面上
//   ?selftest=ci  同时把结果和截图请求发回本机测试服务器（CI 使用）
import { runSuites } from './tests/suites.js';
import { _internals } from './app.js';
import { Store } from './store.js';
import { Speech, speak, ttsSupported, voiceCount, recordingSupported, recognitionSupported, pickMime } from './speech.js';
import { WORDS, sceneByID, STORIES } from './core/content.js';
import { MIN } from './core/srs.js';

const CI = /selftest=ci/.test(location.search);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
const results = [];
const shots = [];
const errors = [];
window.addEventListener('error', e => errors.push(`${e.message} @${(e.filename || '').split('/').pop()}:${e.lineno}`));
window.addEventListener('unhandledrejection', e => errors.push(`未处理的 Promise 错误：${e.reason?.message || e.reason}`));

async function waitFor(fn, ms = 3000, msg = '等待超时') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch { /* 继续等 */ } await sleep(40); }
  throw new Error(msg);
}
function expect(cond, msg) { if (!cond) throw new Error(msg); }

const navRetries = [];
async function nav(hash) {
  const view = hash.replace(/^#\//, '').split(/[/?]/)[0];
  const appEl = document.getElementById('app');
  location.hash = hash;
  try {
    await waitFor(() => appEl.dataset.view === view, 2500);
  } catch {
    // 模拟器里 Safari 有时会延迟派发 hashchange：补发一次并记录
    navRetries.push(hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await waitFor(() => appEl.dataset.view === view, 8000,
      `打开 ${hash} 失败（当前 hash=${location.hash}，页面=${appEl.dataset.view}，错误=${errors.slice(-1)[0] || '无'}）`);
  }
  await sleep(80);
}
async function tap(sel) {
  const el = typeof sel === 'string' ? await waitFor(() => $(sel), 3000, `找不到元素 ${sel}`) : sel;
  if (el.tagName === 'A' && el.getAttribute('href')?.startsWith('#')) {
    const view = el.getAttribute('href').replace(/^#\//, '').split(/[/?]/)[0];
    await nav(el.getAttribute('href'));
    void view;
  } else {
    el.click();
  }
  await sleep(60);
}
async function shot(name) {
  shots.push(name);
  if (!CI) return;
  await sleep(450);                       // 等待动画结束
  try { await fetch(`/__shot?name=${encodeURIComponent(name)}`, { method: 'POST' }); } catch { /* 无测试服务器 */ }
}
function noHorizontalScroll(where) {
  const over = document.documentElement.scrollWidth - window.innerWidth;
  expect(over <= 1, `${where} 出现横向滚动（超出 ${over}px）`);
}

async function flow(group, name, fn) {
  const t0 = performance.now();
  try { const detail = await fn(); results.push({ group, name, ok: true, detail: detail || '', ms: Math.round(performance.now() - t0) }); }
  catch (e) { results.push({ group, name, ok: false, detail: e.message, ms: Math.round(performance.now() - t0) }); }
}
const info = (group, name, ok, detail) => results.push({ group, name, ok, detail, info: true, ms: 0 });

export async function runSelfTest() {
  const started = Date.now();
  const { S } = _internals;
  Store.reset();
  await sleep(300);

  // ---------- 1. 浏览器能力 ----------
  const G1 = 'Safari 能力';
  info(G1, '朗读 speechSynthesis', ttsSupported(), ttsSupported() ? `英语声音 ${await waitVoices()} 个` : '不支持');
  info(G1, '录音 MediaRecorder + getUserMedia', recordingSupported(), recordingSupported() ? `格式 ${pickMime() || '默认'}` : '不支持');
  info(G1, '语音识别 SpeechRecognition', recognitionSupported(), recognitionSupported() ? 'webkitSpeechRecognition 可用' : '不支持');
  info(G1, '离线缓存 Service Worker', 'serviceWorker' in navigator, 'serviceWorker' in navigator ? '支持' : '不支持');
  let ls = false; try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); ls = true; } catch { /* */ }
  info(G1, '本地存储 localStorage', ls, ls ? '可写' : '不可写');
  info(G1, '现代 JS（模块、可选链、Array.at）', typeof [].at === 'function', 'ES2022');
  if (ttsSupported()) {
    Speech.muted = false;
    const ok = await speak('Hello!', {});
    info(G1, '朗读实际播放', ok, ok ? '收到朗读结束回调' : '未收到结束回调（自动化环境无用户点击时 Safari 可能拒绝朗读，需真机点按验证）');
  }
  Speech.muted = true;

  // ---------- 2. 逻辑单元测试 ----------
  for (const r of await runSuites()) results.push({ group: '逻辑：' + r.suite, name: r.name, ok: r.ok, detail: r.error || '', ms: r.ms });

  // ---------- 3. 界面流程 ----------
  const G3 = '界面流程';
  await flow(G3, '首页：统计、下一课、12 个场景卡片、4 个 Tab', async () => {
    await nav('#/learn');
    expect($$('.tabbar a').length === 4, 'Tab 数量不是 4');
    expect($$('[data-test^="scene-"]').length === 12, '场景卡片数量不是 12');
    expect($('[data-test="next-lesson"]')?.getAttribute('href') === '#/lesson/s1', '下一课不是第一课');
    noHorizontalScroll('首页');
    await shot('01-学习首页');
  });

  await flow(G3, '第一课：认识 4 个单词 → 场景 → 听音选义 → 完成并加入复习', async () => {
    await tap('[data-test="next-lesson"]');
    await waitFor(() => $('[data-test="word-card"] .word')?.textContent === 'morning', 3000, '第一个单词不是 morning');
    await shot('02-单词卡');
    for (let i = 0; i < 3; i++) await tap('[data-test="lesson-next"]');
    await tap('[data-test="lesson-next"]');
    await waitFor(() => $('[data-test="scene"]'), 3000, '没有进入场景页');
    expect($$('[data-test="scene"] .bubble').length === 5, '场景台词不是 5 句');
    expect($$('[data-test="scene"] mark').length >= 6, '目标单词没有高亮');
    noHorizontalScroll('场景页');
    await shot('03-场景对话');
    await tap('[data-test="to-quiz"]');
    for (let q = 0; q < 4; q++) {
      await waitFor(() => $('[data-test="quiz-card"]'), 3000, '没有进入小测验');
      expect($('[data-test="quiz-card"] .word').textContent === '?????', '作答前不应显示单词');
      if (q === 0) await shot('04-听音选义');
      const item = S.lesson.quiz[S.lesson.qi];
      const right = $$('.opt').find(b => b.dataset.opt === item.word.meaning);
      expect(right, '找不到正确选项');
      await tap(right);
      expect($('.opt.right'), '答对后没有标绿');
      expect($('[data-test="quiz-card"] .word').textContent === item.word.id, '作答后应显示单词');
      await tap('[data-test="quiz-next"]');
    }
    await waitFor(() => $('[data-test="lesson-done"]'), 3000, '没有完成页');
    expect(/4\/4/.test($('[data-test="lesson-done"]').textContent), '答对数不是 4/4');
    const ps = Store.progressList();
    expect(ps.length === 4, `应保存 4 个单词，实际 ${ps.length}`);
    expect(ps.every(p => Math.abs(p.nextReview - Date.now() - 5 * MIN) < 60_000), '第一次复习时间不是 5 分钟后');
    await shot('05-本课完成');
    return '4 个单词已保存，第一次复习约 5 分钟后';
  });

  await flow(G3, '复习：到期提醒、带场景回忆、三档自评更新计划', async () => {
    Store._mutate(s => Object.values(s.progress).forEach(p => { p.nextReview = Date.now() - 1000; }));
    await nav('#/review');
    expect($('.big-num')?.textContent === '4', '待复习数量不是 4');
    expect($('.tabbar .badge')?.textContent === '4', 'Tab 角标不是 4');
    expect($$('.bars .bar').length === 7, '未来 7 天图表缺失');
    await shot('06-复习首页');
    await tap('[data-test="start-review"]');
    const grades = ['good', 'hard', 'forgot', 'good'], seen = [];
    for (let i = 0; i < 4; i++) {
      await waitFor(() => $('[data-test="review-card"]'), 3000, '没有复习卡片');
      expect(/来自场景/.test(document.body.textContent), '复习卡片缺少原场景');
      expect($$('.card mark').length >= 1, '场景句子里没有高亮单词');
      await tap('[data-test="reveal"]');
      if (i === 0) await shot('07-复习卡片');
      seen.push(S.review.ids[S.review.i]);
      await tap(`[data-act="grade"][data-g="${grades[i]}"]`);
    }
    await waitFor(() => $('[data-test="review-done"]'), 3000, '没有复习完成页');
    const st = seen.map(id => Store.progress(id));
    expect(st[0].stage === 1 && st[1].stage === 0 && st[2].stage === 0 && st[3].stage === 1, `阶段不对：${st.map(p => p.stage)}`);
    expect(st[2].lapseCount === 1, '“忘记了”没有记录遗忘次数');
    expect(Math.abs(st[0].nextReview - Date.now() - 30 * MIN) < 60_000, '“记住了”后应 30 分钟后再复习');
    return '记住了→30分钟后；有点模糊→5分钟后；忘记了→重置';
  });

  await flow(G3, '剧场：学够单词后解锁“手忙脚乱的周一”，演完全剧', async () => {
    Store.learnScene(sceneByID.s2); Store.learnScene(sceneByID.s7);
    await nav('#/story');
    const d1 = $('[data-test="story-d1"]'), d2 = $('[data-test="story-d2"]');
    expect(d1?.tagName === 'A', 'd1 应已解锁');
    expect(d2?.tagName === 'DIV' && /已学/.test(d2.textContent), 'd2 应显示锁定');
    noHorizontalScroll('剧场首页');
    await shot('08-剧场首页');
    await tap(d1);
    const steps = STORIES.find(s => s.id === 'd1').steps;
    for (let i = 0; i < steps.length; i++) {
      await waitFor(() => S.play && S.play.cur === i, 3000, `没有到第 ${i + 1} 步`);
      if (steps[i].type === 'fill') {
        expect(/_____/.test($(`[data-test="fill-${i}"] .sent`).textContent), '填空没有挖空');
        expect($('[data-test="story-next"]').disabled, '未作答时“继续”应不可点');
        await tap($$(`[data-test="fill-${i}"] .opt`).find(b => b.dataset.opt === steps[i].answer));
        if (i === 2) await shot('09-剧场填空');
      }
      if (steps[i].type === 'speak') {
        expect($(`[data-test="speak-${i}"] [data-test="rec"]`) || !recordingSupported(), '开口说环节缺少录音按钮');
        await shot('10-剧场开口说');
      }
      await tap('[data-test="story-next"]');
    }
    await waitFor(() => $('[data-test="story-end"]'), 3000, '没有谢幕页');
    expect(/4\/4/.test($('[data-test="story-end"]').textContent), '填空答对数不是 4/4');
    noHorizontalScroll('剧场演出');
    await shot('11-剧终');
    return '11 步全部走完，填空 4/4';
  });

  await flow(G3, '随机小剧场：用已学的 12 个词即兴生成并演完（含答错）', async () => {
    await nav('#/story');
    await tap('[data-test="remix"]');
    await waitFor(() => S.play?.story?.isRemix, 3000, '没有生成随机剧场');
    const st = S.play.story;
    expect(st.wordIDs.length === 5, `出演单词应为 5 个，实际 ${st.wordIDs.length}`);
    let wrongDone = false;
    for (let i = 0; i < st.steps.length; i++) {
      await waitFor(() => S.play.cur === i, 3000, `没有到第 ${i + 1} 步`);
      const s = st.steps[i];
      if (s.type === 'fill') {
        const opts = $$(`[data-test="fill-${i}"] .opt`);
        const pick = !wrongDone ? opts.find(b => b.dataset.opt !== s.answer) : opts.find(b => b.dataset.opt === s.answer);
        await tap(pick);
        if (!wrongDone) { expect($('.opt.wrong') && $('.opt.right'), '答错后应同时标出错误和正确答案'); wrongDone = true; }
      }
      await tap('[data-test="story-next"]');
    }
    await waitFor(() => $('[data-test="story-end"]'), 3000, '没有谢幕页');
    return `出演：${st.wordIDs.join(', ')}`;
  });

  await flow(G3, '发音：单词/日常用语/进步三个分页，跟读页有录音按钮', async () => {
    await nav('#/speak');
    expect($$('[data-test^="tile-"]').length === 12, `单词数应为 12，实际 ${$$('[data-test^="tile-"]').length}`);
    await shot('12-发音练习');
    await tap('[data-act="speakMode"][data-m="phrases"]');
    expect($$('a.list-row').length >= 15, '日常用语列表太少');
    await tap('[data-act="speakMode"][data-m="history"]');
    expect(/还没有练习记录/.test(document.body.textContent), '空记录提示缺失');
    [62, 71, 85, 90].forEach((sc, i) => Store.addRecord(['morning', 'coffee', 'I have to hurry!', 'late'][i], sc, i === 0 ? 'morning' : null));
    await nav('#/learn'); await nav('#/speak');
    await tap('[data-act="speakMode"][data-m="history"]');
    expect($('svg polyline'), '进步曲线没有画出来');
    expect(/77 分/.test(document.body.textContent), '平均分应为 77');
    await shot('13-我的进步');
    S.speakMode = 'words';
    await nav('#/practice?w=morning');
    expect($('.word-card .word')?.textContent === 'morning', '跟读页单词不对');
    expect(recordingSupported() ? $('[data-test="rec"]') : $('.notice.err'), '缺少录音按钮或不支持提示');
    noHorizontalScroll('跟读页');
    await shot('14-跟读打分');
    expect(Store.progress('morning').bestScore === 62, '最佳分数没有记录到单词');
  });

  await flow(G3, '设备自检页可以打开', async () => {
    await nav('#/check');
    expect($$('.check-row').length >= 8, '自检项目缺失');
    await shot('15-设备自检');
  });

  await flow(G3, '数据保存在本地并在刷新后保留', async () => {
    const raw = localStorage.getItem('wordbuddy.selftest');
    expect(raw, '没有写入 localStorage');
    const data = JSON.parse(raw);
    expect(Object.keys(data.progress).length === 12, `保存的单词数应为 12，实际 ${Object.keys(data.progress).length}`);
    expect(data.records.length === 4, '练习记录没有保存');
  });


  // ---------- 我的单词 ----------
  const G4 = '我的单词';
  const setValue = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };

  await flow(G4, '首页有“添加我要背的单词”入口', async () => {
    await nav('#/learn');
    expect($('[data-test="add-words"]'), '缺少添加单词入口');
    await tap('[data-test="add-words"]');
    expect($('[data-test="mode-type"]') && $('[data-test="mode-photo"]'), '缺少手动输入/拍照识别切换');
  });

  await flow(G4, '手动输入：查词、选义项、补填生词意思、生成场景', async () => {
    await nav('#/add');
    setValue(await waitFor(() => $('[data-test="add-text"]')), 'giraffe, swimming, Beautiful, coffee, qwertyx, library');
    await tap('[data-test="add-lookup"]');
    await waitFor(() => $('[data-test="cand-giraffe"]'), 15000, '查词结果没有出现（词典加载失败？）');
    expect(/长颈鹿/.test($('[data-test="cand-giraffe"]').textContent), 'giraffe 没有查到中文意思');
    expect($('[data-test="cand-coffee"]').classList.contains('locked'), '已在课程里的 coffee 应标记为已在词库');
    expect(/词典里没有/.test($('[data-test="cand-qwertyx"]').textContent), '生词 qwertyx 应提示词典里没有');
    expect($('[data-test="add-generate"]').disabled, '生词没填意思时不应允许生成');
    await shot('30-添加单词-查词');
    setValue($('[data-test="cand-qwertyx"] .mean-input'), '测试词');
    await sleep(50);
    expect(!$('[data-test="add-generate"]').disabled, '填好意思后应可生成');
    const sense = $$('[data-test="cand-swimming"] .chip.sense')[0];
    if (sense) await tap(sense);
    await tap('[data-test="add-generate"]');
    await waitFor(() => $('[data-test="add-done"]'), 20000, '没有生成场景');
    const mine = Store.customScenes();
    expect(mine.length === 2, `应生成 2 个场景（4+1 个词），实际 ${mine.length}`);
    expect(mine.reduce((n, sc) => n + sc.words.length, 0) === 5, '添加的单词数不是 5');
    expect(mine.every(sc => sc.words.every(w => sc.lines.some(l => l.en.toLowerCase().includes(w.id)))), '有单词没出现在生成的场景里');
    expect(mine[0].words.find(w => w.id === 'qwertyx').meaning === '测试词', '手动填写的意思没有保存');
    await shot('31-添加单词-生成完成');
    return mine.map(sc => sc.title).join('；');
  });

  await flow(G4, '学习新加的单词：单词卡 → 场景 → 换场景 → 小测验 → 进入复习计划', async () => {
    const sc = Store.customScenes()[0];
    await nav('#/learn');
    expect($(`[data-test="scene-${sc.id}"]`), '首页“我的单词”里没有新场景');
    await nav('#/lesson/' + sc.id);
    for (let i = 0; i < sc.words.length; i++) await tap('[data-test="lesson-next"]');
    await waitFor(() => $('[data-test="scene"]'), 3000, '没有进入场景页');
    const before = $('[data-test="scene"]').textContent;
    await shot('32-我的单词-场景');
    await tap('[data-test="regen"]');
    await waitFor(() => !S.regen, 20000, '换场景超时');
    await sleep(100);
    await tap('[data-test="to-quiz"]');
    for (let q = 0; q < sc.words.length; q++) {
      await waitFor(() => $('[data-test="quiz-card"]'), 3000, '没有进入小测验');
      const item = S.lesson.quiz[S.lesson.qi];
      expect(new Set(item.options).size === item.options.length, '小测验选项有重复');
      await tap($$('.opt').find(b => b.dataset.opt === item.word.meaning));
      await tap('[data-test="quiz-next"]');
    }
    await waitFor(() => $('[data-test="lesson-done"]'), 3000, '没有完成页');
    expect(sc.words.every(w => Store.progress(w.id)?.sceneID === sc.id), '新单词没有加入复习计划');
  });

  await flow(G4, '拍照识别：从图片中识别英文单词', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200; canvas.height = 420;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#111'; ctx.font = 'bold 64px Helvetica, Arial, sans-serif';
    ctx.fillText('The yellow banana', 60, 150);
    ctx.fillText('is on the window.', 60, 270);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    await nav('#/add');
    await tap('[data-test="mode-photo"]');
    const { runOCR } = _internals;
    const t0 = Date.now();
    await runOCR(blob);
    const A = S.add;
    expect(A.ocr.phase === 'done', `识别失败：${A.ocr.error || A.ocr.phase}`);
    const ids = A.cands.filter(c => c.entry).map(c => c.id);
    for (const w of ['yellow', 'banana', 'window']) expect(ids.includes(w), `没有识别出 ${w}（识别到：${ids.join(', ')}）`);
    expect(!ids.includes('the') && !ids.includes('is'), '虚词应被过滤');
    await shot('33-拍照识别');
    return `识别出 ${ids.join(', ')}，用时 ${((Date.now() - t0) / 1000).toFixed(1)} 秒（含首次下载识别组件）`;
  });

  await flow(G4, '删除我的单词后进度一并清除', async () => {
    const sc = Store.customScenes()[0];
    Store.deleteCustomScene(sc.id);
    expect(!Store.customScenes().some(x => x.id === sc.id), '场景没有删除');
    expect(sc.words.every(w => !Store.progress(w.id)), '进度没有清除');
    expect(WORDS.length === 48 + Store.customScenes().reduce((n, x) => n + x.words.length, 0), '单词总数不对');
  });

  // ---------- 4. 汇总 ----------
  Store.reset();
  Speech.muted = false;
  const report = {
    userAgent: navigator.userAgent,
    viewport: `${innerWidth}×${innerHeight} @${devicePixelRatio}x`,
    screen: `${screen.width}×${screen.height}`,
    durationMs: Date.now() - started,
    total: results.filter(r => !r.info).length,
    passed: results.filter(r => !r.info && r.ok).length,
    failed: results.filter(r => !r.info && !r.ok).length,
    results, shots, errors, navRetries,
  };
  showReport(report);
  await shot('16-自检结果');
  if (CI) {
    try { await fetch('/__report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) }); }
    catch { /* 无测试服务器 */ }
  }
  window.__selftest = report;
  // 演示数据：学过 3 课、有 4 个待复习，供最后的首页截图
  ['s1', 's2', 's3'].forEach(id => Store.learnScene(sceneByID[id]));
  Store._mutate(st => Object.values(st.progress).slice(0, 4).forEach(p => { p.nextReview = Date.now() - 1000; }));
  await sleep(1500);
  location.hash = '#/learn';
  return report;
}

async function waitVoices() {
  for (let i = 0; i < 60 && !voiceCount(); i++) await sleep(150);
  return voiceCount();
}

function showReport(r) {
  const groups = [...new Set(r.results.map(x => x.group))];
  document.getElementById('app').innerHTML = `
    <h1 class="page-title">自检结果</h1>
    <div class="card center" style="margin-bottom:14px"><b style="font-size:40px;color:${r.failed ? 'var(--red)' : 'var(--green)'}">${r.passed}/${r.total}</b>
      <div class="muted small">测试通过 · 用时 ${(r.durationMs / 1000).toFixed(1)} 秒</div></div>
    ${groups.map(g => `<div class="card" style="margin-bottom:12px"><b>${g}</b>
      ${r.results.filter(x => x.group === g).map(x => `<div class="check-row"><span>${x.ok ? '✅' : x.info ? '⚠️' : '❌'}</span>
        <div>${x.name}${x.detail ? `<div class="tiny muted">${String(x.detail).replace(/</g, '&lt;')}</div>` : ''}</div></div>`).join('')}</div>`).join('')}
    <p class="tiny muted">${r.userAgent}</p>`;
  window.scrollTo(0, 0);
}
