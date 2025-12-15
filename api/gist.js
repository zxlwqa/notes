import { Pool } from 'pg'
import axios from 'axios'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

const PASSWORD = process.env.PASSWORD || ''
const GIT_TOKEN = process.env.GIT_TOKEN || ''

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
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
  } catch (e) {
    console.error('[vercel] Failed to initialize database:', e)
  }
}

async function appendLog(level, message, meta = null) {
  try {
    await pool.query('INSERT INTO logs (level, message, meta) VALUES ($1, $2, $3)',
      [level, message, meta ? JSON.stringify(meta) : null]
    )
  } catch (e) {
    console.error('Failed to append log:', e)
  }
}

function checkAuth(req) {
  if (!PASSWORD) return true
  const auth = req.headers.authorization
  return auth && auth === `Bearer ${PASSWORD}`
}

async function getAllNotes() {
  const result = await pool.query('SELECT * FROM notes ORDER BY created_at ASC')
  return result.rows.map(row => ({
    id: row.id,
    title: row.title,
    content: row.content,
    tags: row.tags ? JSON.parse(row.tags) : [],
    createdAt: row.created_at?.toISOString() || new Date().toISOString(),
    updatedAt: row.updated_at?.toISOString() || new Date().toISOString(),
  }))
}

async function getGistId() {
  try {
    const result = await pool.query('SELECT value FROM settings WHERE key = $1', ['gist_id'])
    return result.rows.length > 0 ? result.rows[0].value : null
  } catch {
    return null
  }
}

async function saveGistId(gistId) {
  try {
    await pool.query(
      'INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()',
      ['gist_id', gistId]
    )
  } catch (e) {
    console.error('Failed to save Gist ID:', e)
  }
}

async function findLatestNotesGist(gitToken) {
  try {
    const resp = await axios.get('https://api.github.com/gists', {
      headers: {
        'Authorization': `Bearer ${gitToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Notes-App'
      }
    })

    if (!resp.data) {
      return null
    }

    const gists = resp.data

    const notesGists = gists
      .filter(gist => {
        const hasNotesFile = gist.files && 'notes.md' in gist.files
        const hasNotesDescription = gist.description && gist.description.includes('笔记备份')
        return hasNotesFile && hasNotesDescription
      })
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

    if (notesGists.length > 0) {
      return {
        id: notesGists[0].id,
        updated_at: notesGists[0].updated_at
      }
    }

    return null
  } catch (e) {
    console.error('[GIST] 搜索 Gist 失败:', e)
    return null
  }
}

async function createOrUpdateGist(content) {
  if (!GIT_TOKEN) {
    throw new Error('GitHub Token not configured')
  }

  let gistId = await getGistId()
  
  // 如果数据库中没有 gist_id，尝试搜索所有 Gist 找最新的
  if (!gistId) {
    console.warn('[GIST] 数据库中未找到 gist_id，搜索所有 Gist...')
    const latestGist = await findLatestNotesGist(GIT_TOKEN)
    if (latestGist) {
      gistId = latestGist.id
      console.warn(`[GIST] 找到最新的 Gist: ${gistId}，更新时间: ${latestGist.updated_at}`)
      await saveGistId(gistId)
    }
  }

  const now = new Date(Date.now() + 8 * 60 * 60 * 1000)
  const gistData = {
    description: '笔记备份 - ' + now.toISOString().replace('T', ' ').substring(0, 19),
    public: false,
    files: {
      'notes.md': {
        content: content
      }
    }
  }

  if (gistId) {
    try {
      const response = await axios.patch(
        `https://api.github.com/gists/${gistId}`,
        gistData,
        {
          headers: {
            'Authorization': `Bearer ${GIT_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'Notes-App'
          }
        }
      )
      return response.data
    } catch (error) {
      // 如果 Gist 不存在（404），清除无效的 gist_id 并搜索或创建新的
      if (error.response && error.response.status === 404) {
        console.warn(`[GIST] Gist ${gistId} 不存在，清除无效 ID 并搜索...`)
        try {
          await pool.query('DELETE FROM settings WHERE key = $1', ['gist_id'])
        } catch (e) {
          console.error('[GIST] Failed to clear invalid gist_id:', e)
        }
        
        // 搜索所有 Gist 找最新的
        const latestGist = await findLatestNotesGist(GIT_TOKEN)
        if (latestGist) {
          gistId = latestGist.id
          console.warn(`[GIST] 找到最新的 Gist: ${gistId}，更新时间: ${latestGist.updated_at}`)
          await saveGistId(gistId)
          
          // 尝试更新找到的 Gist
          try {
            const retryResp = await axios.patch(
              `https://api.github.com/gists/${gistId}`,
              gistData,
              {
                headers: {
                  'Authorization': `Bearer ${GIT_TOKEN}`,
                  'Accept': 'application/vnd.github.v3+json',
                  'Content-Type': 'application/json',
                  'User-Agent': 'Notes-App'
                }
              }
            )
            return retryResp.data
          } catch (retryError) {
            console.warn(`[GIST] 更新找到的 Gist 失败: ${retryError.response?.status}`)
          }
        }
      } else {
        throw error
      }
    }
  }
  
  // 如果没有 gistId 或者 gistId 无效且搜索也没找到，创建新 Gist
  console.warn('[GIST] 创建新的 Gist...')
  const response = await axios.post(
    'https://api.github.com/gists',
    gistData,
    {
      headers: {
        'Authorization': `Bearer ${GIT_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Notes-App'
      }
    }
  )
  if (response.data?.id) {
    await saveGistId(response.data.id)
    console.warn(`[GIST] 创建新 Gist 成功: ${response.data.id}`)
  }
  return response.data
}

async function getGist() {
  let gistId = await getGistId()
  
  // 如果数据库中没有 gist_id，尝试搜索所有 Gist 找最新的
  if (!gistId) {
    console.warn('[GIST] 数据库中未找到 gist_id，搜索所有 Gist...')
    const latestGist = await findLatestNotesGist(GIT_TOKEN)
    if (latestGist) {
      gistId = latestGist.id
      console.warn(`[GIST] 找到最新的 Gist: ${gistId}，更新时间: ${latestGist.updated_at}`)
      await saveGistId(gistId)
    }
  }

  if (!gistId) {
    throw new Error('未找到Gist ID，请先上传备份')
  }

  if (!GIT_TOKEN) {
    throw new Error('GitHub Token not configured')
  }

  try {
    const response = await axios.get(
      `https://api.github.com/gists/${gistId}`,
      {
        headers: {
          'Authorization': `Bearer ${GIT_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Notes-App'
        }
      }
    )
    return response.data
  } catch (error) {
    // 如果 Gist 不存在（404），尝试搜索所有 Gist 找最新的
    if (error.response && error.response.status === 404) {
      console.warn(`[GIST] Gist ${gistId} 不存在，搜索所有 Gist...`)
      try {
        await pool.query('DELETE FROM settings WHERE key = $1', ['gist_id'])
      } catch (e) {
        console.error('[GIST] Failed to clear invalid gist_id:', e)
      }
      
      const latestGist = await findLatestNotesGist(GIT_TOKEN)
      if (latestGist) {
        gistId = latestGist.id
        console.warn(`[GIST] 找到最新的 Gist: ${gistId}，更新时间: ${latestGist.updated_at}`)
        await saveGistId(gistId)
        
        const retryResp = await axios.get(
          `https://api.github.com/gists/${gistId}`,
          {
            headers: {
              'Authorization': `Bearer ${GIT_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'Notes-App'
            }
          }
        )
        return retryResp.data
      }
    }
    throw error
  }
}

function parseMarkdownToNotes(content) {
  const notes = []
  const noteContents = content.split('\n\n---\n\n').filter(note => note.trim())
  
  noteContents.forEach((noteContent, index) => {
    const trimmedContent = noteContent.trim()
    if (!trimmedContent) return
    
    const lines = trimmedContent.split('\n')
    
    let title = lines[0] || `导入笔记 ${index + 1}`
    if (title.startsWith('# ')) {
      title = title.slice(2)
    }
    
    let tags = []
    let createdAt = new Date().toISOString()
    let updatedAt = new Date().toISOString()
    let contentStartIndex = 1
    
    for (let j = 1; j < lines.length; j++) {
      const line = lines[j]
      if (line.startsWith('标签: ')) {
        const tagStr = line.slice(3).trim()
        tags = tagStr ? tagStr.split(',').map(t => t.trim()).filter(t => t) : []
      } else if (line.startsWith('创建时间: ')) {
        createdAt = line.slice(5).trim() || createdAt
      } else if (line.startsWith('更新时间: ')) {
        updatedAt = line.slice(5).trim() || updatedAt
      } else if (line === '') {
        contentStartIndex = j + 1
        break
      }
    }
    
    const noteContentText = lines.slice(contentStartIndex).join('\n')
    
    if (noteContentText.trim()) {
      notes.push({
        id: `imported-${Date.now()}-${index}`,
        title,
        content: noteContentText,
        tags,
        createdAt,
        updatedAt,
      })
    }
  })
  
  return notes
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (!checkAuth(req)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }

  try {
    await initDatabase()

    if (req.method === 'POST') {
      const notes = await getAllNotes()
      
      if (notes.length === 0) {
        return res.json({ success: false, error: '没有笔记可备份' })
      }

      let markdown = ''
      notes.forEach((note, index) => {
        markdown += `# ${note.title}\n`
        markdown += `标签: ${note.tags?.join(', ') || ''}\n`
        markdown += `创建时间: ${note.createdAt}\n`
        markdown += `更新时间: ${note.updatedAt}\n\n`
        markdown += `${note.content}\n\n`
        if (index < notes.length - 1) {
          markdown += '---\n\n'
        }
      })

      try {
        const gistData = await createOrUpdateGist(markdown)
        await appendLog('info', '成功上传到Gist', `Gist ID: ${gistData.id}, 笔记数量: ${notes.length}`)
        return res.json({ 
          success: true, 
          message: `成功上传到Gist`, 
          fileName: 'notes.md', 
          totalNotes: notes.length,
          gistId: gistData.id
        })
      } catch (e) {
        await appendLog('error', 'GitHub Gist 上传失败', e.message)
        return res.status(500).json({ success: false, error: `上传失败: ${e.message}` })
      }
    }

    if (req.method === 'GET') {
      try {
        const gistData = await getGist()
        const file = gistData.files['notes.md'] || Object.values(gistData.files)[0]
        
        if (!file || !file.content) {
              return res.json({ success: false, error: 'Gist中没有找到笔记内容' })
        }
        
        const notes = parseMarkdownToNotes(file.content)
        
        if (notes.length === 0) {
          return res.json({ success: false, error: 'Gist文件中没有找到有效的笔记' })
        }

        await pool.query('DELETE FROM notes')
        
        if (notes.length > 0) {
          const values = notes.map(note => [
            note.id,
            note.title,
            note.content,
            JSON.stringify(note.tags),
            note.createdAt,
            note.updatedAt
          ])
          
          const placeholders = values.map((_, i) => 
            `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`
          ).join(', ')
          
          const flatValues = values.flat()
          await pool.query(
            `INSERT INTO notes (id, title, content, tags, created_at, updated_at) VALUES ${placeholders}`,
            flatValues
          )
        }

        await appendLog('info', '成功从Gist导入', `Gist ID: ${gistData.id}, 导入: ${notes.length} 条`)
        return res.json({ 
          success: true, 
          message: `成功从Gist导入`, 
          fileName: 'notes.md', 
          importedCount: notes.length, 
          updatedCount: 0 
        })
      } catch (e) {
        await appendLog('error', 'GitHub Gist 下载失败', e.message)
        return res.status(500).json({ success: false, error: `下载失败: ${e.message}` })
      }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' })
  } catch (e) {
    console.error('Gist API error:', e)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

