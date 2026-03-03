const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const AdmZip = require('adm-zip');
const { MongoClient } = require('mongodb');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const app = express();
const STORAGE_FILE = path.join(__dirname, 'storage.json');
// Zeabur injects PORT; set MONGODB_URI in Zeabur env vars for persistent storage
const PORT = process.env.PORT || 3000;
const RAW_URI = (process.env.MONGODB_URI || '').trim().replace(/^["']|["']$/g, '');
const MONGODB_URI = /^mongodb(\+srv)?:\/\//i.test(RAW_URI) ? RAW_URI : '';
const DB_NAME = 'willah_db';
const COLLECTION = 'storage';

let db = null;
let mongoFailed = false;

async function getDb() {
  if (db) return db;
  if (!MONGODB_URI || mongoFailed) return null;
  try {
    const client = await MongoClient.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000
    });
    db = client.db(DB_NAME);
    console.log('MongoDB connected');
    return db;
  } catch (err) {
    console.error('MongoDB connection failed, using file storage:', err.message);
    console.error('MongoDB full error:', err.toString());
    mongoFailed = true;
    return null;
  }
}

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

function readStorageFile() {
  try {
    if (!fs.existsSync(STORAGE_FILE)) return {};
    const raw = fs.readFileSync(STORAGE_FILE, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (err) {
    console.error('readStorage error', err);
    return {};
  }
}

function writeStorageFile(data) {
  try {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('writeStorage error', err);
    return false;
  }
}

async function readStorage() {
  const database = await getDb();
  if (!database) return readStorageFile();
  try {
    const col = database.collection(COLLECTION);
    const doc = await col.findOne({ _id: 'store' });
    return doc ? doc.data : {};
  } catch (err) {
    console.error('Mongo readStorage error', err);
    return {};
  }
}

async function writeStorage(data) {
  const database = await getDb();
  if (!database) return writeStorageFile(data);
  try {
    const col = database.collection(COLLECTION);
    await col.updateOne(
      { _id: 'store' },
      { $set: { data } },
      { upsert: true }
    );
    return true;
  } catch (err) {
    console.error('Mongo writeStorage error', err);
    return false;
  }
}

app.get('/api/storage/status', async (req, res) => {
  const db = await getDb();
  const store = await readStorage();
  const taskCount = Array.isArray(store.todoList) ? store.todoList.length : 0;
  const hasUri = !!(process.env.MONGODB_URI || '').trim();
  const uriValid = /^mongodb(\+srv)?:\/\//i.test((process.env.MONGODB_URI || '').trim());
  res.json({
    storage: db ? 'MongoDB' : 'file',
    mongodbConnected: !!db,
    taskCount,
    hasData: taskCount > 0,
    debug: { hasUri, uriValid, mongoFailed }
  });
});

app.get('/api/storage', async (req, res) => {
  const store = await readStorage();
  const key = req.query.key;
  if (key !== undefined && key !== '') {
    if (!(key in store)) return res.status(404).json({ error: 'key not found' });
    return res.json({ key, value: store[key] });
  }
  res.json(store);
});

app.post('/api/storage', async (req, res) => {
  const { key, value } = req.body;
  if (key === undefined || key === '') return res.status(400).json({ error: 'key required' });
  const store = await readStorage();
  store[key] = value;
  if (!(await writeStorage(store))) return res.status(500).json({ error: 'failed to write' });
  res.json({ success: true });
});

app.delete('/api/storage', async (req, res) => {
  const key = req.query.key;
  if (key === undefined || key === '') {
    if (!(await writeStorage({}))) return res.status(500).json({ error: 'failed to write' });
    return res.json({ success: true });
  }
  const store = await readStorage();
  if (!(key in store)) return res.status(404).json({ error: 'key not found' });
  delete store[key];
  if (!(await writeStorage(store))) return res.status(500).json({ error: 'failed to write' });
  res.json({ success: true });
});

app.get('/health', (req, res) => res.send('ok'));

function parseDocxLines(buffer) {
  const zip = new AdmZip(buffer);
  const symbols = {};
  const abstractSymbols = {};
  try {
    const numEntry = zip.getEntry('word/numbering.xml');
    if (numEntry) {
      const numXml = numEntry.getData().toString('utf8');
      const anumBlocks = numXml.split(/<w:abstractNum\b/).slice(1);
      for (const blk of anumBlocks) {
        const aidM = blk.match(/abstractNumId="(\d+)"/);
        const lvlM = blk.match(/<w:lvlText[^>]*val="([^"]*)"/);
        if (aidM && lvlM) abstractSymbols[aidM[1]] = lvlM[1];
      }
      const numBlocks = numXml.split(/<w:num\b/).slice(1);
      for (const blk of numBlocks) {
        const nidM = blk.match(/numId="(\d+)"/);
        const aidM = blk.match(/abstractNumId[^v]*val="(\d+)"/);
        if (nidM && aidM && abstractSymbols[aidM[1]]) symbols[nidM[1]] = abstractSymbols[aidM[1]];
      }
    }
    const docEntry = zip.getEntry('word/document.xml');
    if (!docEntry) return [];
    const docXml = docEntry.getData().toString('utf8');
    const lines = [];
    const pBlocks = docXml.split(/<w:p\b/).slice(1);
    for (const block of pBlocks) {
      const nidM = block.match(/numId[^v]*val="(\d+)"/);
      const numId = nidM ? nidM[1] : null;
      const textParts = block.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g);
      let text = '';
      for (const t of textParts) text += (t[1] || '');
      text = text.replace(/\s+/g, ' ').trim();
      const sym = (numId && symbols[numId]) ? symbols[numId] + ' ' : '';
      const line = (sym + text).trim();
      if (line) lines.push(line);
    }
    return lines;
  } catch (e) {
    console.error('parseDocx error', e);
    return [];
  }
}

function convertLinesToTasks(lines) {
  const DATE_RE = /^(\d{8})(?:周[一二三四五六日])?/;
  let currentDate = null;
  const tasks = [];
  let total = lines.length;
  let filtered = 0;
  let completed = 0;
  let uncompleted = 0;
  for (const line of lines) {
    const dateMatch = line.match(DATE_RE);
    if (dateMatch) {
      const d = dateMatch[1];
      currentDate = d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8);
      continue;
    }
    if (line.startsWith('☑ ')) {
      const text = line.slice(2).trim();
      if (text && currentDate) {
        tasks.push({ text, date: currentDate, completed: true });
        completed++;
      } else filtered++;
      continue;
    }
    if (line.startsWith('☐ ')) {
      const text = line.slice(2).trim();
      if (text && currentDate) {
        tasks.push({ text, date: currentDate, completed: false });
        uncompleted++;
      } else filtered++;
      continue;
    }
    filtered++;
  }
  return { tasks, stats: { total, valid: total - filtered, filtered, completed, uncompleted } };
}

app.post('/api/import', upload.single('file'), async (req, res) => {
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ error: '请选择 .docx 文件' });
  }
  const ext = path.extname(req.file.originalname || '').toLowerCase();
  if (ext !== '.docx') {
    return res.status(400).json({ error: '仅支持 .docx 格式' });
  }
  const lines = parseDocxLines(req.file.buffer);
  const { tasks, stats } = convertLinesToTasks(lines);
  const store = await readStorage();
  const todoList = Array.isArray(store.todoList) ? store.todoList : [];
  const existingIds = new Set(todoList.map(t => t.id));
  let nextId = Date.now();
  for (const t of tasks) {
    while (existingIds.has(nextId)) nextId++;
    todoList.push({ id: nextId, text: t.text, date: t.date, completed: t.completed });
    existingIds.add(nextId);
    nextId++;
  }
  store.todoList = todoList;
  if (!(await writeStorage(store))) {
    return res.status(500).json({ error: '写入失败' });
  }
  res.json({
    success: true,
    stats: {
      total: stats.total,
      valid: stats.valid,
      filtered: stats.filtered,
      uncompleted: stats.uncompleted,
      completed: stats.completed
    }
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
  if (MONGODB_URI) console.log('MONGODB_URI set, will try MongoDB for storage');
  else if (RAW_URI) console.log('MONGODB_URI invalid (must start with mongodb:// or mongodb+srv://), using file storage');
  else console.log('Using file storage (set MONGODB_URI for MongoDB)');
});
