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
      CREATE TABLE IF NOT EXISTS logs (
        id SERIAL PRIMARY KEY,
        level TEXT,
        message TEXT,
        meta TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.log('[vercel] Logs table initialized')
  } catch (e) {
    console.error('[vercel] Failed to initialize logs table:', e)
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
app.use(express.json({ limit: '2mb' }))

app.get('/api/logs', authMiddleware, async (req, res) => {
  try {
    await initDatabase()
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
    await initDatabase()
    await pool.query('DELETE FROM logs')
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to clear logs' })
  }
})

export default app
