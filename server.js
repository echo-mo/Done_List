const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const DATA_FILE = path.join(__dirname, 'tasks.json');
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
// 如果存在前端静态文件目录，作为静态资源提供（方便将前后端部署到同一应用）
const staticDir = path.join(__dirname, 'my_vibe_html');
if (fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
}

// 读取存储文件（如果不存在则返回空数组）
function readTasks() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (err) {
    console.error('readTasks error', err);
    return [];
  }
}

// 写入存储文件（覆盖）
function writeTasks(tasks) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(tasks, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('writeTasks error', err);
    return false;
  }
}

// GET 返回当前任务数组
app.get('/api/tasks', (req, res) => {
  const tasks = readTasks();
  res.json(tasks);
});

// PUT 用于替换整个任务数组（前端可在每次变更时上传整个数组）
app.put('/api/tasks', (req, res) => {
  const tasks = req.body;
  if (!Array.isArray(tasks)) return res.status(400).json({ error: 'expected array' });
  const ok = writeTasks(tasks);
  if (!ok) return res.status(500).json({ error: 'failed to write' });
  res.json({ success: true });
});

// 简单健康检查
app.get('/health', (req, res) => res.send('ok'));

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
