import { neon } from '@neondatabase/serverless'
import { logError, logToDatabase } from '../_utils/log.js'

function parseBackupToNotes(text) {
  try {
    const json = JSON.parse(text)
    const arr = Array.isArray(json) ? json : (Array.isArray(json?.notes) ? json.notes : null)
    if (Array.isArray(arr)) {
      return arr.filter(n => n && (n.content || n.title)).map(n => ({
        id: n.id || `imported-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        title: String(n.title || '未命名'),
        tags: Array.isArray(n.tags) ? n.tags : [],
        createdAt: n.createdAt || new Date().toISOString(),
        updatedAt: n.updatedAt || new Date().toISOString(),
      }))
    }
  } catch {}

  const notes = []
  const noteContents = text.split('\n\n---\n\n').filter(note => note.trim())
  
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
    
    notes.push({
      id: `imported-${Date.now()}-${index}`,
      title,
      content: noteContentText,
      tags,
      createdAt,
      updatedAt,
    })
  })
  return notes
}

function getR2Config(env) {
  const accountId = env.ACCOUNT_ID || ''
  const accessKeyId = env.ACCESS_KEY_ID || ''
  const secretAccessKey = env.SECRET_ACCESS_KEY || ''
  
  if (!accountId) {
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
  
  const payloadArray = payload ? new TextEncoder().encode(payload) : new Uint8Array(0)
  const payloadHashBuffer = await crypto.subtle.digest('SHA-256', payloadArray)
  const payloadHash = Array.from(new Uint8Array(payloadHashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  
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
  
  const canonicalRequestArray = new TextEncoder().encode(canonicalRequest)
  const canonicalRequestHashBuffer = await crypto.subtle.digest('SHA-256', canonicalRequestArray)
  const canonicalRequestHash = Array.from(new Uint8Array(canonicalRequestHashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    canonicalRequestHash
  ].join('\n')
  
  async function hmac(key, data) {
    const keyData = typeof key === 'string' ? new TextEncoder().encode(key) : key
    const dataArray = typeof data === 'string' ? new TextEncoder().encode(data) : data
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
  const signature = Array.from(signatureBuffer)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  
  const authorization = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  
  return {
    authorization,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash
  }
}

async function uploadToR2(content, env) {
  const config = getR2Config(env)
  if (!config || !config.endpoint) {
    throw new Error('R2 未配置。请设置 ACCOUNT_ID、ACCESS_KEY_ID 和 SECRET_ACCESS_KEY 环境变量')
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
}

async function downloadFromR2(env) {
  const config = getR2Config(env)
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
}

export default async function onRequest(context) {
  const { request, env } = context
  const method = request.method
  
  console.warn('[R2] Request method:', method)
  
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    })
  }

  try {
    const sql = neon(env.DATABASE_URL)
    
    if (method === 'POST') {
      console.warn('[R2] Uploading notes to R2 from Neon database')
      
      try {
        const notes = await sql`
          SELECT id, title, content, tags, created_at, updated_at 
          FROM notes 
          ORDER BY created_at ASC
        `
        
        if (notes.length === 0) {
          try { await logToDatabase(env, 'warn', 'r2:post:no_notes') } catch {}
          return new Response(JSON.stringify({ 
            success: false, 
            error: "没有可导出的笔记"
          }), {
            status: 404,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          })
        }
        
        let markdown = ''
        notes.forEach((note, index) => {
          markdown += `# ${note.title}\n`
          markdown += `标签: ${note.tags ? JSON.parse(note.tags).join(', ') : ''}\n`
          markdown += `创建时间: ${note.created_at?.toISOString() || ''}\n`
          markdown += `更新时间: ${note.updated_at?.toISOString() || ''}\n\n`
          markdown += `${note.content}\n\n`
          if (index < notes.length - 1) {
            markdown += '---\n\n'
          }
        })
        
        await uploadToR2(markdown, env)
        
        console.warn('[R2] Uploaded successfully, notes count:', notes.length)
        try { await logToDatabase(env, 'info', 'r2:post:success', { count: notes.length }) } catch {}
        return new Response(JSON.stringify({ 
          success: true, 
          message: "成功上传到R2",
          fileName: "notes.md",
          totalNotes: notes.length,
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        })
      } catch (dbError) {
        console.error('[R2] Upload failed:', dbError)
        logError('r2:post:error', { message: dbError?.message }, env)
        
        let errorMessage = '操作失败'
        if (dbError?.message) {
          errorMessage = String(dbError.message)
        }
        
        return new Response(JSON.stringify({ 
          success: false, 
          error: errorMessage,
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        })
      }
    }

    if (method === 'GET') {
      console.warn('[R2] Downloading notes from R2 and importing to Neon')
      try {
        const content = await downloadFromR2(env)
        const parsedNotes = parseBackupToNotes(content)
        console.warn('[R2] Parsed notes count:', parsedNotes.length)
        
        if (parsedNotes.length === 0) {
          try { await logToDatabase(env, 'error', 'r2:get:no_notes', { message: 'No notes parsed' }) } catch {}
          return new Response(JSON.stringify({ success: false, error: '备份文件中没有找到有效的笔记' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          })
        }
        
        await sql`
          CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            tags TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          )
        `
        await sql`DELETE FROM notes`
        console.warn('[R2] Cleared existing notes before import')
        
        let importedCount = 0
        try {
          const rows = parsedNotes.map(n => ({
            id: String(n.id),
            title: String(n.title || ''),
            content: String(n.content || ''),
            tags: JSON.stringify(n.tags || []),
            created_at: n.createdAt || new Date().toISOString(),
            updated_at: n.updatedAt || new Date().toISOString(),
          }))
          const rowsJson = JSON.stringify(rows)
          await sql`
            INSERT INTO notes (id, title, content, tags, created_at, updated_at)
            SELECT id, title, content, tags, created_at, updated_at
            FROM json_to_recordset(${rowsJson}::json)
              AS x(id text, title text, content text, tags text, created_at timestamptz, updated_at timestamptz)
            ON CONFLICT (id) DO UPDATE SET
              title = EXCLUDED.title,
              content = EXCLUDED.content,
              tags = EXCLUDED.tags,
              updated_at = EXCLUDED.updated_at
          `
          importedCount = parsedNotes.length
        } catch (bulkErr) {
          console.warn('[R2] Bulk UPSERT failed, falling back to slow path:', bulkErr?.message)
          for (const n of parsedNotes) {
            try {
              await sql`
                INSERT INTO notes (id, title, content, tags, created_at, updated_at)
                VALUES (${n.id}, ${n.title}, ${n.content}, ${JSON.stringify(n.tags)}, ${n.createdAt}, ${n.updatedAt})
                ON CONFLICT (id) DO UPDATE SET
                  title = EXCLUDED.title,
                  content = EXCLUDED.content,
                  tags = EXCLUDED.tags,
                  updated_at = EXCLUDED.updated_at
              `
              importedCount++
            } catch (dbError) {
              console.error(`[R2] Failed to insert note ${n.id}:`, dbError)
            }
          }
        }

        try { await logToDatabase(env, 'info', 'r2:get:success', { importedCount }) } catch {}
        return new Response(JSON.stringify({ success: true, fileName: 'notes.md', importedCount, updatedCount: 0 }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        })
      } catch (err) {
        console.error('[R2] Download/import failed:', err)
        logError('r2:get:error', { message: err?.message }, env)
        return new Response(JSON.stringify({ success: false, error: 'R2下载/导入失败', details: err?.message }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        })
      }
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    })
  } catch (error) {
    console.error('R2 error:', error)
    logError('r2:unhandled', { message: error?.message }, env)
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    })
  }
}
