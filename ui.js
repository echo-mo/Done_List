/**
 * ui.js — DOM 渲染与事件代理层
 * 职责：连接 Store、Api 与 HTML DOM；渲染视图、监听事件、初始化应用。
 * 依赖：Store（store.js）、Api（api.js）须在本文件之前通过 <script> 加载。
 * 约束：本文件是唯一可直接操作 DOM 的层。
 */

// ── DOM 引用 ─────────────────────────────────────────────────────────────────
const taskInput  = document.getElementById('task-input');
const addButton  = document.querySelector('.btn-add');
const taskListEl = document.querySelector('.task-list');
const doneListEl = document.getElementById('done-list');

const QUERY_STORAGE_KEY = 'taskQueryState';

// ── 渲染：单个任务 <li> 元素 ─────────────────────────────────────────────────
function createTaskElement(text, completed, date, id) {
  if (id == null) id = Date.now();
  if (!date) date = Store.todayStr();

  const li = document.createElement('li');
  li.className    = 'task';
  li.dataset.id   = String(id);
  li.dataset.date = date;
  if (completed) li.classList.add('completed');

  const content = document.createElement('div');
  content.className = 'task-content';

  const span = document.createElement('span');
  span.className   = 'task-text';
  span.textContent = text;

  const dateSpan = document.createElement('div');
  dateSpan.className   = 'task-date';
  dateSpan.textContent = date;

  content.appendChild(span);
  content.appendChild(dateSpan);

  const actions = document.createElement('div');
  actions.className = 'actions';

  const completeBtn       = document.createElement('button');
  completeBtn.type        = 'button';
  completeBtn.className   = 'btn-complete';
  completeBtn.textContent = completed ? 'Undo' : 'Done';

  const editBtn       = document.createElement('button');
  editBtn.type        = 'button';
  editBtn.className   = 'btn-edit';
  editBtn.textContent = 'Edit';

  actions.appendChild(completeBtn);
  actions.appendChild(editBtn);

  // task-inner：可横向位移的顶层内容层（内含 content + actions，不含 delete）
  const taskInner = document.createElement('div');
  taskInner.className = 'task-inner';
  taskInner.appendChild(content);
  taskInner.appendChild(actions);

  // delete 按钮作为 li 直属子元素，绝对定位于右侧（移动端左滑后露出）
  const deleteBtn       = document.createElement('button');
  deleteBtn.type        = 'button';
  deleteBtn.className   = 'btn-delete';
  deleteBtn.textContent = 'Delete';

  li.appendChild(taskInner);
  li.appendChild(deleteBtn);
  return li;
}

// 将 actions 替换为「已完成」按钮组（Undo / Edit / Delete）
function setCompletedActions(actions) {
  actions.innerHTML = '';
  // delete 按钮已作为 li 直属子元素存在，此处只重建 undo / edit
  [['btn-undo', 'Undo'], ['btn-edit', 'Edit']].forEach(([cls, label]) => {
    const btn       = document.createElement('button');
    btn.type        = 'button';
    btn.className   = cls;
    btn.textContent = label;
    actions.appendChild(btn);
  });
}

// ── 渲染：将全量任务列表写入 DOM ─────────────────────────────────────────────
function applyTasks(tasks) {
  if (!Array.isArray(tasks)) return;
  taskListEl.innerHTML = '';
  if (doneListEl) doneListEl.innerHTML = '';
  const today = Store.todayStr();

  tasks.forEach((t, i) => {
    const nt = Store.normalizeTask(t);
    const id = nt.id != null ? nt.id : Date.now() + i;
    const li = createTaskElement(nt.text, nt.completed, nt.date, id);

    if (nt.completed && doneListEl && nt.date === today) {
      li.classList.add('completed');
      const actions = li.querySelector('.actions');
      if (actions) setCompletedActions(actions);
      doneListEl.appendChild(li);
    } else if (!nt.completed) {
      taskListEl.appendChild(li);
    }
  });

  updateStats();
  renderHeatmap();
}

// ── 渲染：统计面板 ───────────────────────────────────────────────────────────
function updateStats() {
  const today  = Store.todayStr();
  const year   = String(new Date().getFullYear());
  const tasks  = Store.getTasks();
  const getDate = t => (t.date || t.createdAt || '').toString().slice(0, 10);

  const yearTasks          = tasks.filter(t => getDate(t).startsWith(year));
  const yearCompletedCount = yearTasks.filter(t => t.completed).length;
  const yearRate = yearTasks.length
    ? Math.round(yearCompletedCount / yearTasks.length * 100) : 0;

  const elTotal     = document.getElementById('statTotal');
  const elCompleted = document.getElementById('statCompleted');
  const elRate      = document.getElementById('statRate');
  if (elTotal)     elTotal.textContent     = tasks.filter(t => getDate(t) === today).length;
  if (elCompleted) elCompleted.textContent = yearCompletedCount;
  if (elRate)      elRate.textContent      = yearRate + '%';
}

// ── 添加任务 ─────────────────────────────────────────────────────────────────
async function addTask() {
  const text = taskInput.value.trim();
  if (!text) return;
  const date = Store.todayStr();

  if (Store.hasDuplicate(date, text)) {
    alert('同一日期下已存在同名任务');
    return;
  }

  const id = Date.now();
  Store.addTask({ id, text, date, completed: false }); // ① 先写 Store（权威数据源）
  const li = createTaskElement(text, false, date, id); // ② 再更新 DOM
  taskListEl.appendChild(li);
  taskInput.value = '';
  taskInput.focus();

  if (Api.API_BASE) await Api.saveTasksToServer().catch(err => alert('保存失败：' + err.message));
  else Store.saveToLocal();
  updateStats();
}

addButton.addEventListener('click', addTask);
taskInput.addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });

// ── 编辑：进入 / 保存 / 取消 ────────────────────────────────────────────────
function startEdit(li, opts) {
  const textEl   = li.querySelector('.task-text');
  const content  = li.querySelector('.task-content');
  const actions  = li.querySelector('.actions');
  // task-inner 是编辑域的真实父节点；兼容无 task-inner 的旧结构
  const taskInner = li.querySelector('.task-inner') || li;
  if (!content || !actions) return;

  const currentText  = textEl ? textEl.textContent : '';
  const currentDate  = li.dataset.date || Store.todayStr();
  const onBeforeSave = opts?.onBeforeSave;

  closeCurrentSwipe(); // 进入编辑前收起左滑展开状态
  // ✅ 核心：进入编辑时设置 JS 状态标志，轮询保护不再依赖 DOM 查询
  Store.setEditing(li.dataset.id);

  const wrap = document.createElement('div');
  wrap.className = 'edit-fields';

  const inputText         = document.createElement('input');
  inputText.type          = 'text';
  inputText.value         = currentText;
  inputText.placeholder   = 'Task content';

  const inputDate   = document.createElement('input');
  inputDate.type    = 'date';
  inputDate.value   = currentDate;

  const btnWrap     = document.createElement('div');
  btnWrap.className = 'actions';

  const saveBtn       = document.createElement('button');
  saveBtn.type        = 'button';
  saveBtn.className   = 'btn-save';
  saveBtn.textContent = 'Save';

  const cancelBtn       = document.createElement('button');
  cancelBtn.type        = 'button';
  cancelBtn.className   = 'btn-cancel';
  cancelBtn.textContent = 'Cancel';

  saveBtn.onclick = async function () {
    const newText = inputText.value.trim();
    if (!newText) return;
    const newDate = inputDate.value || Store.todayStr();

    if (Store.hasDuplicate(newDate, newText, li.dataset.id)) {
      alert('同一日期下已存在同名任务');
      return;
    }

    Store.updateTask(li.dataset.id, { text: newText, date: newDate }); // ① 先写 Store
    li.dataset.date = newDate;                                          // ② 再改 DOM
    content.style.display = '';
    content.querySelector('.task-text').textContent = newText;
    content.querySelector('.task-date').textContent = newDate;
    taskInner.removeChild(wrap);
    taskInner.appendChild(actions);

    Store.clearEditing(); // ✅ 保存完成后清除编辑标志

    if (onBeforeSave) onBeforeSave(li);
    if (Api.API_BASE) await Api.saveTasksToServer().catch(err => alert('保存失败：' + err.message));
    else Store.saveToLocal();
    updateStats();
  };

  cancelBtn.onclick = function () {
    content.style.display = '';
    taskInner.removeChild(wrap);
    taskInner.appendChild(actions);
    Store.clearEditing(); // ✅ 取消时同样清除编辑标志
  };

  btnWrap.appendChild(saveBtn);
  btnWrap.appendChild(cancelBtn);
  wrap.appendChild(inputText);
  wrap.appendChild(inputDate);
  wrap.appendChild(btnWrap);
  content.style.display = 'none';
  taskInner.appendChild(wrap);
  taskInner.removeChild(actions);
  inputText.focus();
}

// ── 事件代理：主任务列表（删除 / 完成 / 编辑）──────────────────────────────
taskListEl.addEventListener('click', async function (e) {
  const target = e.target;

  if (target.classList.contains('btn-delete')) {
    const li = target.closest('li.task');
    if (li) {
      _openedInner = null; // 清除左滑状态
      Store.removeTask(li.dataset.id);
      taskListEl.removeChild(li);
    }
    if (Api.API_BASE) await Api.saveTasksToServer().catch(err => alert('保存失败：' + err.message));
    else Store.saveToLocal();
    updateStats();
    return;
  }

  if (target.classList.contains('btn-complete')) {
    const li = target.closest('li.task');
    if (li && doneListEl && taskListEl.contains(li)) {
      Store.updateTask(li.dataset.id, { completed: true });
      li.classList.add('completed');
      const actions = li.querySelector('.actions');
      if (actions) setCompletedActions(actions);
      taskListEl.removeChild(li);
      doneListEl.appendChild(li);
      if (Api.API_BASE) await Api.saveTasksToServer().catch(err => alert('保存失败：' + err.message));
      else Store.saveToLocal();
      updateStats();
    }
    return;
  }

  if (target.classList.contains('btn-edit')) {
    const li = target.closest('li.task');
    if (li) startEdit(li);
  }
});

// ── 事件代理：已完成列表（撤销 / 编辑 / 删除）──────────────────────────────
if (doneListEl) {
  doneListEl.addEventListener('click', async function (e) {
    const target = e.target;
    const li     = target.closest('li.task');
    if (!li) return;

    if (target.classList.contains('btn-undo')) {
      const id   = li.dataset.id;
      const text = li.querySelector('.task-text')?.textContent || '';
      const date = li.dataset.date || Store.todayStr();
      Store.updateTask(id, { completed: false });
      doneListEl.removeChild(li);
      taskListEl.appendChild(createTaskElement(text, false, date, id));
      if (Api.API_BASE) await Api.saveTasksToServer().catch(err => alert('保存失败：' + err.message));
      else Store.saveToLocal();
      updateStats();
      return;
    }

    if (target.classList.contains('btn-edit')) {
      startEdit(li);
      return;
    }

    if (target.classList.contains('btn-delete')) {
      _openedInner = null; // 清除左滑状态
      Store.removeTask(li.dataset.id);
      doneListEl.removeChild(li);
      if (Api.API_BASE) await Api.saveTasksToServer().catch(err => alert('保存失败：' + err.message));
      else Store.saveToLocal();
      updateStats();
    }
  });
}

// ── 左滑删除（移动端 Swipe-to-Delete）────────────────────────────────────────
const SWIPE_MAX       = 80;  // 跟手时最大位移 px（轻微超出，形成弹性手感）
const SWIPE_SETTLED   = 66;  // 展开后的稳定停靠位 px（delete 按钮露出宽度）
const SWIPE_THRESHOLD = 26;  // 阈值：超过则吸附到 SWIPE_SETTLED，不足则回弹到 0

let _openedInner = null; // 当前已展开的 .task-inner
let _swipeState  = null; // 当前正在滑动的状态

function closeCurrentSwipe(animate = true) {
  if (!_openedInner) return;
  const inner = _openedInner;
  _openedInner = null;
  if (!animate) inner.style.transition = 'none';
  inner.style.transform = 'translateX(0)';
  inner.closest('li.task')?.classList.remove('swipe-open');
  if (!animate) requestAnimationFrame(() => { inner.style.transition = ''; });
}

function openSwipe(inner) {
  inner.style.transform = `translateX(-${SWIPE_SETTLED}px)`;
  inner.closest('li.task')?.classList.add('swipe-open');
  _openedInner = inner;
}

// 点击页面其他区域时收起展开的删除按钮
document.addEventListener('click', function (e) {
  if (!_openedInner) return;
  const openedLi = _openedInner.closest('li.task');
  // 点击发生在已展开任务内部（含 delete 按钮）则不收起，让 click 事件正常处理
  if (openedLi && openedLi.contains(e.target)) return;
  closeCurrentSwipe();
});

// 通过 document 事件代理统一处理所有 .task-inner 的滑动
document.addEventListener('touchstart', function (e) {
  if (Store.isEditing()) return;
  const li = e.target.closest('li.task');
  if (!li) return;
  const inner = li.querySelector('.task-inner');
  if (!inner) return;

  const touch = e.touches[0];
  _swipeState = {
    inner,
    startX:        touch.clientX,
    startY:        touch.clientY,
    startTranslate: _openedInner === inner ? -SWIPE_SETTLED : 0,
    direction:     null, // null = 未确定；'h' = 水平；'v' = 垂直
  };
}, { passive: true });

document.addEventListener('touchmove', function (e) {
  if (!_swipeState) return;
  const touch = e.touches[0];
  const dx = touch.clientX - _swipeState.startX;
  const dy = touch.clientY - _swipeState.startY;

  // 首次移动时确定滑动方向
  if (!_swipeState.direction) {
    if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return; // 尚未移动足够距离
    _swipeState.direction = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
  }
  // 垂直滑动：放弃水平位移，绝不阻止浏览器默认滚动
  if (_swipeState.direction === 'v') return;

  // 水平滑动：阻止页面滚动，跟随手指移动 task-inner
  e.preventDefault();

  // 收起其他已展开的任务
  if (_openedInner && _openedInner !== _swipeState.inner) {
    closeCurrentSwipe();
  }

  const newTranslate = Math.min(0, Math.max(-SWIPE_MAX, _swipeState.startTranslate + dx));
  _swipeState.inner.style.transition = 'none';
  _swipeState.inner.style.transform  = `translateX(${newTranslate}px)`;
}, { passive: false });

document.addEventListener('touchend', function (e) {
  if (!_swipeState || _swipeState.direction !== 'h') {
    _swipeState = null;
    return;
  }
  const touch       = e.changedTouches[0];
  const dx          = touch.clientX - _swipeState.startX;
  const totalOffset = _swipeState.startTranslate + dx;

  _swipeState.inner.style.transition = ''; // 恢复 CSS transition

  if (totalOffset < -SWIPE_THRESHOLD) {
    openSwipe(_swipeState.inner);
  } else {
    closeCurrentSwipe();
  }
  _swipeState = null;
}, { passive: true });

// ── 热力图（按查询时间段的点阵）────────────────────────────────────────────
// 紫色系，颜色深浅表示任务数量
function getHeatmapRange() {
  const startInput = document.getElementById('query-start');
  const endInput = document.getElementById('query-end');
  let start = startInput?.value?.trim() || '';
  let end = endInput?.value?.trim() || '';
  const today = Store.todayStr();
  if (!start && !end) {
    const d = new Date();
    d.setDate(d.getDate() - 89);
    start = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    end = today;
  }
  if (!start) start = end || today;
  if (!end) end = start || today;
  if (start > end) [start, end] = [end, start];
  return { start, end };
}

function parseDateStr(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function dateStrForRange(startStr, dayIndex) {
  const d = parseDateStr(startStr);
  d.setDate(d.getDate() + dayIndex);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function buildDayStatsForRange(startStr, endStr) {
  const tasks = Store.getTasks();
  const getDate = t => (t.date || '').toString().slice(0, 10);
  const map = {};
  const start = parseDateStr(startStr).getTime();
  const end = parseDateStr(endStr).getTime();
  tasks.forEach(t => {
    const d = getDate(t);
    if (!d) return;
    const tms = parseDateStr(d).getTime();
    if (tms < start || tms > end) return;
    if (!map[d]) map[d] = 0;
    map[d]++;
  });
  return map;
}

function countToLevel(count) {
  if (!count || count <= 0) return 0;
  if (count <= 1) return 1;
  if (count <= 3) return 2;
  if (count <= 5) return 3;
  return 4;
}

function getDaysBetween(startStr, endStr) {
  const a = parseDateStr(startStr).getTime();
  const b = parseDateStr(endStr).getTime();
  return Math.round((b - a) / 86400000) + 1;
}

function renderHeatmap() {
  const container = document.getElementById('calendar-heatmap');
  if (!container) return;
  const { start, end } = getHeatmapRange();
  const dayStats = buildDayStatsForRange(start, end);
  const totalDays = getDaysBetween(start, end);
  const firstDayOfWeek = parseDateStr(start).getDay();
  container.innerHTML = '';
  container.setAttribute('data-range', start + '~' + end);

  const rows = [];
  let row = [];
  for (let i = 0; i < firstDayOfWeek; i++) row.push({ date: null, level: 0 });
  for (let i = 0; i < totalDays; i++) {
    const dateStr = dateStrForRange(start, i);
    const count = dayStats[dateStr] || 0;
    const level = countToLevel(count);
    row.push({ date: dateStr, level });
    if (row.length === 7) {
      rows.push(row);
      row = [];
    }
  }
  if (row.length) {
    while (row.length < 7) row.push({ date: null, level: 0 });
    rows.push(row);
  }

  rows.forEach(r => {
    const rowEl = document.createElement('div');
    rowEl.className = 'heatmap-row';
    r.forEach(cell => {
      const cellEl = document.createElement('div');
      cellEl.className = 'heatmap-cell';
      cellEl.setAttribute('data-level', cell.level);
      if (cell.date) {
        cellEl.dataset.date = cell.date;
        cellEl.setAttribute('title', cell.date);
      }
      rowEl.appendChild(cellEl);
    });
    container.appendChild(rowEl);
  });

  const isMobile = window.matchMedia('(max-width: 768px)').matches;

  container.querySelectorAll('.heatmap-cell[data-date]').forEach(el => {
    el.addEventListener('click', function () {
      const date = this.dataset.date;
      if (!date) return;
      if (isMobile) openDayDrawer(date); else selectDayInQuery(date);
    });
  });
}

function selectDayInQuery(dateStr) {
  const startInput = document.getElementById('query-start');
  const endInput = document.getElementById('query-end');
  if (startInput) startInput.value = dateStr;
  if (endInput) endInput.value = dateStr;
  runQuery(dateStr, dateStr);
}

let _drawerDate = null;

function openDayDrawer(dateStr) {
  const overlay = document.getElementById('drawer-overlay');
  const drawer = document.getElementById('day-drawer');
  const titleEl = document.getElementById('drawer-title');
  const bodyEl = document.getElementById('drawer-tasks');
  if (!overlay || !drawer || !bodyEl) return;
  _drawerDate = dateStr;
  refreshDrawerBody(dateStr, titleEl, bodyEl);
  overlay.classList.add('open');
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  overlay.setAttribute('aria-hidden', 'false');
  overlay.onclick = closeDayDrawer;
}

function refreshDrawerBody(dateStr, titleEl, bodyEl) {
  if (!bodyEl) bodyEl = document.getElementById('drawer-tasks');
  if (!titleEl) titleEl = document.getElementById('drawer-title');
  if (!bodyEl) return;
  if (titleEl) titleEl.textContent = dateStr + ' 当日任务';
  const tasks = Store.getTasks().filter(t => (t.date || '').toString().slice(0, 10) === dateStr);
  bodyEl.innerHTML = '';
  if (tasks.length === 0) {
    bodyEl.innerHTML = '<p class="query-empty">该日暂无任务</p>';
  } else {
    tasks.forEach(t => {
      const nt = Store.normalizeTask(t);
      bodyEl.appendChild(createQueryTaskElement(nt, nt.completed));
    });
  }
}

function closeDayDrawer() {
  _drawerDate = null;
  const overlay = document.getElementById('drawer-overlay');
  const drawer = document.getElementById('day-drawer');
  if (overlay) overlay.classList.remove('open');
  if (drawer) drawer.classList.remove('open');
  if (drawer) drawer.setAttribute('aria-hidden', 'true');
  if (overlay) overlay.setAttribute('aria-hidden', 'true');
}

// ── 查询 ─────────────────────────────────────────────────────────────────────
function runQuery(startDate, endDate) {
  let start = startDate || '';
  let end   = endDate   || '';
  const today = Store.todayStr();
  if (!start && !end) {
    const d = new Date();
    d.setDate(d.getDate() - 89);
    start = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    end = today;
    const startInput = document.getElementById('query-start');
    const endInput = document.getElementById('query-end');
    if (startInput) startInput.value = start;
    if (endInput) endInput.value = end;
  }
  const tasks = Store.getTasks().filter(t => {
    const d = (t.date || '').toString().slice(0, 10);
    if (d >= today) return false;
    if (start && end) return d >= start && d <= end;
    if (start) return d >= start;
    if (end) return d <= end;
    return true;
  });
  renderQueryResults(tasks);
  try {
    sessionStorage.setItem(QUERY_STORAGE_KEY, JSON.stringify({ start, end, tasks }));
  } catch (e) {}
  renderHeatmap();
}

function renderQueryResults(tasks) {
  const container = document.getElementById('query-results');
  if (!container) return;
  container.innerHTML = '';
  if (tasks.length === 0) {
    container.innerHTML = '<p class="query-empty">暂无符合条件的任务</p>';
    return;
  }
  const uncompleted = tasks.filter(t => !t.completed);
  const completed   = tasks.filter(t =>  t.completed);

  if (uncompleted.length > 0) {
    const g  = document.createElement('div');
    g.className = 'query-group';
    g.innerHTML = '<div class="query-group-title">未完成任务</div>';
    const ul = document.createElement('ul');
    ul.className = 'task-list';
    uncompleted.forEach(t => ul.appendChild(createQueryTaskElement(t)));
    g.appendChild(ul);
    container.appendChild(g);
  }
  if (completed.length > 0) {
    const g  = document.createElement('div');
    g.className = 'query-group';
    g.innerHTML = '<div class="query-group-title">已完成任务</div>';
    const ul = document.createElement('ul');
    ul.className = 'task-list';
    completed.forEach(t => ul.appendChild(createQueryTaskElement(t, true)));
    g.appendChild(ul);
    container.appendChild(g);
  }
}

function createQueryTaskElement(t, isCompleted) {
  const nt = Store.normalizeTask(t);
  const li = createTaskElement(nt.text, nt.completed, nt.date, nt.id);
  li.dataset.id = String(nt.id);
  const actions = li.querySelector('.actions');
  if (!actions) return li;
  actions.innerHTML = '';

  if (isCompleted) {
    const undoBtn       = document.createElement('button');
    undoBtn.type        = 'button';
    undoBtn.className   = 'btn-undo';
    undoBtn.textContent = 'Undo';
    actions.appendChild(undoBtn);
    undoBtn.onclick = () => undoQueryTask(li);
  } else {
    const doneBtn       = document.createElement('button');
    doneBtn.type        = 'button';
    doneBtn.className   = 'btn-complete';
    doneBtn.textContent = 'Done';
    actions.appendChild(doneBtn);
    doneBtn.onclick = () => completeQueryTask(li);
  }

  const editBtn       = document.createElement('button');
  editBtn.type        = 'button';
  editBtn.className   = 'btn-edit';
  editBtn.textContent = 'Edit';
  actions.appendChild(editBtn);
  editBtn.onclick = () => startEditQueryTask(li);

  // delete 按钮由 createTaskElement 创建为 li 直属子元素，直接绑定 onclick 即可
  const deleteBtn = li.querySelector('.btn-delete');
  if (deleteBtn) deleteBtn.onclick = () => deleteQueryTask(li);

  return li;
}

function completeQueryTask(li) {
  Store.updateTask(li.dataset.id, { completed: true });
  if (Api.API_BASE) Api.saveTasksToServer().catch(err => alert('保存失败：' + err.message));
  else Store.saveToLocal();
  applyTasks(Store.getTasks());
  const state = getQueryState();
  if (state) runQuery(state.start, state.end);
  if (_drawerDate) refreshDrawerBody(_drawerDate);
}

function startEditQueryTask(li) {
  startEdit(li, {
    onBeforeSave: (el) => {
      const id      = el.dataset.id;
      const newText = el.querySelector('.task-text')?.textContent || '';
      const newDate = el.dataset.date || Store.todayStr();
      // Store.updateTask 已在 startEdit 的 saveBtn.onclick 中调用，此处同步主列表 DOM
      const mainLi = taskListEl.querySelector(`li[data-id="${id}"]`)
        || doneListEl?.querySelector(`li[data-id="${id}"]`);
      if (mainLi) {
        mainLi.dataset.date = newDate;
        const t = mainLi.querySelector('.task-text');
        const d = mainLi.querySelector('.task-date');
        if (t) t.textContent = newText;
        if (d) d.textContent = newDate;
      }
    },
  });
  const saveBtn = li.querySelector('.btn-save');
  if (saveBtn) {
    const origOnclick = saveBtn.onclick;
    saveBtn.onclick = async function () {
      if (origOnclick) await origOnclick.call(this);
      const state = getQueryState();
      if (state) runQuery(state.start, state.end);
      if (_drawerDate) refreshDrawerBody(_drawerDate);
    };
  }
}

function deleteQueryTask(li) {
  const id = li.dataset.id;
  Store.removeTask(id);
  const mainLi = taskListEl.querySelector(`li[data-id="${id}"]`)
    || doneListEl?.querySelector(`li[data-id="${id}"]`);
  if (mainLi) mainLi.remove();
  if (Api.API_BASE) Api.saveTasksToServer().catch(err => alert('保存失败：' + err.message));
  else Store.saveToLocal();
  li.remove();
  const state = getQueryState();
  if (state) runQuery(state.start, state.end);
  updateStats();
  renderHeatmap();
  if (_drawerDate) refreshDrawerBody(_drawerDate);
}

function undoQueryTask(li) {
  Store.updateTask(li.dataset.id, { completed: false });
  if (Api.API_BASE) Api.saveTasksToServer().catch(err => alert('保存失败：' + err.message));
  else Store.saveToLocal();
  applyTasks(Store.getTasks());
  const state = getQueryState();
  if (state) runQuery(state.start, state.end);
  if (_drawerDate) refreshDrawerBody(_drawerDate);
}

function getQueryState() {
  try {
    const raw = sessionStorage.getItem(QUERY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function restoreAndRunQuery() {
  const endInput = document.getElementById('query-end');
  if (endInput && !endInput.value) endInput.value = Store.todayStr();
  const state = getQueryState();
  if (!state || (!state.start && !state.end)) return;
  const startInput = document.getElementById('query-start');
  if (startInput) startInput.value = state.start || '';
  if (endInput)   endInput.value   = state.end   || '';
  runQuery(state.start, state.end);
}

document.getElementById('btn-query')?.addEventListener('click', function () {
  const start = document.getElementById('query-start')?.value || '';
  const end   = document.getElementById('query-end')?.value   || '';
  runQuery(start, end);
});

// ── 历史记录导入（.docx）────────────────────────────────────────────────────
document.getElementById('btn-import')?.addEventListener('click', async function () {
  const fileInput = document.getElementById('import-file');
  const resultEl  = document.getElementById('import-result');
  if (!fileInput?.files?.length || !resultEl) return;
  const file = fileInput.files[0];
  if (!file.name.toLowerCase().endsWith('.docx')) {
    resultEl.className   = 'import-result error';
    resultEl.textContent = '请选择 .docx 格式文件';
    return;
  }
  resultEl.textContent = '导入中...';
  resultEl.className   = 'import-result';
  try {
    const buf = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);
    const symbols = {}, abstractSymbols = {};

    const numEntry = zip.file('word/numbering.xml');
    if (numEntry) {
      const numXml = await numEntry.async('string');
      numXml.split(/<w:abstractNum\b/).slice(1).forEach(blk => {
        const aidM = blk.match(/abstractNumId="(\d+)"/);
        const lvlM = blk.match(/<w:lvlText[^>]*val="([^"]*)"/);
        if (aidM && lvlM) abstractSymbols[aidM[1]] = lvlM[1];
      });
      numXml.split(/<w:num\b/).slice(1).forEach(blk => {
        const nidM = blk.match(/numId="(\d+)"/);
        const aidM = blk.match(/abstractNumId[^v]*val="(\d+)"/);
        if (nidM && aidM && abstractSymbols[aidM[1]]) symbols[nidM[1]] = abstractSymbols[aidM[1]];
      });
    }

    const docEntry = zip.file('word/document.xml');
    if (!docEntry) throw new Error('无效的 docx 文件');
    const docXml = await docEntry.async('string');
    const lines  = [];
    docXml.split(/<w:p\b/).slice(1).forEach(block => {
      const nidM  = block.match(/numId[^v]*val="(\d+)"/);
      const numId = nidM ? nidM[1] : null;
      let text = '';
      for (const t of block.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)) text += (t[1] || '');
      text = text.replace(/\s+/g, ' ').trim();
      const line = ((numId && symbols[numId] ? symbols[numId] + ' ' : '') + text).trim();
      if (line) lines.push(line);
    });

    const DATE_RE = /^(\d{8})(?:周[一二三四五六日])?/;
    let currentDate = null;
    const importedTasks = [];
    let total = lines.length, filtered = 0, completed = 0, uncompleted = 0;

    for (const line of lines) {
      const dm = line.match(DATE_RE);
      if (dm) {
        const d = dm[1];
        currentDate = `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;
        continue;
      }
      if (line.startsWith('☑ ')) {
        const text = line.slice(2).trim();
        if (text && currentDate) { importedTasks.push({ text, date: currentDate, completed: true }); completed++; }
        else filtered++;
        continue;
      }
      if (line.startsWith('☐ ')) {
        const text = line.slice(2).trim();
        if (text && currentDate) { importedTasks.push({ text, date: currentDate, completed: false }); uncompleted++; }
        else filtered++;
        continue;
      }
      filtered++;
    }

    const existingIds = new Set(Store.getTasks().map(t => t.id));
    let nextId = Date.now();
    const merged = [...Store.getTasks()];
    for (const t of importedTasks) {
      while (existingIds.has(nextId)) nextId++;
      merged.push({ id: nextId, text: t.text, date: t.date, completed: t.completed });
      existingIds.add(nextId);
      nextId++;
    }
    Store.setTasks(Store.deduplicateTasks(merged));

    if (Api.API_BASE) await Api.saveTasksToServer();
    else Store.saveToLocal();

    resultEl.className  = 'import-result success';
    resultEl.innerHTML  = `总数据行数=${total}<br>有效数据行数=${total - filtered}<br>被过滤的数据行数=${filtered}<br>导入的未完成任务数=${uncompleted}<br>导入的已完成任务数=${completed}`;
    fileInput.value = '';
    applyTasks(Store.getTasks());
    restoreAndRunQuery();
  } catch (e) {
    resultEl.className   = 'import-result error';
    resultEl.textContent = '导入失败：' + (e.message || '解析错误');
  }
});

// ── localStorage 降级：加载 ──────────────────────────────────────────────────
function loadFromLocalStorage() {
  const tasks = Store.loadFromLocal();
  Store.setTasks(tasks || []);
  applyTasks(Store.getTasks());
  restoreAndRunQuery();
}

// ── 初始化 ───────────────────────────────────────────────────────────────────
function init() {
  // 将 UI 回调注入到 Api 层，保持 api.js 与 DOM 解耦
  Api.init({
    applyTasks,
    restoreAndRunQuery,
    onFallback: loadFromLocalStorage,
  });

  // 初始化统计面板年份标签
  const y   = new Date().getFullYear();
  const el1 = document.getElementById('statCompletedLabel');
  const el2 = document.getElementById('statRateLabel');
  if (el1) el1.textContent = `${y}'s Completed Tasks`;
  if (el2) el2.textContent = `${y}'s Execution`;

  // 首次数据加载；无论加载成功/降级，完成后启动轮询
  if (Api.API_BASE) {
    Api.loadTasksFromServer().finally(() => {
      setInterval(Api.pollAndMergeTasks, Api.SYNC_INTERVAL_MS);
    });
  } else {
    loadFromLocalStorage();
  }
}

// 脚本位于 <body> 末尾，DOM 已就绪；兼容性写法保证任何时序下均可运行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
