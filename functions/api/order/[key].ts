import { logToD1 } from '../../_utils/log'
import type { PagesFunction } from '../../types'

export const onRequest: PagesFunction = async ({ request, env }) => {
  const method = request.method;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }

  if (method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  if (!env.NOTESD) {
    return new Response(JSON.stringify({ success: false, error: 'D1 database not available' }), {
      status: 500,
      headers: corsHeaders
    })
  }

  const extractKey = (request: Request): string | null => {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    return parts.length >= 3 ? parts[2] : null;
  }

  const key = extractKey(request)
  
  if (!key) {
    return new Response(JSON.stringify({ success: false, error: 'Key is required' }), {
      status: 400,
      headers: corsHeaders
    })
  }

  const auth = request.headers.get('Authorization') || ''
  const envPassword = env.PASSWORD as string | undefined
  if (envPassword && auth !== `Bearer ${envPassword}`) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401,
      headers: corsHeaders
    })
  }

  try {
    await env.NOTESD.exec(`
      CREATE TABLE IF NOT EXISTS order_data (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)
  } catch (e) {
    console.error('Failed to create order_data table:', e)
  }

  if (method === 'GET') {
    try {
      const row = await env.NOTESD.prepare(`SELECT value FROM order_data WHERE key = ?`).bind(key).first<{ value: string }>()
      
      if (!row || !row.value) {
        return Response.json({ success: true, data: null }, { headers: corsHeaders })
      }
      
      let parsed = null
      try {
        parsed = row.value ? JSON.parse(row.value) : null
      } catch {
        parsed = row.value
      }
      
      return Response.json({ success: true, data: parsed }, { headers: corsHeaders })
    } catch (error) {
      console.error('Order GET error:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      await logToD1(env, 'error', 'order.get_error', { message: errorMessage })
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Internal server error',
        details: errorMessage
      }), {
        status: 500,
        headers: corsHeaders
      })
    }
  }

  if (method === 'POST') {
    try {
      const value = await request.json()
      
      if (typeof value === 'undefined') {
        return new Response(JSON.stringify({ success: false, error: 'Value is required' }), {
          status: 400,
          headers: corsHeaders
        })
      }
      
      const valueStr = JSON.stringify(value)
      const now = new Date().toISOString()
      
      await env.NOTESD.prepare(
        `INSERT INTO order_data (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      ).bind(key, valueStr, now).run()
      
      try {
        await logToD1(env, 'info', 'order.saved', { key })
      } catch (e) {
        console.error('Failed to log order save:', e)
      }
      
      return Response.json({ success: true }, { headers: corsHeaders })
    } catch (error) {
      console.error('Order POST error:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      await logToD1(env, 'error', 'order.post_error', { message: errorMessage })
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Internal server error',
        details: errorMessage
      }), {
        status: 500,
        headers: corsHeaders
      })
    }
  }

  return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
    status: 405,
    headers: corsHeaders
  })
}
