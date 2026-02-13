const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const STORAGE_FILE = path.join(__dirname, 'storage.json');
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
const staticDir = __dirname;
if (fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
  app.get('/', (req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'), err => {
      if (err) res.status(500).send('Server error');
    });
  });
  console.log('Serving static files from', staticDir);
}

// localStorage 风格存储：key-value 持久化到 storage.json
function readStorage() {
  try {
    if (!fs.existsSync(STORAGE_FILE)) return {};
    const raw = fs.readFileSync(STORAGE_FILE, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (err) {
    console.error('readStorage error', err);
    return {};
  }
}

function writeStorage(data) {
  try {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('writeStorage error', err);
    return false;
  }
}

// 1. 获取：GET /api/storage 或 GET /api/storage?key=xxx
app.get('/api/storage', (req, res) => {
  const store = readStorage();
  const key = req.query.key;
  if (key !== undefined && key !== '') {
    if (!(key in store)) return res.status(404).json({ error: 'key not found' });
    return res.json({ key, value: store[key] });
  }
  res.json(store);
});

// 2. 设置：POST /api/storage  body: { key, value }
app.post('/api/storage', (req, res) => {
  const { key, value } = req.body;
  if (key === undefined || key === '') return res.status(400).json({ error: 'key required' });
  const store = readStorage();
  store[key] = value;
  if (!writeStorage(store)) return res.status(500).json({ error: 'failed to write' });
  res.json({ success: true });
});

// 3. 删除：DELETE /api/storage?key=xxx
app.delete('/api/storage', (req, res) => {
  const key = req.query.key;
  if (key === undefined || key === '') {
    // 4. 清空：DELETE /api/storage（无 key）
    if (!writeStorage({})) return res.status(500).json({ error: 'failed to write' });
    return res.json({ success: true });
  }
  const store = readStorage();
  if (!(key in store)) return res.status(404).json({ error: 'key not found' });
  delete store[key];
  if (!writeStorage(store)) return res.status(500).json({ error: 'failed to write' });
  res.json({ success: true });
});

app.get('/health', (req, res) => res.send('ok'));

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
