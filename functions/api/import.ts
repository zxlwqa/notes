import { logToD1 } from '../_utils/log'
import type { PagesFunction, D1Database } from '../types'

export const onRequestPost: PagesFunction<{
  NOTESD: D1Database;
  PASSWORD?: string;
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
      await env.NOTESD.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)`);
      const row = await env.NOTESD.prepare(`SELECT value FROM settings WHERE key = 'password'`).first<{ value: string }>();
      const flagRow = await env.NOTESD.prepare(`SELECT value FROM settings WHERE key = 'password_set'`).first<{ value: string }>();
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

    await env.NOTESD.exec(`CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, title TEXT, content TEXT, tags TEXT, created_at TEXT, updated_at TEXT)`);

    const { notes } = await request.json();
    
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

        await env.NOTESD.prepare(`INSERT INTO notes (id, title, content, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title = excluded.title, content = excluded.content, tags = excluded.tags, updated_at = excluded.updated_at`).bind(noteId, title, content, tags, now, now).run();

        importedCount++;
      } catch (error: unknown) {
        console.error('Import note error:', error);
        const errorMessage = error instanceof Error ? error.message : String(error)
        errors.push(`笔记 "${note.title || '无标题'}" 导入失败: ${errorMessage}`);
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
    const errorMessage = error instanceof Error ? error.message : String(error)
    await logToD1(env, 'error', 'import.exception', { message: errorMessage })
    return new Response(JSON.stringify({ 
      error: "Internal server error",
      details: errorMessage 
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
};