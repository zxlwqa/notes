import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

const PASSWORD = process.env.PASSWORD || ''

function getR2Config() {
  const accountId = process.env.ACCOUNT_ID || ''
  const accessKeyId = process.env.ACCESS_KEY_ID || ''
  const secretAccessKey = process.env.SECRET_ACCESS_KEY || ''
  
  if (!accountId) {
    console.error('[R2] ACCOUNT_ID 未配置')
    return null
  }
  
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`
  const bucketName = 'notes'
  
  return {
    accountId,
    endpoint,
    accessKeyId,
    secretAccessKey,
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
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_data (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.warn('[vercel] Database tables initialized')
  } catch (e) {
    console.error('[vercel] Failed to initialize database:', e)
  }
}

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

function checkAuth(req) {
  if (!PASSWORD) return true
  const auth = req.headers.authorization
  return auth && auth === `Bearer ${PASSWORD}`
}

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

async function uploadToR2(content) {
  const config = getR2Config()
  if (!config || !config.endpoint) {
    throw new Error('R2未配置。请设置 ACCOUNT_ID、ACCESS_KEY_ID 和 SECRET_ACCESS_KEY 环境变量')
  }
  const filename = 'notes.md'
  const url = `${config.endpoint}/${config.bucketName}/${filename}`
  
  const headers = {
    'Content-Type': 'text/markdown; charset=utf-8',
  }
  
  if (!config.accessKeyId || !config.secretAccessKey) {
    throw new Error('请配置 ACCESS_KEY_ID 和 SECRET_ACCESS_KEY 环境变量')
  }
  
  const awsHeaders = await createAwsSignatureV4('PUT', url, headers, content, config.accessKeyId, config.secretAccessKey, 'auto')
  Object.assign(headers, awsHeaders)
  
  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: headers,
      body: content
    })

    if (!response.ok) {
      const errorText = await response.text()
      
      if (response.status === 401) {
        if (!config.accessKeyId || !config.secretAccessKey) {
          throw new Error('请配置 ACCESS_KEY_ID 和 SECRET_ACCESS_KEY 环境变量')
        } else {
          throw new Error('R2 认证失败。请检查 ACCESS_KEY_ID 和 SECRET_ACCESS_KEY 是否正确')
        }
      }
      
      let errorMessage = `R2 上传失败 (状态码: ${response.status})`
      
      const codeMatch = errorText.match(/<Code>(.*?)<\/Code>/i)
      const messageMatch = errorText.match(/<Message>(.*?)<\/Message>/i)
      if (codeMatch || messageMatch) {
        const code = codeMatch ? codeMatch[1] : ''
        const message = messageMatch ? messageMatch[1] : ''
        if (code || message) {
          errorMessage = `R2 上传失败: ${code ? code + ' - ' : ''}${message || ''}`
        }
      }
      
      if (errorText.includes('Unauthorized') || errorText.includes('not authorized')) {
        errorMessage = 'R2 认证失败。请检查 ACCESS_KEY_ID 和 SECRET_ACCESS_KEY 是否正确'
      }
      
      throw new Error(errorMessage)
    }

    return response
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`网络错误: 无法连接 R2 服务 (${url})`)
    }
    if (error.message && (error.message.includes('R2') || error.message.includes('配置') || error.message.includes('认证'))) {
      throw error
    }
    throw new Error(`R2 上传失败: ${error.message || String(error)}`)
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
    const response = await fetch(url, {
      method: 'GET',
      headers: headers,
    })

    if (!response.ok) {
      const errorText = await response.text()
      
      if (response.status === 401) {
        if (!config.accessKeyId || !config.secretAccessKey) {
          throw new Error('请配置 ACCESS_KEY_ID 和 SECRET_ACCESS_KEY 环境变量')
        } else {
          throw new Error('R2 认证失败。请检查 ACCESS_KEY_ID 和 SECRET_ACCESS_KEY 是否正确')
        }
      }
      
      let errorMessage = `R2 下载失败 (状态码: ${response.status})`
      
      const codeMatch = errorText.match(/<Code>(.*?)<\/Code>/i)
      const messageMatch = errorText.match(/<Message>(.*?)<\/Message>/i)
      if (codeMatch || messageMatch) {
        const code = codeMatch ? codeMatch[1] : ''
        const message = messageMatch ? messageMatch[1] : ''
        if (code || message) {
          errorMessage = `R2 下载失败: ${code ? code + ' - ' : ''}${message || ''}`
        }
      }
      
      if (errorText.includes('Unauthorized') || errorText.includes('not authorized')) {
        errorMessage = 'R2 认证失败。请检查 ACCESS_KEY_ID 和 SECRET_ACCESS_KEY 是否正确'
      }
      
      throw new Error(errorMessage)
    }
    
    return await response.text()
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`网络错误: 无法连接 R2 服务 (${url})`)
    }
    if (error.message && (error.message.includes('R2') || error.message.includes('配置') || error.message.includes('认证'))) {
      throw error
    }
    throw new Error(`R2 下载失败: ${error.message || String(error)}`)
  }
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
        await uploadToR2(markdown)
        await appendLog('info', '笔记已成功上传到R2', `文件: notes.md, 笔记数量: ${notes.length}`)
        return res.json({ success: true, message: `笔记已成功上传到R2`, fileName: 'notes.md', totalNotes: notes.length })
      } catch (e) {
        const errorMsg = e?.message || String(e) || '未知错误'
        console.error('R2 upload error:', errorMsg, e)
        await appendLog('error', 'R2 上传失败', errorMsg).catch(() => {})
        return res.status(500).json({ success: false, error: `上传失败: ${errorMsg}` })
      }
    }

    if (req.method === 'GET') {
      try {
        const markdown = await downloadFromR2()
        
        const notes = []
        const noteContents = markdown.split('\n\n---\n\n').filter(note => note.trim())
        
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

        if (notes.length === 0) {
          return res.json({ success: false, error: '备份文件中没有找到有效的笔记' })
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

  await appendLog('info', '笔记已成功从R2下载并导入', `文件: notes.md, 导入: ${notes.length} 条`)
  return res.json({ success: true, message: `笔记已成功从R2下载并导入`, fileName: 'notes.md', importedCount: notes.length, updatedCount: 0 })
      } catch (e) {
        const errorMsg = e?.message || String(e) || '未知错误'
        console.error('R2 download error:', errorMsg, e)
        await appendLog('error', 'R2 下载失败', errorMsg).catch(() => {})
        return res.status(500).json({ success: false, error: `下载失败: ${errorMsg}` })
      }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' })
  } catch (e) {
    console.error('R2 API error:', e)
    const errorMessage = e?.message || String(e) || 'Internal server error'
    await appendLog('error', 'R2 API 异常', errorMessage).catch(() => {})
  return res.status(500).json({ success: false, error: `服务器错误: ${errorMessage}` })
  }
}
