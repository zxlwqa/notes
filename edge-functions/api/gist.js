import { neon } from '@neondatabase/serverless'
import { logError, logToDatabase } from '../_utils/log.js'

function _toBase64(str) {
  try {
    return btoa(str)
  } catch {
    try {
      const bytes = new TextEncoder().encode(str)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      return btoa(binary)
    } catch {
      return ''
    }
  }
}

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

async function getGistId(sql) {
  try {
    const result = await sql`SELECT value FROM settings WHERE key = 'gist_id'`
    return result.length > 0 ? result[0].value : null
  } catch {
    return null
  }
}

async function saveGistId(sql, gistId) {
  try {
    await sql`
      INSERT INTO settings (key, value, updated_at) 
      VALUES ('gist_id', ${gistId}, NOW()) 
      ON CONFLICT (key) DO UPDATE SET value = ${gistId}, updated_at = NOW()
    `
  } catch (e) {
    console.error('Failed to save Gist ID:', e)
  }
}

async function findLatestNotesGist(gitToken) {
  try {
    const resp = await fetch('https://api.github.com/gists', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${gitToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Notes-App'
      }
    })

    if (!resp.ok) {
      console.error(`[GIST] 获取 Gist 列表失败: ${resp.status}`)
      return null
    }

    const gists = await resp.json()

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

export default async function onRequest(context) {
  const { request, env } = context
  const method = request.method
  
  console.warn('[GIST] Request method:', method)
  
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
    const GIT_TOKEN = env.GIT_TOKEN || ''
    
    if (method === 'POST') {
      console.warn('[GIST] Creating Gist from Neon database')
      
      try {
        const notes = await sql`
          SELECT id, title, content, tags, created_at, updated_at 
          FROM notes 
          ORDER BY created_at ASC
        `
        
        if (notes.length === 0) {
          try { await logToDatabase(env, 'warn', 'gist:post:no_notes') } catch {}
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
        
        if (!GIT_TOKEN) {
          try { await logToDatabase(env, 'error', 'gist:post:no_token') } catch {}
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'GitHub Token 未配置'
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          })
        }
        
        let gistId = await getGistId(sql)
        
        // 如果数据库中没有 gist_id，尝试搜索所有 Gist 找最新的
        if (!gistId) {
          console.warn('[GIST] 数据库中未找到 gist_id，搜索所有 Gist...')
          const latestGist = await findLatestNotesGist(GIT_TOKEN)
          if (latestGist) {
            gistId = latestGist.id
            console.warn(`[GIST] 找到最新的 Gist: ${gistId}，更新时间: ${latestGist.updated_at}`)
            await saveGistId(sql, gistId)
          }
        }

        const now = new Date(Date.now() + 8 * 60 * 60 * 1000)
        const gistData = {
          description: '笔记备份 - ' + now.toISOString().replace('T', ' ').substring(0, 19),
          public: false,
          files: {
            'notes.md': {
              content: markdown
            }
          }
        }
        
        let gistResponse
        if (gistId) {
          const resp = await fetch(`https://api.github.com/gists/${gistId}`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${GIT_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
              'User-Agent': 'Notes-App'
            },
            body: JSON.stringify(gistData)
          })
          
          if (!resp.ok) {
            // 如果 Gist 不存在（404），清除无效的 gist_id 并搜索或创建新的
            if (resp.status === 404) {
              console.warn(`[GIST] Gist ${gistId} 不存在，清除无效 ID 并搜索...`)
              try {
                await sql`DELETE FROM settings WHERE key = 'gist_id'`
              } catch (e) {
                console.error('[GIST] Failed to clear invalid gist_id:', e)
              }
              
              // 搜索所有 Gist 找最新的
            const latestGist = await findLatestNotesGist(GIT_TOKEN)
            if (latestGist) {
              gistId = latestGist.id
              console.warn(`[GIST] 找到最新的 Gist: ${gistId}，更新时间: ${latestGist.updated_at}`)
              await saveGistId(sql, gistId)
              
              // 尝试更新找到的 Gist
              const retryResp = await fetch(`https://api.github.com/gists/${gistId}`, {
                method: 'PATCH',
                headers: {
                  'Authorization': `Bearer ${GIT_TOKEN}`,
                  'Accept': 'application/vnd.github.v3+json',
                  'Content-Type': 'application/json',
                  'User-Agent': 'Notes-App'
                },
                body: JSON.stringify(gistData)
              })
              
              if (retryResp.ok) {
                gistResponse = await retryResp.json()
              } else {
                console.warn(`[GIST] 更新找到的 Gist 失败: ${retryResp.status}`)
              }
            }
            } else {
              const errorText = await resp.text()
              let errorMessage = `GitHub API 错误: ${resp.status}`
              try {
                const errorJson = JSON.parse(errorText)
                errorMessage = errorJson.message || errorJson.error || errorMessage
              } catch {
                const textPreview = errorText.substring(0, 200)
                errorMessage = textPreview || errorMessage
              }
              console.error(`[GIST] GitHub API 错误 (${resp.status}):`, errorMessage)
              throw new Error(errorMessage)
            }
          } else {
            // PATCH 成功，直接返回
            gistResponse = await resp.json()
          }
        }
        
        // 如果没有 gistResponse（要么没有 gistId，要么 gistId 无效且搜索也没找到），创建新 Gist
        if (!gistResponse) {
          console.warn('[GIST] 创建新的 Gist...')
          const resp = await fetch('https://api.github.com/gists', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${GIT_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
              'User-Agent': 'Notes-App'
            },
            body: JSON.stringify(gistData)
          })
          
          if (!resp.ok) {
            const errorText = await resp.text()
            let errorMessage = `GitHub API 错误: ${resp.status}`
            try {
              const errorJson = JSON.parse(errorText)
              errorMessage = errorJson.message || errorJson.error || errorMessage
            } catch {
              const textPreview = errorText.substring(0, 200)
              errorMessage = textPreview || errorMessage
            }
            console.error(`[GIST] GitHub API 错误 (${resp.status}):`, errorMessage)
            throw new Error(errorMessage)
          }
          
          gistResponse = await resp.json()
          if (gistResponse.id) {
            await saveGistId(sql, gistResponse.id)
            console.warn(`[GIST] 创建新 Gist 成功: ${gistResponse.id}`)
          }
        }
        
        console.warn('[GIST] Gist created/updated successfully, Gist ID:', gistResponse.id)
        try { await logToDatabase(env, 'info', 'gist:post:success', { gistId: gistResponse.id, count: notes.length }) } catch {}
        return new Response(JSON.stringify({ 
          success: true, 
          message: "成功上传到Gist",
          fileName: "notes.md",
          totalNotes: notes.length,
          gistId: gistResponse.id
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        })
      } catch (dbError) {
        console.error('[GIST] Operation failed:', dbError)
        logError('gist:post:error', { message: dbError?.message }, env)
        
        let errorMessage = '操作失败'
        let errorDetails = ''
        
        if (dbError?.message) {
          errorDetails = String(dbError.message)
          if (errorDetails.includes('GitHub API') || errorDetails.includes('Bad credentials') || errorDetails.includes('Not Found')) {
            errorMessage = errorDetails
          } else {
            errorMessage = '数据库操作失败'
          }
        }
        
        return new Response(JSON.stringify({ 
          success: false, 
          error: errorMessage,
          details: errorDetails || undefined
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
      console.warn('[GIST] Downloading notes from GitHub Gist and importing to Neon')
      try {
        if (!GIT_TOKEN) {
          try { await logToDatabase(env, 'error', 'gist:get:no_token') } catch {}
          return new Response(JSON.stringify({ success: false, error: 'GitHub Token 未配置' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          })
        }
        
        let gistId = await getGistId(sql)
        
        // 如果数据库中没有 gist_id，尝试搜索所有 Gist 找最新的
        if (!gistId) {
          console.warn('[GIST] 数据库中未找到 gist_id，搜索所有 Gist...')
          const latestGist = await findLatestNotesGist(GIT_TOKEN)
          if (latestGist) {
            gistId = latestGist.id
            console.warn(`[GIST] 找到最新的 Gist: ${gistId}，更新时间: ${latestGist.updated_at}`)
            await saveGistId(sql, gistId)
          }
        }

        if (!gistId) {
          try { await logToDatabase(env, 'error', 'gist:get:no_id') } catch {}
          return new Response(JSON.stringify({ success: false, error: '未找到Gist ID，请先上传备份' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          })
        }
        
        let resp = await fetch(`https://api.github.com/gists/${gistId}`, {
          headers: {
            'Authorization': `Bearer ${GIT_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Notes-App'
          }
        })
        
        // 如果 Gist 不存在（404），尝试搜索所有 Gist 找最新的
        if (!resp.ok && resp.status === 404) {
          console.warn(`[GIST] Gist ${gistId} 不存在，搜索所有 Gist...`)
          try {
            await sql`DELETE FROM settings WHERE key = 'gist_id'`
          } catch (e) {
            console.error('[GIST] Failed to clear invalid gist_id:', e)
          }
          
          const latestGist = await findLatestNotesGist(GIT_TOKEN)
          if (latestGist) {
            gistId = latestGist.id
            console.warn(`[GIST] 找到最新的 Gist: ${gistId}，更新时间: ${latestGist.updated_at}`)
            await saveGistId(sql, gistId)
            
            resp = await fetch(`https://api.github.com/gists/${gistId}`, {
              headers: {
                'Authorization': `Bearer ${GIT_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Notes-App'
              }
            })
          }
        }

        if (!resp.ok) {
          const errorText = await resp.text()
          let errorMessage = `GitHub API 错误: ${resp.status}`
          try {
            const errorJson = JSON.parse(errorText)
            errorMessage = errorJson.message || errorJson.error || errorMessage
          } catch {
            const textPreview = errorText.substring(0, 200)
            errorMessage = textPreview || errorMessage
          }
          console.error(`[GIST] GitHub API 错误 (${resp.status}):`, errorMessage)
          throw new Error(errorMessage)
        }
        
        const gistData = await resp.json()
        const file = gistData.files['notes.md'] || Object.values(gistData.files)[0]
        
        if (!file || !file.content) {
          try { await logToDatabase(env, 'error', 'gist:get:no_content') } catch {}
          return new Response(JSON.stringify({ success: false, error: 'Gist中没有找到笔记内容' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          })
        }
        
        const parsedNotes = parseBackupToNotes(file.content)
        console.warn('[GIST] Parsed notes count:', parsedNotes.length)
        
        if (parsedNotes.length === 0) {
          try { await logToDatabase(env, 'error', 'gist:get:no_notes', { message: 'No notes parsed' }) } catch {}
          return new Response(JSON.stringify({ success: false, error: 'Gist文件中没有找到有效的笔记' }), {
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
        console.warn('[GIST] Cleared existing notes before import')
        
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
          console.warn('[GIST] Bulk UPSERT failed, falling back to slow path:', bulkErr?.message)
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
              console.error(`[GIST] Failed to insert note ${n.id}:`, dbError)
            }
          }
        }

        try { await logToDatabase(env, 'info', 'gist:get:success', { gistId, importedCount }) } catch {}
        return new Response(JSON.stringify({ success: true, fileName: 'notes.md', importedCount, updatedCount: 0 }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        })
      } catch (err) {
        console.error('[GIST] Download/import failed:', err)
        logError('gist:get:error', { message: err?.message }, env)
        return new Response(JSON.stringify({ success: false, error: 'GitHub Gist下载/导入失败', details: err?.message }), {
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
    console.error('Gist error:', error)
    logError('gist:unhandled', { message: error?.message }, env)
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    })
  }
}

