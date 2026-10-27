// 标准发音（Safari 朗读）、录音（MediaRecorder）、语音识别（webkitSpeechRecognition）

const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
const listeners = new Set();
let voices = [];
let current = null;           // 正在朗读的文本

export const Speech = {
  muted: false,                // 自动化测试时静音，避免拖慢流程
  get speakingText() { return current; },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
const emit = () => listeners.forEach(fn => fn(current));

function loadVoices() {
  if (!synth) return;
  const all = synth.getVoices().filter(v => /^en[-_]US/i.test(v.lang));
  const score = v => (/(premium|enhanced)/i.test(v.name + v.voiceURI) ? 2 : 0) + (v.localService ? 1 : 0);
  const sorted = all.sort((a, b) => score(b) - score(a));
  // 让前两个声音不同（Samantha / Fred / Aaron 等），方便区分对话角色
  const preferred = ['Samantha', 'Aaron', 'Nicky', 'Fred'];
  const pref = preferred.map(n => sorted.find(v => v.name.startsWith(n))).filter(Boolean);
  voices = [...new Set([...pref, ...sorted])];
}
if (synth) {
  loadVoices();
  synth.addEventListener?.('voiceschanged', loadVoices);
}

export function voiceCount() { loadVoices(); return voices.length; }
export function ttsSupported() { return !!synth && typeof SpeechSynthesisUtterance !== 'undefined'; }

/** 朗读，返回朗读结束的 Promise（最长等待按文本长度估算，防止 Safari 不回调时卡住） */
export function speak(text, { slow = false, voice = 0, queue = false } = {}) {
  if (!ttsSupported() || Speech.muted) return Promise.resolve(false);
  if (!queue) stopSpeaking();
  return new Promise(resolve => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    if (voices.length) u.voice = voices[voice % voices.length];
    u.rate = slow ? 0.6 : 0.92;
    let done = false;
    const finish = ok => { if (done) return; done = true; if (current === text) { current = null; emit(); } resolve(ok); };
    u.onstart = () => { current = text; emit(); };
    u.onend = () => finish(true);
    u.onerror = () => finish(false);
    setTimeout(() => finish(false), 3000 + text.length * (slow ? 160 : 100));
    synth.speak(u);
  });
}

let generation = 0;

/** 依次朗读多句；中途调用 stopSpeaking() 即停止 */
export async function speakAll(lines) {
  stopSpeaking();
  const mine = generation;
  for (const { text, voice } of lines) {
    await speak(text, { voice, queue: true });
    if (generation !== mine) return;
  }
}

export function stopSpeaking() {
  generation++;
  if (!synth) return;
  synth.cancel();
  current = null;
  emit();
}

// ---------------- 录音 + 识别 ----------------

export function recognitionSupported() {
  return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}
export function recordingSupported() {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
}
export function pickMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  return ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(t => MediaRecorder.isTypeSupported?.(t)) || '';
}

/**
 * 开始一次跟读：同时录音（用于回放）和语音识别（用于打分）。
 * 返回会话对象：stop() → Promise<{ blob, url, duration, alternatives, recognitionError }>
 */
export async function startTake({ onLevel } = {}) {
  stopSpeaking();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const mime = pickMime();
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
  const started = performance.now();
  recorder.start();

  // 音量动画
  let raf = 0, ctx = null;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser(); an.fftSize = 512; src.connect(an);
    const buf = new Uint8Array(an.fftSize);
    const tick = () => {
      an.getByteTimeDomainData(buf);
      let peak = 0; for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      onLevel?.(Math.min(1, peak / 60));
      raf = requestAnimationFrame(tick);
    };
    tick();
  } catch { /* 无音量动画也不影响录音 */ }

  // 语音识别
  let alternatives = [], recognitionError = null, rec = null, recEnded = null;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) {
    rec = new SR();
    rec.lang = 'en-US'; rec.interimResults = false; rec.continuous = true; rec.maxAlternatives = 3;
    const finals = [];
    rec.onresult = e => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) finals.push(e.results[i]);
    };
    rec.onerror = e => { recognitionError = e.error || 'error'; };
    recEnded = new Promise(r => { rec.onend = () => {
      // 多段结果拼接：首选结果逐段拼接；候选取第一段的备选
      if (finals.length) {
        const top = finals.map(r => r[0].transcript).join(' ').trim();
        const conf = finals.reduce((s, r) => s + (r[0].confidence || 0), 0) / finals.length;
        alternatives = [{ transcript: top, confidence: conf }];
        if (finals.length === 1) for (let k = 1; k < finals[0].length; k++) alternatives.push({ transcript: finals[0][k].transcript, confidence: finals[0][k].confidence || 0 });
      }
      r();
    }; });
    try { rec.start(); } catch (e) { recognitionError = String(e.message || e); }
  } else {
    recognitionError = 'unsupported';
  }

  return {
    stop: () => new Promise(resolve => {
      cancelAnimationFrame(raf);
      ctx?.close?.();
      const duration = (performance.now() - started) / 1000;
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (rec) {
          try { rec.stop(); } catch { /* 已结束 */ }
          await Promise.race([recEnded, new Promise(r => setTimeout(r, 2500))]);
        }
        const blob = new Blob(chunks, { type: recorder.mimeType || mime || 'audio/mp4' });
        resolve({ blob, url: URL.createObjectURL(blob), duration, alternatives, recognitionError });
      };
      recorder.stop();
    }),
  };
}

let player = null;
export function playURL(url) {
  stopSpeaking();
  player?.pause();
  player = new Audio(url);
  return new Promise(r => { player.onended = () => r(true); player.onerror = () => r(false); player.play().catch(() => r(false)); });
}
export function stopPlaying() { player?.pause(); }
