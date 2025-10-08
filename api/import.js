import express from 'express'
import cors from 'cors'
import { Pool } from 'pg'

// PostgreSQL config
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

// Env
const PASSWORD = process.env.PASSWORD || ''

// Initialize database
async function initDatabase() {
  try {
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
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS logs (
        id SERIAL PRIMARY KEY,
        level TEXT,
        message TEXT,
        meta TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.log('[vercel] Database tables initialized')
  } catch (e) {
    console.error('[vercel] Failed to initialize database:', e)
  }
}

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

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

app.post('/api/import', authMiddleware, async (req, res) => {
  try {
    await initDatabase()
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

export default app
