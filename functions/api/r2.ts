import { logToD1 } from '../_utils/log'
import type { PagesFunction, D1Database, R2Bucket } from '../types'

// 数据库笔记行类型
interface NoteRow {
  id?: string
  title?: string
  content?: string
  tags?: string
  created_at?: string
  updated_at?: string
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
  NOTESR: R2Bucket
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
      await logToD1(context.env, 'warn', 'r2.upload.no_notes')
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
    await logToD1(context.env, 'error', 'r2.upload.db_error', { message: e instanceof Error ? e.message : String(e) })
    return new Response(
      JSON.stringify({ success: false, error: "数据库读取失败" }),
      { status: 500, headers: corsHeaders }
    )
  }

  const bucket = context.env.NOTESR
  if (!bucket) {
    await logToD1(context.env, 'error', 'r2.upload.no_bucket')
    return new Response(
      JSON.stringify({ success: false, error: "R2存储桶未配置" }),
      { status: 500, headers: corsHeaders }
    )
  }

  try {
    const filename = 'notes.md'
    await bucket.put(filename, content, {
      httpMetadata: {
        contentType: 'text/markdown; charset=utf-8',
      },
      customMetadata: {
        uploadedAt: new Date().toISOString(),
        notesCount: notesCount.toString(),
      },
    })

    await logToD1(context.env, 'info', 'r2.upload.success', { fileName: filename, totalNotes: notesCount })
    return new Response(
      JSON.stringify({ 
        success: true, 
        fileName: filename,
        totalNotes: notesCount,
        uploadTime: new Date(Date.now() + 8 * 60 * 60 * 1000)
          .toISOString()
          .replace('Z', '')
          .replace(/\.\d{3}$/, '')
      }),
      { status: 200, headers: corsHeaders }
    )
  } catch (e: unknown) {
    console.error("R2 上传异常:", e)
    const errorMessage = e instanceof Error ? e.message : String(e)
    await logToD1(context.env, 'error', 'r2.upload.exception', { message: errorMessage })
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: corsHeaders }
    )
  }
}

export const onRequestGet: PagesFunction<{
  NOTESD: D1Database
  NOTESR: R2Bucket
}> = async (context) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  const bucket = context.env.NOTESR
  if (!bucket) {
    await logToD1(context.env, 'error', 'r2.download.no_bucket')
    return new Response(
      JSON.stringify({ success: false, error: "R2存储桶未配置" }),
      { status: 500, headers: corsHeaders }
    )
  }

  try {
    const filename = 'notes.md'
    const object = await bucket.get(filename)
    
    if (!object) {
      await logToD1(context.env, 'error', 'r2.download.not_found')
      return new Response(
        JSON.stringify({ success: false, error: "R2中未找到备份文件" }),
        { status: 404, headers: corsHeaders }
      )
    }

    const content = await object.text()
    const notes = parseMarkdownToNotes(content)
    
    if (notes.length === 0) {
      await logToD1(context.env, 'error', 'r2.download.no_notes')
      return new Response(
        JSON.stringify({ success: false, error: "备份文件中没有找到有效的笔记" }),
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

    await logToD1(context.env, 'info', 'r2.download.success', { fileName: filename, importedCount })
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "成功从R2导入",
        fileName: filename,
        importedCount: importedCount,
        updatedCount: 0,
        totalNotes: notes.length
      }),
      { status: 200, headers: corsHeaders }
    )
  } catch (e: unknown) {
    console.error("R2 下载异常:", e)
    const errorMessage = e instanceof Error ? e.message : String(e)
    await logToD1(context.env, 'error', 'r2.download.exception', { message: errorMessage })
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: corsHeaders }
    )
  }
}
