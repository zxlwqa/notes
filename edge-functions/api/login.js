import { neon } from '@neondatabase/serverless'
import { logError } from '../_utils/log.js'

export default async function onRequest(context) {
  const { request, env } = context
  console.warn('[LOGIN] Edge Function called')
  console.warn('[LOGIN] Environment variables:', Object.keys(env || {}))
  console.warn('[LOGIN] Context:', Object.keys(context))
  
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    })
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    })
  }

  try {
    const { password } = await request.json()
    const envPassword = env.PASSWORD || ''
    
    const sql = neon(env.DATABASE_URL)

    const getClientIp = (context) => {
      const headers = request.headers
      
      const ipHeaders = [
        'cf-connecting-ip',
        'x-real-ip',
        'x-forwarded-for',
        'client-ip',
        'x-client-ip',
        'x-edgeone-ip',
        'x-edge-ip',
        'x-forwarded-ip',
        'x-remote-addr',
        'remote-addr',
        'true-client-ip',
        'x-client-ipaddress',
        'client-address'
      ]
      
      for (const headerName of ipHeaders) {
        const value = headers.get(headerName)
        if (value) {
          if (headerName === 'x-forwarded-for') {
            const ips = value.split(',').map(ip => ip.trim())
            return ips[0]
          }
          return value
        }
      }
      
      if (context?.clientIP) {
        return context.clientIP
      }
      
      if (request?.cf?.connectingIP) {
        return request.cf.connectingIP
      }
      
      const host = headers.get('host')
      if (host && host.includes('edgeone')) {
        return 'EdgeOne CDN'
      }
      
      return '未知'
    }
    await sql`
      CREATE TABLE IF NOT EXISTS logs (
        id SERIAL PRIMARY KEY,
        level TEXT,
        message TEXT,
        meta TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `
    
    const ip = getClientIp(context)
    console.warn('[LOGIN] Client IP:', ip)
    
    if (!envPassword || password === envPassword) {
      try {
        const ipDisplay = ip && ip !== '未知' ? ip : 'EdgeOne CDN'
        await sql`
          INSERT INTO logs (level, message, meta) 
          VALUES ('info', '用户登录成功', ${'IP: ' + ipDisplay})
        `
        console.warn('[LOGIN] Login success logged to Neon database')
      } catch (dbError) {
        console.error('[LOGIN] Database log failed:', dbError)
        logError('login:log:error', { message: dbError?.message }, env)
      }
      
      return new Response(JSON.stringify({ 
        success: true,
        message: 'Login successful'
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      })
    }
    
    try {
      const ipDisplay = ip && ip !== '未知' ? ip : 'EdgeOne CDN'
      await sql`
        INSERT INTO logs (level, message, meta) 
        VALUES ('warn', '用户登录失败', ${'IP: ' + ipDisplay + ', 原因: 密码错误'})
      `
      console.warn('[LOGIN] Login failure logged to Neon database')
    } catch (dbError) {
      console.error('[LOGIN] Database log failed:', dbError)
      logError('login:log:error', { message: dbError?.message }, env)
    }
    
    return new Response(JSON.stringify({ 
      error: "Invalid password"
    }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    })
  } catch (error) {
    console.error('[LOGIN] Error:', error)
    logError('login:unhandled', { message: error?.message }, env)
    return new Response(JSON.stringify({ 
      error: "Internal server error", 
      details: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    })
  }
}
