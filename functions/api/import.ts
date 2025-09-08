import { logToD1 } from '../_utils/log'
export const onRequestPost: PagesFunction<{
  DB: D1Database;
}> = async ({ request, env }) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    const password = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!password) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    let effectivePassword = env.PASSWORD as string | undefined;
    let useD1Password = false;
    try {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)`);
      const row: any = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'password'`).first();
      const flagRow: any = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'password_set'`).first();
      useD1Password = (flagRow?.value === 'true');
      if (useD1Password && row?.value) effectivePassword = row.value;
    } catch (e) {
      console.error('Read password from D1 failed:', e);
    }

    if (!effectivePassword || password !== effectivePassword) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    await env.DB.exec(`CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, title TEXT, content TEXT, tags TEXT, created_at TEXT, updated_at TEXT)`);

    const { notes, format } = await request.json();
    
    if (!notes || !Array.isArray(notes)) {
      await logToD1(env, 'warn', 'import.invalid_notes')
      return new Response(JSON.stringify({ error: "Invalid notes data" }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    let importedCount = 0;
    let errors: string[] = [];

    for (const note of notes) {
      try {
        const noteId = note.id || Date.now().toString();
        const title = note.title || '导入的笔记';
        const content = note.content || '';
        const tags = note.tags ? JSON.stringify(note.tags) : JSON.stringify(['导入']);
        const now = new Date(Date.now() + 8 * 60 * 60 * 1000)
          .toISOString()
          .replace('Z', '')
          .replace(/\.\d{3}$/, '')

        await env.DB.prepare(`INSERT INTO notes (id, title, content, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title = excluded.title, content = excluded.content, tags = excluded.tags, updated_at = excluded.updated_at`).bind(noteId, title, content, tags, now, now).run();

        importedCount++;
      } catch (error) {
        console.error('Import note error:', error);
        errors.push(`笔记 "${note.title || '无标题'}" 导入失败: ${error.message}`);
        await logToD1(env, 'error', 'import.note_failed', { title: note.title || '无标题', message: (error as any)?.message })
      }
    }

    await logToD1(env, 'info', 'import.done', { imported: importedCount, total: notes.length })
    return Response.json({
      success: true,
      imported: importedCount,
      total: notes.length,
      errors: errors.length > 0 ? errors : undefined
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
      }
    });

  } catch (error) {
    console.error('Import API error:', error);
    await logToD1(env, 'error', 'import.exception', { message: (error as any)?.message })
    return new Response(JSON.stringify({ 
      error: "Internal server error",
      details: error.message 
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
};
