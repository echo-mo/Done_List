const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const app = express();
const STORAGE_FILE = path.join(__dirname, 'storage.json');
// Zeabur injects PORT; set MONGODB_URI in Zeabur env vars for persistent storage
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || '';
const DB_NAME = 'willah_db';
const COLLECTION = 'storage';

let db = null;

async function getDb() {
  if (db) return db;
  if (!MONGODB_URI) return null;
  const client = await MongoClient.connect(MONGODB_URI);
  db = client.db(DB_NAME);
  return db;
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

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  if (MONGODB_URI) console.log('Using MongoDB for storage');
  else console.log('Using file storage (set MONGODB_URI for MongoDB)');
});
