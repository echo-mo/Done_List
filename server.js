const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { MongoClient } = require('mongodb');

// ── 业务状态码枚举 ───────────────────────────────────────────────────────────
const BizCode = {
  SUCCESS:              0,
  KEY_REQUIRED:      1001,
  KEY_NOT_FOUND:     1002,
  STORAGE_WRITE_FAILED: 1003,
  STORAGE_READ_FAILED:  1004,
  DUPLICATE_TASK:    2001,
  INTERNAL_ERROR:    5000,
};

// 统一响应辅助
function ok(res, data = null, message = 'success') {
  return res.json({ code: BizCode.SUCCESS, message, data });
}
function fail(res, code, message, httpStatus = 200) {
  return res.status(httpStatus).json({ code, message, data: null });
}

const app = express();
const STORAGE_FILE = path.join(__dirname, 'storage.json');
// Zeabur injects PORT; set MONGODB_URI in Zeabur env vars for persistent storage
const PORT = process.env.PORT || 3000;
const RAW_URI = (process.env.MONGODB_URI || '').trim().replace(/^["']|["']$/g, '');
const MONGODB_URI = /^mongodb(\+srv)?:\/\//i.test(RAW_URI) ? RAW_URI : '';
const DB_NAME = 'done_list_app';
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
  const database = await getDb();
  const store = await readStorage();
  const taskCount = Array.isArray(store.todoList) ? store.todoList.length : 0;
  const hasUri = !!(process.env.MONGODB_URI || '').trim();
  const uriValid = /^mongodb(\+srv)?:\/\//i.test((process.env.MONGODB_URI || '').trim());
  return ok(res, {
    storage: database ? 'MongoDB' : 'file',
    mongodbConnected: !!database,
    taskCount,
    hasData: taskCount > 0,
    debug: { hasUri, uriValid, mongoFailed }
  });
});

app.get('/api/storage', async (req, res) => {
  const store = await readStorage();
  const key = req.query.key;
  if (key !== undefined && key !== '') {
    if (!(key in store)) return fail(res, BizCode.KEY_NOT_FOUND, 'key not found', 404);
    return ok(res, { key, value: store[key] });
  }
  return ok(res, store);
});

// 校验 todoList 内 (date + text) 同一天内不重复
function hasDuplicateTasks(todoList) {
  if (!Array.isArray(todoList)) return false;
  const seen = new Set();
  for (const t of todoList) {
    const d = (t.date || '').toString().trim().slice(0, 10);
    const txt = (t.text || '').toString().trim();
    const k = d + '|' + txt;
    if (seen.has(k)) return true;
    seen.add(k);
  }
  return false;
}

app.post('/api/storage', async (req, res) => {
  const { key, value } = req.body;
  if (key === undefined || key === '') return fail(res, BizCode.KEY_REQUIRED, 'key required', 400);
  if (key === 'todoList' && hasDuplicateTasks(value)) {
    return fail(res, BizCode.DUPLICATE_TASK, '同日期下已存在同名任务', 400);
  }
  const store = await readStorage();
  store[key] = value;
  if (!(await writeStorage(store))) return fail(res, BizCode.STORAGE_WRITE_FAILED, 'storage write failed', 500);
  return ok(res);
});

app.delete('/api/storage', async (req, res) => {
  const key = req.query.key;
  if (key === undefined || key === '') {
    if (!(await writeStorage({}))) return fail(res, BizCode.STORAGE_WRITE_FAILED, 'storage write failed', 500);
    return ok(res);
  }
  const store = await readStorage();
  if (!(key in store)) return fail(res, BizCode.KEY_NOT_FOUND, 'key not found', 404);
  delete store[key];
  if (!(await writeStorage(store))) return fail(res, BizCode.STORAGE_WRITE_FAILED, 'storage write failed', 500);
  return ok(res);
});

app.get('/health', (req, res) => res.send('ok'));

// 全局异常兜底中间件（必须放在所有路由之后，且保留 4 个参数）
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  return fail(res, BizCode.INTERNAL_ERROR, 'internal server error', 500);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
  if (MONGODB_URI) console.log('MONGODB_URI set, will try MongoDB for storage');
  else if (RAW_URI) console.log('MONGODB_URI invalid (must start with mongodb:// or mongodb+srv://), using file storage');
  else console.log('Using file storage (set MONGODB_URI for MongoDB)');
});
