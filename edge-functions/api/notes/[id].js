import { neon } from '@neondatabase/serverless'
import { logError, logToDatabase } from '../../_utils/log.js'

export default async function onRequest(context) {
  const { request, params, env } = context
  const method = request.method
  
  console.warn('[NOTE] Request method:', method)
  console.warn('[NOTE] Note ID:', params.id)
  console.warn('[NOTE] Environment variables:', Object.keys(env || {}))
  
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
    const noteId = params.id
    const sql = neon(env.DATABASE_URL)

    if (method === 'GET') {
      console.warn('[NOTE] Getting note from Neon database:', noteId)
      
      try {
        const notes = await sql`
          SELECT id, title, content, tags, created_at, updated_at 
          FROM notes 
          WHERE id = ${noteId}
        `
        
        if (notes.length === 0) {
          return new Response(JSON.stringify({ error: 'Note not found' }), {
            status: 404,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            }
          })
        }
        
        const note = notes[0]
        const formattedNote = {
          id: note.id,
          title: note.title,
          content: note.content,
          tags: note.tags ? JSON.parse(note.tags) : [],
          createdAt: note.created_at?.toISOString() || new Date().toISOString(),
          updatedAt: note.updated_at?.toISOString() || new Date().toISOString(),
        }
        
        console.warn('[NOTE] Note found in Neon database:', note.id)
        try { await logToDatabase(env, 'info', 'note:get:success', { id: note.id }) } catch {}
        return new Response(JSON.stringify(formattedNote), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        })
      } catch (dbError) {
        console.error('[NOTE] Database query failed:', dbError)
        logError('note:get:error', { id: noteId, message: dbError?.message }, env)
        return new Response(JSON.stringify({ error: 'Database query failed' }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        })
      }
    }

    if (method === 'PUT') {
      const body = await request.json()
      const { title, content, tags } = body
      
      console.warn('[NOTE] Updating note in Neon database:', noteId)
      
      try {
        await sql`
          UPDATE notes 
          SET title = ${title}, content = ${content}, tags = ${JSON.stringify(tags || [])}, updated_at = NOW()
          WHERE id = ${noteId}
        `
        
        console.warn('[NOTE] Note updated in Neon database successfully')
        try { await logToDatabase(env, 'info', 'note:put:success', { id: noteId }) } catch {}
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        })
      } catch (dbError) {
        console.error('[NOTE] Database update failed:', dbError)
        logError('note:put:error', { id: noteId, message: dbError?.message }, env)
        return new Response(JSON.stringify({ error: 'Database update failed' }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        })
      }
    }

    if (method === 'DELETE') {
      console.warn('[NOTE] Deleting note from Neon database:', noteId)
      
      try {
        await sql`
          DELETE FROM notes WHERE id = ${noteId}
        `
        
        console.warn('[NOTE] Note deleted from Neon database successfully')
        try { await logToDatabase(env, 'info', 'note:delete:success', { id: noteId }) } catch {}
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        })
      } catch (dbError) {
        console.error('[NOTE] Database delete failed:', dbError)
        logError('note:delete:error', { id: noteId, message: dbError?.message }, env)
        return new Response(JSON.stringify({ error: 'Database delete failed' }), {
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
    console.error('Note operation error:', error)
    logError('note:unhandled', { message: error?.message }, env)
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    })
  }
}
