/**
 * ui.js — DOM 渲染与事件代理层
 * 职责：连接 Store、Api 与 HTML DOM；渲染视图、监听事件、初始化应用。
 * 依赖：Store（store.js）、Api（api.js）须在本文件之前通过 <script> 加载。
 * 约束：本文件是唯一可直接操作 DOM 的层。
 */

// ── DOM 引用 ─────────────────────────────────────────────────────────────────
const taskInput  = document.getElementById('task-input');
const addButton  = document.getElementById('btn-add');
const taskListEl = document.querySelector('.task-list');
const doneListEl = document.getElementById('done-list');

const QUERY_STORAGE_KEY = 'taskQueryState';

// ── 渲染：单个任务 <li> 元素 ─────────────────────────────────────────────────
function createTaskElement(text, completed, date, id, opts) {
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

  if (opts?.showCategoryBadge && opts.category) {
    const badge = document.createElement('span');
    badge.className = 'task-category-badge';
    badge.textContent = opts.category;
    span.appendChild(badge);
  }

  content.appendChild(dateSpan);

  // 复选框（左侧大圆圈，点击=完成/撤销）
  const checkboxEl = document.createElement('div');
  checkboxEl.className = 'task-checkbox' + (completed ? ' checked' : '');

  const actions = document.createElement('div');
  actions.className = 'actions';

  const editBtn       = document.createElement('button');
  editBtn.type        = 'button';
  editBtn.className   = 'btn-edit';
  editBtn.textContent = 'Edit';

  actions.appendChild(editBtn);

  // task-inner：可横向位移的顶层内容层（checkbox + content + actions，不含 delete/edit-swipe）
  const taskInner = document.createElement('div');
  taskInner.className = 'task-inner';
  taskInner.appendChild(checkboxEl);
  taskInner.appendChild(content);
  taskInner.appendChild(actions);

  // 左侧 Edit 滑出按钮（移动端右滑后露出，绝对定位于左侧）
  const editSwipeBtn       = document.createElement('button');
  editSwipeBtn.type        = 'button';
  editSwipeBtn.className   = 'btn-edit-swipe';
  editSwipeBtn.innerHTML   = '✏ Edit';

  // 右侧 Delete 滑出按钮（移动端左滑后露出，绝对定位于右侧）
  const deleteBtn       = document.createElement('button');
  deleteBtn.type        = 'button';
  deleteBtn.className   = 'btn-delete';
  deleteBtn.innerHTML   = '🗑 Delete';

  li.appendChild(editSwipeBtn);
  li.appendChild(taskInner);
  li.appendChild(deleteBtn);
  return li;
}

// 已完成任务的 actions 只保留 Edit（Undo 由复选框承担）
function setCompletedActions(actions) {
  actions.innerHTML = '';
  const editBtn       = document.createElement('button');
  editBtn.type        = 'button';
  editBtn.className   = 'btn-edit';
  editBtn.textContent = 'Edit';
  actions.appendChild(editBtn);
}

// ── 渲染：将全量任务列表写入 DOM（指纹跳过无变化重渲染）─────────────────────
let _taskListFP = '';

function applyTasks(tasks) {
  if (!Array.isArray(tasks)) return;
  const currentCat = Store.getCategory();

  const visible = [];
  tasks.forEach((t, i) => {
    const nt = Store.normalizeTask(t);
    if ((nt.category || 'self') !== currentCat) return;
    if (nt.completed) return;
    visible.push({ nt, id: nt.id != null ? nt.id : Date.now() + i });
  });

  const fp = visible.map(v => v.id + '|' + v.nt.text + '|' + v.nt.date).join('\n');
  if (fp !== _taskListFP) {
    _taskListFP = fp;
    taskListEl.innerHTML = '';
    visible.forEach(v => {
      taskListEl.appendChild(createTaskElement(v.nt.text, false, v.nt.date, v.id));
    });
  }

  renderDoneList();
  updateStats();
  renderHeatmap();
}

let _doneListFP = '';

function renderDoneList() {
  if (!doneListEl) return;
  const today = Store.todayStr();
  const grouped = Store.getCompletedTasksGrouped(today);

  const fp = Store.getCategoryKeys().map(cat =>
    cat + ':' + (grouped[cat] || []).map(t => t.id + '|' + t.text).join(',')
  ).join(';');
  if (fp === _doneListFP) return;
  _doneListFP = fp;

  doneListEl.innerHTML = '';

  Store.getCategoryKeys().forEach(cat => {
    const tasks = grouped[cat] || [];
    const group = document.createElement('div');
    group.className = 'done-category-group';

    const header = document.createElement('div');
    header.className = 'done-category-header' + (tasks.length === 0 ? ' empty' : '');
    const bar = document.createElement('span');
    bar.className = 'done-category-bar';
    bar.style.background = CONFIG.getCategoryColor(cat);
    header.appendChild(bar);
    header.appendChild(document.createTextNode(CONFIG.getCategoryLabel(cat) + (tasks.length > 0 ? ' (' + tasks.length + ')' : '')));
    group.appendChild(header);

    if (tasks.length > 0) {
      const ul = document.createElement('ul');
      ul.className = 'done-list';
      tasks.forEach(t => {
        const nt = Store.normalizeTask(t);
        const li = createTaskElement(nt.text, true, nt.date, nt.id);
        li.classList.add('completed', 'task-fade-in');
        ul.appendChild(li);
      });
      group.appendChild(ul);
    }

    doneListEl.appendChild(group);
  });
}

// ── 渲染：统计面板 ───────────────────────────────────────────────────────────
function updateStats() {
  const today  = Store.todayStr();
  const year   = String(new Date().getFullYear());
  const currentCat = Store.getCategory();
  const tasks  = Store.getTasksByCategory(currentCat);
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
  const category = Store.getCategory();

  if (Store.hasDuplicate(date, text, category)) {
    alert(CONFIG.text.duplicateAlert);
    return;
  }

  const id = Date.now();
  Store.addTask({ id, text, date, completed: false, category }); // ① 先写 Store（权威数据源）
  const li = createTaskElement(text, false, date, id); // ② 再更新 DOM
  taskListEl.appendChild(li);
  taskInput.value = '';
  taskInput.focus();

  Api.debouncedSave();
  updateStats();
}

addButton.addEventListener('click', addTask);
taskInput.addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });

// ── 编辑：进入 / 保存 / 取消 ────────────────────────────────────────────────

/** 移动端：底部弹窗编辑 */
function startEditBottomSheet(li, opts) {
  closeCurrentSwipe();
  Store.setEditing(li.dataset.id);

  const currentText  = li.querySelector('.task-text')?.textContent || '';
  const currentDate  = li.dataset.date || Store.todayStr();
  const taskData     = Store.getTasks().find(t => String(t.id) === li.dataset.id) || {};
  const currentCat   = taskData.category || Store.getCategory();
  const onBeforeSave = opts?.onBeforeSave;
  const onAfterSave  = opts?.onAfterSave;

  const overlay   = document.getElementById('edit-drawer-overlay');
  const drawer    = document.getElementById('edit-drawer');
  const textInput = document.getElementById('edit-drawer-text');
  const dateInput = document.getElementById('edit-drawer-date');
  const catSelect = document.getElementById('edit-drawer-category');
  const saveBtn   = document.getElementById('edit-drawer-save');
  const cancelBtn = document.getElementById('edit-drawer-cancel');
  if (!drawer) { startEditInline(li, opts); return; }

  textInput.value = currentText;
  dateInput.value = currentDate;
  if (catSelect) catSelect.value = currentCat;

  function closeSheet() {
    overlay.classList.remove('open');
    drawer.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    drawer.setAttribute('aria-hidden', 'true');
    saveBtn.onclick   = null;
    cancelBtn.onclick = null;
    overlay.onclick   = null;
    Store.clearEditing();
  }

  saveBtn.onclick = async function () {
    const newText = textInput.value.trim();
    if (!newText) return;
    const newDate = dateInput.value || Store.todayStr();
    const newCat  = catSelect ? catSelect.value : currentCat;

    if (newText === currentText && newDate === currentDate && newCat === currentCat) {
      closeSheet();
      return;
    }

    if (Store.hasDuplicate(newDate, newText, newCat, li.dataset.id)) {
      alert(CONFIG.text.duplicateAlert);
      return;
    }

    Store.updateTask(li.dataset.id, { text: newText, date: newDate, category: newCat });
    closeSheet();

    if (onBeforeSave) onBeforeSave(li);
    Api.debouncedSave();
    applyTasks(Store.getTasks());
    if (onAfterSave) onAfterSave();
  };

  cancelBtn.onclick = closeSheet;
  overlay.onclick   = closeSheet;

  overlay.classList.add('open');
  drawer.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  drawer.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => textInput.focus());
}

/** 桌面端：内联编辑 */
function startEditInline(li, opts) {
  const textEl   = li.querySelector('.task-text');
  const content  = li.querySelector('.task-content');
  const actions  = li.querySelector('.actions');
  const taskInner = li.querySelector('.task-inner') || li;
  if (!content || !actions) return;

  const currentText  = textEl ? textEl.textContent : '';
  const currentDate  = li.dataset.date || Store.todayStr();
  const taskData     = Store.getTasks().find(t => String(t.id) === li.dataset.id) || {};
  const currentCat   = taskData.category || Store.getCategory();
  const onBeforeSave = opts?.onBeforeSave;
  const onAfterSave  = opts?.onAfterSave;

  closeCurrentSwipe();
  Store.setEditing(li.dataset.id);

  const checkboxInner = li.querySelector('.task-checkbox');
  if (checkboxInner) checkboxInner.style.display = 'none';

  const wrap = document.createElement('div');
  wrap.className = 'edit-fields';

  const inputText       = document.createElement('input');
  inputText.type        = 'text';
  inputText.value       = currentText;
  inputText.placeholder = 'Task content';

  const inputDate  = document.createElement('input');
  inputDate.type   = 'date';
  inputDate.value  = currentDate;

  const selectCat       = document.createElement('select');
  selectCat.className   = 'edit-category-select';
  Store.getCategoryKeys().forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = CONFIG.getCategoryLabel(c);
    if (c === currentCat) opt.selected = true;
    selectCat.appendChild(opt);
  });

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
    const newCat  = selectCat.value;

    if (newText === currentText && newDate === currentDate && newCat === currentCat) {
      cancelBtn.onclick();
      return;
    }

    if (Store.hasDuplicate(newDate, newText, newCat, li.dataset.id)) {
      alert(CONFIG.text.duplicateAlert);
      return;
    }

    Store.updateTask(li.dataset.id, { text: newText, date: newDate, category: newCat });

    content.style.display = '';
    taskInner.removeChild(wrap);
    taskInner.appendChild(actions);
    if (checkboxInner) checkboxInner.style.display = '';
    Store.clearEditing();

    if (onBeforeSave) onBeforeSave(li);
    Api.debouncedSave();
    applyTasks(Store.getTasks());
    if (onAfterSave) onAfterSave();
  };

  cancelBtn.onclick = function () {
    content.style.display = '';
    taskInner.removeChild(wrap);
    taskInner.appendChild(actions);
    if (checkboxInner) checkboxInner.style.display = '';
    Store.clearEditing();
  };

  btnWrap.appendChild(saveBtn);
  btnWrap.appendChild(cancelBtn);
  wrap.appendChild(inputText);
  wrap.appendChild(inputDate);
  wrap.appendChild(selectCat);
  wrap.appendChild(btnWrap);
  content.style.display = 'none';
  taskInner.appendChild(wrap);
  taskInner.removeChild(actions);
  inputText.focus();
}

/** 统一入口：移动端用 Bottom Sheet，桌面端内联 */
function startEdit(li, opts) {
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  if (isMobile && document.getElementById('edit-drawer')) {
    startEditBottomSheet(li, opts);
  } else {
    startEditInline(li, opts);
  }
}

// ── 事件代理：主任务列表（删除 / 完成 / 编辑）──────────────────────────────
taskListEl.addEventListener('click', async function (e) {
  const target = e.target;

  if (target.classList.contains('btn-delete')) {
    const li = target.closest('li.task');
    if (li) {
      _openedInner = null;
      _openedDirection = null;
      Store.removeTask(li.dataset.id);
      taskListEl.removeChild(li);
    }
    Api.debouncedSave();
    updateStats();
    return;
  }

  // 复选框点击 → 完成任务
  if (target.classList.contains('task-checkbox') && !target.classList.contains('checked')) {
    const li = target.closest('li.task');
    if (li && taskListEl.contains(li)) {
      Store.updateTask(li.dataset.id, { completed: true });
      taskListEl.removeChild(li);
      renderDoneList();
      Api.debouncedSave();
      updateStats();
      renderHeatmap();
    }
    return;
  }

  if (target.classList.contains('btn-edit') || target.classList.contains('btn-edit-swipe')) {
    const li = target.closest('li.task');
    if (li) { closeCurrentSwipe(); startEdit(li); }
  }
});

// ── 事件代理：已完成列表（撤销 / 编辑 / 删除）──────────────────────────────
if (doneListEl) {
  doneListEl.addEventListener('click', async function (e) {
    const target = e.target;
    const li     = target.closest('li.task');
    if (!li) return;

    // 复选框点击 → 撤销完成（Undo）
    if (target.classList.contains('task-checkbox') && target.classList.contains('checked')) {
      const id = li.dataset.id;
      Store.updateTask(id, { completed: false });
      Api.debouncedSave();
      applyTasks(Store.getTasks());
      renderHeatmap();
      return;
    }

    if (target.classList.contains('btn-edit') || target.classList.contains('btn-edit-swipe')) {
      closeCurrentSwipe();
      startEdit(li);
      return;
    }

    if (target.classList.contains('btn-delete')) {
      _openedInner = null;
      Store.removeTask(li.dataset.id);
      Api.debouncedSave();
      applyTasks(Store.getTasks());
    }
  });
}

// ── 左滑删除（移动端 Swipe-to-Delete）────────────────────────────────────────
const SWIPE_MAX       = 80;  // 跟手时最大位移 px（轻微超出，形成弹性手感）
const SWIPE_SETTLED   = 66;  // 展开后的稳定停靠位 px（delete 按钮露出宽度）
const SWIPE_THRESHOLD = 26;  // 阈值：超过则吸附到 SWIPE_SETTLED，不足则回弹到 0

let _openedInner     = null; // 当前已展开的 .task-inner
let _openedDirection = null; // 'left'(delete) | 'right'(edit)
let _swipeState      = null; // 当前正在滑动的状态

function closeCurrentSwipe(animate = true) {
  if (!_openedInner) return;
  const inner = _openedInner;
  _openedInner = null;
  _openedDirection = null;
  if (!animate) inner.style.transition = 'none';
  inner.style.transform = 'translateX(0)';
  inner.closest('li.task')?.classList.remove('swipe-open', 'swipe-right-open');
  if (!animate) requestAnimationFrame(() => { inner.style.transition = ''; });
}

function openSwipe(inner, direction) {
  const offset = direction === 'right' ? SWIPE_SETTLED : -SWIPE_SETTLED;
  inner.style.transform = `translateX(${offset}px)`;
  const li = inner.closest('li.task');
  li?.classList.remove('swipe-open', 'swipe-right-open');
  li?.classList.add(direction === 'right' ? 'swipe-right-open' : 'swipe-open');
  _openedInner = inner;
  _openedDirection = direction;
}

// 点击页面其他区域时收起展开的删除按钮
document.addEventListener('click', function (e) {
  if (!_openedInner) return;
  const openedLi = _openedInner.closest('li.task');
  // 点击发生在已展开任务内部（含 delete 按钮）则不收起，让 click 事件正常处理
  if (openedLi && openedLi.contains(e.target)) return;
  closeCurrentSwipe();
});

// ── 长按编辑（移动端）───────────────────────────────────────────────────────
const LONG_PRESS_MS = 550;
let _longPressTimer = null;

function cancelLongPress() {
  if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }
}

// 通过 document 事件代理统一处理所有 .task-inner 的双向滑动
document.addEventListener('touchstart', function (e) {
  const li = e.target.closest('li.task');
  if (!li) return;
  const inner = li.querySelector('.task-inner');
  if (!inner) return;

  const touch = e.touches[0];
  // 根据当前打开方向设置初始 translate
  let startTranslate = 0;
  if (_openedInner === inner) {
    startTranslate = _openedDirection === 'right' ? SWIPE_SETTLED : -SWIPE_SETTLED;
  }
  _swipeState = {
    inner, li,
    startX: touch.clientX,
    startY: touch.clientY,
    startTranslate,
    direction: null,
    editing: Store.isEditing(),
  };

  // 长按计时（非编辑态且非复选框区域）
  if (!Store.isEditing() && !e.target.classList.contains('task-checkbox')) {
    _longPressTimer = setTimeout(() => {
      _longPressTimer = null;
      if (!Store.isEditing()) startEdit(li);
    }, LONG_PRESS_MS);
  }
}, { passive: true });

document.addEventListener('touchmove', function (e) {
  if (!_swipeState) return;
  const touch = e.touches[0];
  const dx = touch.clientX - _swipeState.startX;
  const dy = touch.clientY - _swipeState.startY;

  if (!_swipeState.direction) {
    if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
    _swipeState.direction = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    cancelLongPress();
  }
  if (_swipeState.direction === 'v') return;

  // 编辑态：不跟手移动，只等 touchend 判断是否取消编辑
  if (_swipeState.editing) return;

  e.preventDefault();
  if (_openedInner && _openedInner !== _swipeState.inner) closeCurrentSwipe();

  // 允许双向滑动（正=右滑露出Edit，负=左滑露出Delete）
  const newTranslate = Math.min(SWIPE_MAX, Math.max(-SWIPE_MAX, _swipeState.startTranslate + dx));
  _swipeState.inner.style.transition = 'none';
  _swipeState.inner.style.transform  = `translateX(${newTranslate}px)`;
}, { passive: false });

document.addEventListener('touchend', function (e) {
  cancelLongPress();
  if (!_swipeState || _swipeState.direction !== 'h') {
    _swipeState = null;
    return;
  }
  const touch       = e.changedTouches[0];
  const dx          = touch.clientX - _swipeState.startX;
  const totalOffset = _swipeState.startTranslate + dx;

  // 编辑模式下：左滑 → 触发取消编辑
  if (_swipeState.editing) {
    if (dx < -SWIPE_THRESHOLD) {
      _swipeState.li.querySelector('.btn-cancel')?.click();
    }
    _swipeState = null;
    return;
  }

  _swipeState.inner.style.transition = '';

  if (totalOffset < -SWIPE_THRESHOLD) {
    openSwipe(_swipeState.inner, 'left');   // 露出 Delete
  } else if (totalOffset > SWIPE_THRESHOLD) {
    openSwipe(_swipeState.inner, 'right');  // 露出 Edit
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

function formatDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// 将 JS 的星期（0=周日..6=周六）转换为以周一为 0 的索引
function getWeekdayIndex(dateObj) {
  const js = dateObj.getDay(); // 0=Sunday..6=Saturday
  return (js + 6) % 7;         // 0=Monday..6=Sunday
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
  const startDate = parseDateStr(start);
  const endDate = parseDateStr(end);
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();

  // 以「周一」为一周起点，对齐网格：
  // gridStart = 起始日期所在周的周一
  // gridEnd   = 结束日期所在周的周日
  const startIdx = getWeekdayIndex(startDate); // 0=Mon..6=Sun
  const endIdx   = getWeekdayIndex(endDate);
  const gridStart = new Date(startDate);
  gridStart.setDate(gridStart.getDate() - startIdx);
  const gridEnd = new Date(endDate);
  gridEnd.setDate(gridEnd.getDate() + (6 - endIdx));

  const totalDays = Math.round((gridEnd.getTime() - gridStart.getTime()) / 86400000) + 1;

  container.innerHTML = '';
  container.setAttribute('data-range', start + '~' + end);

  const rows = [];
  let row = [];
  let current = new Date(gridStart);

  for (let i = 0; i < totalDays; i++) {
    const currentMs = current.getTime();
    const inRange = currentMs >= startMs && currentMs <= endMs;

    if (inRange) {
      const dateStr = formatDate(current);
      const count = dayStats[dateStr] || 0;
      const level = countToLevel(count);
      row.push({ date: dateStr, level });
    } else {
      // 不在查询区间内的日期只占位，不绑定 date，不可点击
      row.push({ date: null, level: 0 });
    }

    if (row.length === 7) {
      rows.push(row);
      row = [];
    }

    // 下一天
    current.setDate(current.getDate() + 1);
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
  if (titleEl) titleEl.textContent = dateStr + ' ' + CONFIG.text.drawerTitle;
  const tasks = Store.getTasks().filter(t => (t.date || '').toString().slice(0, 10) === dateStr);
  bodyEl.innerHTML = '';
  if (tasks.length === 0) {
    bodyEl.innerHTML = '<p class="query-empty">' + CONFIG.text.emptyDay + '</p>';
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
    container.innerHTML = '<p class="query-empty">' + CONFIG.text.emptyQuery + '</p>';
    return;
  }
  const uncompleted = tasks.filter(t => !t.completed);
  const completed   = tasks.filter(t =>  t.completed);

  if (uncompleted.length > 0) {
    const g  = document.createElement('div');
    g.className = 'query-group';
    g.innerHTML = '<div class="query-group-title">' + CONFIG.text.queryGroupUndone + '</div>';
    const ul = document.createElement('ul');
    ul.className = 'task-list';
    uncompleted.forEach(t => ul.appendChild(createQueryTaskElement(t)));
    g.appendChild(ul);
    container.appendChild(g);
  }
  if (completed.length > 0) {
    const g  = document.createElement('div');
    g.className = 'query-group';
    g.innerHTML = '<div class="query-group-title">' + CONFIG.text.queryGroupDone + '</div>';
    const ul = document.createElement('ul');
    ul.className = 'task-list';
    completed.forEach(t => ul.appendChild(createQueryTaskElement(t, true)));
    g.appendChild(ul);
    container.appendChild(g);
  }
}

function createQueryTaskElement(t, isCompleted) {
  const nt = Store.normalizeTask(t);
  const li = createTaskElement(nt.text, nt.completed, nt.date, nt.id, { showCategoryBadge: true, category: nt.category });
  li.dataset.id = String(nt.id);

  // 复选框处理完成/撤销（与主列表逻辑一致）
  const checkbox = li.querySelector('.task-checkbox');
  if (checkbox) {
    checkbox.onclick = () => {
      if (li.classList.contains('completed')) {
        undoQueryTask(li);
      } else {
        completeQueryTask(li);
      }
    };
  }

  const editBtn = li.querySelector('.btn-edit');
  if (editBtn) editBtn.onclick = () => startEditQueryTask(li);

  const editSwipeBtn = li.querySelector('.btn-edit-swipe');
  if (editSwipeBtn) editSwipeBtn.onclick = () => { closeCurrentSwipe(); startEditQueryTask(li); };

  const deleteBtn = li.querySelector('.btn-delete');
  if (deleteBtn) deleteBtn.onclick = () => deleteQueryTask(li);

  return li;
}

function completeQueryTask(li) {
  Store.updateTask(li.dataset.id, { completed: true });
  li.classList.add('completed');
  const cb = li.querySelector('.task-checkbox');
  if (cb) cb.classList.add('checked');
  Api.debouncedSave();
  applyTasks(Store.getTasks());
  const state = getQueryState();
  if (state) runQuery(state.start, state.end);
  if (_drawerDate) refreshDrawerBody(_drawerDate);
}

function startEditQueryTask(li) {
  function afterSave() {
    const state = getQueryState();
    if (state) runQuery(state.start, state.end);
    if (_drawerDate) refreshDrawerBody(_drawerDate);
  }

  startEdit(li, {
    onBeforeSave: (el) => {
      const id      = el.dataset.id;
      const newText = el.querySelector('.task-text')?.textContent || '';
      const newDate = el.dataset.date || Store.todayStr();
      const mainLi  = taskListEl.querySelector(`li[data-id="${id}"]`)
        || doneListEl?.querySelector(`li[data-id="${id}"]`);
      if (mainLi) {
        mainLi.dataset.date = newDate;
        const t = mainLi.querySelector('.task-text');
        const d = mainLi.querySelector('.task-date');
        if (t) t.textContent = newText;
        if (d) d.textContent = newDate;
      }
    },
    onAfterSave: afterSave,
  });

  // 桌面端内联编辑：saveBtn 在 li 内，通过包装保证查询刷新
  const saveBtn = li.querySelector('.btn-save');
  if (saveBtn) {
    const origOnclick = saveBtn.onclick;
    saveBtn.onclick = async function () {
      if (origOnclick) await origOnclick.call(this);
      afterSave();
    };
  }
}

function deleteQueryTask(li) {
  const id = li.dataset.id;
  Store.removeTask(id);
  const mainLi = taskListEl.querySelector(`li[data-id="${id}"]`)
    || doneListEl?.querySelector(`li[data-id="${id}"]`);
  if (mainLi) mainLi.remove();
  Api.debouncedSave();
  li.remove();
  const state = getQueryState();
  if (state) runQuery(state.start, state.end);
  updateStats();
  renderHeatmap();
  if (_drawerDate) refreshDrawerBody(_drawerDate);
}

function undoQueryTask(li) {
  Store.updateTask(li.dataset.id, { completed: false });
  li.classList.remove('completed');
  const cb = li.querySelector('.task-checkbox');
  if (cb) cb.classList.remove('checked');
  Api.debouncedSave();
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
    resultEl.textContent = CONFIG.text.importSelectDocx;
    return;
  }
  resultEl.textContent = CONFIG.text.importLoading;
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
    resultEl.textContent = CONFIG.text.importFailed + (e.message || '解析错误');
  }
});

// ── localStorage 降级：加载 ──────────────────────────────────────────────────
function loadFromLocalStorage() {
  const tasks = Store.loadFromLocal();
  Store.setTasks(tasks || []);
  applyTasks(Store.getTasks());
  restoreAndRunQuery();
}

// ── 分类切换 Tab ──────────────────────────────────────────────────────────────
document.getElementById('category-tabs')?.addEventListener('click', function (e) {
  const tab = e.target.closest('.category-tab');
  if (!tab || tab.classList.contains('active')) return;
  const cat = tab.dataset.category;
  if (!Store.isValidCategory(cat)) return;

  this.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  Store.setCategory(cat);
  applyTasks(Store.getTasks());
});

// ── 设置面板 ────────────────────────────────────────────────────────────────
let _settingsDraft = null;

function openSettings() {
  const overlay = document.getElementById('settings-overlay');
  const drawer  = document.getElementById('settings-drawer');
  if (!overlay || !drawer) return;

  _settingsDraft = CONFIG.getEffective();
  renderSettingsBody();

  overlay.classList.add('open');
  drawer.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  drawer.setAttribute('aria-hidden', 'false');
}

function closeSettings() {
  const overlay = document.getElementById('settings-overlay');
  const drawer  = document.getElementById('settings-drawer');
  if (overlay) { overlay.classList.remove('open'); overlay.setAttribute('aria-hidden', 'true'); }
  if (drawer)  { drawer.classList.remove('open');  drawer.setAttribute('aria-hidden', 'true'); }
  _settingsDraft = null;
}

function renderSettingsBody() {
  const body = document.getElementById('settings-body');
  if (!body || !_settingsDraft) return;
  body.innerHTML = '';

  // --- 基础设置 ---
  const secBasic = createSettingsSection('基础设置');
  const apiField = createTextField('API Base URL', _settingsDraft.API_BASE_URL, 'url', (v) => {
    _settingsDraft.API_BASE_URL = v;
    const input = apiField.querySelector('input');
    if (input) input.style.borderColor = isValidURL(v) ? '' : '#ef5350';
  });
  secBasic.appendChild(apiField);
  body.appendChild(secBasic);

  // --- 主题色 ---
  const secTheme = createSettingsSection('主题色');
  const themeFields = [
    ['主色调 (Primary)', 'primary'],
    ['次色调 (Secondary)', 'secondary'],
  ];
  themeFields.forEach(([label, key]) => {
    secTheme.appendChild(createColorField(label, _settingsDraft.theme[key], (v) => {
      _settingsDraft.theme[key] = v;
      document.documentElement.style.setProperty('--c-' + key, v);
    }));
  });
  body.appendChild(secTheme);

  // --- 文案 ---
  const secText = createSettingsSection('文案自定义');
  const textFields = [
    ['页面标题', 'appTitle'],
    ['副标题', 'appSubtitle'],
  ];
  textFields.forEach(([label, key]) => {
    secText.appendChild(createTextField(label, _settingsDraft.text[key], 'text', (v) => {
      _settingsDraft.text[key] = v;
    }));
  });
  body.appendChild(secText);

  // --- 分类管理 ---
  const secCat = createSettingsSection('分类管理');
  const catList = document.createElement('div');
  catList.id = 'settings-cat-list';
  renderCategoryList(catList);
  secCat.appendChild(catList);

  const addBtn = document.createElement('button');
  addBtn.className = 'btn-cat-add';
  addBtn.textContent = '+ 添加新分类';
  addBtn.onclick = () => {
    const newKey = 'cat_' + Date.now();
    _settingsDraft.categories.push({ key: newKey, label: 'New', color: '#888888' });
    renderCategoryList(catList);
  };
  secCat.appendChild(addBtn);
  body.appendChild(secCat);
}

function renderCategoryList(container) {
  container.innerHTML = '';
  const tasks = Store.getTasks();
  _settingsDraft.categories.forEach((cat, i) => {
    const row = document.createElement('div');
    row.className = 'settings-cat-row';

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.value = cat.label;
    labelInput.oninput = () => { _settingsDraft.categories[i].label = labelInput.value; };

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = cssColorToHex(cat.color);
    colorInput.oninput = () => { _settingsDraft.categories[i].color = colorInput.value; };

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-cat-remove';
    removeBtn.innerHTML = '&times;';
    removeBtn.onclick = () => {
      const hasTasks = tasks.some(t => (t.category || 'self') === cat.key);
      if (hasTasks && !confirm('该分类下有任务数据，删除后这些任务将暂时无法显示。确定删除？')) return;
      _settingsDraft.categories.splice(i, 1);
      renderCategoryList(container);
    };

    row.appendChild(labelInput);
    row.appendChild(colorInput);
    row.appendChild(removeBtn);
    container.appendChild(row);
  });
}

function createSettingsSection(title) {
  const sec = document.createElement('div');
  sec.className = 'settings-section';
  const h = document.createElement('div');
  h.className = 'settings-section-title';
  h.textContent = title;
  sec.appendChild(h);
  return sec;
}

function createTextField(label, value, type, onChange) {
  const field = document.createElement('div');
  field.className = 'settings-field';
  const lbl = document.createElement('label');
  lbl.textContent = label;
  const input = document.createElement('input');
  input.type = type || 'text';
  input.value = value || '';
  input.oninput = () => onChange(input.value);
  field.appendChild(lbl);
  field.appendChild(input);
  return field;
}

function createColorField(label, value, onChange) {
  const field = document.createElement('div');
  field.className = 'settings-field';
  const lbl = document.createElement('label');
  lbl.textContent = label;
  const input = document.createElement('input');
  input.type = 'color';
  input.value = cssColorToHex(value);
  input.oninput = () => onChange(input.value);
  field.appendChild(lbl);
  field.appendChild(input);
  return field;
}

function cssColorToHex(color) {
  if (!color) return '#000000';
  if (color.startsWith('#') && (color.length === 7 || color.length === 4)) return color;
  const d = document.createElement('div');
  d.style.color = color;
  document.body.appendChild(d);
  const computed = getComputedStyle(d).color;
  document.body.removeChild(d);
  const m = computed.match(/(\d+)/g);
  if (!m || m.length < 3) return '#000000';
  return '#' + m.slice(0, 3).map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
}

function isValidURL(str) {
  if (!str || !str.trim()) return true;
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function saveSettings() {
  if (!_settingsDraft) return;
  if (!isValidURL(_settingsDraft.API_BASE_URL)) {
    alert('API Base URL 格式无效，请输入有效的 HTTP/HTTPS 地址');
    return;
  }
  CONFIG.saveUserOverrides(_settingsDraft);
  window.location.reload();
}

function resetSettings() {
  CONFIG.clearUserOverrides();
  window.location.reload();
}

document.getElementById('btn-settings')?.addEventListener('click', openSettings);
document.getElementById('settings-close')?.addEventListener('click', closeSettings);
document.getElementById('settings-overlay')?.addEventListener('click', closeSettings);
document.getElementById('settings-save')?.addEventListener('click', saveSettings);
document.getElementById('settings-reset')?.addEventListener('click', resetSettings);

// ── 配置应用：CSS 变量 + 文案 + 动态 DOM ────────────────────────────────────
function applyConfig() {
  if (typeof CONFIG === 'undefined') return;
  const r = document.documentElement.style;
  const t = CONFIG.theme;

  r.setProperty('--c-primary', t.primary);
  r.setProperty('--c-secondary', t.secondary);
  r.setProperty('--c-danger', t.danger);
  r.setProperty('--c-edit', t.edit);
  r.setProperty('--c-success', t.success);
  r.setProperty('--c-cancel', t.cancel);
  r.setProperty('--c-undo', t.undo);
  r.setProperty('--c-badge-bg', t.badgeBg);
  r.setProperty('--c-task-bg', t.taskBg);
  r.setProperty('--c-completed-bg', t.completedBg);
  r.setProperty('--c-text-muted', t.textMuted);
  r.setProperty('--c-checkbox-border', CONFIG.checkbox.border);
  r.setProperty('--c-checkbox-checked', CONFIG.checkbox.checked);
  r.setProperty('--c-edit-drawer-border', CONFIG.editDrawer.border);
  r.setProperty('--c-edit-drawer-focus', CONFIG.editDrawer.borderFocus);
  r.setProperty('--c-edit-drawer-save', CONFIG.editDrawer.saveBg);
  r.setProperty('--c-swipe-edit', CONFIG.swipeEditBg);
  CONFIG.heatmapLevels.forEach((c, i) => r.setProperty('--c-heatmap-' + i, c));

  const txt = CONFIG.text;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('appTitle', txt.appTitle);
  set('appSubtitle', txt.appSubtitle);
  set('motivationalQuote', txt.defaultQuote);
  set('statsHeading', txt.statsHeading);
  set('statTodayLabel', txt.statTodayLabel);
  set('todayTasksTitle', txt.todayTasksTitle);
  set('completedTitle', txt.completedTitle);
  set('queryTitle', txt.queryTitle);
  set('queryStartLabel', txt.queryStartLabel);
  set('queryEndLabel', txt.queryEndLabel);
  set('importTitle', txt.importTitle);
  set('editDrawerTitle', txt.editDrawerTitle);
  set('drawer-title', txt.drawerTitle);

  const btnAdd = document.getElementById('btn-add');
  if (btnAdd) btnAdd.textContent = txt.addBtnLabel;
  const btnQuery = document.getElementById('btn-query');
  if (btnQuery) btnQuery.textContent = txt.queryBtnLabel;
  const btnImport = document.getElementById('btn-import');
  if (btnImport) btnImport.textContent = txt.importBtnLabel;
  const inputEl = document.getElementById('task-input');
  if (inputEl) inputEl.placeholder = txt.inputPlaceholder;
  const editText = document.getElementById('edit-drawer-text');
  if (editText) editText.placeholder = txt.editPlaceholder;
  const editSave = document.getElementById('edit-drawer-save');
  if (editSave) editSave.textContent = txt.editSaveLabel;
  const editCancel = document.getElementById('edit-drawer-cancel');
  if (editCancel) editCancel.textContent = txt.editCancelLabel;

  // 动态生成分类 Tab
  const tabsEl = document.getElementById('category-tabs');
  if (tabsEl) {
    tabsEl.innerHTML = '';
    CONFIG.categories.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'category-tab' + (cat.key === CONFIG.DEFAULT_CATEGORY ? ' active' : '');
      btn.dataset.category = cat.key;
      btn.textContent = cat.label;
      tabsEl.appendChild(btn);
    });
  }

  // 动态生成编辑弹窗分类选项
  const catSelect = document.getElementById('edit-drawer-category');
  if (catSelect) {
    catSelect.innerHTML = '';
    CONFIG.categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.key;
      opt.textContent = cat.label;
      catSelect.appendChild(opt);
    });
  }
}

// ── 初始化 ───────────────────────────────────────────────────────────────────
function init() {
  applyConfig();

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
  if (el1) el1.textContent = CONFIG.text.statCompletedTpl.replace('{year}', y);
  if (el2) el2.textContent = CONFIG.text.statRateTpl.replace('{year}', y);

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
