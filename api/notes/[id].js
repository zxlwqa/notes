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
    console.log('[vercel] Notes table initialized')
  } catch (e) {
    console.error('[vercel] Failed to initialize notes table:', e)
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS')
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

    // 从 URL 路径中提取 ID
    const { id } = req.query

    if (!id) {
      return res.status(400).json({ success: false, error: 'Missing note ID' })
    }

    if (req.method === 'GET') {
      // GET /api/notes/:id - 获取单个笔记
      const result = await pool.query('SELECT * FROM notes WHERE id = $1', [id])
      
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Note not found' })
      }
      
      const note = result.rows[0]
      const formattedNote = {
        id: note.id,
        title: note.title,
        content: note.content,
        tags: note.tags ? JSON.parse(note.tags) : [],
        createdAt: note.created_at?.toISOString() || new Date().toISOString(),
        updatedAt: note.updated_at?.toISOString() || new Date().toISOString(),
      }
      
      return res.json(formattedNote)
    }

    if (req.method === 'PUT') {
      // PUT /api/notes/:id - 更新笔记
      const { title, content, tags } = req.body
      
      await pool.query(
        'UPDATE notes SET title = $1, content = $2, tags = $3, updated_at = $4 WHERE id = $5',
        [title, content, JSON.stringify(tags || []), new Date().toISOString(), id]
      )
      
      return res.json({ success: true })
    }

    if (req.method === 'DELETE') {
      // DELETE /api/notes/:id - 删除笔记
      await pool.query('DELETE FROM notes WHERE id = $1', [id])
      return res.json({ success: true })
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' })
  } catch (e) {
    console.error('Notes API error:', e)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
}
