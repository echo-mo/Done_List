# 核心数据字典

> 项目：Done List  
> 版本：v3.0  
> 更新：2026-04-21

---

## 实体一：Task（任务）

数据库路径：`storage.data.todoList[]`

| 字段名 | 语义 ID | 数据类型 | 必填 | 约束 | 描述 |
|---|---|---|---|---|---|
| `id` | `TASK-001` | number | 是 | 全局唯一，前端 `Date.now()` 生成 | 任务唯一标识符 |
| `text` | `TASK-002` | string | 是 | 非空，与 `date`、`category` 联合唯一 | 任务内容文本 |
| `completed` | `TASK-003` | boolean | 是 | `false`=未完成，`true`=已完成 | 任务完成状态 |
| `date` | `TASK-004` | string (YYYY-MM-DD) | 是 | 与 `text`、`category` 联合唯一 | 任务日期（不区分创建与完成日期） |
| `category` | `TASK-005` | string | 是 | 可选值由 `CONFIG.categories` 定义，默认 `CONFIG.DEFAULT_CATEGORY`（`"self"`） | 任务分类窗口 |

**去重规则**：`(TASK-004, TASK-002, TASK-005)` 组合在全量数据集中唯一。

---

## 实体二：StorageDocument（MongoDB 存储文档）

集合：`done_list_db.storage`

| 字段名 | 语义 ID | 数据类型 | 描述 |
|---|---|---|---|
| `_id` | `STORE-001` | string | 文档唯一标识，固定值 `'store'`，整库只有一条 |
| `data` | `STORE-002` | object | 键值对容器，所有业务数据挂载于此 |
| `data.todoList` | `STORE-003` | Task[] | 全量任务列表（`TASK-001~005` 的对象数组） |

---

## 实体三：ApiResponse（统一接口响应）

所有 REST 接口（`/health` 除外）均返回此结构。

| 字段名 | 语义 ID | 数据类型 | 描述 |
|---|---|---|---|
| `code` | `API-001` | number | 业务状态码，`0` = 成功，非零 = 各类错误 |
| `message` | `API-002` | string | 面向前端/用户的可读提示文本 |
| `data` | `API-003` | any \| null | 成功时的核心数据载荷，失败时为 `null` |

---

## 业务状态码枚举（BizCode）

| 状态码 | 常量名 | HTTP 状态 | 含义 |
|---|---|---|---|
| `0` | `SUCCESS` | 200 | 操作成功 |
| `1001` | `KEY_REQUIRED` | 400 | 请求参数 `key` 缺失或为空 |
| `1002` | `KEY_NOT_FOUND` | 404 | 指定的 `key` 在存储中不存在 |
| `1003` | `STORAGE_WRITE_FAILED` | 500 | 存储写入失败（MongoDB 与文件均失败） |
| `1004` | `STORAGE_READ_FAILED` | 500 | 存储读取失败（保留，暂未启用） |
| `2001` | `DUPLICATE_TASK` | 400 | 同日期同分类下已存在同名任务（(date, text, category) 重复） |
| `5000` | `INTERNAL_ERROR` | 500 | 未捕获的内部异常兜底 |

---

## API 接口一览

| 方法 | 路径 | 成功 data | 常见错误码 |
|---|---|---|---|
| `GET` | `/api/storage?key=todoList` | `{ key, value: Task[] }` | 1002 |
| `POST` | `/api/storage` | `null` | 1001, 2001, 1003 |
| `DELETE` | `/api/storage?key=xxx` | `null` | 1002, 1003 |
| `GET` | `/api/storage/status` | `{ storage, mongodbConnected, taskCount, ... }` | — |
| `GET` | `/health` | 纯文本 `ok`（供 Zeabur 健康检查） | — |

---

## 实体四：CONFIG（全局配置对象）

文件路径：`config.js`，通过 `CONFIG` 全局对象暴露。

| 字段名 | 语义 ID | 数据类型 | 描述 |
|---|---|---|---|
| `categories` | `CFG-001` | Array<{key, label, color}> | 分类定义列表，驱动 Tab Bar / 编辑选择器 / 已完成分组 |
| `DEFAULT_CATEGORY` | `CFG-002` | string | 默认激活分类的 key |
| `theme` | `CFG-003` | object | 主题色集合（primary / secondary / danger / edit / success / cancel / undo 等） |
| `heatmapLevels` | `CFG-004` | string[5] | 热力图 5 级色阶数组（HSL 字符串） |
| `API_BASE_URL` | `CFG-005` | string | 后端 API 基准地址 |
| `SYNC_INTERVAL_MS` | `CFG-006` | number | 多端同步轮询间隔（毫秒） |
| `text` | `CFG-007` | object | 全部 UI 文案（标题、按钮、提示语、占位符等） |

**辅助函数**：

| 函数 | 返回值 | 描述 |
|---|---|---|
| `getCategoryKeys()` | `string[]` | 返回所有分类 key 的数组 |
| `getCategoryLabel(key)` | `string` | 根据 key 返回分类显示名称 |
| `getCategoryColor(key)` | `string` | 根据 key 返回分类专属色 |
| `isValidCategory(key)` | `boolean` | 校验 key 是否为合法分类 |
