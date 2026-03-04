/**
 * store.js — 状态管理层
 * 职责：维护全量任务缓存、编辑状态标志、纯数据操作函数。
 * 约束：本文件 **不得** 访问 DOM，不得调用 fetch，纯 JS 数据层。
 */
const Store = (() => {
  // ── 私有状态 ────────────────────────────────────────────────────────────────
  let _tasks = [];            // 全量任务缓存（TASK-001~004）
  let _editingTaskId = null;  // null = 未编辑；有值 = 正在编辑该任务 id

  // ── 基础工具 ────────────────────────────────────────────────────────────────
  const todayStr = () => new Date().toISOString().slice(0, 10);

  const normalizeTask = (t) => ({
    id: t.id,
    text: t.text || '',
    completed: Boolean(t.completed),
    date: (t.date || t.createdAt || t.completedAt || todayStr()).toString().slice(0, 10),
  });

  const taskKey = (t) =>
    (t.date || '').toString().slice(0, 10) + '|' + (t.text || '').trim();

  const deduplicateTasks = (tasks) => {
    const seen = new Set();
    return tasks.filter(t => {
      const k = taskKey(t);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).map(normalizeTask);
  };

  // ── 编辑状态（JS 驱动，脱离 DOM）──────────────────────────────────────────
  // 解决手机端软键盘弹起导致 Edit 状态丢失的根本方案：
  // 编辑状态由此处的 _editingTaskId 决定，而非 DOM 查询。
  const isEditing  = () => _editingTaskId !== null;
  const setEditing = (id) => { _editingTaskId = String(id); };
  const clearEditing = () => { _editingTaskId = null; };

  // ── 缓存读写 ────────────────────────────────────────────────────────────────
  const getTasks = () => _tasks;
  const setTasks = (tasks) => { _tasks = tasks; };

  const addTask = (task) => {
    _tasks.push(normalizeTask(task));
  };

  const updateTask = (id, fields) => {
    const idx = _tasks.findIndex(t => String(t.id) === String(id));
    if (idx >= 0) Object.assign(_tasks[idx], fields);
  };

  const removeTask = (id) => {
    _tasks = _tasks.filter(t => String(t.id) !== String(id));
  };

  // ── 去重校验 ────────────────────────────────────────────────────────────────
  // 注：重构后 _tasks 始终为权威数据源，无需再合并 DOM 快照。
  const hasDuplicate = (date, text, excludeId) => {
    const d   = (date || '').toString().slice(0, 10);
    const txt = (text || '').trim();
    const pool = excludeId != null
      ? _tasks.filter(t => String(t.id) !== String(excludeId))
      : _tasks;
    return pool.some(
      t => (t.date || '').toString().slice(0, 10) === d
        && (t.text || '').trim() === txt
    );
  };

  // ── localStorage ────────────────────────────────────────────────────────────
  const saveToLocal = () => {
    try {
      localStorage.setItem('todoList', JSON.stringify(_tasks));
    } catch (e) {
      console.warn('localStorage write failed:', e);
    }
  };

  const loadFromLocal = () => {
    try {
      const raw = localStorage.getItem('todoList');
      if (!raw) return null;
      const tasks = JSON.parse(raw);
      return Array.isArray(tasks) ? deduplicateTasks(tasks.map(normalizeTask)) : null;
    } catch (e) {
      return null;
    }
  };

  // ── 公开接口 ────────────────────────────────────────────────────────────────
  return {
    todayStr,
    normalizeTask,
    deduplicateTasks,
    taskKey,
    isEditing,
    setEditing,
    clearEditing,
    getTasks,
    setTasks,
    addTask,
    updateTask,
    removeTask,
    hasDuplicate,
    saveToLocal,
    loadFromLocal,
  };
})();
