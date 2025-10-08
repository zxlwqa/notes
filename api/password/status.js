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
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.log('[vercel] Settings table initialized')
  } catch (e) {
    console.error('[vercel] Failed to initialize settings table:', e)
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  // 检查认证
  if (!checkAuth(req)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  try {
    await initDatabase()

    // 检查是否有环境变量密码
    const hasEnvPassword = !!PASSWORD
    
    // 检查数据库中是否有密码设置
    const result = await pool.query('SELECT value FROM settings WHERE key = $1', ['password'])
    const hasDbPassword = result.rows.length > 0 && result.rows[0].value

    // 返回密码状态
    return res.json({
      success: true,
      usingD1: false, // Vercel 不使用 D1
      usingPostgreSQL: true, // Vercel 使用 PostgreSQL
      hasEnvPassword,
      hasDbPassword,
      passwordSource: hasEnvPassword ? 'env' : (hasDbPassword ? 'postgresql' : 'none')
    })
  } catch (e) {
    console.error('Password status API error:', e)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
}
