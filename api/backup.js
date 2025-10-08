import { Pool } from 'pg'
import axios from 'axios'

// PostgreSQL config
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

// Env
const PASSWORD = process.env.PASSWORD || ''
const WEBDAV_URL = process.env.WEBDAV_URL || ''
const WEBDAV_USER = process.env.WEBDAV_USER || ''
const WEBDAV_PASS = process.env.WEBDAV_PASS || ''

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
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
function checkAuth(req) {
  if (!PASSWORD) return true
  const auth = req.headers.authorization
  return auth && auth === `Bearer ${PASSWORD}`
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

// Upload to WebDAV
async function uploadToWebDAV(content) {
  if (!WEBDAV_URL || !WEBDAV_USER || !WEBDAV_PASS) {
    throw new Error('WebDAV credentials not configured')
  }

  const url = `${WEBDAV_URL}/notes.md`
  const auth = Buffer.from(`${WEBDAV_USER}:${WEBDAV_PASS}`).toString('base64')
  
  await axios.put(url, content, {
    headers: {
      'Content-Type': 'text/markdown',
      'Authorization': `Basic ${auth}`,
    },
  })
}

// Download from WebDAV
async function downloadFromWebDAV() {
  if (!WEBDAV_URL || !WEBDAV_USER || !WEBDAV_PASS) {
    throw new Error('WebDAV credentials not configured')
  }

  const url = `${WEBDAV_URL}/notes.md`
  const auth = Buffer.from(`${WEBDAV_USER}:${WEBDAV_PASS}`).toString('base64')
  
  const response = await axios.get(url, {
    headers: {
      'Authorization': `Basic ${auth}`,
    },
  })
  
  return response.data
}

export default async function handler(req, res) {
  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
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

    if (req.method === 'POST') {
      // POST /api/backup - 上传备份
      const notes = await getAllNotes()
      
      if (notes.length === 0) {
        return res.json({ success: false, error: '没有笔记可备份' })
      }

      // 生成 Markdown 格式的备份
      let markdown = `# 笔记备份\n\n备份时间: ${new Date().toLocaleString('zh-CN')}\n\n`
      
      notes.forEach((note, index) => {
        markdown += `## ${note.title}\n\n`
        markdown += `**标签:** ${note.tags?.join(', ') || '无'}\n\n`
        markdown += `**创建时间:** ${new Date(note.createdAt).toLocaleString('zh-CN')}\n\n`
        markdown += `**更新时间:** ${new Date(note.updatedAt).toLocaleString('zh-CN')}\n\n`
        markdown += `**内容:**\n\n${note.content}\n\n`
        if (index < notes.length - 1) {
          markdown += '---\n\n'
        }
      })

      try {
        await uploadToWebDAV(markdown)
        await appendLog('info', '笔记已成功上传到云端', `文件: notes.md, 笔记数量: ${notes.length}`)
        return res.json({ success: true, message: `笔记已成功上传到云端`, file: 'notes.md', count: notes.length })
      } catch (e) {
        await appendLog('error', 'WebDAV 上传失败', e.message)
        return res.status(500).json({ success: false, error: `上传失败: ${e.message}` })
      }
    }

    if (req.method === 'GET') {
      // GET /api/backup - 下载备份
      try {
        const markdown = await downloadFromWebDAV()
        
        // 解析 Markdown 内容
        const notes = []
        const sections = markdown.split('## ').slice(1) // 跳过标题
        
        for (const section of sections) {
          const lines = section.split('\n')
          const title = lines[0]?.trim()
          if (!title) continue
          
          // 提取标签
          const tagsLine = lines.find(line => line.startsWith('**标签:**'))
          const tags = tagsLine ? tagsLine.replace('**标签:**', '').trim().split(', ').filter(t => t && t !== '无') : []
          
          // 提取内容
          const contentStart = lines.findIndex(line => line.startsWith('**内容:**'))
          const content = contentStart >= 0 ? lines.slice(contentStart + 2).join('\n').replace(/---\s*$/, '').trim() : ''
          
          if (content) {
            notes.push({
              id: `imported-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              title,
              content,
              tags,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            })
          }
        }

        if (notes.length === 0) {
          return res.json({ success: false, error: '备份文件中没有找到有效的笔记' })
        }

        // 清空现有笔记
        await pool.query('DELETE FROM notes')
        
        // 导入新笔记
        for (const note of notes) {
          await pool.query(
            'INSERT INTO notes (id, title, content, tags, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
            [note.id, note.title, note.content, JSON.stringify(note.tags), note.createdAt, note.updatedAt]
          )
        }

        await appendLog('info', '笔记已成功从云端下载并导入', `文件: notes.md, 导入: ${notes.length} 条`)
        return res.json({ success: true, message: `笔记已成功从云端下载并导入`, file: 'notes.md', imported: notes.length })
      } catch (e) {
        await appendLog('error', 'WebDAV 下载失败', e.message)
        return res.status(500).json({ success: false, error: `下载失败: ${e.message}` })
      }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' })
  } catch (e) {
    console.error('Backup API error:', e)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
}
