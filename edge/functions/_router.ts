import { getDb, ensureTables, appendLog } from './_db'

function json(data: any, init?: ResponseInit) {
  const headers = new Headers(init?.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  headers.set('access-control-allow-origin', '*')
  headers.set('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS')
  headers.set('access-control-allow-headers', 'Content-Type, Authorization')
  return new Response(JSON.stringify(data), { ...init, headers })
}

export default async function handleApi(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return json(null, { status: 204 })

  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/api\/?/, '/')

  try {
    const db = getDb()
    await ensureTables(db)

    if (path === '/login' && request.method === 'POST') {
      const { password } = await request.json().catch(() => ({} as any))
      if (!password || typeof password !== 'string') {
        await appendLog(db, 'warn', 'login.missing_password')
        return json({ error: 'Password is required' }, { status: 400 })
      }

      // 读取 password 来源：settings.password_set=true 时优先 DB
      let useDb = false
      let dbPassword: string | null = null
      try {
        const flag = await db`SELECT value FROM settings WHERE key = 'password_set'`
        useDb = (flag?.[0]?.value === 'true')
        if (useDb) {
          const row = await db`SELECT value FROM settings WHERE key = 'password'`
          dbPassword = row?.[0]?.value ?? null
        }
      } catch {}

      const envPassword = (globalThis as any)?.ENV?.PASSWORD || (typeof process !== 'undefined' ? process.env.PASSWORD : undefined)
      const effective = (useDb && dbPassword) ? dbPassword : envPassword

      if (password === effective) {
        const ip = request.headers.get('CF-Connecting-IP') || (request.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || request.headers.get('x-real-ip') || undefined
        const cf: any = (request as any)?.cf || {}
        const country = cf.country || undefined
        const city = cf.city || undefined
        const location = country ? country : (city || '')
        await appendLog(db, 'info', 'login.success', { ua: request.headers.get('user-agent'), ip, location })
        return json({ success: true })
      }
      await appendLog(db, 'warn', 'login.invalid_password')
      return json({ error: 'Invalid password' }, { status: 401 })
    }

    if (path === '/password/status' && request.method === 'GET') {
      let usingPostgreSQL = true
      let hasEnvPassword = !!((globalThis as any)?.ENV?.PASSWORD || (typeof process !== 'undefined' ? process.env.PASSWORD : undefined))
      let hasDbPassword = false
      let passwordSource: 'env' | 'postgresql' | 'none' = 'none'
      try {
        const flag = await db`SELECT value FROM settings WHERE key = 'password_set'`
        const useDb = (flag?.[0]?.value === 'true')
        if (useDb) {
          const row = await db`SELECT value FROM settings WHERE key = 'password'`
          hasDbPassword = !!row?.[0]?.value
        }
        passwordSource = useDb && hasDbPassword ? 'postgresql' : (hasEnvPassword ? 'env' : 'none')
      } catch {}
      return json({ usingD1: false, usingPostgreSQL, hasEnvPassword, hasDbPassword, passwordSource })
    }

    if (path === '/logs' && request.method === 'GET') {
      const rows = await db`SELECT id, level, message, meta, created_at FROM logs ORDER BY created_at DESC LIMIT 200`
      const items = (rows || []).map((row: any) => {
        let detail = ''
        const meta = row?.meta || null
        if (meta && typeof meta === 'object') {
          if (typeof meta.title === 'string' && meta.title) detail = meta.title
          else if (typeof meta.count === 'number') detail = `数量：${meta.count}`
          else if (typeof meta.id === 'string') detail = meta.id
          else if (typeof meta.location === 'string' && meta.location) {
            const ip = meta.ip || ''
            detail = `位置：${meta.location}${ip ? ` · IP：${ip}` : ''}`
          }
        }
        return { ...row, detail }
      })
      return json({ success: true, source: 'postgresql', count: items.length, items })
    }

    if (path === '/logs' && request.method === 'DELETE') {
      await db`DELETE FROM logs`
      return json({ success: true })
    }

    if (path === '/notes' && request.method === 'GET') {
      const rows = await db`SELECT id, title, content, tags, created_at, updated_at FROM notes ORDER BY updated_at DESC`
      return json(rows)
    }

    if (path === '/notes' && request.method === 'POST') {
      const body = await request.json().catch(() => ({} as any))
      const id = body?.id
      const title = body?.title || ''
      const content = body?.content || ''
      const tags = Array.isArray(body?.tags) ? body.tags.join(',') : (body?.tags || '')
      if (!id || !title) return json({ error: 'id/title required' }, { status: 400 })
      await db`INSERT INTO notes(id, title, content, tags) VALUES(${id}, ${title}, ${content}, ${tags}) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content, tags = EXCLUDED.tags, updated_at = NOW()`
      return json({ success: true })
    }

    const noteIdMatch = path.match(/^\/notes\/(.+)$/)
    if (noteIdMatch) {
      const noteId = decodeURIComponent(noteIdMatch[1])
      if (request.method === 'GET') {
        const rows = await db`SELECT id, title, content, tags, created_at, updated_at FROM notes WHERE id = ${noteId} LIMIT 1`
        if (!rows?.[0]) return json({ error: 'Not Found' }, { status: 404 })
        return json(rows[0])
      }
      if (request.method === 'PUT') {
        const body = await request.json().catch(() => ({} as any))
        const title = body?.title || ''
        const content = body?.content || ''
        const tags = Array.isArray(body?.tags) ? body.tags.join(',') : (body?.tags || '')
        await db`UPDATE notes SET title = ${title}, content = ${content}, tags = ${tags}, updated_at = NOW() WHERE id = ${noteId}`
        return json({ success: true })
      }
      if (request.method === 'DELETE') {
        await db`DELETE FROM notes WHERE id = ${noteId}`
        return json({ success: true })
      }
    }

    return json({ error: 'Not Found' }, { status: 404 })
  } catch (e: any) {
    return json({ error: 'Edge error', message: e?.message }, { status: 500 })
  }
}


