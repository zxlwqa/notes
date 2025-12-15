import { neon } from '@neondatabase/serverless'
import { logError, logToDatabase } from '../../_utils/log.js'

export default async function onRequest(context) {
  const { request, env } = context
  const method = request.method
  
  console.warn('[PASSWORD] Request method:', method)
  console.warn('[PASSWORD] Environment variables:', Object.keys(env || {}))
  
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

  if (method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    })
  }

  try {
    const hasPassword = !!env.PASSWORD
    console.warn('[PASSWORD] Environment password status:', hasPassword)
    
    const sql = neon(env.DATABASE_URL)
    
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT,
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `
      
      const passwordRow = await sql`
        SELECT value FROM settings WHERE key = 'password'
      `
      
      const dbHasPassword = passwordRow.length > 0 && passwordRow[0].value
      const effectivePassword = dbHasPassword || hasPassword
      
      console.warn('[PASSWORD] Database password status:', { dbHasPassword, hasPassword, effectivePassword })
      
      try { await logToDatabase(env, 'info', 'password:get:success', { dbHasPassword, hasPassword, effectivePassword }) } catch {}
      return new Response(JSON.stringify({ 
        hasPassword: !!effectivePassword,
        message: effectivePassword ? 'Password is set' : 'No password set',
        source: dbHasPassword ? 'database' : 'environment'
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      })
    } catch (dbError) {
      console.error('[PASSWORD] Database connection failed:', dbError)
      logError('password:get:error', { message: dbError?.message }, env)
      
      console.warn('[PASSWORD] Database connection failed, using environment variables')
      return new Response(JSON.stringify({ 
        hasPassword,
        message: hasPassword ? 'Password is set' : 'No password set',
        source: 'environment'
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      })
    }
  } catch (error) {
    console.error('Password status error:', error)
    logError('password:unhandled', { message: error?.message }, env)
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    })
  }
}
