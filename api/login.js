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

export default async function handler(req, res) {
  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  try {
    // 确保数据库已初始化
    await initDatabase()
    
    const { password } = req.body || {}
    
    if (!PASSWORD || password === PASSWORD) {
      await appendLog('info', '用户登录成功', `IP: ${req.headers['x-forwarded-for'] || req.connection.remoteAddress}`)
      return res.json({ success: true })
    }
    await appendLog('warn', '用户登录失败', `IP: ${req.headers['x-forwarded-for'] || req.connection.remoteAddress}, 原因: 密码错误`)
    res.status(401).json({ success: false, error: 'Invalid password' })
  } catch (e) {
    console.error('[ERROR] Login failed:', e)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}
