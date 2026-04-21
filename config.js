/**
 * config.js — 全局配置（纯数据定义，不含任何 UI/DOM/网络操作）
 * 职责：集中管理所有可定制参数，供 store / api / ui 各层引用。
 * 约束：本文件必须最先加载；仅暴露 CONFIG 全局对象。
 *
 * 双层覆盖机制：
 *   1. _defaults 定义代码内置默认值
 *   2. localStorage('done_list_config') 存储用户自定义覆盖
 *   3. 运行时 CONFIG 读取合并后的生效值
 *
 * 自定义指南：
 *   - 修改 appTitle / appSubtitle 可替换为你自己的品牌名
 *   - 修改 categories 可自定义任务分类（key/label/color）
 *   - 修改 theme 可调整全局配色方案
 *   - 也可以在部署后通过 Settings 面板在线修改（无需改代码）
 */
const CONFIG = (() => {

  const CONFIG_STORAGE_KEY = 'done_list_config';

  // ── 内置默认值（按需修改为你自己的配置）────────────────────────────────────
  const _defaults = {
    categories: [
      { key: 'work',     label: 'Work',     color: 'hsl(220,60%,65%)' },
      { key: 'personal', label: 'Personal', color: 'hsl(255,60%,65%)' },
      { key: 'health',   label: 'Health',   color: 'hsl(150,45%,55%)' },
    ],
    DEFAULT_CATEGORY: 'personal',
    theme: {
      primary:     '#667eea',
      secondary:   '#764ba2',
      danger:      '#ef5350',
      edit:        '#42a5f5',
      success:     '#66bb6a',
      cancel:      '#b0bec5',
      undo:        '#ffa726',
      badgeBg:     'rgba(102,126,234,0.15)',
      taskBg:      'hsl(255,35%,95%)',
      completedBg: '#f5f5f5',
      textMuted:   '#666',
    },
    heatmapLevels: [
      'hsl(255,35%,95%)',
      'hsl(255,48%,84%)',
      'hsl(255,60%,72%)',
      'hsl(255,68%,61%)',
      'hsl(255,74%,52%)',
    ],
    checkbox: {
      border:  'hsl(252,74%,52%)',
      checked: 'hsl(252,74%,52%)',
    },
    editDrawer: {
      border:      'hsl(255,50%,85%)',
      borderFocus: 'hsl(255,74%,52%)',
      saveBg:      'hsl(255,74%,52%)',
    },
    swipeEditBg: 'hsl(255,74%,52%)',
    API_BASE_URL: (typeof location !== 'undefined' && location.origin) ? location.origin : '',
    SYNC_INTERVAL_MS: 15000,
    REQUEST_TIMEOUT:  10000,
    text: {
      appTitle:         'My Done List',
      appSubtitle:      'Dream big, act daily, get things done.',
      defaultQuote:     '"The secret of getting ahead is getting started." - Mark Twain',
      statsHeading:     'Task Overview',
      statTodayLabel:   "Today's Tasks",
      statCompletedTpl: "{year}'s Completed Tasks",
      statRateTpl:      "{year}'s Execution",
      todayTasksTitle:  "Today's Tasks",
      completedTitle:   "Today's Completed Tasks",
      queryTitle:       'Task Query',
      importTitle:      'Import History',
      inputPlaceholder: 'Add a new task',
      addBtnLabel:      'Add',
      queryBtnLabel:    'Query',
      importBtnLabel:   'Import',
      queryStartLabel:  'Start Date',
      queryEndLabel:    'End Date',
      drawerTitle:      'Tasks',
      editDrawerTitle:  'Edit Task',
      editPlaceholder:  'Task content',
      editSaveLabel:    'Save',
      editCancelLabel:  'Cancel',
      duplicateAlert:   'A task with the same name already exists on this date',
      saveFailed:       'Save failed: ',
      emptyQuery:       'No matching tasks found',
      emptyDay:         'No tasks for this day',
      queryGroupDone:   'Completed',
      queryGroupUndone: 'Incomplete',
      importSelectDocx: 'Please select a .docx file',
      importLoading:    'Importing...',
      importFailed:     'Import failed: ',
    },
  };

  // ── 深合并工具 ────────────────────────────────────────────────────────────
  function deepMerge(base, override) {
    if (!override || typeof override !== 'object') return base;
    const result = Array.isArray(base) ? [...base] : { ...base };
    for (const k of Object.keys(override)) {
      if (override[k] !== null && typeof override[k] === 'object' && !Array.isArray(override[k])
          && typeof result[k] === 'object' && !Array.isArray(result[k])) {
        result[k] = deepMerge(result[k], override[k]);
      } else {
        result[k] = override[k];
      }
    }
    return result;
  }

  // ── 从 localStorage 加载用户覆盖 ─────────────────────────────────────────
  function loadUserOverrides() {
    try {
      const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveUserOverrides(overrides) {
    try {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(overrides));
    } catch (e) {
      console.warn('config save failed:', e);
    }
  }

  function clearUserOverrides() {
    try {
      localStorage.removeItem(CONFIG_STORAGE_KEY);
    } catch (e) {}
  }

  // ── 合并生效配置 ──────────────────────────────────────────────────────────
  const userOverrides = loadUserOverrides();
  const _effective = userOverrides ? deepMerge(_defaults, userOverrides) : { ..._defaults };

  if (userOverrides && Array.isArray(userOverrides.categories)) {
    _effective.categories = userOverrides.categories;
  }

  // ── 公开接口 ──────────────────────────────────────────────────────────────
  return {
    get categories()      { return _effective.categories; },
    get DEFAULT_CATEGORY() { return _effective.DEFAULT_CATEGORY; },
    get theme()           { return _effective.theme; },
    get heatmapLevels()   { return _effective.heatmapLevels; },
    get checkbox()        { return _effective.checkbox; },
    get editDrawer()      { return _effective.editDrawer; },
    get swipeEditBg()     { return _effective.swipeEditBg; },
    get API_BASE_URL()    { return _effective.API_BASE_URL; },
    get SYNC_INTERVAL_MS(){ return _effective.SYNC_INTERVAL_MS; },
    get REQUEST_TIMEOUT() { return _effective.REQUEST_TIMEOUT; },
    get text()            { return _effective.text; },

    getCategoryKeys:  () => _effective.categories.map(c => c.key),
    getCategoryLabel: (key) => (_effective.categories.find(c => c.key === key) || {}).label || key,
    getCategoryColor: (key) => (_effective.categories.find(c => c.key === key) || {}).color || _effective.theme.primary,
    isValidCategory:  (key) => _effective.categories.some(c => c.key === key),

    getDefaults:        () => JSON.parse(JSON.stringify(_defaults)),
    getEffective:       () => JSON.parse(JSON.stringify(_effective)),
    hasUserOverrides:   () => !!userOverrides,
    saveUserOverrides,
    clearUserOverrides,
  };
})();
