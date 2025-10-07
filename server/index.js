import express from 'express'
import cors from 'cors'
import compression from 'compression'
import path from 'path'
import { fileURLToPath } from 'url'
import serveStatic from 'serve-static'
import { Redis } from '@upstash/redis'
import axios from 'axios'

// Resolve __dirname in ESM
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const distDir = path.resolve(rootDir, '..', 'dist')

// Env
const PORT = process.env.PORT || 3000
const PASSWORD = process.env.PASSWORD || ''
const VITE_BASE = process.env.VITE_BASE || ''
const WEBDAV_URL = process.env.WEBDAV_URL || ''
const WEBDAV_USER = process.env.WEBDAV_USER || ''
const WEBDAV_PASS = process.env.WEBDAV_PASS || ''

// Upstash Redis config
const redis = new Redis({
  url: process.env.UPSTASH_URL,
  token: process.env.UPSTASH_TOKEN,
})

// Keys
const NOTES_KEY = 'notes:list'
const NOTE_KEY = (id) => `notes:item:${id}`
const LOGS_KEY = 'notes:logs'
const SETTINGS_KEY = 'notes:settings'

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || ''
  if (!PASSWORD) return next()
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }
  const token = auth.slice('Bearer '.length)
  if (token !== PASSWORD) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }
  next()
}

const app = express()
app.use(cors())
app.use(compression())
app.use(express.json({ limit: '2mb' }))

// Logs helper
async function appendLog(level, message, meta) {
  const entry = {
    id: Date.now(),
    level,
    message,
    meta: meta ? JSON.stringify(meta) : null,
    created_at: new Date().toISOString(),
  }
  await redis.lpush(LOGS_KEY, JSON.stringify(entry))
  await redis.ltrim(LOGS_KEY, 0, 999)
}

// Notes helpers
async function getAllNotes() {
  const ids = await redis.smembers(NOTES_KEY)
  if (!ids || ids.length === 0) return []
  const keys = ids.map((id) => NOTE_KEY(id))
  const values = await redis.mget(...keys)
  return values
    .map((v) => (typeof v === 'string' ? JSON.parse(v) : v))
    .filter(Boolean)
}

// API routes
app.get('/api/password/status', (req, res) => {
  res.json({ passwordSet: Boolean(PASSWORD) })
})

app.post('/api/login', (req, res) => {
  const { password } = req.body || {}
  if (!PASSWORD || password === PASSWORD) {
    return res.json({ success: true })
  }
  res.status(401).json({ success: false, error: 'Invalid password' })
})

app.get('/api/notes', authMiddleware, async (req, res) => {
  try {
    const notes = await getAllNotes()
    res.json(notes)
  } catch (e) {
    await appendLog('error', 'get notes failed', { error: String(e) })
    res.status(500).json({ success: false, error: 'Failed to load notes' })
  }
})

app.get('/api/notes/:id', authMiddleware, async (req, res) => {
  try {
    const id = req.params.id
    const raw = await redis.get(NOTE_KEY(id))
    if (!raw) return res.status(404).json({ success: false, error: 'Not found' })
    res.json(typeof raw === 'string' ? JSON.parse(raw) : raw)
  } catch (e) {
    await appendLog('error', 'get note failed', { error: String(e) })
    res.status(500).json({ success: false, error: 'Failed to load note' })
  }
})

app.post('/api/notes', authMiddleware, async (req, res) => {
  try {
    const body = req.body || {}
    const id = body.id || String(Date.now())
    const note = {
      id,
      title: body.title || '',
      content: body.content || '',
      tags: Array.isArray(body.tags) ? body.tags : [],
      createdAt: body.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await redis.set(NOTE_KEY(id), JSON.stringify(note))
    await redis.sadd(NOTES_KEY, id)
    await appendLog('info', 'note created/updated', { id })
    res.json({ success: true, id })
  } catch (e) {
    await appendLog('error', 'create note failed', { error: String(e) })
    res.status(500).json({ success: false, error: 'Failed to create note' })
  }
})

app.put('/api/notes/:id', authMiddleware, async (req, res) => {
  try {
    const id = req.params.id
    const raw = await redis.get(NOTE_KEY(id))
    const oldNote = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {}
    const body = req.body || {}
    const note = {
      id,
      title: body.title ?? oldNote.title ?? '',
      content: body.content ?? oldNote.content ?? '',
      tags: Array.isArray(body.tags) ? body.tags : oldNote.tags || [],
      createdAt: oldNote.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await redis.set(NOTE_KEY(id), JSON.stringify(note))
    await redis.sadd(NOTES_KEY, id)
    await appendLog('info', 'note updated', { id })
    res.json({ success: true })
  } catch (e) {
    await appendLog('error', 'update note failed', { error: String(e) })
    res.status(500).json({ success: false, error: 'Failed to update note' })
  }
})

app.delete('/api/notes/:id', authMiddleware, async (req, res) => {
  try {
    const id = req.params.id
    await redis.del(NOTE_KEY(id))
    await redis.srem(NOTES_KEY, id)
    await appendLog('info', 'note deleted', { id })
    res.json({ success: true })
  } catch (e) {
    await appendLog('error', 'delete note failed', { error: String(e) })
    res.status(500).json({ success: false, error: 'Failed to delete note' })
  }
})

app.post('/api/import', authMiddleware, async (req, res) => {
  try {
    const list = Array.isArray(req.body) ? req.body : (req.body?.notes || [])
    let imported = 0
    for (const item of list) {
      const id = item.id || String(Date.now())
      const note = {
        id,
        title: item.title || '',
        content: item.content || '',
        tags: Array.isArray(item.tags) ? item.tags : [],
        createdAt: item.createdAt || item.created_at || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      await redis.set(NOTE_KEY(id), JSON.stringify(note))
      await redis.sadd(NOTES_KEY, id)
      imported += 1
    }
    await appendLog('info', 'notes imported', { count: imported })
    res.json({ success: true, imported })
  } catch (e) {
    await appendLog('error', 'import failed', { error: String(e) })
    res.status(500).json({ success: false, error: 'Import failed' })
  }
})

app.post('/api/backup', authMiddleware, async (req, res) => {
  try {
    const notes = await getAllNotes()
    const fileName = 'notes-latest.json'
    const content = JSON.stringify(notes, null, 2)

    // 优先上传到 WebDAV（如果配置了）
    if (WEBDAV_URL) {
      const base = WEBDAV_URL.replace(/\/$/, '')
      const targetUrl = `${base}/${fileName}`
      await axios.put(targetUrl, content, {
        headers: { 'Content-Type': 'application/json' },
        auth: WEBDAV_USER || WEBDAV_PASS ? { username: WEBDAV_USER, password: WEBDAV_PASS } : undefined,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      })
      await appendLog('info', 'backup uploaded to webdav', { url: targetUrl })
      return res.json({ success: true, fileName, totalNotes: notes.length })
    }

    // 否则退回使用 Redis 存储最新备份
    await redis.set('notes:backup:latest', content)
    res.json({ success: true, fileName, totalNotes: notes.length })
  } catch (e) {
    await appendLog('error', 'backup failed', { error: String(e) })
    res.status(500).json({ success: false, error: 'Backup failed' })
  }
})

app.get('/api/backup', authMiddleware, async (req, res) => {
  try {
    let list = []

    if (WEBDAV_URL) {
      const base = WEBDAV_URL.replace(/\/$/, '')
      const targetUrl = `${base}/notes-latest.json`
      const response = await axios.get(targetUrl, {
        responseType: 'text',
        auth: WEBDAV_USER || WEBDAV_PASS ? { username: WEBDAV_USER, password: WEBDAV_PASS } : undefined,
        validateStatus: (s) => s >= 200 && s < 300,
      })
      try {
        list = JSON.parse(response.data || '[]')
      } catch (_) {
        list = []
      }
    } else {
      const raw = await redis.get('notes:backup:latest')
      list = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : []
    }
    let importedCount = 0
    let updatedCount = 0
    for (const item of list) {
      const existing = await redis.get(NOTE_KEY(item.id))
      if (existing) updatedCount += 1
      else importedCount += 1
      await redis.set(NOTE_KEY(item.id), JSON.stringify(item))
      await redis.sadd(NOTES_KEY, item.id)
    }
    res.json({ success: true, fileName: 'notes-latest.json', importedCount, updatedCount })
  } catch (e) {
    await appendLog('error', 'download failed', { error: String(e) })
    res.status(500).json({ success: false, error: 'Download failed' })
  }
})

app.get('/api/logs', authMiddleware, async (req, res) => {
  try {
    const raw = await redis.lrange(LOGS_KEY, 0, 200)
    const list = raw.map((x) => JSON.parse(x))
    res.json(list)
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to load logs' })
  }
})

app.delete('/api/logs', authMiddleware, async (req, res) => {
  try {
    await redis.del(LOGS_KEY)
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to clear logs' })
  }
})

// Static hosting of built frontend
app.use(serveStatic(distDir, { index: false, maxAge: '1y', setHeaders: (res) => res.setHeader('Cache-Control', 'public, max-age=31536000') }))

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(distDir, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`[server] listening on http://0.0.0.0:${PORT}${VITE_BASE}`)
})


