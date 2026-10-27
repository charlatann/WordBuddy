// 拍照识别英文：按需加载 Tesseract.js（首次使用需联网下载约 3 MB 的识别模型，之后浏览器会缓存）
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
let workerPromise = null;
let progressCb = null;

function loadScript(src) {
  if (window.Tesseract) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true; s.crossOrigin = 'anonymous';
    s.onload = resolve;
    s.onerror = () => reject(new Error('识别组件下载失败，请检查网络后重试'));
    document.head.appendChild(s);
  });
}

async function getWorker() {
  workerPromise ||= (async () => {
    await loadScript(TESSERACT_URL);
    return window.Tesseract.createWorker('eng', 1, {
      logger: m => {
        if (!progressCb) return;
        const stage = m.status === 'recognizing text' ? '识别中' : '准备识别组件';
        progressCb(stage, m.progress || 0);
      },
    });
  })().catch(e => { workerPromise = null; throw e; });
  return workerPromise;
}

/** 把照片缩小到最长边 1800px，并转成灰度，提升识别速度和准确率 */
export async function prepareImage(file, maxSide = 1800) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(img, 0, 0);
  bmp.close?.();
  return canvas;
}

/**
 * 识别图片中的英文
 * @param source File / Blob / canvas
 * @returns { text, words:[{text, confidence}] }
 */
export async function recognize(source, { onProgress } = {}) {
  progressCb = onProgress || null;
  try {
    const worker = await getWorker();
    const input = source instanceof Blob ? await prepareImage(source) : source;
    const { data } = await worker.recognize(input);
    const words = (data.words || []).map(w => ({ text: w.text, confidence: w.confidence }));
    // 只保留识别把握较大的词，过滤污渍、图案等造成的乱码
    const confident = words.filter(w => w.confidence >= 55).map(w => w.text).join(' ');
    return { text: confident || data.text || '', allText: data.text || '', words };
  } finally {
    progressCb = null;
  }
}
