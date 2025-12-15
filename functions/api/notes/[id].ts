import { logToD1 } from '../../_utils/log'
import type { PagesFunction, D1Database } from '../../types'

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
  return parts.length >= 3 ? parts[2] : null;
}

const ensureAuth = async (request: Request, env: { NOTESD?: D1Database; PASSWORD?: string }): Promise<Response | null> => {
  const password = request.headers.get("Authorization")?.replace("Bearer ", "");
  let effectivePassword = env.PASSWORD as string | undefined;
  let useD1Password = false;
  try {
    await env.NOTESD?.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)`);
    const flagRow = await env.NOTESD?.prepare(`SELECT value FROM settings WHERE key = 'password_set'`).first<{ value: string }>();
    useD1Password = (flagRow?.value === 'true');
    if (useD1Password) {
      const row = await env.NOTESD?.prepare(`SELECT value FROM settings WHERE key = 'password'`).first<{ value: string }>();
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

    const data = await env.NOTESD!.prepare(
      `SELECT id, title, content, tags, created_at, updated_at FROM notes WHERE id = ?`
    ).bind(noteId).first<{ id: string; title?: string; content?: string; tags?: string; created_at?: string; updated_at?: string }>();

    if (!data) {
      return new Response(JSON.stringify({ error: "Note not found" }), { 
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

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
  } catch (error: unknown) {
    console.error('Database error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    return new Response(JSON.stringify({ error: errorMessage }), { 
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
}

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

    let tagsArray: string[] = [];
    if (tags) {
      if (Array.isArray(tags)) {
        tagsArray = tags as string[];
      } else {
        console.warn('Invalid tags type:', typeof tags);
        return new Response(JSON.stringify({ error: "Tags must be an array" }), { 
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        });
      }
    }

    const existingNote = await env.NOTESD!.prepare(`SELECT id, title FROM notes WHERE id = ?`).bind(noteId).first<{ id: string; title?: string }>();
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
    const result = await env.NOTESD!.prepare(
      `UPDATE notes SET title = ?, content = ?, tags = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%S','now','+8 hours') WHERE id = ?`
    ).bind(title, content, tagsJson, noteId).run();

    console.warn('Update result:', result);

    return Response.json({ success: true }, { 
      headers: {
        'Access-Control-Allow-Origin': '*',
      }
    });
  } catch (error: unknown) {
    console.error('Database error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    return new Response(JSON.stringify({ error: errorMessage }), { 
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
}

const handleDelete: PagesFunction = async ({ request, env }) => {
  console.warn('Delete request received in [id].ts');
  
  const auth = await ensureAuth(request, env);
  if (auth) return auth;

  try {
    const noteId = extractNoteId(request);
    console.warn('Delete request - Note ID:', noteId);
    
    if (!noteId) {
      return new Response(JSON.stringify({ error: "Note ID required" }), { 
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    console.warn('Checking if note exists before deletion...');
    const existingNote = await env.NOTESD!.prepare(`SELECT id, title FROM notes WHERE id = ?`).bind(noteId).first<{ id: string; title?: string }>();
    console.warn('Existing note check result:', existingNote);
    
    if (!existingNote) {
      await logToD1(env, 'warn', 'notes.delete.not_found', { id: noteId })
      console.warn('Note not found for deletion:', noteId);
      return new Response(JSON.stringify({ error: "Note not found" }), { 
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    console.warn('Note exists, attempting to delete:', noteId);
    const deleteResult = await env.NOTESD!.prepare(`DELETE FROM notes WHERE id = ?`).bind(noteId).run();
    console.warn('Delete result:', deleteResult);
    await logToD1(env, 'info', 'notes.delete', { id: noteId, title: existingNote?.title || '无标题' })

    return Response.json({ success: true }, { 
      headers: {
        'Access-Control-Allow-Origin': '*',
      }
    });
  } catch (error: unknown) {
    console.error('Delete database error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    console.error('Error details:', {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined
    });
    try { await logToD1(env, 'error', 'notes.delete.exception', { message: errorMessage }) } catch {}
    return new Response(JSON.stringify({ error: "Internal server error", details: errorMessage }), { 
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
}