import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import serveStatic from 'serve-static'
import { Pool } from 'pg'
import axios from 'axios'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distDir = path.resolve(__dirname, '..', 'dist')

const PORT = process.env.PORT || 3000
const PASSWORD = process.env.PASSWORD || ''
const WEBDAV_URL = process.env.WEBDAV_URL || ''
const WEBDAV_USER = process.env.WEBDAV_USER || ''
const WEBDAV_PASS = process.env.WEBDAV_PASS || ''
const GIT_TOKEN = process.env.GIT_TOKEN || ''
const ACCOUNT_ID = process.env.ACCOUNT_ID || ''
const ACCESS_KEY_ID = process.env.ACCESS_KEY_ID || ''
const SECRET_ACCESS_KEY = process.env.SECRET_ACCESS_KEY || ''

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('[服务器] 错误: DATABASE_URL 环境变量未设置')
  process.exit(1)
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

const app = express()

app.set('trust proxy', true)

app.use(express.json())

app.use(express.urlencoded({ extended: true }))

async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        title TEXT,
        content TEXT,
        tags TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS logs (
        id SERIAL PRIMARY KEY,
        level TEXT,
        message TEXT NOT NULL,
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
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_data (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    
    console.warn('[服务器] 数据库表已初始化')
  } catch (e) {
    console.error('[服务器] 数据库初始化失败:', e)
    throw e
  }
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || ''
  if (!PASSWORD) return next()
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: '未授权' })
  }
  const token = auth.slice('Bearer '.length)
  if (token !== PASSWORD) {
    return res.status(401).json({ success: false, error: '未授权' })
  }
  next()
}

function cleanIP(ip) {
  if (!ip) return 'unknown'
  if (ip.startsWith('::ffff:')) {
    return ip.substring(7)
  }
  return ip
}

function safeJsonParse(str, defaultValue = null) {
  if (!str || typeof str !== 'string') return defaultValue
  try {
    return JSON.parse(str)
  } catch {
    return defaultValue
  }
}

async function appendLog(level, message, meta) {
  const entry = {
    level,
    message,
    meta: meta ? JSON.stringify(meta) : null,
  }
  
  const levelMap = {
    'info': '信息',
    'warn': '警告',
    'warning': '警告',
    'error': '错误',
    'debug': '调试'
  }
  const levelZh = levelMap[level] || level
  
  try {
    await pool.query(
      'INSERT INTO logs (level, message, meta) VALUES ($1, $2, $3)',
      [level, message, entry.meta]
    )
    console.warn(`[${levelZh}] ${message}`, meta ? JSON.stringify(meta) : '')
  } catch (e) {
    console.error('写入PostgreSQL日志失败:', e)
    console.warn(`[${levelZh}] ${message}`, meta ? JSON.stringify(meta) : '')
  }
}

async function getAllNotes() {
  try {
    const result = await pool.query('SELECT * FROM notes ORDER BY updated_at DESC')
    return result.rows.map(row => ({
      id: row.id,
      title: row.title || '',
      content: row.content || '',
      tags: safeJsonParse(row.tags, []),
      createdAt: row.created_at?.toISOString() || new Date().toISOString(),
      updatedAt: row.updated_at?.toISOString() || new Date().toISOString(),
    }))
  } catch (e) {
    console.error('获取笔记失败:', e)
    return []
  }
}

app.get('/api/password/status', authMiddleware, async (req, res) => {
  try {
    const hasEnvPassword = Boolean(PASSWORD)
    
    const result = await pool.query('SELECT value FROM settings WHERE key = $1', ['password'])
    const hasDbPassword = result.rows.length > 0 && result.rows[0].value

    res.json({
      success: true,
      usingD1: false,
      usingPostgreSQL: true,
      hasEnvPassword,
      hasDbPassword,
      passwordSource: hasEnvPassword ? 'env' : (hasDbPassword ? 'postgresql' : 'none')
    })
  } catch (e) {
    console.error('密码状态错误', e)
    res.status(500).json({ success: false, error: '服务器内部错误' })
  }
})

app.get('/api/test-logs', authMiddleware, async (req, res) => {
  try {
  await appendLog('info', '测试日志条目', `时间: ${Date.now()}`)
    
    const result = await pool.query('SELECT * FROM logs ORDER BY created_at DESC LIMIT 5')
    const logs = result.rows
    
    res.json({ 
      success: true, 
      postgresConnected: true,
      logsCount: logs.length,
      latestLog: logs[0] || null
    })
  } catch (e) {
    res.json({ 
      success: false, 
      postgresConnected: false,
      error: String(e)
    })
  }
})

app.post('/api/login', async (req, res) => {
  const { password } = req.body || {}
  if (!PASSWORD || password === PASSWORD) {
    await appendLog('info', '用户登录成功', `IP: ${cleanIP(req.ip)}`)
    return res.json({ success: true })
  }
  await appendLog('warn', '用户登录失败', `IP: ${cleanIP(req.ip)}, 原因: 密码错误`)
  res.status(401).json({ success: false, error: '密码无效' })
})

app.get('/api/notes', authMiddleware, async (req, res) => {
  try {
    const notes = await getAllNotes()
    res.json(notes)
  } catch (e) {
    await appendLog('error', '获取笔记失败', { error: String(e) })
    res.status(500).json({ success: false, error: '加载笔记失败' })
  }
})

app.get('/api/notes/:id', authMiddleware, async (req, res) => {
  try {
    const id = req.params.id
    const result = await pool.query('SELECT * FROM notes WHERE id = $1', [id])
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: '未找到' })
    }
    
    const row = result.rows[0]
    const note = {
      id: row.id,
      title: row.title || '',
      content: row.content || '',
      tags: safeJsonParse(row.tags, []),
      createdAt: row.created_at?.toISOString() || new Date().toISOString(),
      updatedAt: row.updated_at?.toISOString() || new Date().toISOString(),
    }
    
    res.json(note)
  } catch (e) {
    await appendLog('error', '获取笔记失败', { error: String(e) })
    res.status(500).json({ success: false, error: '加载笔记失败' })
  }
})

app.post('/api/notes', authMiddleware, async (req, res) => {
  try {
    const body = req.body || {}
    const id = body.id || String(Date.now())
    const note = {
      id,
      title: body.title || '',
      content: body.content || '',
      tags: Array.isArray(body.tags) ? body.tags : [],
      createdAt: body.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    
    await pool.query(
      `INSERT INTO notes (id, title, content, tags, created_at, updated_at) 
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       content = EXCLUDED.content,
       tags = EXCLUDED.tags,
       updated_at = EXCLUDED.updated_at`,
      [note.id, note.title, note.content, JSON.stringify(note.tags), note.createdAt, note.updatedAt]
    )
    
  await appendLog('info', '笔记已创建/更新', { id })
    res.json({ success: true, id })
  } catch (e) {
    await appendLog('error', '创建笔记失败', { error: String(e) })
    res.status(500).json({ success: false, error: '创建笔记失败' })
  }
})

app.put('/api/notes/:id', authMiddleware, async (req, res) => {
  try {
    const id = req.params.id
    const body = req.body || {}
    
    const existing = await pool.query('SELECT * FROM notes WHERE id = $1', [id])
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: '笔记未找到' })
    }
    
    const oldNote = existing.rows[0]
    const note = {
      id,
      title: body.title ?? oldNote.title ?? '',
      content: body.content ?? oldNote.content ?? '',
      tags: Array.isArray(body.tags) ? body.tags : safeJsonParse(oldNote.tags, []),
      createdAt: oldNote.created_at?.toISOString() || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    
    await pool.query(
      'UPDATE notes SET title = $1, content = $2, tags = $3, updated_at = $4 WHERE id = $5',
      [note.title, note.content, JSON.stringify(note.tags), note.updatedAt, note.id]
    )
    
  await appendLog('info', '笔记已更新', { id })
    res.json({ success: true })
  } catch (e) {
    await appendLog('error', '更新笔记失败', { error: String(e) })
    res.status(500).json({ success: false, error: '更新笔记失败' })
  }
})

app.delete('/api/notes/:id', authMiddleware, async (req, res) => {
  try {
    const id = req.params.id
    await pool.query('DELETE FROM notes WHERE id = $1', [id])
  await appendLog('info', '笔记已删除', { id })
    res.json({ success: true })
  } catch (e) {
    await appendLog('error', '删除笔记失败', { error: String(e) })
    res.status(500).json({ success: false, error: '删除笔记失败' })
  }
})

app.post('/api/import', authMiddleware, async (req, res) => {
  try {
    const list = Array.isArray(req.body) ? req.body : (req.body?.notes || [])
    let imported = 0
    
    for (const item of list) {
      const id = item.id || String(Date.now() + Math.random())
      const note = {
        id,
        title: item.title || '',
        content: item.content || '',
        tags: Array.isArray(item.tags) ? item.tags : [],
        createdAt: item.createdAt || item.created_at || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      
      await pool.query(
        `INSERT INTO notes (id, title, content, tags, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         content = EXCLUDED.content,
         tags = EXCLUDED.tags,
         updated_at = EXCLUDED.updated_at`,
        [note.id, note.title, note.content, JSON.stringify(note.tags), note.createdAt, note.updatedAt]
      )
      imported += 1
    }
    
  await appendLog('info', '笔记已导入', { imported })
    res.json({ success: true, imported })
  } catch (e) {
    await appendLog('error', '导入失败', `错误: ${String(e)}`)
    res.status(500).json({ success: false, error: '导入失败' })
  }
})

app.post('/api/backup', authMiddleware, async (req, res) => {
  try {
    const notes = await getAllNotes()
    const fileName = 'notes.md'
    const content = (notes || [])
      .map((n) => {
        if (!n || typeof n !== 'object') return ''
  const title = n.title || '无标题'
        const tags = Array.isArray(n.tags) ? n.tags.join(', ') : ''
        const createdAt = n.createdAt || ''
        const updatedAt = n.updatedAt || ''
        const noteContent = n.content || ''
        
        return `# ${title}\n标签: ${tags}\n创建时间: ${createdAt}\n更新时间: ${updatedAt}\n\n${noteContent}`
      })
      .join('\n\n---\n\n')

    if (WEBDAV_URL) {
      const base = WEBDAV_URL.replace(/\/$/, '')
      const targetUrl = `${base}/${fileName}`
      await axios.put(targetUrl, content, {
        headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
        auth: WEBDAV_USER || WEBDAV_PASS ? { username: WEBDAV_USER, password: WEBDAV_PASS } : undefined,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      })
      await appendLog('info', '笔记已上传到云端', `上传数量: ${notes.length} 条笔记`)
      return res.json({ success: true, fileName, totalNotes: notes.length })
    }

    await pool.query(
      'INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at',
      ['backup_latest', content, new Date().toISOString()]
    )
    await appendLog('info', '笔记已保存到本地', `保存数量: ${notes.length} 条笔记`)
    res.json({ success: true, fileName, totalNotes: notes.length })
  } catch (e) {
    await appendLog('error', '备份失败', `错误: ${String(e)}`)
    res.status(500).json({ success: false, error: '备份失败' })
  }
})

app.get('/api/backup', authMiddleware, async (req, res) => {
  try {
    let markdown = ''

    if (WEBDAV_URL) {
      const base = WEBDAV_URL.replace(/\/$/, '')
      const targetUrl = `${base}/notes.md`
      const response = await axios.get(targetUrl, {
        responseType: 'text',
        auth: WEBDAV_USER || WEBDAV_PASS ? { username: WEBDAV_USER, password: WEBDAV_PASS } : undefined,
        validateStatus: (s) => s >= 200 && s < 300,
      })
      markdown = String(response.data || '')
    } else {
      const result = await pool.query('SELECT value FROM settings WHERE key = $1', ['backup_latest'])
      markdown = result.rows[0]?.value || ''
    }
    
    const parsedNotes = parseMarkdownToNotes(markdown)
    const importedCount = parsedNotes.length
    
    res.json({ success: true, fileName: 'notes.md', importedCount, updatedCount: 0 })
    
    ;(async () => {
      try {
        await pool.query('DELETE FROM notes')
        await appendLog('info', 'cleared old notes from postgres', { count: 0 })
        
        for (const item of parsedNotes) {
          await pool.query(
            'INSERT INTO notes (id, title, content, tags, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
            [item.id, item.title, item.content, JSON.stringify(item.tags), item.createdAt, item.updatedAt]
          )
        }
        
  await appendLog('info', '笔记已从云端下载并导入', { importedCount })
      } catch (err) {
        console.error('后台导入错误:', err)
        await appendLog('error', '后台导入失败', `错误: ${String(err)}`)
      }
    })()
  } catch (e) {
    await appendLog('error', '下载失败', `错误: ${String(e)}`)
    res.status(500).json({ success: false, error: '下载失败' })
  }
})

function parseMarkdownToNotes(content) {
  if (!content || typeof content !== 'string') return []
  const parts = content
    .split(/\n\n---\n\n/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  const result = []
  for (let i = 0; i < parts.length; i++) {
    const text = parts[i]
    const lines = text.split('\n')
    
    let title = lines[0] || `导入笔记 ${i + 1}`
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
    
    const noteContent = lines.slice(contentStartIndex).join('\n')
    
    result.push({
      id: `imported-${Date.now()}-${i}`,
      title,
      content: noteContent,
      tags,
      createdAt,
      updatedAt,
    })
  }
  return result
}

function getR2Config() {
  if (!ACCOUNT_ID) {
    return null
  }
  
  const endpoint = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`
  const bucketName = 'notes'
  
  return {
    accountId: ACCOUNT_ID,
    endpoint,
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
    bucketName
  }
}

async function createAwsSignatureV4(method, url, headers, payload, accessKeyId, secretAccessKey, region = 'auto') {
  const urlObj = new URL(url)
  const host = urlObj.hostname
  let path = urlObj.pathname
  if (!path || path === '') {
    path = '/'
  } else if (!path.startsWith('/')) {
    path = '/' + path
  }
  
  const query = urlObj.search.slice(1)
  
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  
  const encoder = new TextEncoder()
  const payloadData = encoder.encode(payload || '')
  const payloadHashBuffer = await crypto.subtle.digest('SHA-256', payloadData)
  const payloadHashArray = Array.from(new Uint8Array(payloadHashBuffer))
  const payloadHash = payloadHashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  
  const canonicalHeaders = {
    'host': host.toLowerCase(),
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash
  }
  
  if (headers['Content-Type']) {
    canonicalHeaders['content-type'] = headers['Content-Type']
  }
  
  const sortedHeaders = Object.keys(canonicalHeaders).sort()
  const canonicalHeadersString = sortedHeaders
    .map(key => {
      const value = canonicalHeaders[key].replace(/\s+/g, ' ').trim()
      return `${key}:${value}`
    })
    .join('\n') + '\n'
  
  const signedHeaders = sortedHeaders.join(';')
  
  const canonicalRequest = [
    method,
    path,
    query || '',
    canonicalHeadersString,
    signedHeaders,
    payloadHash
  ].join('\n')
  
  const algorithm = 'AWS4-HMAC-SHA256'
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`
  
  const canonicalRequestData = encoder.encode(canonicalRequest)
  const canonicalRequestHashBuffer = await crypto.subtle.digest('SHA-256', canonicalRequestData)
  const canonicalRequestHashArray = Array.from(new Uint8Array(canonicalRequestHashBuffer))
  const canonicalRequestHash = canonicalRequestHashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    canonicalRequestHash
  ].join('\n')
  
  async function hmac(key, data) {
    const keyData = typeof key === 'string' ? encoder.encode(key) : key
    const dataArray = typeof data === 'string' ? encoder.encode(data) : data
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, dataArray)
    return new Uint8Array(signature)
  }
  
  const kDate = await hmac(`AWS4${secretAccessKey}`, dateStamp)
  const kRegion = await hmac(kDate, region)
  const kService = await hmac(kRegion, 's3')
  const kSigning = await hmac(kService, 'aws4_request')
  const signatureBuffer = await hmac(kSigning, stringToSign)
  const signature = Array.from(signatureBuffer).map(b => b.toString(16).padStart(2, '0')).join('')
  
  const authorization = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  
  return {
    authorization,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash
  }
}

async function uploadToR2(content) {
  const config = getR2Config()
  if (!config || !config.endpoint) {
    throw new Error('R2 未配置。请设置 ACCOUNT_ID、ACCESS_KEY_ID 和 SECRET_ACCESS_KEY 环境变量')
  }
  
  if (!config.accessKeyId || !config.secretAccessKey) {
    throw new Error('请配置 ACCESS_KEY_ID 和 SECRET_ACCESS_KEY 环境变量')
  }
  
  const filename = 'notes.md'
  const url = `${config.endpoint}/${config.bucketName}/${filename}`
  const headers = {
    'Content-Type': 'text/markdown; charset=utf-8',
  }
  
  const awsHeaders = await createAwsSignatureV4('PUT', url, headers, content, config.accessKeyId, config.secretAccessKey, 'auto')
  Object.assign(headers, awsHeaders)
  
  try {
    const response = await axios.put(url, content, {
      headers,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    })
    return response
  } catch (error) {
    if (error.response) {
      const status = error.response.status
      const errorText = error.response.data || ''
      const errorTextStr = typeof errorText === 'string' ? errorText : String(errorText)

      if (status === 401) {
        throw new Error('R2 认证失败。请检查 ACCESS_KEY_ID 和 SECRET_ACCESS_KEY 是否正确')
      }

      let errorMessage = `R2 上传失败 (状态码: ${status})`
      const codeMatch = errorTextStr.match(/<Code>(.*?)<\/Code>/i)
      const messageMatch = errorTextStr.match(/<Message>(.*?)<\/Message>/i)
      if (codeMatch || messageMatch) {
        const code = codeMatch ? codeMatch[1] : ''
        const message = messageMatch ? messageMatch[1] : ''
        if (code || message) {
          errorMessage = `R2 上传失败: ${code ? code + ' - ' : ''}${message || ''}`
        }
      }

      if (errorTextStr.includes('Unauthorized') || errorTextStr.includes('not authorized')) {
        errorMessage = 'R2 认证失败。请检查 ACCESS_KEY_ID 和 SECRET_ACCESS_KEY 是否正确'
      }

      throw new Error(errorMessage)
    }
    throw error
  }
}

async function downloadFromR2() {
  const config = getR2Config()
  if (!config || !config.endpoint) {
    throw new Error('R2 未配置。请设置 ACCOUNT_ID、ACCESS_KEY_ID 和 SECRET_ACCESS_KEY 环境变量')
  }

  const filename = 'notes.md'
  const url = `${config.endpoint}/${config.bucketName}/${filename}`
  const headers = {}

  if (!config.accessKeyId || !config.secretAccessKey) {
    throw new Error('请配置 ACCESS_KEY_ID 和 SECRET_ACCESS_KEY 环境变量')
  }

  const awsHeaders = await createAwsSignatureV4('GET', url, headers, '', config.accessKeyId, config.secretAccessKey, 'auto')
  Object.assign(headers, awsHeaders)

  try {
    const response = await axios.get(url, { headers, responseType: 'text' })
    return response.data
  } catch (error) {
    if (error.response) {
      const status = error.response.status
      const errorText = error.response.data || ''
      const errorTextStr = typeof errorText === 'string' ? errorText : String(errorText)

      if (status === 401) {
        if (!config.accessKeyId || !config.secretAccessKey) {
          throw new Error('请配置 ACCESS_KEY_ID 和 SECRET_ACCESS_KEY 环境变量')
        } else {
          throw new Error('R2 认证失败。请检查 ACCESS_KEY_ID 和 SECRET_ACCESS_KEY 是否正确')
        }
      }

      let errorMessage = `R2 下载失败 (状态码: ${status})`
      const codeMatch = errorTextStr.match(/<Code>(.*?)<\/Code>/i)
      const messageMatch = errorTextStr.match(/<Message>(.*?)<\/Message>/i)
      if (codeMatch || messageMatch) {
        const code = codeMatch ? codeMatch[1] : ''
        const message = messageMatch ? messageMatch[1] : ''
        if (code || message) {
          errorMessage = `R2 下载失败: ${code ? code + ' - ' : ''}${message || ''}`
        }
      }

      if (errorTextStr.includes('Unauthorized') || errorTextStr.includes('not authorized')) {
        errorMessage = 'R2 认证失败。请检查 ACCESS_KEY_ID 和 SECRET_ACCESS_KEY 是否正确'
      }

      throw new Error(errorMessage)
    }
    throw error
  }
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
      'INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at',
      ['gist_id', gistId, new Date().toISOString()]
    )
  } catch (e) {
    console.error('保存 Gist ID 失败:', e)
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

    // 查找所有包含 notes.md 文件的 Gist，且描述包含"笔记备份"
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
  if (!GIT_TOKEN) throw new Error('GitHub Token 未配置')

  let gistId = await getGistId()
  
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
      'notes.md': { content }
    }
  }

  try {
    if (gistId) {
      try {
        const resp = await axios.patch(`https://api.github.com/gists/${gistId}`, gistData, {
          headers: {
            'Authorization': `Bearer ${GIT_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'Notes-App'
          }
        })
        return resp.data
      } catch (patchError) {
        if (patchError.response && patchError.response.status === 404) {
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
              const retryResp = await axios.patch(`https://api.github.com/gists/${gistId}`, gistData, {
                headers: {
                  'Authorization': `Bearer ${GIT_TOKEN}`,
                  'Accept': 'application/vnd.github.v3+json',
                  'Content-Type': 'application/json',
                  'User-Agent': 'Notes-App'
                }
              })
              return retryResp.data
            } catch (retryError) {
              console.warn(`[GIST] 更新找到的 Gist 失败: ${retryError.response?.status}`)
            }
          }
        } else {
          throw patchError
        }
      }
    }

    // 如果没有 gistId 或者 gistId 无效且搜索也没找到，创建新 Gist
    console.warn('[GIST] 创建新的 Gist...')
    const resp = await axios.post('https://api.github.com/gists', gistData, {
      headers: {
        'Authorization': `Bearer ${GIT_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Notes-App'
      }
    })
    if (resp.data?.id) {
      await saveGistId(resp.data.id)
      console.warn(`[GIST] 创建新 Gist 成功: ${resp.data.id}`)
    }
    return resp.data
  } catch (error) {
    if (error.response) {
      const errorMessage = error.response.data?.message || error.response.data?.error || `GitHub API 错误: ${error.response.status}`
      throw new Error(errorMessage)
    }
    if (error.request) throw new Error('无法连接 GitHub API')
    throw new Error(error.message || 'GitHub Gist 操作失败')
  }
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
  if (!GIT_TOKEN) throw new Error('GitHub Token 未配置')

  try {
    const resp = await axios.get(`https://api.github.com/gists/${gistId}`, {
      headers: {
        'Authorization': `Bearer ${GIT_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Notes-App'
      }
    })
    return resp.data
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
        
        const retryResp = await axios.get(`https://api.github.com/gists/${gistId}`, {
          headers: {
            'Authorization': `Bearer ${GIT_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Notes-App'
          }
        })
        return retryResp.data
      }
    }
    
    if (error.response) {
      const errorMessage = error.response.data?.message || error.response.data?.error || `GitHub API 错误: ${error.response.status}`
      throw new Error(errorMessage)
    }
    if (error.request) throw new Error('无法连接 GitHub API')
    throw new Error(error.message || 'GitHub Gist 下载失败')
  }
}

app.post('/api/gist', authMiddleware, async (req, res) => {
  try {
    const notes = await getAllNotes()

    if (!notes || notes.length === 0) {
      await appendLog('warn', 'gist:post:no_notes', {})
      return res.json({ success: false, error: '没有可导出的笔记' })
    }

    let markdown = notes.map((note) => {
      const tags = Array.isArray(note.tags) ? note.tags.join(', ') : (note.tags || '')
      return `# ${note.title}\n标签: ${tags}\n创建时间: ${note.createdAt}\n更新时间: ${note.updatedAt}\n\n${note.content}`
    }).join('\n\n---\n\n')

    if (!GIT_TOKEN) {
      await appendLog('error', 'gist:post:no_token')
      return res.status(500).json({ success: false, error: 'GitHub Token 未配置' })
    }

    try {
      const gistData = await createOrUpdateGist(markdown)
      await appendLog('info', 'gist:post:success', { gistId: gistData.id, count: notes.length })
      return res.json({ success: true, message: '成功上传到Gist', fileName: 'notes.md', totalNotes: notes.length, gistId: gistData.id })
    } catch (e) {
      await appendLog('error', 'gist:post:failed', { error: String(e) })
      return res.status(500).json({ success: false, error: `上传失败: ${e.message || String(e)}` })
    }
  } catch (e) {
    await appendLog('error', 'gist:post:exception', { error: String(e) })
    return res.status(500).json({ success: false, error: e.message || '上传失败' })
  }
})

app.get('/api/gist', authMiddleware, async (req, res) => {
  try {
    if (!GIT_TOKEN) {
      await appendLog('error', 'gist:get:no_token')
      return res.status(500).json({ success: false, error: 'GitHub Token 未配置' })
    }

    const gistData = await getGist()
    const file = gistData.files['notes.md'] || Object.values(gistData.files)[0]

    if (!file || !file.content) {
      await appendLog('error', 'gist:get:no_content')
      return res.status(400).json({ success: false, error: 'Gist 中没有找到笔记内容' })
    }

    const notes = parseMarkdownToNotes(file.content)
    if (!notes || notes.length === 0) {
      await appendLog('error', 'gist:get:no_notes')
      return res.status(400).json({ success: false, error: '备份文件中没有找到有效的笔记' })
    }

    await pool.query('DELETE FROM notes')
    let importedCount = 0
    for (const note of notes) {
      try {
        await pool.query(
          'INSERT INTO notes (id, title, content, tags, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
          [note.id, note.title, note.content, JSON.stringify(note.tags || []), note.createdAt, note.updatedAt]
        )
        importedCount++
      } catch (e) {
        console.error('导入笔记失败:', e)
      }
    }

    await appendLog('info', 'gist:get:success', { importedCount })
    return res.json({ success: true, message: '成功从Gist导入', fileName: 'notes.md', importedCount, updatedCount: 0, totalNotes: notes.length })
  } catch (e) {
    await appendLog('error', 'gist:get:failed', { error: String(e) })
    return res.status(500).json({ success: false, error: `下载失败: ${e.message || String(e)}` })
  }
})

app.post('/api/r2', authMiddleware, async (req, res) => {
  try {
    const notes = await getAllNotes()
    if (!notes || notes.length === 0) {
      await appendLog('warn', 'r2:post:no_notes')
      return res.json({ success: false, error: '没有可导出的笔记' })
    }

    const markdown = notes.map((note) => {
      const tags = Array.isArray(note.tags) ? note.tags.join(', ') : (note.tags || '')
      return `# ${note.title}\n标签: ${tags}\n创建时间: ${note.createdAt}\n更新时间: ${note.updatedAt}\n\n${note.content}`
    }).join('\n\n---\n\n')

    const config = getR2Config()
    if (!config || !config.endpoint) {
      await appendLog('error', 'r2:post:no_config')
      return res.status(500).json({ success: false, error: 'R2 未配置' })
    }

    try {
      await uploadToR2(markdown)
      await appendLog('info', 'r2:post:success', { fileName: 'notes.md', count: notes.length })
      return res.json({ success: true, message: '成功上传到R2', fileName: 'notes.md', totalNotes: notes.length })
    } catch (e) {
      await appendLog('error', 'r2:post:failed', { error: String(e) })
      return res.status(500).json({ success: false, error: `上传失败: ${e.message || String(e)}` })
    }
  } catch (e) {
    await appendLog('error', 'r2:post:exception', { error: String(e) })
    return res.status(500).json({ success: false, error: e.message || '上传失败' })
  }
})

app.get('/api/r2', authMiddleware, async (req, res) => {
  try {
    const config = getR2Config()
    if (!config || !config.endpoint) {
      await appendLog('error', 'r2:get:no_config')
      return res.status(500).json({ success: false, error: 'R2 未配置' })
    }

    const content = await downloadFromR2()
    const notes = parseMarkdownToNotes(content)
    if (!notes || notes.length === 0) {
      await appendLog('error', 'r2:get:no_notes')
      return res.status(400).json({ success: false, error: 'R2 文件中没有找到有效的笔记' })
    }

    await pool.query('DELETE FROM notes')
    let importedCount = 0
    for (const note of notes) {
      try {
        await pool.query(
          'INSERT INTO notes (id, title, content, tags, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
          [note.id, note.title, note.content, JSON.stringify(note.tags || []), note.createdAt, note.updatedAt]
        )
        importedCount++
      } catch (e) {
        console.error('导入笔记失败:', e)
      }
    }

    await appendLog('info', 'r2:get:success', { importedCount })
    return res.json({ success: true, message: '成功从R2导入', fileName: 'notes.md', importedCount, updatedCount: 0, totalNotes: notes.length })
  } catch (e) {
    await appendLog('error', 'r2:get:failed', { error: String(e) })
    return res.status(500).json({ success: false, error: `下载失败: ${e.message || String(e)}` })
  }
})

app.get('/api/order/:key', authMiddleware, async (req, res) => {
  try {
    const key = req.params.key
    const result = await pool.query('SELECT value FROM order_data WHERE key = $1', [key])
    
    if (result.rows.length === 0) {
      return res.json({ success: true, data: null })
    }
    
    const value = result.rows[0].value
    const parsed = value ? safeJsonParse(value, value) : null
    
    res.json({ success: true, data: parsed })
  } catch (e) {
    console.error('加载顺序失败:', e)
    res.status(500).json({ success: false, error: '加载顺序失败' })
  }
})

app.post('/api/order/:key', authMiddleware, async (req, res) => {
  try {
    const key = req.params.key
    const value = req.body
    
    if (typeof value === 'undefined') {
      return res.status(400).json({ success: false, error: '缺少必需的参数' })
    }
    
    const valueStr = JSON.stringify(value)
    
    await pool.query(
      'INSERT INTO order_data (key, value, updated_at) VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at',
      [key, valueStr, new Date().toISOString()]
    )
    
    await appendLog('info', `Order data saved: ${key}`, { key })
    res.json({ success: true })
  } catch (e) {
    await appendLog('error', '保存顺序失败', { error: String(e) })
    res.status(500).json({ success: false, error: '保存顺序失败' })
  }
})

app.get('/api/logs', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM logs ORDER BY created_at DESC LIMIT 200')
    const logs = result.rows.map(row => ({
      id: row.id,
      level: row.level,
      message: row.message,
      meta: row.meta,
      created_at: row.created_at?.toISOString() || new Date().toISOString(),
    }))
    
    res.json({ items: logs })
  } catch (e) {
    console.error('加载日志失败:', e)
    res.status(500).json({ success: false, error: '加载日志失败' })
  }
})

app.delete('/api/logs', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM logs')
    res.json({ success: true })
  } catch {
    res.status(500).json({ success: false, error: '清空日志失败' })
  }
})

app.use((err, req, res, _next) => {
  console.error('[服务器] 未处理的错误:', err)
  res.status(500).json({ success: false, error: '服务器内部错误' })
})

if (existsSync(distDir)) {
  app.use(serveStatic(distDir, { index: false, maxAge: '1y', setHeaders: (res) => res.setHeader('Cache-Control', 'public, max-age=31536000') }))
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'))
  })
} else {
  console.warn(`[服务器] 警告: 静态文件目录不存在: ${distDir}`)
  app.get('*', (req, res) => {
    res.status(503).json({ success: false, error: '静态文件目录未找到，请先构建前端应用' })
  })
}

async function startServer() {
  try {
    await initDatabase()

    try {
      await pool.query('SELECT 1')
      console.warn('[服务器] PostgreSQL 连接成功')
    } catch (dbError) {
      console.error('[服务器] PostgreSQL 连接失败:', dbError)
      throw dbError
    }
    
    const startTime = new Date().toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
    
    app.listen(PORT, () => {
      console.warn('\n=================================')
      console.warn(`= 应用启动时间: ${startTime} =`)
      console.warn('=================================\n')
      console.warn(`[服务器] 正在监听 http://0.0.0.0:${PORT}`)
      console.warn(`[服务器] 发布目录: ${distDir}`)
      appendLog('info', '服务器已启动', `端口: ${PORT}, 数据库 已连接`).catch(err => {
        console.error('记录启动日志失败:', err)
      })
    })
  } catch (e) {
    console.error('[服务器] 启动失败:', e)
    process.exit(1)
  }
}

startServer()
