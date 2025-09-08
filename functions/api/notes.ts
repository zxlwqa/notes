import { logToD1 } from '../_utils/log'
type PagesFunction = (context: { request: Request; env: any }) => Promise<Response>;

export const onRequest: PagesFunction = async ({ request, env }) => {
  const method = request.method;
  
  if (!env.DB) {
    return new Response(
      JSON.stringify({
        error: "Database not bound",
        message:
          "⚠️ D1 数据库尚未绑定",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  switch (method) {
    case 'GET':
      return handleGet({ request, env });
    case 'POST':
      return handlePost({ request, env });
    case 'PUT':
      return handlePut({ request, env });
    case 'DELETE':
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    default:
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
  }
};

const handleGet: PagesFunction = async ({ request, env }) => {
  const password = request.headers.get("Authorization")?.replace("Bearer ", "");
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
  if (!password || !effectivePassword || password !== effectivePassword) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }

  try {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/').filter(part => part);

    if (pathParts.length >= 3 && pathParts[2]) {

      const noteId = pathParts[2];
      const data = await env.DB.prepare(
        `SELECT id, title, content, tags, created_at, updated_at FROM notes WHERE id = ?`
      ).bind(noteId).first();

      if (!data) {
        return new Response(JSON.stringify({ error: "Note not found" }), {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        });
      }

      const toIso = (s: string | null | undefined) => {
        if (!s) return new Date().toISOString();
        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
          return s.replace(' ', 'T') + 'Z';
        }
        return s;
      };

      let tags: string[] = [];
      try {
        tags = data.tags ? JSON.parse(data.tags) : [];
      } catch (e) {
        console.error('Error parsing tags:', e);
        tags = [];
      }

      return Response.json({
        id: data.id,
        title: data.title || '无标题',
        content: data.content || '',
        tags: tags,
        createdAt: toIso(data.created_at),
        updatedAt: toIso(data.updated_at)
      }, {
        headers: {
          'Access-Control-Allow-Origin': '*',
        }
      });
    } else {
      const { results } = await env.DB.prepare(
        `SELECT id, title, content, tags, created_at, updated_at FROM notes ORDER BY updated_at DESC`
      ).all();

      const toIso = (s: string | null | undefined) => {
        if (!s) return new Date().toISOString();
        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
          return s.replace(' ', 'T') + 'Z';
        }
        return s;
      };

      const notes = results.map((note: any) => {
        let tags = [];
        try {
          tags = note.tags ? JSON.parse(note.tags) : [];
        } catch (e) {
          console.error('Error parsing tags:', e);
          tags = [];
        }

        return {
          id: note.id,
          title: note.title || '无标题',
          content: note.content || '',
          tags: tags,
          createdAt: toIso(note.created_at),
          updatedAt: toIso(note.updated_at)
        };
      });

      await logToD1(env, 'info', 'notes.list', { count: notes.length })
      return Response.json(notes, {
        headers: {
          'Access-Control-Allow-Origin': '*',
        }
      });
    }
  } catch (error) {
    console.error('Database error:', error);
    await logToD1(env, 'error', 'notes.get.exception', { message: (error as any)?.message })
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
};

const handlePost: PagesFunction = async ({ request, env }) => {
  const password = request.headers.get("Authorization")?.replace("Bearer ", "");
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
  if (!password || !effectivePassword || password !== effectivePassword) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }

  try {
    const body = await request.json();

    if (body.content && !body.title) {
      await env.DB.prepare(
        `INSERT INTO notes (id, title, content, created_at, updated_at) VALUES (1, '默认笔记', ?, strftime('%Y-%m-%dT%H:%M:%S','now','+8 hours'), strftime('%Y-%m-%dT%H:%M:%S','now','+8 hours')) ON CONFLICT(id) DO UPDATE SET content = excluded.content, updated_at = strftime('%Y-%m-%dT%H:%M:%S','now','+8 hours')`
      ).bind(body.content).run();

      return Response.json({ success: true }, {
        headers: {
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    const { title, content, tags } = body;
    if (typeof title !== 'string' || typeof content !== 'string') {
      return new Response(JSON.stringify({ error: "Invalid title or content" }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    let tagsArray: string[] = [];
    if (tags) {
      if (Array.isArray(tags)) {
        tagsArray = tags;
      } else {
        return new Response(JSON.stringify({ error: "Tags must be an array" }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        });
      }
    }

    const noteId = Date.now().toString();
    const tagsJson = JSON.stringify(tagsArray);
    await env.DB.prepare(
      `INSERT INTO notes (id, title, content, tags, created_at, updated_at) VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%S','now','+8 hours'), strftime('%Y-%m-%dT%H:%M:%S','now','+8 hours'))`
    ).bind(noteId, title, content, tagsJson).run();

    await logToD1(env, 'info', 'notes.create', { id: noteId, title })
    return Response.json({
      success: true,
      id: noteId
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
      }
    });
  } catch (error) {
    console.error('Database error:', error);
    await logToD1(env, 'error', 'notes.create.exception', { message: (error as any)?.message })
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
};

const handlePut: PagesFunction = async ({ request, env }) => {
  const password = request.headers.get("Authorization")?.replace("Bearer ", "");
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
  if (!password || !effectivePassword || password !== effectivePassword) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }

  try {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/').filter(part => part);
    const noteId = pathParts[2];

    if (!noteId) {
      return new Response(JSON.stringify({ error: "Note ID required" }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    const requestBody = await request.json();
    const { title, content, tags } = requestBody;
    if (typeof title !== 'string' || typeof content !== 'string') {
      return new Response(JSON.stringify({ error: "Invalid title or content" }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    const existingNote = await env.DB.prepare(`SELECT id FROM notes WHERE id = ?`).bind(noteId).first();
    if (!existingNote) {
      return new Response(JSON.stringify({ error: "Note not found" }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    let tagsArray: string[] = [];
    if (tags) {
      if (Array.isArray(tags)) {
        tagsArray = tags;
      } else {
        return new Response(JSON.stringify({ error: "Tags must be an array" }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        });
      }
    }

    const tagsJson = JSON.stringify(tagsArray);
    await env.DB.prepare(
      `UPDATE notes SET title = ?, content = ?, tags = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%S','now','+8 hours') WHERE id = ?`
    ).bind(title, content, tagsJson, noteId).run();

    await logToD1(env, 'info', 'notes.update', { id: noteId })
    return Response.json({ success: true }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
      }
    });
  } catch (error) {
    console.error('Database error:', error);
    await logToD1(env, 'error', 'notes.update.exception', { message: (error as any)?.message })
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
};
