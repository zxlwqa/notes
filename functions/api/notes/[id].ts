// 类型定义
type PagesFunction = (context: { request: Request; env: any }) => Promise<Response>;

// 统一的API处理函数（动态路由 /api/notes/:id）
export const onRequest: PagesFunction = async ({ request, env }) => {
  const method = request.method;

  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }

  switch (method) {
    case 'GET':
      return handleGet({ request, env });
    case 'PUT':
      return handlePut({ request, env });
    case 'DELETE':
      return handleDelete({ request, env });
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

const extractNoteId = (request: Request): string | null => {
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  // 期望形如 ['api', 'notes', ':id']
  return parts.length >= 3 ? parts[2] : null;
}

const ensureAuth = async (request: Request, env: any): Promise<Response | null> => {
  const password = request.headers.get("Authorization")?.replace("Bearer ", "");
  let effectivePassword = env.PASSWORD as string | undefined;
  let useD1Password = false;
  try {
    await env.DB?.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)`);
    const flagRow: any = await env.DB?.prepare(`SELECT value FROM settings WHERE key = 'password_set'`).first();
    useD1Password = (flagRow?.value === 'true');
    if (useD1Password) {
      const row: any = await env.DB?.prepare(`SELECT value FROM settings WHERE key = 'password'`).first();
      if (row?.value) effectivePassword = row.value;
    }
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
  return null;
}

const toIso = (s: string | null | undefined) => {
  if (!s) return new Date().toISOString();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
    return s.replace(' ', 'T') + 'Z'
  }
  return s
}

// GET /api/notes/:id
const handleGet: PagesFunction = async ({ request, env }) => {
  const auth = await ensureAuth(request, env);
  if (auth) return auth;

  try {
    const noteId = extractNoteId(request);
    if (!noteId) {
      return new Response(JSON.stringify({ error: "Note ID required" }), { 
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

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

    // 解析tags字段
    let tags = [];
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
  } catch (error) {
    console.error('Database error:', error);
    return new Response(JSON.stringify({ error: "Internal server error" }), { 
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
}

// PUT /api/notes/:id
const handlePut: PagesFunction = async ({ request, env }) => {
  const auth = await ensureAuth(request, env);
  if (auth) return auth;

  try {
    const noteId = extractNoteId(request);
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
    const { title, content, tags } = requestBody || {};
    if (typeof title !== 'string' || typeof content !== 'string') {
      return new Response(JSON.stringify({ error: "Invalid title or content" }), { 
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    // 验证tags字段
    let tagsArray = [];
    if (tags) {
      if (Array.isArray(tags)) {
        tagsArray = tags;
      } else {
        console.log('Invalid tags type:', typeof tags);
        return new Response(JSON.stringify({ error: "Tags must be an array" }), { 
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        });
      }
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

    const tagsJson = JSON.stringify(tagsArray);
    const result = await env.DB.prepare(
      `UPDATE notes SET title = ?, content = ?, tags = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%S','now','+8 hours') || '+08:00' WHERE id = ?`
    ).bind(title, content, tagsJson, noteId).run();

    console.log('Update result:', result);

    return Response.json({ success: true }, { 
      headers: {
        'Access-Control-Allow-Origin': '*',
      }
    });
  } catch (error) {
    console.error('Database error:', error);
    return new Response(JSON.stringify({ error: "Internal server error" }), { 
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
}

// DELETE /api/notes/:id
const handleDelete: PagesFunction = async ({ request, env }) => {
  console.log('Delete request received in [id].ts');
  
  const auth = await ensureAuth(request, env);
  if (auth) return auth;

  try {
    const noteId = extractNoteId(request);
    console.log('Delete request - Note ID:', noteId);
    
    if (!noteId) {
      return new Response(JSON.stringify({ error: "Note ID required" }), { 
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    // 先检查笔记是否存在
    console.log('Checking if note exists before deletion...');
    const existingNote = await env.DB.prepare(`SELECT id FROM notes WHERE id = ?`).bind(noteId).first();
    console.log('Existing note check result:', existingNote);
    
    if (!existingNote) {
      console.log('Note not found for deletion:', noteId);
      return new Response(JSON.stringify({ error: "Note not found" }), { 
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    console.log('Note exists, attempting to delete:', noteId);
    const deleteResult = await env.DB.prepare(`DELETE FROM notes WHERE id = ?`).bind(noteId).run();
    console.log('Delete result:', deleteResult);

    return Response.json({ success: true }, { 
      headers: {
        'Access-Control-Allow-Origin': '*',
      }
    });
  } catch (error) {
    console.error('Delete database error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    return new Response(JSON.stringify({ error: "Internal server error", details: error.message }), { 
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
}
