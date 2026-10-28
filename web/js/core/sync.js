// 云同步：把学习数据存到用户自己 GitHub 账号下的一个私密 Gist，多台设备之间自动合并
//
// 合并规则（任何一台设备离线修改后再同步都不会丢数据）：
//  - 每个单词的进度、每组“我的单词”各自比较修改时间，保留较新的一份
//  - 删除会留下“删除标记”，比删除前的修改更新时才生效，避免被旧数据“复活”
//  - 练习记录取两边的并集（去重），保留最近 200 条
//  - API 密钥、同步令牌等私密设置不会上传

export const GIST_FILE = 'wordbuddy-sync.json';
export const GIST_DESC = 'WordBuddy 单词伙伴 · 学习进度同步（请勿手动修改）';
export const FORMAT = 1;

const tsOf = x => (x && (x.updatedAt || x.lastReviewed || x.learnedAt)) || 0;

/** 从本地完整状态中取出需要同步的部分 */
export function syncable(state) {
  return {
    format: FORMAT,
    progress: state.progress || {},
    custom: state.custom || [],
    records: state.records || [],
    tomb: { progress: { ...(state.tomb?.progress || {}) }, custom: { ...(state.tomb?.custom || {}) } },
    shared: state.shared || { remindTime: (state.settings || {}).remindTime || '20:00', updatedAt: 0 },
  };
}

function mergeKeyed(aMap, bMap, aTomb, bTomb) {
  const out = {}, tomb = {};
  for (const k of new Set([...Object.keys(aTomb), ...Object.keys(bTomb)])) tomb[k] = Math.max(aTomb[k] || 0, bTomb[k] || 0);
  for (const k of new Set([...Object.keys(aMap), ...Object.keys(bMap)])) {
    const a = aMap[k], b = bMap[k];
    const pick = !a ? b : !b ? a : (tsOf(b) > tsOf(a) ? b : a);
    if ((tomb[k] || 0) >= tsOf(pick)) continue;        // 删除得比最后一次修改晚：保持删除
    out[k] = pick;
    delete tomb[k];                                    // 删除之后又重新学/重新添加：取消删除标记
  }
  return { out, tomb };
}

/** 合并两份同步数据（纯函数，不修改参数） */
export function mergeStates(local, remote) {
  const a = syncable(local), b = syncable(remote || {});
  const p = mergeKeyed(a.progress, b.progress, a.tomb.progress, b.tomb.progress);
  const toMap = list => Object.fromEntries(list.map(s => [s.id, s]));
  const c = mergeKeyed(toMap(a.custom), toMap(b.custom), a.tomb.custom, b.tomb.custom);
  // “我的单词”按添加时间排列（没有时间的旧数据保持原顺序）
  const custom = Object.values(c.out).sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0));
  const seen = new Set();
  const records = [...a.records, ...b.records]
    .filter(r => { const k = `${r.date}|${r.text}|${r.score}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((x, y) => y.date - x.date).slice(0, 200);
  const shared = (b.shared.updatedAt || 0) > (a.shared.updatedAt || 0) ? b.shared : a.shared;
  return { format: FORMAT, progress: p.out, custom, records, tomb: { progress: p.tomb, custom: c.tomb }, shared };
}

/** 比较两份同步数据内容是否相同（与键的顺序无关） */
export function sameData(x, y) {
  const norm = v => JSON.stringify(v, (k, val) => (val && typeof val === 'object' && !Array.isArray(val)
    ? Object.fromEntries(Object.keys(val).sort().map(key => [key, val[key]])) : val));
  return norm(syncable(x)) === norm(syncable(y));
}

// ---------------- GitHub Gist ----------------

export class SyncError extends Error {
  constructor(message, kind) { super(message); this.kind = kind; }
}

export class GistClient {
  constructor(token, fetchImpl = (...a) => fetch(...a)) {
    this.token = token;
    this.fetch = fetchImpl;
  }

  async call(path, { method = 'GET', body } = {}) {
    let res;
    try {
      res = await this.fetch(path.startsWith('http') ? path : `https://api.github.com${path}`, {
        method, cache: 'no-store',
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.token}`,
                   ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new SyncError('网络不通，联网后会自动同步', 'offline');
    }
    if (res.status === 401) throw new SyncError('GitHub 令牌无效或已过期，请重新生成', 'auth');
    if (res.status === 403) throw new SyncError('令牌没有 Gist 权限，生成时请勾选 gist', 'scope');
    if (res.status === 404) throw new SyncError('找不到同步数据', 'missing');
    if (!res.ok) throw new SyncError(`GitHub 返回错误（${res.status}），稍后会自动重试`, 'server');
    return res.status === 204 ? null : res.json();
  }

  /** 找到之前创建的同步 Gist；没有则返回 null */
  async find() {
    for (let page = 1; page <= 10; page++) {
      const list = await this.call(`/gists?per_page=100&page=${page}`);
      const hit = list.find(g => g.files && g.files[GIST_FILE]);
      if (hit) return hit.id;
      if (list.length < 100) return null;
    }
    return null;
  }

  async create(data) {
    try {
      const g = await this.call('/gists', { method: 'POST', body: {
        description: GIST_DESC, public: false, files: { [GIST_FILE]: { content: JSON.stringify(data) } } } });
      return g.id;
    } catch (e) {
      // 没有 gist 权限的令牌创建时 GitHub 返回 404
      if (e.kind === 'missing') throw new SyncError('令牌没有 Gist 权限，生成时请勾选 gist', 'scope');
      throw e;
    }
  }

  async read(id) {
    const g = await this.call(`/gists/${id}`);
    const f = g.files?.[GIST_FILE];
    if (!f) return null;
    let text = f.content;
    if (f.truncated && f.raw_url) {
      try { text = await (await this.fetch(f.raw_url, { cache: 'no-store' })).text(); }
      catch { throw new SyncError('网络不通，联网后会自动同步', 'offline'); }
    }
    try { return JSON.parse(text); } catch { return null; }
  }

  async write(id, data) {
    await this.call(`/gists/${id}`, { method: 'PATCH', body: { files: { [GIST_FILE]: { content: JSON.stringify(data) } } } });
  }
}

/**
 * 同步一次：读取云端 → 与本地合并 → 有变化就写回云端
 * @returns { merged, gistId, pushed, created }
 */
export async function syncOnce(local, client, gistId) {
  let id = gistId;
  let remote = null;
  if (id) {
    try { remote = await client.read(id); }
    catch (e) { if (e.kind !== 'missing') throw e; id = null; }   // Gist 被删了：重新查找或新建
  }
  if (!id) {
    id = await client.find();
    if (id) remote = await client.read(id);
  }
  const merged = mergeStates(local, remote);
  if (!id) {
    id = await client.create(merged);
    return { merged, gistId: id, pushed: true, created: true };
  }
  const pushed = !remote || !sameData(merged, remote);
  if (pushed) await client.write(id, merged);
  return { merged, gistId: id, pushed, created: false };
}
