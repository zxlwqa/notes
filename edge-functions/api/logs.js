import { neon } from '@neondatabase/serverless'

export default async function onRequest(context) {
  const { request, env } = context
  const method = request.method
  
  console.warn('[LOGS] Request method:', method)
  console.warn('[LOGS] Environment variables:', Object.keys(env || {}))
  
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

  if (method !== 'GET' && method !== 'DELETE') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    })
  }

  try {
    const sql = neon(env.DATABASE_URL)

    if (method === 'DELETE') {
      console.warn('[LOGS] Clearing logs table')
      try {
        await sql`DELETE FROM logs`
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        })
      } catch (dbError) {
        console.error('[LOGS] Database clear failed:', dbError)
        return new Response(JSON.stringify({ success: false, error: 'Database clear failed' }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        })
      }
    }

    console.warn('[LOGS] Getting logs from Neon database')
    try {
      const logs = await sql`
        SELECT id, level, message, meta, created_at 
        FROM logs 
        ORDER BY created_at DESC 
        LIMIT 100
      `

      const items = logs.map(log => ({
        id: log.id,
        level: log.level,
        message: log.message,
        meta: log.meta ?? null,
        created_at: (log.created_at instanceof Date ? log.created_at : new Date(log.created_at)).toISOString(),
      }))

      console.warn('[LOGS] Database connection successful, logs count:', items.length)
      return new Response(JSON.stringify({ items, total: items.length }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      })
    } catch (dbError) {
      console.error('[LOGS] Database query failed:', dbError)
      return new Response(JSON.stringify({ items: [], total: 0 }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      })
    }
  } catch (error) {
    console.error('Logs error:', error)
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    })
  }
}
