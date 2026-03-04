# Willah's Done List

> Dream big, act daily, get things done.

一个跨设备任务清单 Web 应用，支持多端实时同步、历史记录查询与 .docx 批量导入。

---

## 技术栈

| 层次 | 技术 |
|---|---|
| 前端 | 原生 HTML5 / CSS3 / JavaScript（ES2020+），无框架 |
| 后端 | Node.js 18 + Express 4 |
| 数据库 | MongoDB（生产）/ `storage.json`（本地降级） |
| 部署 | Zeabur（Docker 容器化） |
| 依赖 | `cors`、`mongodb`、`express`；前端额外引入 JSZip CDN |

---

## 项目结构

```
.
├── index.html          # 纯 HTML/CSS 骨架（无内联 JS）
├── store.js            # 状态管理层：任务缓存、编辑状态标志、纯数据操作
├── api.js              # 网络请求层：request 工具、加载/保存/轮询
├── ui.js               # DOM 渲染 & 事件代理层：所有用户交互
├── server.js           # Express 后端：统一 BizCode 响应 + 存储路由
├── Dockerfile          # 容器镜像定义
├── package.json        # Node.js 依赖与启动脚本
├── DATA_DICTIONARY.md  # 核心数据字典（字段语义 ID、BizCode 枚举）
├── ARCHITECTURE.md     # 架构文档（Mermaid 依赖图、分层规范）
└── storage.json        # 本地文件存储（无 MongoDB 时自动生成，不提交 git）
```

---

## 本地启动

**前提条件**：Node.js ≥ 16

```bash
# 1. 安装依赖
npm install

# 2. 启动服务（默认端口 3000）
npm start
# 或
node server.js

# 3. 打开浏览器访问
open http://localhost:3000
```

启动后若未配置 `MONGODB_URI`，数据将自动持久化到 `storage.json`（本地文件降级模式）。

---

## 环境变量

| 变量名 | 必填 | 说明 |
|---|---|---|
| `PORT` | 否 | 监听端口，默认 `3000`；Zeabur 自动注入 |
| `MONGODB_URI` | 否（生产建议配置） | MongoDB 连接字符串，格式 `mongodb+srv://...`；不配置则使用本地文件存储 |

---

## Zeabur 部署指南

### 1. 推送代码到 GitHub

```bash
git add .
git commit -m "feat: refactored architecture"
git push origin main
```

### 2. 在 Zeabur 创建服务

1. 登录 [Zeabur 控制台](https://zeabur.com)
2. 新建 Project → Add Service → GitHub 仓库 → 选择 `main` 分支
3. Zeabur 会自动检测 `Dockerfile` 并完成构建

### 3. 配置 MongoDB

1. 在同一 Project 中点击 **Add Service → Marketplace → MongoDB**
2. Zeabur 会自动将 `MONGODB_URI` 注入到你的服务环境变量中，无需手动复制

> **注意**：若未挂载 MongoDB，容器重启后 `storage.json` 文件将丢失。生产环境务必配置 MongoDB。

### 4. 验证部署

- 健康检查：`GET https://<your-app>.zeabur.app/health` → 返回 `ok`
- 存储状态：`GET https://<your-app>.zeabur.app/api/storage/status` → 返回 `{ code:0, data:{ storage:'MongoDB', mongodbConnected:true } }`

---

## API 概览

所有接口（`/health` 除外）返回统一结构 `{ code, message, data }`。

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/health` | 健康检查，返回纯文本 `ok` |
| `GET` | `/api/storage?key=todoList` | 读取全量任务列表 |
| `POST` | `/api/storage` | 保存任务列表 |
| `GET` | `/api/storage/status` | 查看存储后端状态 |

完整 BizCode 枚举见 [`DATA_DICTIONARY.md`](./DATA_DICTIONARY.md)。
