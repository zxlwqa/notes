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

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.post('/api/login', async (req, res) => {
  try {
    // 确保数据库已初始化
    await initDatabase()
    
    const { password } = req.body || {}
    
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

export default app
