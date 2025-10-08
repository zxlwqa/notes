import express from 'express'
import cors from 'cors'
import compression from 'compression'
import path from 'path'
import { fileURLToPath } from 'url'
import serveStatic from 'serve-static'
import { Pool } from 'pg'
import axios from 'axios'

// Resolve __dirname in ESM
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distDir = path.resolve(__dirname, '..', 'dist')

// Env
const PORT = process.env.PORT || 3000
const PASSWORD = process.env.PASSWORD || ''
const WEBDAV_URL = process.env.WEBDAV_URL || ''
const WEBDAV_USER = process.env.WEBDAV_USER || ''
const WEBDAV_PASS = process.env.WEBDAV_PASS || ''

// PostgreSQL config
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

// Initialize database
async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        title TEXT,
        content TEXT,
        tags TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS logs (
        id SERIAL PRIMARY KEY,
        level TEXT,
        message TEXT NOT NULL,
        meta TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    
    console.log('[server] Database tables initialized')
  } catch (e) {
    console.error('[server] Database initialization failed:', e)
    throw e
  }
}

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

// 清理 IP 地址格式
function cleanIP(ip) {
  if (!ip) return 'unknown'
  // 移除 IPv6 映射前缀
  if (ip.startsWith('::ffff:')) {
    return ip.substring(7)
  }
  return ip
}

// Logs helper
async function appendLog(level, message, meta) {
  const entry = {
    level,
    message,
    meta: meta ? JSON.stringify(meta) : null,
  }
  try {
    await pool.query(
      'INSERT INTO logs (level, message, meta) VALUES ($1, $2, $3)',
      [level, message, entry.meta]
    )
    console.log(`[${level.toUpperCase()}] ${message}`, meta ? JSON.stringify(meta) : '')
  } catch (e) {
    console.error('Failed to write log to PostgreSQL:', e)
    console.log(`[${level.toUpperCase()}] ${message}`, meta ? JSON.stringify(meta) : '')
  }
}

// Notes helpers
async function getAllNotes() {
  try {
    const result = await pool.query('SELECT * FROM notes ORDER BY updated_at DESC')
    return result.rows.map(row => ({
      id: row.id,
      title: row.title || '',
      content: row.content || '',
      tags: row.tags ? JSON.parse(row.tags) : [],
      createdAt: row.created_at?.toISOString() || new Date().toISOString(),
      updatedAt: row.updated_at?.toISOString() || new Date().toISOString(),
    }))
  } catch (e) {
    console.error('Failed to get notes:', e)
    return []
  }
}

// API routes
app.get('/api/password/status', authMiddleware, async (req, res) => {
  try {
    // 检查是否有环境变量密码
    const hasEnvPassword = Boolean(PASSWORD)
    
    // 检查数据库中是否有密码设置
    const result = await pool.query('SELECT value FROM settings WHERE key = $1', ['password'])
    const hasDbPassword = result.rows.length > 0 && result.rows[0].value

    // 返回密码状态
    res.json({
      success: true,
      usingD1: false, // Docker 不使用 D1
      usingPostgreSQL: true, // Docker 使用 PostgreSQL
      hasEnvPassword,
      hasDbPassword,
      passwordSource: hasEnvPassword ? 'env' : (hasDbPassword ? 'postgresql' : 'none')
    })
  } catch (e) {
    console.error('Password status error:', e)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

// 测试 PostgreSQL 连接和日志功能
app.get('/api/test-logs', authMiddleware, async (req, res) => {
  try {
    // 写入一条测试日志
    await appendLog('info', '测试日志条目', `时间戳: ${Date.now()}`)
    
    // 读取日志
    const result = await pool.query('SELECT * FROM logs ORDER BY created_at DESC LIMIT 5')
    const logs = result.rows
    
    res.json({ 
      success: true, 
      postgresConnected: true,
      logsCount: logs.length,
      latestLog: logs[0] || null
    })
  } catch (e) {
    res.json({ 
      success: false, 
      postgresConnected: false,
      error: String(e)
    })
  }
})

app.post('/api/login', async (req, res) => {
  const { password } = req.body || {}
  if (!PASSWORD || password === PASSWORD) {
    await appendLog('info', '用户登录成功', `IP: ${cleanIP(req.ip)}`)
    return res.json({ success: true })
  }
  await appendLog('warn', '用户登录失败', `IP: ${cleanIP(req.ip)}, 原因: 密码错误`)
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
    const result = await pool.query('SELECT * FROM notes WHERE id = $1', [id])
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Not found' })
    }
    
    const row = result.rows[0]
    const note = {
      id: row.id,
      title: row.title || '',
      content: row.content || '',
      tags: row.tags ? JSON.parse(row.tags) : [],
      createdAt: row.created_at?.toISOString() || new Date().toISOString(),
      updatedAt: row.updated_at?.toISOString() || new Date().toISOString(),
    }
    
    res.json(note)
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
    
    await pool.query(
      `INSERT INTO notes (id, title, content, tags, created_at, updated_at) 
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       content = EXCLUDED.content,
       tags = EXCLUDED.tags,
       updated_at = EXCLUDED.updated_at`,
      [note.id, note.title, note.content, JSON.stringify(note.tags), note.createdAt, note.updatedAt]
    )
    
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
    const body = req.body || {}
    
    // 检查笔记是否存在
    const existing = await pool.query('SELECT * FROM notes WHERE id = $1', [id])
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Note not found' })
    }
    
    const oldNote = existing.rows[0]
    const note = {
      id,
      title: body.title ?? oldNote.title ?? '',
      content: body.content ?? oldNote.content ?? '',
      tags: Array.isArray(body.tags) ? body.tags : (oldNote.tags ? JSON.parse(oldNote.tags) : []),
      createdAt: oldNote.created_at?.toISOString() || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    
    await pool.query(
      'UPDATE notes SET title = $1, content = $2, tags = $3, updated_at = $4 WHERE id = $5',
      [note.title, note.content, JSON.stringify(note.tags), note.updatedAt, note.id]
    )
    
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
    await pool.query('DELETE FROM notes WHERE id = $1', [id])
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
      const id = item.id || String(Date.now() + Math.random())
      const note = {
        id,
        title: item.title || '',
        content: item.content || '',
        tags: Array.isArray(item.tags) ? item.tags : [],
        createdAt: item.createdAt || item.created_at || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      
      await pool.query(
        `INSERT INTO notes (id, title, content, tags, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         content = EXCLUDED.content,
         tags = EXCLUDED.tags,
         updated_at = EXCLUDED.updated_at`,
        [note.id, note.title, note.content, JSON.stringify(note.tags), note.createdAt, note.updatedAt]
      )
      imported += 1
    }
    
    await appendLog('info', '笔记已导入', `导入数量: ${imported} 条笔记`)
    res.json({ success: true, imported })
  } catch (e) {
    await appendLog('error', '导入失败', `错误: ${String(e)}`)
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
      await appendLog('info', '笔记已上传到云端', `上传数量: ${notes.length} 条笔记`)
      return res.json({ success: true, fileName, totalNotes: notes.length })
    }

    // 否则存储到 PostgreSQL
    await pool.query(
      'INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at',
      ['backup_latest', content, new Date().toISOString()]
    )
    await appendLog('info', '笔记已保存到本地', `保存数量: ${notes.length} 条笔记`)
    res.json({ success: true, fileName, totalNotes: notes.length })
  } catch (e) {
    await appendLog('error', '备份失败', `错误: ${String(e)}`)
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
      const result = await pool.query('SELECT value FROM settings WHERE key = $1', ['backup_latest'])
      markdown = result.rows[0]?.value || ''
    }
    
    // 完全清空 PostgreSQL 中的旧数据
    await pool.query('DELETE FROM notes')
    await appendLog('info', 'cleared old notes from postgres', { count: 0 })
    
    // 解析 Markdown 为笔记数组并完全覆盖 PostgreSQL
    const parsedNotes = parseMarkdownToNotes(markdown)
    let importedCount = 0
    
    for (const item of parsedNotes) {
      await pool.query(
        'INSERT INTO notes (id, title, content, tags, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [item.id, item.title, item.content, JSON.stringify(item.tags), item.createdAt, item.updatedAt]
      )
      importedCount += 1
    }
    
    await appendLog('info', '笔记已从云端下载并导入', `导入数量: ${importedCount} 条笔记`)
    
    res.json({ success: true, fileName: 'notes.md', importedCount, updatedCount: 0 })
  } catch (e) {
    await appendLog('error', '下载失败', `错误: ${String(e)}`)
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
    const result = await pool.query('SELECT * FROM logs ORDER BY created_at DESC LIMIT 200')
    const logs = result.rows.map(row => ({
      id: row.id,
      level: row.level,
      message: row.message,
      meta: row.meta,
      created_at: row.created_at?.toISOString() || new Date().toISOString(),
    }))
    
    // 前端期望的格式：{ items: [...] }
    res.json({ items: logs })
  } catch (e) {
    console.error('Failed to load logs:', e)
    res.status(500).json({ success: false, error: 'Failed to load logs' })
  }
})

app.delete('/api/logs', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM logs')
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

// Start server
async function startServer() {
  try {
    // Initialize database
    await initDatabase()
    
    // Test PostgreSQL connection
    await pool.query('SELECT 1')
    console.log('[server] PostgreSQL connection successful')
    
    // Start listening
    app.listen(PORT, async () => {
      console.log(`[server] listening on http://0.0.0.0:${PORT}`)
      console.log(`[server] dist dir: ${distDir}`)
      await appendLog('info', '服务器已启动', `端口: ${PORT}, 数据库: 已连接`)
    })
  } catch (e) {
    console.error('[server] Failed to start server:', e)
    process.exit(1)
  }
}

startServer()
