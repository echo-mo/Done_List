部署说明 — 将此项目部署到 Zeabur（快速指南）

项目结构说明

- `server.js`：Node.js/Express 后端，暴露 `GET /api/tasks` 与 `PUT /api/tasks` 接口，并在根目录下提供静态文件（当 `my_vibe_html` 存在时）。
- `my_vibe_html/index.html`：前端单文件应用，已支持本地 `localStorage` 与可选远端 API（配置 `API_BASE`）。
- `Dockerfile`：用于在 Zeabur 或任何 Docker 平台上运行。
- `package.json`：依赖与启动脚本。

快速部署（推荐：使用 GitHub + Zeabur）

1. 将当前 repo 推到 GitHub：

```powershell
git init
git add .
git commit -m "todo app with backend"
git branch -M main
# 将远程替换为你的 GitHub 仓库地址
git remote add origin https://github.com/<yourname>/<repo>.git
git push -u origin main
```

2. 在 Zeabur 控制台创建应用：
- 登录 Zeabur。
- 新建应用（Create App），连接到你的 GitHub 仓库并选择 `main` 分支。
- Zeabur 会检测 `Dockerfile` 并使用它构建镜像；如果未检测到，可在部署设置中手动选择 Dockerfile。
- 设置环境变量 `PORT`（可选，默认为 3000）。

3. 构建并部署：
- 提交后，Zeabur 会自动构建并部署应用，部署成功后你将获得一个子域名（例如 `https://your-app.zeabur.app`）。

4. 前端配置：
- 打开 `my_vibe_html/index.html`，将顶部脚本的 `API_BASE` 设置为你的 Zeabur 域名，例如：

```js
const API_BASE = 'https://your-app.zeabur.app';
```

- 重新部署（提交并 push 到 GitHub），或者如果你在同一个应用里托管静态文件（如本 repo），无需修改 `API_BASE`，因为静态文件会和后端在同一域名下工作。

注意事项

- Zeabur 的免费层可能会有运行时间或资源限制，部署前请查看 Zeabur 的当前免费政策。对于生产或高流量使用请考虑付费计划或外部数据库。
- `tasks.json` 存储在容器文件系统中：某些平台的容器是短暂的（重启或重新部署时文件可能丢失）。若需要持久化请使用外部数据库或挂载卷（Zeabur 支持卷/数据库时可配置）。

如果你希望，我可以：
- 直接替你把代码推到 GitHub（需要你的授权/仓库信息），并给出在 Zeabur 的具体创建步骤；
- 或者把 `API_BASE` 自动设置为你现有的 `willah.zeabur.app` 并生成部署建议；
- 或者改为使用 Firebase（免运维的跨设备同步）。
