import { logToD1 } from '../_utils/log'

export const onRequestPost: PagesFunction = async ({ request, env }) => {
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
    const { password } = await request.json();
    
    if (!password || typeof password !== 'string') {
      await logToD1(env, 'warn', 'login.missing_password')
      return new Response(JSON.stringify({ error: "Password is required" }), { 
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }
    if (!env.DB) {
      console.error('D1 not bound, fallback to env.PASSWORD');
    }
    let storedPassword: string | null = null;
    let useD1Password = false;
    try {
      if (env.DB) {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)`);
        const row: any = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'password'`).first();
        storedPassword = row?.value || null;
        const flagRow: any = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'password_set'`).first();
        useD1Password = (flagRow?.value === 'true');
      }
    } catch (e) {
      console.error('Read password from D1 failed:', e);
    }

    const envPassword = env.PASSWORD as string | undefined;
    const effectivePassword = useD1Password && storedPassword ? storedPassword : envPassword;
    if (password === effectivePassword) {
      const ip = request.headers.get('CF-Connecting-IP')
        || (request.headers.get('x-forwarded-for') || '').split(',')[0]?.trim()
        || request.headers.get('x-real-ip')
        || undefined
      const cf: any = (request as any)?.cf || {}
      const country = cf.country || undefined
      const city = cf.city || undefined
      await logToD1(env, 'info', 'login.success', { ua: request.headers.get('user-agent'), ip, country, city })
      return Response.json(
        { success: true },
        { 
          headers: {
            'Access-Control-Allow-Origin': '*',
          }
        }
      );
    }
    
    await logToD1(env, 'warn', 'login.invalid_password')
    return new Response(JSON.stringify({ error: "Invalid password" }), { 
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    await logToD1(env, 'error', 'login.exception', { message: (error as any)?.message })
    return new Response(JSON.stringify({ error: "Internal server error" }), { 
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
};
