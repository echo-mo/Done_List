/**
 * api.js — 网络请求层
 * 职责：封装 request 工具、加载/保存/轮询任务的全部 HTTP 逻辑。
 * 依赖：Store（状态管理）。
 * 约束：本文件 **不得** 直接操作 DOM；需要触发 UI 更新时，
 *       通过 Api.init() 注入的回调函数通知 ui.js。
 */
const Api = (() => {
  const API_BASE = (typeof CONFIG !== 'undefined' && CONFIG.API_BASE_URL) ? CONFIG.API_BASE_URL
    : (typeof location !== 'undefined' && location.origin) ? location.origin : '';
  const SYNC_INTERVAL_MS = (typeof CONFIG !== 'undefined' ? CONFIG.SYNC_INTERVAL_MS : 3000);

  // ui.js 通过 Api.init() 注入以下回调，解耦 api 与 dom
  let _cb = {
    applyTasks: null,          // (tasks[]) => void  — 重新渲染任务列表
    restoreAndRunQuery: null,  // ()        => void  — 恢复并重跑查询
    onFallback: null,          // ()        => void  — 服务端加载失败时降级
  };

  /**
   * 注入 UI 回调，由 ui.js 在初始化时调用一次。
   * @param {{ applyTasks, restoreAndRunQuery, onFallback }} callbacks
   */
  function init(callbacks) {
    _cb = { ..._cb, ...callbacks };
  }

  // ── 全局请求工具 ────────────────────────────────────────────────────────────
  /**
   * 统一 fetch 封装：解析 { code, message, data } 响应。
   * code !== 0 时抛出含 bizCode 属性的 Error，调用方负责 catch 并展示 err.message。
   */
  async function request(url, options = {}) {
    const res  = await fetch(url, options);
    const json = await res.json();
    if (json.code !== 0) {
      const err = new Error(json.message || 'Request failed');
      err.bizCode = json.code;
      throw err;
    }
    return json.data;
  }

  // ── 加载：从服务端（降级到 localStorage）──────────────────────────────────
  async function loadTasksFromServer() {
    try {
      const data  = await request(`${API_BASE}/api/storage?key=todoList`);
      const tasks = data?.value;

      if (!Array.isArray(tasks)) {
        _cb.onFallback?.();
        return;
      }

      const normalized = tasks.map(Store.normalizeTask);
      const deduped    = Store.deduplicateTasks(normalized);
      Store.setTasks(deduped);

      // 若服务端存有重复数据，立即回写清理
      if (deduped.length !== normalized.length) {
        saveTasksToServer().catch(() => {});
      }

      Store.saveToLocal();
      _cb.applyTasks?.(deduped);
      _cb.restoreAndRunQuery?.();
    } catch (err) {
      // KEY_NOT_FOUND(bizCode 1002) = 首次使用，数据库尚无数据，正常降级
      _cb.onFallback?.();
    }
  }

  // ── 保存：将 Store._tasks 持久化到服务端 ────────────────────────────────────
  // 注：重构后 Store._tasks 通过直接 mutation 始终保持最新，
  //     无需再执行 mergeTodayIntoCache（该函数依赖 DOM，已从保存流程中移除）。
  async function saveTasksToServer() {
    Store.saveToLocal();
    await request(`${API_BASE}/api/storage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'todoList', value: Store.getTasks() }),
    });
  }

  // ── 轮询：多端实时同步（ETag 304 优化）──────────────────────────────────────
  let _pollETag = null;

  async function pollAndMergeTasks() {
    if (!API_BASE) return;
    try {
      const headers = {};
      if (_pollETag) headers['If-None-Match'] = _pollETag;

      const res = await fetch(`${API_BASE}/api/storage?key=todoList`, { headers });
      if (res.status === 304) return;

      const json = await res.json();
      if (json.code !== 0) return;

      _pollETag = res.headers.get('ETag');

      const remote = json.data?.value;
      if (!Array.isArray(remote)) return;

      const normalizedRemote = Store.deduplicateTasks(remote.map(Store.normalizeTask));
      const cacheStr  = JSON.stringify(Store.getTasks());
      const remoteStr = JSON.stringify(normalizedRemote);

      if (remoteStr !== cacheStr) {
        Store.setTasks(normalizedRemote);
        if (!Store.isEditing()) {
          _cb.applyTasks?.(normalizedRemote);
          _cb.restoreAndRunQuery?.();
        }
      }
    } catch (err) {
      console.warn('Poll sync failed:', err);
    }
  }

  // ── 防抖保存：乐观更新，合并短时间内的多次写操作 ─────────────────────────
  let _saveTimer = null;
  function debouncedSave(delay = 500) {
    Store.saveToLocal();
    if (!API_BASE) return;
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
      _saveTimer = null;
      saveTasksToServer().catch(err => console.warn('Background save failed:', err));
    }, delay);
  }

  // ── 公开接口 ────────────────────────────────────────────────────────────────
  return {
    API_BASE,
    SYNC_INTERVAL_MS,
    init,
    request,
    loadTasksFromServer,
    saveTasksToServer,
    debouncedSave,
    pollAndMergeTasks,
  };
})();
