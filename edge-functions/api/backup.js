import { neon } from '@neondatabase/serverless'
import { logError, logToDatabase } from '../_utils/log.js'

function toBase64(str) {
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export default async function onRequest(context) {
  const { request, env } = context
  const method = request.method
  
  console.warn('[BACKUP] Request method:', method)
  console.warn('[BACKUP] Environment variables:', Object.keys(env || {}))
  
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
      console.warn('[BACKUP] Creating backup from Neon database')
      
      try {
        const notes = await sql`
          SELECT id, title, content, tags, created_at, updated_at 
          FROM notes 
          ORDER BY created_at ASC
        `
        
        const backupData = {
          timestamp: new Date().toISOString(),
          version: '1.0',
          notes: notes.map(note => ({
            id: note.id,
            title: note.title,
            content: note.content,
            tags: note.tags ? JSON.parse(note.tags) : [],
            createdAt: note.created_at?.toISOString(),
            updatedAt: note.updated_at?.toISOString(),
          }))
        }
        
        console.warn('[BACKUP] Backup created successfully, notes count:', backupData.notes.length)
        try { await logToDatabase(env, 'info', 'backup:post:success', { count: backupData.notes.length }) } catch {}
        return new Response(JSON.stringify({ 
          success: true, 
          message: "备份创建成功",
          fileName: "notes.md",
          totalNotes: backupData.notes.length,
          data: backupData
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        })
      } catch (dbError) {
        console.error('[BACKUP] Database backup failed:', dbError)
        logError('backup:post:error', { message: dbError?.message }, env)
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Database backup failed',
          details: dbError.message
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        })
      }
    }

    if (method === 'DELETE') {
      console.warn('[BACKUP] Clearing all notes from database')
      
      try {
        const countResult = await sql`SELECT COUNT(*) as count FROM notes`
        const currentCount = countResult[0]?.count || 0
        
        await sql`DELETE FROM notes`
        
        console.warn(`[BACKUP] Cleared ${currentCount} notes from database`)
        try { await logToDatabase(env, 'info', 'backup:clear:success', { clearedCount: currentCount }) } catch {}
        
        return new Response(JSON.stringify({ 
          success: true, 
          message: `已清空 ${currentCount} 条笔记`,
          clearedCount: currentCount
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        })
      } catch (dbError) {
        console.error('[BACKUP] Failed to clear notes:', dbError)
        await logError('backup:clear:error', { message: dbError?.message }, env)
        return new Response(JSON.stringify({ 
          success: false, 
          error: '清理笔记失败',
          details: dbError?.message 
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
      console.warn('[BACKUP] Downloading notes from WebDAV and importing to Neon')
      try {
        const base = (env.WEBDAV_URL || '').replace(/\/$/, '')
        const user = env.WEBDAV_USER || ''
        const pass = env.WEBDAV_PASS || ''
        if (!base || !user || !pass) {
          throw new Error('WebDAV not configured')
        }
        const auth = 'Basic ' + toBase64(`${user}:${pass}`)
        const headers = {
          Authorization: auth,
          Accept: 'text/plain, text/markdown, application/json'
        }
        const candidates = [`${base}/notes-latest.md`, `${base}/notes.md`]
        let text = ''
        let fileName = 'notes.md'
        let lastStatus = null
        let lastStatusText = ''
        for (const url of candidates) {
          const resp = await fetch(url, { headers, method: 'GET' })
          if (resp.ok) { text = await resp.text(); fileName = url.split('/').pop() || 'notes.md'; break }
          lastStatus = resp.status
          try { lastStatusText = await resp.text() } catch { lastStatusText = resp.statusText || '' }
        }
        if (!text) {
          const detail = `WebDAV fetch failed: status=${lastStatus}, url candidates tried`
          await logError('backup:download:error', { message: detail, status: lastStatus, body: lastStatusText }, env)
          return new Response(JSON.stringify({ success: false, error: 'WebDAV fetch failed', status: lastStatus }), {
            status: 502,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          })
        }

        const parsedNotes = parseBackupToNotes(text)
        console.warn('[BACKUP] Parsed notes count:', parsedNotes.length)
        console.warn('[BACKUP] First few notes:', parsedNotes.slice(0, 2))
        
        if (parsedNotes.length === 0) {
          await logError('backup:download:error', { message: 'No notes parsed from WebDAV content' }, env)
          return new Response(JSON.stringify({ success: false, error: 'No notes found in WebDAV file' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          })
        }
        
        let importedCount = 0
        let updatedCount = 0
        try {
          await sql`SELECT 1 as test`
          console.warn('[BACKUP] Database connection test successful')
        } catch (dbTestError) {
          console.error('[BACKUP] Database connection test failed:', dbTestError)
          await logError('backup:download:error', { message: 'Database connection test failed', details: dbTestError.message }, env)
          return new Response(JSON.stringify({ success: false, error: 'Database connection failed', details: dbTestError.message }), {
            status: 500,
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
        console.warn('[BACKUP] Cleared existing notes before import')
        
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
          console.warn('[BACKUP] Bulk UPSERT failed, falling back to slow path:', bulkErr?.message)
          for (let i = 0; i < parsedNotes.length; i++) {
            const n = parsedNotes[i]
            const id = n.id
            const title = n.title
            const content = n.content
            const tags = n.tags || []
            const createdAt = n.createdAt
            const updatedAt = n.updatedAt

            let retries = 3
            let success = false
            while (retries > 0 && !success) {
              try {
                const res = await sql`
                  INSERT INTO notes (id, title, content, tags, created_at, updated_at)
                  VALUES (${id}, ${title}, ${content}, ${JSON.stringify(tags)}, ${createdAt}, ${updatedAt})
                  ON CONFLICT (id) DO UPDATE SET
                    title = EXCLUDED.title,
                    content = EXCLUDED.content,
                    tags = EXCLUDED.tags,
                    updated_at = EXCLUDED.updated_at
                  RETURNING (xmax <> 0) AS updated
                `
                const wasUpdated = Array.isArray(res) ? res[0]?.updated : res?.[0]?.updated
                if (wasUpdated) updatedCount++
                else importedCount++
                success = true
              } catch (dbError) {
                retries--
                if (retries === 0) {
                  console.error(`[BACKUP] Failed to insert note ${id} after 3 retries:`, dbError)
                  throw dbError
                }
                await sleep(1000)
              }
            }
            if (i + 1 < parsedNotes.length) await sleep(500)
          }
        }

        try { await logToDatabase(env, 'info', 'backup:download:success', { fileName, importedCount, updatedCount }) } catch {}
        return new Response(JSON.stringify({ success: true, fileName, importedCount, updatedCount }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        })
      } catch (err) {
        console.error('[BACKUP] WebDAV download/import failed:', err)
        logError('backup:download:error', { message: err?.message }, env)
        return new Response(JSON.stringify({ success: false, error: 'WebDAV download/import failed', details: err?.message }), {
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
    console.error('Backup error:', error)
    logError('backup:unhandled', { message: error?.message }, env)
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    })
  }
}
