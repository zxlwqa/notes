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

// Env
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
    // Create notes table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `)
    
    // Create logs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS logs (
        id SERIAL PRIMARY KEY,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        meta TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `)
    
    // Create settings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `)
    
    console.log('[vercel] Database tables initialized')
  } catch (e) {
    console.error('[vercel] Failed to initialize database:', e)
  }
}

// Initialize database on startup (moved to function level for Vercel)
// initDatabase()

// Logging function
async function appendLog(level, message, meta = null) {
  try {
    await pool.query(
      'INSERT INTO logs (level, message, meta) VALUES ($1, $2, $3)',
      [level, message, meta ? JSON.stringify(meta) : null]
    )
  } catch (e) {
    console.error('Failed to append log:', e)
  }
}

// Auth middleware
function authMiddleware(req, res, next) {
  if (!PASSWORD) return next()
  const auth = req.headers.authorization
  if (!auth || auth !== `Bearer ${PASSWORD}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }
  next()
}

// Get all notes
async function getAllNotes() {
  const result = await pool.query('SELECT * FROM notes ORDER BY updated_at DESC')
  return result.rows.map(row => ({
    id: row.id,
    title: row.title,
    content: row.content,
    tags: row.tags ? JSON.parse(row.tags) : [],
    createdAt: row.created_at?.toISOString() || new Date().toISOString(),
    updatedAt: row.updated_at?.toISOString() || new Date().toISOString(),
  }))
}

// Express app
const app = express()

// Middleware
app.use(cors())
app.use(compression())
app.use(express.json({ limit: '10mb' }))

// Serve static files
app.use(serveStatic(path.join(__dirname, '../dist')))

// API Routes
app.get('/api/password/status', (req, res) => {
  res.json({ hasPassword: !!PASSWORD })
})

// 调试接口 - 检查环境变量状态
app.get('/api/debug/env', (req, res) => {
  res.json({
    hasPassword: !!PASSWORD,
    passwordLength: PASSWORD ? PASSWORD.length : 0,
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    hasWebdavUrl: !!process.env.WEBDAV_URL,
    nodeEnv: process.env.NODE_ENV
  })
})

app.post('/api/login', async (req, res) => {
  try {
    // 确保数据库已初始化
    await initDatabase()
    
    const { password } = req.body || {}
    
    // 调试日志
    console.log('[DEBUG] Login attempt:', {
      hasPassword: !!PASSWORD,
      passwordLength: PASSWORD ? PASSWORD.length : 0,
      inputPasswordLength: password ? password.length : 0,
      passwordsMatch: password === PASSWORD
    })
    
    if (!PASSWORD || password === PASSWORD) {
      await appendLog('info', '用户登录成功', `IP: ${req.ip}`)
      return res.json({ success: true })
    }
    await appendLog('warn', '用户登录失败', `IP: ${req.ip}, 原因: 密码错误`)
    res.status(401).json({ success: false, error: 'Invalid password' })
  } catch (e) {
    console.error('[ERROR] Login failed:', e)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

app.get('/api/notes', authMiddleware, async (req, res) => {
  try {
    const notes = await getAllNotes()
    res.json(notes)
  } catch (e) {
    await appendLog('error', '获取笔记失败', `错误: ${String(e)}`)
    res.status(500).json({ success: false, error: 'Failed to load notes' })
  }
})

app.post('/api/notes', authMiddleware, async (req, res) => {
  try {
    const { id, title, content, tags } = req.body
    if (!id || !title || !content) {
      return res.status(400).json({ success: false, error: 'Missing required fields' })
    }
    
    await pool.query(
      'INSERT INTO notes (id, title, content, tags, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content, tags = EXCLUDED.tags, updated_at = EXCLUDED.updated_at',
      [id, title, content, JSON.stringify(tags || []), new Date().toISOString(), new Date().toISOString()]
    )
    
    await appendLog('info', '笔记已保存', `ID: ${id}`)
    res.json({ success: true })
  } catch (e) {
    await appendLog('error', '保存笔记失败', `错误: ${String(e)}`)
    res.status(500).json({ success: false, error: 'Failed to save note' })
  }
})

app.delete('/api/notes/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params
    await pool.query('DELETE FROM notes WHERE id = $1', [id])
    await appendLog('info', '笔记已删除', `ID: ${id}`)
    res.json({ success: true })
  } catch (e) {
    await appendLog('error', '删除笔记失败', `错误: ${String(e)}`)
    res.status(500).json({ success: false, error: 'Failed to delete note' })
  }
})

app.post('/api/import', authMiddleware, async (req, res) => {
  try {
    const { notes } = req.body
    if (!Array.isArray(notes)) {
      return res.status(400).json({ success: false, error: 'Invalid notes format' })
    }
    
    let imported = 0
    for (const note of notes) {
      if (!note.id || !note.title || !note.content) continue
      
      await pool.query(
        'INSERT INTO notes (id, title, content, tags, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content, tags = EXCLUDED.tags, updated_at = EXCLUDED.updated_at',
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
    let content = ''
    let importedCount = 0
    
    // 优先从 WebDAV 下载（如果配置了）
    if (WEBDAV_URL) {
      try {
        const base = WEBDAV_URL.replace(/\/$/, '')
        const sourceUrl = `${base}/notes.md`
        const response = await axios.get(sourceUrl, {
          auth: WEBDAV_USER || WEBDAV_PASS ? { username: WEBDAV_USER, password: WEBDAV_PASS } : undefined,
          maxContentLength: Infinity,
        })
        content = response.data
      } catch (e) {
        console.log('WebDAV download failed, falling back to PostgreSQL:', e.message)
      }
    }
    
    // 如果 WebDAV 失败，从 PostgreSQL 获取
    if (!content) {
      const result = await pool.query('SELECT value FROM settings WHERE key = $1', ['backup_latest'])
      if (result.rows.length > 0) {
        content = result.rows[0].value
      }
    }
    
    if (!content) {
      return res.json({ success: true, fileName: 'notes.md', importedCount: 0, updatedCount: 0 })
    }
    
    // 完全清空 PostgreSQL 中的旧数据
    await pool.query('DELETE FROM notes')
    await appendLog('info', '已清空旧笔记数据', `清空数量: 0`)
    
    // 解析并导入新数据
    const notes = parseMarkdownToNotes(content)
    for (const item of notes) {
      if (!item.id || !item.title || !item.content) continue
      
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
  
  const sections = content.split(/\n\n---\n\n/).filter(s => s.trim())
  const notes = []
  
  for (const section of sections) {
    const lines = section.split('\n')
    if (lines.length < 2) continue
    
    const titleMatch = lines[0].match(/^#\s+(.+)$/)
    if (!titleMatch) continue
    
    const title = titleMatch[1]
    let tags = []
    let createdAt = ''
    let updatedAt = ''
    let contentStart = 1
    
    // 解析标签和时间
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      if (line.startsWith('标签: ')) {
        const tagStr = line.replace('标签: ', '').trim()
        tags = tagStr ? tagStr.split(',').map(t => t.trim()).filter(t => t) : []
      } else if (line.startsWith('创建时间: ')) {
        createdAt = line.replace('创建时间: ', '').trim()
      } else if (line.startsWith('更新时间: ')) {
        updatedAt = line.replace('更新时间: ', '').trim()
      } else if (line.trim() === '') {
        contentStart = i + 1
        break
      }
    }
    
    const noteContent = lines.slice(contentStart).join('\n').trim()
    if (!noteContent) continue
    
    notes.push({
      id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title,
      content: noteContent,
      tags,
      createdAt: createdAt || new Date().toISOString(),
      updatedAt: updatedAt || new Date().toISOString(),
    })
  }
  
  return notes
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

// 测试接口
app.get('/api/test-logs', authMiddleware, async (req, res) => {
  try {
    await appendLog('info', '测试日志条目', `时间戳: ${Date.now()}`)
    
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

// Catch-all handler for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'))
})

export default app
