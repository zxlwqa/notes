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
    console.log('[vercel] Notes table initialized')
  } catch (e) {
    console.error('[vercel] Failed to initialize notes table:', e)
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

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.get('/api/notes', authMiddleware, async (req, res) => {
  try {
    await initDatabase()
    const notes = await getAllNotes()
    res.json(notes)
  } catch (e) {
    console.error('Failed to load notes:', e)
    res.status(500).json({ success: false, error: 'Failed to load notes' })
  }
})

app.post('/api/notes', authMiddleware, async (req, res) => {
  try {
    await initDatabase()
    const { id, title, content, tags } = req.body
    if (!id || !title || !content) {
      return res.status(400).json({ success: false, error: 'Missing required fields' })
    }
    
    await pool.query(
      'INSERT INTO notes (id, title, content, tags, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content, tags = EXCLUDED.tags, updated_at = EXCLUDED.updated_at',
      [id, title, content, JSON.stringify(tags || []), new Date().toISOString(), new Date().toISOString()]
    )
    
    res.json({ success: true, id })
  } catch (e) {
    console.error('Failed to save note:', e)
    res.status(500).json({ success: false, error: 'Failed to save note' })
  }
})

app.put('/api/notes/:id', authMiddleware, async (req, res) => {
  try {
    await initDatabase()
    const { id } = req.params
    const { title, content, tags } = req.body
    
    await pool.query(
      'UPDATE notes SET title = $1, content = $2, tags = $3, updated_at = $4 WHERE id = $5',
      [title, content, JSON.stringify(tags || []), new Date().toISOString(), id]
    )
    
    res.json({ success: true })
  } catch (e) {
    console.error('Failed to update note:', e)
    res.status(500).json({ success: false, error: 'Failed to update note' })
  }
})

app.delete('/api/notes/:id', authMiddleware, async (req, res) => {
  try {
    await initDatabase()
    const { id } = req.params
    await pool.query('DELETE FROM notes WHERE id = $1', [id])
    res.json({ success: true })
  } catch (e) {
    console.error('Failed to delete note:', e)
    res.status(500).json({ success: false, error: 'Failed to delete note' })
  }
})

export default app
