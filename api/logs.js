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
function checkAuth(req) {
  if (!PASSWORD) return true
  const auth = req.headers.authorization
  return auth && auth === `Bearer ${PASSWORD}`
}

export default async function handler(req, res) {
  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  // 检查认证
  if (!checkAuth(req)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }

  try {
    await initDatabase()

    if (req.method === 'GET') {
      // GET /api/logs - 获取日志
      const result = await pool.query('SELECT * FROM logs ORDER BY created_at DESC LIMIT 200')
      const logs = result.rows.map(row => ({
        id: row.id,
        level: row.level,
        message: row.message,
        meta: row.meta,
        created_at: row.created_at?.toISOString() || new Date().toISOString(),
      }))
      
      // 前端期望的格式：{ items: [...] }
      return res.json({ items: logs })
    }

    if (req.method === 'DELETE') {
      // DELETE /api/logs - 清空日志
      await pool.query('DELETE FROM logs')
      return res.json({ success: true })
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' })
  } catch (e) {
    console.error('Logs API error:', e)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
}
