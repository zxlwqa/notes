import { logToD1 } from '../_utils/log'
export const onRequestPost: PagesFunction<{
  DB: D1Database;
  WEBDAV_URL: string;
  WEBDAV_USER: string;
  WEBDAV_PASS: string;
}> = async (context) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }
  let content = "";
  let notesCount = 0;
  try {
    const { results } = await context.env.DB.prepare("SELECT id, title, content, tags, created_at, updated_at FROM notes").all();
    notesCount = results.length;
    if (notesCount === 0) {
      await logToD1(context.env, 'warn', 'backup.upload.no_notes')
      return new Response(
        JSON.stringify({ success: false, error: "没有可导出的笔记" }),
        { status: 404, headers: corsHeaders }
      );
    }
    content = results.map((row: any) => {
      const title = row.title || '无标题'
      const tags = row.tags ? JSON.parse(row.tags).join(', ') : ''
      const createdAt = row.created_at || ''
      const updatedAt = row.updated_at || ''
      const noteContent = row.content || ''
      
      return `# ${title}\n标签: ${tags}\n创建时间: ${createdAt}\n更新时间: ${updatedAt}\n\n${noteContent}`
    }).join('\n\n---\n\n');
  } catch (e) {
    console.error("数据库读取失败:", e);
    await logToD1(context.env, 'error', 'backup.upload.db_error', { message: (e as any)?.message })
    return new Response(
      JSON.stringify({ success: false, error: "数据库读取失败" }),
      { status: 500, headers: corsHeaders }
    );
  }

  const webdavFolder = context.env.WEBDAV_URL;
  const username = context.env.WEBDAV_USER;
  const password = context.env.WEBDAV_PASS;

  const filename = `notes.md`;

  const webdavUrl = webdavFolder.endsWith('/')
    ? webdavFolder + filename
    : webdavFolder + '/' + filename;

  try {
    const res = await fetch(webdavUrl, {
      method: "PUT",
      headers: {
        "Authorization": "Basic " + btoa(username + ":" + password),
        "Content-Type": "text/markdown; charset=utf-8"
      },
      body: new TextEncoder().encode(content)
    });

    if (res.ok) {
      await logToD1(context.env, 'info', 'backup.upload.success', { fileName: filename, totalNotes: notesCount })
      return new Response(
        JSON.stringify({ 
          success: true, 
          url: webdavUrl,
          fileName: filename,
          totalNotes: notesCount,
          uploadTime: new Date(Date.now() + 8 * 60 * 60 * 1000)
            .toISOString()
            .replace('Z', '')
            .replace(/\.\d{3}$/, '')
        }),
        { status: 200, headers: corsHeaders }
      );
    } else {
      const errorText = await res.text();
      console.error("上传失败:", errorText);
      await logToD1(context.env, 'error', 'backup.upload.failed', { status: res.status })
      return new Response(
        JSON.stringify({ success: false, status: res.status, error: errorText }),
        { status: 500, headers: corsHeaders }
      );
    }
  } catch (e: any) {
    console.error("WebDAV 上传异常:", e);
    await logToD1(context.env, 'error', 'backup.upload.exception', { message: e.message })
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 500, headers: corsHeaders }
    );
  }
};

export const onRequestGet: PagesFunction<{
  DB: D1Database;
  WEBDAV_URL: string;
  WEBDAV_USER: string;
  WEBDAV_PASS: string;
}> = async (context) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  const webdavFolder = context.env.WEBDAV_URL;
  const username = context.env.WEBDAV_USER;
  const password = context.env.WEBDAV_PASS;

  const filename = `notes.md`;

  const webdavUrl = webdavFolder.endsWith('/')
    ? webdavFolder + filename
    : webdavFolder + '/' + filename;

  try {
    const res = await fetch(webdavUrl, {
      method: "GET",
      headers: {
        "Authorization": "Basic " + btoa(username + ":" + password)
      }
    });

    if (res.ok) {
      const content = await res.text();
      
      const notes = parseMarkdownToNotes(content);
      
      if (notes.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: "备份文件中没有找到笔记内容" }),
          { status: 400 }
        );
      }

      await context.env.DB.prepare("DELETE FROM notes").run();
      
      let importedCount = 0;
      for (const note of notes) {
        try {
          await context.env.DB.prepare(`
            INSERT INTO notes (id, title, content, tags, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(
            note.id,
            note.title,
            note.content,
            JSON.stringify(note.tags || []),
            note.createdAt,
            note.updatedAt
          ).run();
          importedCount++;
        } catch (e) {
          console.error(`导入笔记失败:`, e);
        }
      }

      await logToD1(context.env, 'info', 'backup.download.success', { fileName: filename, importedCount })
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "笔记已成功从云端下载并导入",
          fileName: filename,
          importedCount: importedCount,
          updatedCount: 0,
          totalNotes: notes.length
        }),
        { status: 200, headers: corsHeaders }
      );
    } else {
      const errorText = await res.text();
      console.error("下载失败:", errorText);
      await logToD1(context.env, 'error', 'backup.download.failed', { status: res.status })
      return new Response(
        JSON.stringify({ success: false, status: res.status, error: errorText }),
        { status: 500, headers: corsHeaders }
      );
    }
  } catch (e: any) {
    console.error("WebDAV 下载异常:", e);
    await logToD1(context.env, 'error', 'backup.download.exception', { message: e.message })
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 500, headers: corsHeaders }
    );
  }
};

function parseMarkdownToNotes(content: string): Array<{
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}> {
  const notes: Array<{
    id: string;
    title: string;
    content: string;
    tags: string[];
    createdAt: string;
    updatedAt: string;
  }> = [];

  const noteContents = content.split('\n\n---\n\n').filter(note => note.trim());
  
  noteContents.forEach((noteContent, index) => {
    const trimmedContent = noteContent.trim();
    if (trimmedContent) {
      const lines = trimmedContent.split('\n');
      
      // 解析标题（第一行，去掉 # 前缀）
      let title = lines[0] || `导入笔记 ${index + 1}`
      if (title.startsWith('# ')) {
        title = title.slice(2)
      }
      
      // 解析元数据
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
      
      // 提取笔记内容（跳过元数据行）
      const noteContentText = lines.slice(contentStartIndex).join('\n')
      
      notes.push({
        id: `imported-${Date.now()}-${index}`,
        title,
        content: noteContentText,
        tags,
        createdAt,
        updatedAt
      });
    }
  });

  return notes;
}
