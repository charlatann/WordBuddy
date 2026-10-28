// 自动同步调度：打开 App、回到前台、学习数据变化后几秒、切到后台时各同步一次
import { GistClient, syncOnce, sameData } from './core/sync.js';
import { Store, namespace } from './store.js';

const cfgKey = () => `${namespace()}.sync`;
const listeners = new Set();
let running = null, again = false, timer = 0, lastRun = 0;

export const SyncMgr = {
  fetchImpl: (...a) => fetch(...a),       // 自检时替换成模拟的 GitHub
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  config() {
    try { return JSON.parse(localStorage.getItem(cfgKey()) || 'null') || {}; } catch { return {}; }
  },
  saveConfig(patch) {
    const c = { ...this.config(), ...patch };
    try { localStorage.setItem(cfgKey(), JSON.stringify(c)); } catch { /* 无痕浏览 */ }
    return c;
  },
  enabled() { return !!this.config().token; },
  get busy() { return !!running; },

  /** 首次连接：验证令牌并完成第一次同步 */
  async connect(token) {
    token = String(token || '').trim();
    if (!token) throw new Error('请先粘贴令牌');
    this.saveConfig({ token, gistId: null, lastSync: 0, lastError: '' });
    const r = await this.syncNow({ force: true });
    if (!r.ok) { this.saveConfig({ token: '' }); throw new Error(r.error); }
    return r;
  },

  disconnect() {
    try { localStorage.removeItem(cfgKey()); } catch { /* */ }
    emit();
  },

  /** 同步一次；同步进行中再次调用会在结束后补一次 */
  async syncNow({ force = false } = {}) {
    if (!this.enabled()) return { ok: false, error: '未开启同步' };
    if (running) { again = true; return running; }
    if (!force && Date.now() - lastRun < 5000) { schedule(5000); return { ok: true, skipped: true }; }
    running = (async () => {
      const cfg = this.config();
      lastRun = Date.now();
      emit();
      try {
        const local = Store.exportSync();
        const client = new GistClient(cfg.token, this.fetchImpl);
        const r = await syncOnce(local, client, cfg.gistId);
        // 同步期间本地又有修改时，以最新本地数据再合并一次，下轮上传
        const changedLocally = !sameData(local, Store.exportSync());
        const pulled = !sameData(r.merged, local);
        if (pulled && !changedLocally) Store.importSync(r.merged);
        if (changedLocally) again = true;
        this.saveConfig({ gistId: r.gistId, lastSync: Date.now(), lastError: '', lastErrorKind: '' });
        return { ok: true, pulled: pulled && !changedLocally, pushed: r.pushed, created: r.created };
      } catch (e) {
        this.saveConfig({ lastError: e.message || String(e), lastErrorKind: e.kind || '' });
        return { ok: false, error: e.message || String(e), kind: e.kind };
      }
    })();
    const res = await running;
    running = null;
    emit(res);
    if (again) { again = false; schedule(1500); }
    return res;
  },

  start() {
    Store.onWrite(() => { if (this.enabled()) schedule(4000); });
    document.addEventListener('visibilitychange', () => {
      if (!this.enabled()) return;
      if (document.visibilityState === 'visible') { if (Date.now() - lastRun > 20000) this.syncNow(); }
      else if (timer) { clearTimeout(timer); timer = 0; this.syncNow({ force: true }); }
    });
    window.addEventListener('online', () => this.enabled() && this.syncNow({ force: true }));
    if (this.enabled()) this.syncNow({ force: true });
  },
};

function schedule(ms) {
  clearTimeout(timer);
  timer = setTimeout(() => { timer = 0; SyncMgr.syncNow({ force: true }); }, ms);
}
function emit(res) { listeners.forEach(fn => fn(res)); }
