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
const distDir = path.resolve(rootDir, 'dist')

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
  try {
    await redis.lpush(LOGS_KEY, JSON.stringify(entry))
    await redis.ltrim(LOGS_KEY, 0, 999)
    console.log(`[${level.toUpperCase()}] ${message}`, meta ? JSON.stringify(meta) : '')
  } catch (e) {
    console.error('Failed to write log to Redis:', e)
    console.log(`[${level.toUpperCase()}] ${message}`, meta ? JSON.stringify(meta) : '')
  }
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

// 测试 Redis 连接和日志功能
app.get('/api/test-logs', authMiddleware, async (req, res) => {
  try {
    // 写入一条测试日志
    await appendLog('info', 'test log entry', { test: true, timestamp: Date.now() })
    
    // 读取日志
    const raw = await redis.lrange(LOGS_KEY, 0, 5)
    const logs = raw.map(x => JSON.parse(x))
    
    res.json({ 
      success: true, 
      redisConnected: true,
      logsCount: logs.length,
      latestLog: logs[0] || null
    })
  } catch (e) {
    res.json({ 
      success: false, 
      redisConnected: false,
      error: String(e)
    })
  }
})

app.post('/api/login', async (req, res) => {
  const { password } = req.body || {}
  if (!PASSWORD || password === PASSWORD) {
    await appendLog('info', 'user login successful', { ip: req.ip })
    return res.json({ success: true })
  }
  await appendLog('warn', 'user login failed', { ip: req.ip, reason: 'invalid password' })
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
    const fileName = 'notes.md'
    const content = (notes || [])
      .map((n) => {
        if (!n || typeof n !== 'object') return ''
        const title = n.title || '无标题'
        const tags = Array.isArray(n.tags) ? n.tags.join(', ') : ''
        const createdAt = n.createdAt || ''
        const updatedAt = n.updatedAt || ''
        const noteContent = n.content || ''
        
        return `# ${title}\n标签: ${tags}\n创建时间: ${createdAt}\n更新时间: ${updatedAt}\n\n${noteContent}`
      })
      .join('\n\n---\n\n')

    // 优先上传到 WebDAV（如果配置了）
    if (WEBDAV_URL) {
      const base = WEBDAV_URL.replace(/\/$/, '')
      const targetUrl = `${base}/${fileName}`
      await axios.put(targetUrl, content, {
        headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
        auth: WEBDAV_USER || WEBDAV_PASS ? { username: WEBDAV_USER, password: WEBDAV_PASS } : undefined,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      })
      await appendLog('info', 'backup uploaded to webdav', { url: targetUrl, totalNotes: notes.length })
      return res.json({ success: true, fileName, totalNotes: notes.length })
    }

    // 否则退回使用 Redis 存储最新备份（Markdown 文本）
    await redis.set('notes:backup:latest:md', content)
    await appendLog('info', 'backup saved to redis', { totalNotes: notes.length })
    res.json({ success: true, fileName, totalNotes: notes.length })
  } catch (e) {
    await appendLog('error', 'backup failed', { error: String(e) })
    res.status(500).json({ success: false, error: 'Backup failed' })
  }
})

app.get('/api/backup', authMiddleware, async (req, res) => {
  try {
    let markdown = ''

    if (WEBDAV_URL) {
      const base = WEBDAV_URL.replace(/\/$/, '')
      const targetUrl = `${base}/notes.md`
      const response = await axios.get(targetUrl, {
        responseType: 'text',
        auth: WEBDAV_USER || WEBDAV_PASS ? { username: WEBDAV_USER, password: WEBDAV_PASS } : undefined,
        validateStatus: (s) => s >= 200 && s < 300,
      })
      markdown = String(response.data || '')
    } else {
      const raw = await redis.get('notes:backup:latest:md')
      markdown = typeof raw === 'string' ? raw : (raw ? String(raw) : '')
    }
    
    // 完全清空 Redis 中的旧数据
    const oldIds = await redis.smembers(NOTES_KEY)
    if (oldIds && oldIds.length > 0) {
      const oldKeys = oldIds.map(id => NOTE_KEY(id))
      await redis.del(...oldKeys)
      await redis.del(NOTES_KEY)
      await appendLog('info', 'cleared old notes from redis', { count: oldIds.length })
    }
    
    // 解析 Markdown 为笔记数组并完全覆盖 Redis
    const parsedNotes = parseMarkdownToNotes(markdown)
    let importedCount = 0
    
    for (const item of parsedNotes) {
      await redis.set(NOTE_KEY(item.id), JSON.stringify(item))
      await redis.sadd(NOTES_KEY, item.id)
      importedCount += 1
    }
    
    await appendLog('info', 'notes downloaded and imported', { 
      source: WEBDAV_URL ? 'webdav' : 'redis', 
      importedCount,
      fileName: 'notes.md'
    })
    
    res.json({ success: true, fileName: 'notes.md', importedCount, updatedCount: 0 })
  } catch (e) {
    await appendLog('error', 'download failed', { error: String(e) })
    res.status(500).json({ success: false, error: 'Download failed' })
  }
})

function parseMarkdownToNotes(content) {
  if (!content || typeof content !== 'string') return []
  const parts = content
    .split(/\n\n---\n\n/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  const result = []
  for (let i = 0; i < parts.length; i++) {
    const text = parts[i]
    const lines = text.split('\n')
    
    // 解析标题（第一行，去掉 # 前缀）
    let title = lines[0] || `导入笔记 ${i + 1}`
    if (title.startsWith('# ')) {
      title = title.slice(2)
    }
    
    // 解析元数据
    let tags = []
    let createdAt = new Date().toISOString()
    let updatedAt = new Date().toISOString()
    let contentStartIndex = 1
    
    for (let j = 1; j < lines.length; j++) {
      const line = lines[j]
      if (line.startsWith('标签: ')) {
        const tagStr = line.slice(3).trim()
        tags = tagStr ? tagStr.split(',').map(t => t.trim()).filter(t => t) : []
      } else if (line.startsWith('创建时间: ')) {
        createdAt = line.slice(5).trim() || createdAt
      } else if (line.startsWith('更新时间: ')) {
        updatedAt = line.slice(5).trim() || updatedAt
      } else if (line === '') {
        contentStartIndex = j + 1
        break
      }
    }
    
    // 提取笔记内容（跳过元数据行）
    const noteContent = lines.slice(contentStartIndex).join('\n')
    
    result.push({
      id: `imported-${Date.now()}-${i}`,
      title,
      content: noteContent,
      tags,
      createdAt,
      updatedAt,
    })
  }
  return result
}

app.get('/api/logs', authMiddleware, async (req, res) => {
  try {
    console.log('[debug] fetching logs from Redis key:', LOGS_KEY)
    const raw = await redis.lrange(LOGS_KEY, 0, 200)
    console.log('[debug] raw logs count:', raw ? raw.length : 0)
    
    if (!raw || raw.length === 0) {
      console.log('[debug] no logs found, returning empty items array')
      return res.json({ items: [] })
    }
    
    const list = raw.map((x) => {
      try {
        return JSON.parse(x)
      } catch (e) {
        console.error('[debug] failed to parse log entry:', x, e)
        return { id: Date.now(), level: 'error', message: 'Invalid log entry', created_at: new Date().toISOString() }
      }
    })
    
    console.log('[debug] returning logs count:', list.length)
    // 前端期望的格式：{ items: [...] }
    res.json({ items: list })
  } catch (e) {
    console.error('Failed to load logs:', e)
    // 避免递归调用 appendLog
    console.log(`[ERROR] failed to load logs: ${String(e)}`)
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

app.listen(PORT, async () => {
  console.log(`[server] listening on http://0.0.0.0:${PORT}${VITE_BASE}`)
  console.log(`[server] dist dir: ${distDir}`)
  
  // 测试 Redis 连接
  try {
    await redis.ping()
    console.log('[server] Redis connection successful')
    await appendLog('info', 'server started', { port: PORT, distDir, redis: 'connected' })
  } catch (e) {
    console.error('[server] Redis connection failed:', e)
    await appendLog('error', 'server started but Redis failed', { port: PORT, distDir, redis: 'failed', error: String(e) })
  }
})


