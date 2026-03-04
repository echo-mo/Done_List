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

  const deleteBtn       = document.createElement('button');
  deleteBtn.type        = 'button';
  deleteBtn.className   = 'btn-delete';
  deleteBtn.textContent = 'Delete';

  actions.appendChild(completeBtn);
  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);
  li.appendChild(content);
  li.appendChild(actions);
  return li;
}

// 将 actions 替换为「已完成」按钮组（Undo / Edit / Delete）
function setCompletedActions(actions) {
  actions.innerHTML = '';
  [['btn-undo', 'Undo'], ['btn-edit', 'Edit'], ['btn-delete', 'Delete']].forEach(([cls, label]) => {
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
      const textEl = li.querySelector('.task-text');
      if (textEl) textEl.style.textDecoration = 'line-through';
      const actions = li.querySelector('.actions');
      if (actions) setCompletedActions(actions);
      doneListEl.appendChild(li);
    } else if (!nt.completed) {
      taskListEl.appendChild(li);
    }
  });

  updateStats();
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
  const textEl  = li.querySelector('.task-text');
  const content = li.querySelector('.task-content');
  const actions = li.querySelector('.actions');
  if (!content || !actions) return;

  const currentText  = textEl ? textEl.textContent : '';
  const currentDate  = li.dataset.date || Store.todayStr();
  const onBeforeSave = opts?.onBeforeSave;

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
    li.removeChild(wrap);
    li.appendChild(actions);

    Store.clearEditing(); // ✅ 保存完成后清除编辑标志

    if (onBeforeSave) onBeforeSave(li);
    if (Api.API_BASE) await Api.saveTasksToServer().catch(err => alert('保存失败：' + err.message));
    else Store.saveToLocal();
    updateStats();
  };

  cancelBtn.onclick = function () {
    content.style.display = '';
    li.removeChild(wrap);
    li.appendChild(actions);
    Store.clearEditing(); // ✅ 取消时同样清除编辑标志
  };

  btnWrap.appendChild(saveBtn);
  btnWrap.appendChild(cancelBtn);
  wrap.appendChild(inputText);
  wrap.appendChild(inputDate);
  wrap.appendChild(btnWrap);
  content.style.display = 'none';
  li.appendChild(wrap);
  li.removeChild(actions);
  inputText.focus();
}

// ── 事件代理：主任务列表（删除 / 完成 / 编辑）──────────────────────────────
taskListEl.addEventListener('click', async function (e) {
  const target = e.target;

  if (target.classList.contains('btn-delete')) {
    const li = target.closest('li.task');
    if (li) {
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
      const textEl = li.querySelector('.task-text');
      if (textEl) textEl.style.textDecoration = 'line-through';
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
      Store.removeTask(li.dataset.id);
      doneListEl.removeChild(li);
      if (Api.API_BASE) await Api.saveTasksToServer().catch(err => alert('保存失败：' + err.message));
      else Store.saveToLocal();
      updateStats();
    }
  });
}

// ── 查询 ─────────────────────────────────────────────────────────────────────
function runQuery(startDate, endDate) {
  const start = startDate || '';
  const end   = endDate   || '';
  const today = Store.todayStr();
  const tasks = Store.getTasks().filter(t => {
    const d = (t.date || '').toString().slice(0, 10);
    if (d >= today) return false;
    if (!start && !end) return true;
    if (start && end)  return d >= start && d <= end;
    if (start)         return d >= start;
    return d <= end;
  });
  renderQueryResults(tasks);
  try {
    sessionStorage.setItem(QUERY_STORAGE_KEY, JSON.stringify({ start, end, tasks }));
  } catch (e) {}
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

  const deleteBtn       = document.createElement('button');
  deleteBtn.type        = 'button';
  deleteBtn.className   = 'btn-delete';
  deleteBtn.textContent = 'Delete';

  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);
  editBtn.onclick   = () => startEditQueryTask(li);
  deleteBtn.onclick = () => deleteQueryTask(li);
  return li;
}

function completeQueryTask(li) {
  Store.updateTask(li.dataset.id, { completed: true });
  if (Api.API_BASE) Api.saveTasksToServer().catch(err => alert('保存失败：' + err.message));
  else Store.saveToLocal();
  applyTasks(Store.getTasks());
  const state = getQueryState();
  if (state) runQuery(state.start, state.end);
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
}

function undoQueryTask(li) {
  Store.updateTask(li.dataset.id, { completed: false });
  if (Api.API_BASE) Api.saveTasksToServer().catch(err => alert('保存失败：' + err.message));
  else Store.saveToLocal();
  applyTasks(Store.getTasks());
  const state = getQueryState();
  if (state) runQuery(state.start, state.end);
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
