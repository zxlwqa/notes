import { logToD1 } from '../_utils/log'
import type { PagesFunction, D1Database } from '../types'

// 数据库笔记行类型
interface NoteRow {
  id?: string
  title?: string
  content?: string
  tags?: string
  created_at?: string
  updated_at?: string
}

async function getGistId(env: { NOTESD: D1Database }): Promise<string | null> {
  try {
    const result = await env.NOTESD.prepare("SELECT value FROM settings WHERE key = ?").bind('gist_id').first<{ value: string }>()
    return result ? result.value : null
  } catch {
    return null
  }
}

async function saveGistId(env: { NOTESD: D1Database }, gistId: string): Promise<void> {
  try {
    await env.NOTESD.prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = ?, updated_at = ?"
    ).bind('gist_id', gistId, new Date().toISOString(), gistId, new Date().toISOString()).run()
  } catch (e) {
    console.error('Failed to save Gist ID:', e)
  }
}

async function findLatestNotesGist(gitToken: string): Promise<{ id: string; updated_at: string } | null> {
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

    const gists = await resp.json() as Array<{
      id: string
      description: string
      files: Record<string, { filename: string }>
      updated_at: string
    }>

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

function parseMarkdownToNotes(content: string): Array<{
  id: string
  title: string
  content: string
  tags: string[]
  createdAt: string
  updatedAt: string
}> {
  const notes: Array<{
    id: string
    title: string
    content: string
    tags: string[]
    createdAt: string
    updatedAt: string
  }> = []

  const noteContents = content.split('\n\n---\n\n').filter(note => note.trim())
  
  noteContents.forEach((noteContent, index) => {
    const trimmedContent = noteContent.trim()
    if (trimmedContent) {
      const lines = trimmedContent.split('\n')
      
      let title = lines[0] || `导入笔记 ${index + 1}`
      if (title.startsWith('# ')) {
        title = title.slice(2)
      }
      
      let tags: string[] = []
      let createdAt = new Date(Date.now() + 8 * 60 * 60 * 1000)
        .toISOString()
        .replace('Z', '')
        .replace(/\.\d{3}$/, '')
      let updatedAt = new Date(Date.now() + 8 * 60 * 60 * 1000)
        .toISOString()
        .replace('Z', '')
        .replace(/\.\d{3}$/, '')
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
        updatedAt
      })
    }
  })

  return notes
}

export const onRequestPost: PagesFunction<{
  NOTESD: D1Database
  GIT_TOKEN: string
}> = async (context) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  let content = ""
  let notesCount = 0
  try {
    const result = await context.env.NOTESD.prepare("SELECT id, title, content, tags, created_at, updated_at FROM notes").all<NoteRow>()
    const results = result.results || []
    notesCount = results.length
    if (notesCount === 0) {
      await logToD1(context.env, 'warn', 'gist.upload.no_notes')
      return new Response(
        JSON.stringify({ success: false, error: "没有可导出的笔记" }),
        { status: 404, headers: corsHeaders }
      )
    }
    content = results.map((row: NoteRow) => {
      const title = row.title || '无标题'
      const createdAt = row.created_at || ''
      const updatedAt = row.updated_at || ''
      const noteContent = row.content || ''
      const tags = row.tags ? (typeof row.tags === 'string' ? row.tags : JSON.stringify(row.tags)) : ''
      
      return `# ${title}\n标签: ${tags}\n创建时间: ${createdAt}\n更新时间: ${updatedAt}\n\n${noteContent}`
    }).join('\n\n---\n\n')
    } catch (e) {
      console.error("数据库读取失败", e)
    await logToD1(context.env, 'error', 'gist.upload.db_error', { message: e instanceof Error ? e.message : String(e) })
    return new Response(
      JSON.stringify({ success: false, error: "数据库读取失败" }),
      { status: 500, headers: corsHeaders }
    )
  }

  const gitToken = context.env.GIT_TOKEN || ''
  
  if (!gitToken) {
    await logToD1(context.env, 'error', 'gist.upload.no_token')
    return new Response(
      JSON.stringify({ success: false, error: "GitHub Token 未配置" }),
      { status: 500, headers: corsHeaders }
    )
  }

  try {
    let gistId = await getGistId(context.env)
    
    // 如果数据库中没有 gist_id，尝试搜索所有 Gist 找最新的
    if (!gistId) {
      console.warn('[GIST] 数据库中未找到 gist_id，搜索所有 Gist...')
      const latestGist = await findLatestNotesGist(gitToken)
      if (latestGist) {
        gistId = latestGist.id
        console.warn(`[GIST] 找到最新的 Gist: ${gistId}，更新时间: ${latestGist.updated_at}`)
        await saveGistId(context.env, gistId)
      }
    }

    const gistData = {
      description: '笔记备份 - ' + new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19),
      public: false,
      files: {
        'notes.md': {
          content: content
        }
      }
    }

    let gistResponse: { id?: string } | undefined
    if (gistId) {
      const resp = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${gitToken}`,
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
            await context.env.NOTESD.prepare("DELETE FROM settings WHERE key = ?").bind('gist_id').run()
          } catch (e) {
            console.error('[GIST] Failed to clear invalid gist_id:', e)
          }
          
          // 搜索所有 Gist 找最新的
          const latestGist = await findLatestNotesGist(gitToken)
          if (latestGist) {
            gistId = latestGist.id
            console.warn(`[GIST] 找到最新的 Gist: ${gistId}，更新时间: ${latestGist.updated_at}`)
            await saveGistId(context.env, gistId)
            
            // 尝试更新找到的 Gist
            const retryResp = await fetch(`https://api.github.com/gists/${gistId}`, {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${gitToken}`,
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
          'Authorization': `Bearer ${gitToken}`,
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
      if (gistResponse?.id) {
        await saveGistId(context.env, gistResponse.id)
        console.warn(`[GIST] 创建新 Gist 成功: ${gistResponse.id}`)
      }
    }

    // 确保 gistResponse 已定义
    if (!gistResponse || !gistResponse.id) {
      throw new Error('无法创建或更新 Gist')
    }

    await logToD1(context.env, 'info', 'gist.upload.success', { fileName: 'notes.md', totalNotes: notesCount, gistId: gistResponse.id })
    return new Response(
      JSON.stringify({ 
        success: true, 
        fileName: 'notes.md',
        totalNotes: notesCount,
        gistId: gistResponse.id,
        uploadTime: new Date(Date.now() + 8 * 60 * 60 * 1000)
          .toISOString()
          .replace('Z', '')
          .replace(/\.\d{3}$/, '')
      }),
      { status: 200, headers: corsHeaders }
    )
  } catch (e: unknown) {
    console.error("GitHub Gist 上传异常:", e)
    const errorMessage = e instanceof Error ? e.message : String(e)
    await logToD1(context.env, 'error', 'gist.upload.exception', { message: errorMessage })
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: corsHeaders }
    )
  }
}

export const onRequestGet: PagesFunction<{
  NOTESD: D1Database
  GIT_TOKEN: string
}> = async (context) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  const gitToken = context.env.GIT_TOKEN || ''
  
  if (!gitToken) {
    await logToD1(context.env, 'error', 'gist.download.no_token')
    return new Response(
      JSON.stringify({ success: false, error: "GitHub Token 未配置" }),
      { status: 500, headers: corsHeaders }
    )
  }

  let gistId = await getGistId(context.env)
  
    // 如果数据库中没有 gist_id，尝试搜索所有 Gist 找最新的
    if (!gistId) {
      console.warn('[GIST] 数据库中未找到 gist_id，搜索所有 Gist...')
    const latestGist = await findLatestNotesGist(gitToken)
      if (latestGist) {
        gistId = latestGist.id
        console.warn(`[GIST] 找到最新的 Gist: ${gistId}，更新时间: ${latestGist.updated_at}`)
        await saveGistId(context.env, gistId)
      }
  }

  if (!gistId) {
    await logToD1(context.env, 'error', 'gist.download.no_id')
    return new Response(
      JSON.stringify({ success: false, error: "未找到Gist ID，请先上传备份" }),
      { status: 404, headers: corsHeaders }
    )
  }

  try {
    let resp = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${gitToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Notes-App'
      }
    })

    // 如果 Gist 不存在（404），尝试搜索所有 Gist 找最新的
    if (!resp.ok && resp.status === 404) {
      console.warn(`[GIST] Gist ${gistId} 不存在，搜索所有 Gist...`)
      try {
        await context.env.NOTESD.prepare("DELETE FROM settings WHERE key = ?").bind('gist_id').run()
      } catch (e) {
        console.error('[GIST] Failed to clear invalid gist_id:', e)
      }
      
      const latestGist = await findLatestNotesGist(gitToken)
      if (latestGist) {
        gistId = latestGist.id
        console.warn(`[GIST] 找到最新的 Gist: ${gistId}，更新时间: ${latestGist.updated_at}`)
        await saveGistId(context.env, gistId)
        
        resp = await fetch(`https://api.github.com/gists/${gistId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${gitToken}`,
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
        errorMessage = errorJson.message || errorMessage
      } catch {
        errorMessage = errorText || errorMessage
      }
      throw new Error(errorMessage)
    }

    const gistData = await resp.json()
    const file = gistData.files['notes.md'] || Object.values(gistData.files)[0]
    
    if (!file || !file.content) {
      return new Response(
        JSON.stringify({ success: false, error: "Gist中没有找到笔记内容" }),
        { status: 400, headers: corsHeaders }
      )
    }
    
    const notes = parseMarkdownToNotes(file.content)
    
    if (notes.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "备份文件中没有找到笔记内容" }),
        { status: 400, headers: corsHeaders }
      )
    }

    await context.env.NOTESD.prepare("DELETE FROM notes").run()
    
    let importedCount = 0
    for (const note of notes) {
      try {
        await context.env.NOTESD.prepare(`
          INSERT INTO notes (id, title, content, tags, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
          note.id,
          note.title,
          note.content,
          JSON.stringify(note.tags || []),
          note.createdAt,
          note.updatedAt
        ).run()
        importedCount++
      } catch (e) {
        console.error(`导入笔记失败:`, e)
      }
    }

    await logToD1(context.env, 'info', 'gist.download.success', { fileName: 'notes.md', importedCount })
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "成功从Gist导入",
        fileName: 'notes.md',
        importedCount: importedCount,
        updatedCount: 0,
        totalNotes: notes.length
      }),
      { status: 200, headers: corsHeaders }
    )
  } catch (e: unknown) {
    console.error("GitHub Gist 下载异常:", e)
    const errorMessage = e instanceof Error ? e.message : String(e)
    await logToD1(context.env, 'error', 'gist.download.exception', { message: errorMessage })
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: corsHeaders }
    )
  }
}

