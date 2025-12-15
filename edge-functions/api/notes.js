import { neon } from '@neondatabase/serverless'
import { logError, logToDatabase } from '../_utils/log.js'

export default async function onRequest(context) {
  const { request, env } = context
  const method = request.method
  
  console.warn('[NOTES] Request method:', method)
  console.warn('[NOTES] Request URL:', request.url)
  console.warn('[NOTES] Environment variables:', Object.keys(env || {}))
  
  if (method === 'OPTIONS') {
    console.warn('[NOTES] Handling OPTIONS request')
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
    const sql = neon(env.DATABASE_URL)
    
    await sql`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `
    
    if (method === 'GET') {
      console.warn('[NOTES] Getting all notes from Neon database')
      
      try {
        const notes = await sql`
          SELECT id, title, content, tags, created_at, updated_at 
          FROM notes 
          ORDER BY updated_at DESC
        `
        
        const formattedNotes = notes.map(note => ({
          id: note.id,
          title: note.title,
          content: note.content,
          tags: note.tags ? JSON.parse(note.tags) : [],
          createdAt: note.created_at?.toISOString() || new Date().toISOString(),
          updatedAt: note.updated_at?.toISOString() || new Date().toISOString(),
        }))
        
        console.warn('[NOTES] Database connection successful, notes count:', formattedNotes.length)
        try { await logToDatabase(env, 'info', 'notes:get:success', { count: formattedNotes.length }) } catch {}
        return new Response(JSON.stringify(formattedNotes), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        })
      } catch (dbError) {
        console.error('[NOTES] Database query failed:', dbError)
        logError('notes:get:error', { message: dbError?.message }, env)
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        })
      }
    }

    if (method === 'POST') {
      console.warn('[NOTES] Creating note in Neon database')
      const body = await request.json()
      const { id, title, content, tags } = body
      
      if (!id || !title || !content) {
        return new Response(JSON.stringify({ success: false, error: 'Missing required fields' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        })
      }
      
      try {
        await sql`
          INSERT INTO notes (id, title, content, tags, created_at, updated_at) 
          VALUES (${id}, ${title}, ${content}, ${JSON.stringify(tags || [])}, NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET 
            title = EXCLUDED.title,
            content = EXCLUDED.content,
            tags = EXCLUDED.tags,
            updated_at = NOW()
        `
        
        console.warn('[NOTES] Note saved to Neon database successfully')
        try { await logToDatabase(env, 'info', 'notes:post:success', { id }) } catch {}
        return new Response(JSON.stringify({ success: true, id }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        })
      } catch (dbError) {
        console.error('[NOTES] Database save failed:', dbError)
        logError('notes:post:error', { message: dbError?.message }, env)
        return new Response(JSON.stringify({ success: false, error: 'Database save failed' }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        })
      }
    }

    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    })
  } catch (error) {
    console.error('[NOTES] Error:', error)
    logError('notes:unhandled', { message: error?.message }, env)
    return new Response(JSON.stringify({ success: false, error: 'Internal server error', details: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    })
  }
}
