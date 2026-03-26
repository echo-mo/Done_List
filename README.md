# Done List

> Dream big, act daily, get things done.

跨设备任务清单 Web 应用，支持多端实时同步、历史记录查询与 .docx 批量导入。

---

## 三种使用方式（从易到难）

| 方式 | 说明 | 数据是否在手机与电脑之间互通 |
|------|------|------------------------------|
| **① 本地使用** | 只在电脑上运行，浏览器访问本机地址 | 不涉及手机，仅本机一份数据 |
| **② 部署到云端，手机与电脑分开存储** | 手机访问云端网址；电脑仍用本地运行（或云端未接数据库） | **不互通**：各端各自一套数据 |
| **③ 手机与电脑共享数据** | 云端部署并连接 **MongoDB**，多端访问**同一**服务地址 | **互通**：同一套任务列表 |

下文对三种方式分别用二级标题展开；其他章节里仍会标注 **【方式①】** **【方式②】** **【方式③】** 以便对照。

---

## 前置要求

- **Node.js 16+**：从 [nodejs.org](https://nodejs.org/) 下载 LTS 版本安装，npm 随附安装，无需单独配置。
- **数据存储**：
  - 不配数据库时：默认本机 `storage.json`（**【方式①】**），或云端容器内文件（**【方式②】**，容器重启可能丢失）。
  - 配置 MongoDB：数据在云端数据库（**【方式③】**）。

---

## 方式① 本地使用

**【方式①】** · **【方式②】** 中「电脑端本地运行」与此相同 · **【方式③】** 开发调试时也可先用本地

```bash
# 1. 安装依赖
npm install

# 2. （可选）配置环境变量；不配则使用本机 storage.json
#    【方式①②】不配 MONGODB_URI 时即为本机/分端文件存储
#    【方式③】若本地要连云端库，在 .env 中填写 MONGODB_URI
cp .env.example .env   # Windows: copy .env.example .env

# 3. 启动服务
npm start

# 4. 浏览器访问
open http://localhost:3000   # Windows: start http://localhost:3000
```

启动成功后终端会显示类似 `listening on port 3000` 的提示。**保持终端窗口开启**，关闭即停止服务。

停止服务：在终端按 `Ctrl+C`。

---

## 方式② 部署到云端，手机与电脑分开存储

目标：手机通过 **HTTPS 公网地址**使用；电脑继续用 [方式①](#方式①-本地使用) 中的 **`http://localhost:3000`**。两端**不共用数据库**，任务列表**互不同步**。

1. 将代码推送到 **自己的** GitHub。
2. 在 [Zeabur 控制台](https://zeabur.com) 新建 Project → Add Service → 选择 GitHub 仓库（`main` 分支）。
3. Zeabur 会自动识别 `Dockerfile` 并构建部署，显示「正在运行」后，用手机浏览器打开 **`https://你的应用名.zeabur.app`**。
4. **不要**在同一 Project 里添加 MongoDB（或不为该 Web 服务配置 `MONGODB_URI`），则云端数据落在容器内 `storage.json`，与电脑本地文件**相互独立**。
5. 电脑端仍按 [方式①](#方式①-本地使用) 启动，访问 `localhost` —— 与手机上的云端数据**分开存储**。

> **注意**：不配置 MongoDB 时，容器重启可能导致云端那份 `storage.json` 丢失。**【方式②】** 接受各端数据独立；需要持久、多端一致请升级到 **【方式③】**。

验证部署：访问 `https://你的应用名.zeabur.app/health`，返回 `ok` 表示服务正常。

---

## 方式③ 手机与电脑共享数据

目标：手机与电脑访问**同一个**部署地址，任务**实时共用**同一后端存储。需要 **MongoDB**。

1. 完成 **【方式②】** 中步骤 1～2，云端应用已能访问。
2. 在同一 Zeabur Project 中：**Add Service → Marketplace → MongoDB**，创建数据库；平台会把 **`MONGODB_URI`** 注入到你的 Web 服务（或按控制台说明手动绑定环境变量）。
3. 确认 Web 服务环境变量里 **`MONGODB_URI` 已生效**（可访问 `/api/storage/status`，`storage` 为 `MongoDB` 且 `mongodbConnected` 为 `true`）。
4. **手机**：浏览器打开 `https://你的应用名.zeabur.app`。  
   **电脑**：同样使用该 HTTPS 地址（或本地开发时 `.env` 指向**同一** `MONGODB_URI`，与云端共库）。
5. 任一端增删改任务，另一端刷新后即可看到**同一套数据**。

> **注意**：生产环境务必配置 MongoDB，否则仅靠容器内文件无法可靠多端同步。

---

## 项目结构

```
.
├── index.html          # 页面结构与样式
├── store.js            # 内存数据管理
├── api.js              # 客户端请求封装
├── ui.js               # 交互逻辑与 DOM 更新
├── server.js           # 服务端路由与存储读写
├── Dockerfile          # 容器化配置
├── package.json        # 依赖与启动脚本
├── DATA_DICTIONARY.md  # 数据字段说明
├── ARCHITECTURE.md     # 架构说明
└── storage.json        # 本地数据文件（自动生成）
```

---

## 环境变量

将 `.env.example` 复制为 `.env` 并按需填写。

| 变量 | 必填 | 说明 |
|------|------|------|
| `PORT` | 否 | 监听端口，默认 `3000` |
| `MONGODB_URI` | 否 | **【方式①②】** 不填 → 本机或容器内 `storage.json`。**【方式③】** 填 MongoDB 连接串 → 多端共享 |

**不配置 `MONGODB_URI` 也可运行**；是否与手机同步取决于你是否部署云端并共库（见上文三种方式）。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | 原生 HTML / CSS / JavaScript，JSZip 处理压缩包 |
| 后端 | Node.js + Express |
| 存储 | MongoDB（云端）或 `storage.json`（本机 / 容器） |
| 部署 | Docker / Zeabur |

---

## API 接口

所有接口（除 `/health`）均返回 `{ code, message, data }`，成功时 `code` 为 `0`。错误码定义见 [`DATA_DICTIONARY.md`](./DATA_DICTIONARY.md)。

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/health` | 健康检查，返回 `ok` |
| `GET` | `/api/storage?key=todoList` | 读取任务列表 |
| `POST` | `/api/storage` | 保存任务数据 |
| `GET` | `/api/storage/status` | **【方式③】** 可用来确认是否为 MongoDB、是否已连接 |
