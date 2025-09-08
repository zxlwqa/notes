import { logToD1 } from '../_utils/log'
export const onRequestPost: PagesFunction = async ({ request, env }) => {
  // 处理CORS预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }

  try {
    const { currentPassword, newPassword } = await request.json()
    if (!currentPassword || !newPassword) {
      await logToD1(env, 'warn', 'password.change.missing_fields')
      return new Response(JSON.stringify({ error: 'Missing password fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Database not bound' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // 确保表存在
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)`)

    // 读取当前有效密码（根据 password_set 标志决定使用哪个密码）
    let storedPassword: string | null = null
    let useD1Password = false
    try {
      const row: any = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'password'`).first()
      const flagRow: any = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'password_set'`).first()
      storedPassword = row?.value || null
      useD1Password = (flagRow?.value === 'true')
    } catch (e) {
      console.error('Read password failed:', e)
    }
    
    const effectivePassword = useD1Password && storedPassword ? storedPassword : env.PASSWORD

    if (currentPassword !== effectivePassword) {
      await logToD1(env, 'warn', 'password.change.invalid_current')
      return new Response(JSON.stringify({ error: 'Invalid current password' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // 更新为新密码
    await env.DB.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('password', ?, strftime('%Y-%m-%dT%H:%M:%S','now','+8 hours') || '+08:00') ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%S','now','+8 hours') || '+08:00'`).bind(newPassword).run()
    await env.DB.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('password_set', 'true', strftime('%Y-%m-%dT%H:%M:%S','now','+8 hours') || '+08:00') ON CONFLICT(key) DO UPDATE SET value = 'true', updated_at = strftime('%Y-%m-%dT%H:%M:%S','now','+8 hours') || '+08:00'`).run()

    await logToD1(env, 'info', 'password.change.success')
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (error) {
    console.error('Change password error:', error)
    await logToD1(env, 'error', 'password.change.exception', { message: (error as any)?.message })
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
}
