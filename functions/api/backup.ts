import { logToD1 } from '../_utils/log'
// 上传备份
export const onRequestPost: PagesFunction<{
  DB: D1Database;
  WEBDAV_URL: string;
  WEBDAV_USER: string;
  WEBDAV_PASS: string;
}> = async (context) => {
  // CORS处理
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }
  // 1. 查询所有笔记内容
  let content = "";
  let notesCount = 0;
  try {
    const { results } = await context.env.DB.prepare("SELECT content FROM notes").all();
    notesCount = results.length;
    if (notesCount === 0) {
      await logToD1(context.env, 'warn', 'backup.upload.no_notes')
      return new Response(
        JSON.stringify({ success: false, error: "没有可导出的笔记" }),
        { status: 404, headers: corsHeaders }
      );
    }
    // 将所有笔记内容用分隔符连接成一个文本
    content = results.map((row: any) => row.content).join('\n\n---\n\n');
  } catch (e) {
    console.error("数据库读取失败:", e);
    await logToD1(context.env, 'error', 'backup.upload.db_error', { message: (e as any)?.message })
    return new Response(
      JSON.stringify({ success: false, error: "数据库读取失败" }),
      { status: 500, headers: corsHeaders }
    );
  }

  // 2. WebDAV 配置，从环境变量读取
  const webdavFolder = context.env.WEBDAV_URL;
  const username = context.env.WEBDAV_USER;
  const password = context.env.WEBDAV_PASS;

  // 3. 固定文件名，保证每次覆盖同一个文件
  const filename = `notes-latest.md`;

  // 4. 拼接完整上传路径
  const webdavUrl = webdavFolder.endsWith('/')
    ? webdavFolder + filename
    : webdavFolder + '/' + filename;

  // 5. 通过 HTTP PUT 上传，覆盖旧文件
  try {
    const res = await fetch(webdavUrl, {
      method: "PUT",
      headers: {
        "Authorization": "Basic " + btoa(username + ":" + password),
        "Content-Type": "text/markdown; charset=utf-8"
      },
      body: new TextEncoder().encode(content) // 兼容中文字符编码
    });

    if (res.ok) {
      await logToD1(context.env, 'info', 'backup.upload.success', { fileName: filename, totalNotes: notesCount })
      // 上传成功，返回成功信息和文件信息
      return new Response(
        JSON.stringify({ 
          success: true, 
          url: webdavUrl,
          fileName: filename,
          totalNotes: notesCount,
          uploadTime: new Date().toISOString()
        }),
        { status: 200, headers: corsHeaders }
      );
    } else {
      // 上传失败，打印并返回错误信息
      const errorText = await res.text();
      console.error("上传失败:", errorText);
      await logToD1(context.env, 'error', 'backup.upload.failed', { status: res.status })
      return new Response(
        JSON.stringify({ success: false, status: res.status, error: errorText }),
        { status: 500, headers: corsHeaders }
      );
    }
  } catch (e: any) {
    // 捕获网络或其他异常
    console.error("WebDAV 上传异常:", e);
    await logToD1(context.env, 'error', 'backup.upload.exception', { message: e.message })
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 500, headers: corsHeaders }
    );
  }
};

// 下载备份
export const onRequestGet: PagesFunction<{
  DB: D1Database;
  WEBDAV_URL: string;
  WEBDAV_USER: string;
  WEBDAV_PASS: string;
}> = async (context) => {
  // CORS处理
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }
  // 1. WebDAV 配置，从环境变量读取
  const webdavFolder = context.env.WEBDAV_URL;
  const username = context.env.WEBDAV_USER;
  const password = context.env.WEBDAV_PASS;

  // 2. 固定文件名
  const filename = `notes-latest.md`;

  // 3. 拼接完整下载路径
  const webdavUrl = webdavFolder.endsWith('/')
    ? webdavFolder + filename
    : webdavFolder + '/' + filename;

  // 4. 从 WebDAV 下载文件
  try {
    const res = await fetch(webdavUrl, {
      method: "GET",
      headers: {
        "Authorization": "Basic " + btoa(username + ":" + password)
      }
    });

    if (res.ok) {
      const content = await res.text();
      
      // 5. 解析Markdown内容并导入到数据库
      const notes = parseMarkdownToNotes(content);
      
      if (notes.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: "备份文件中没有找到笔记内容" }),
          { status: 400 }
        );
      }

      // 6. 清空现有笔记并导入新笔记
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
          updatedCount: 0, // backup.ts 使用清空重建方式，所以更新数量为0
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

// 解析Markdown内容为笔记数组
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

  // 按分隔符分割笔记
  const noteContents = content.split('\n\n---\n\n').filter(note => note.trim());
  
  noteContents.forEach((noteContent, index) => {
    const trimmedContent = noteContent.trim();
    if (trimmedContent) {
      // 提取标题（第一行或前50个字符）
      const lines = trimmedContent.split('\n');
      const firstLine = lines[0].trim();
      const title = firstLine.length > 50 ? firstLine.substring(0, 50) + '...' : firstLine;
      
      notes.push({
        id: `imported-${Date.now()}-${index}`,
        title: title || `导入笔记 ${index + 1}`,
        content: trimmedContent,
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
  });

  return notes;
}
