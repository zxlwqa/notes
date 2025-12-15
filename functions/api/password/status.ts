import type { PagesFunction, D1Database } from '../../types'

export const onRequestGet: PagesFunction<{
  NOTESD: D1Database;
  PASSWORD?: string;
}> = async ({ request, env }) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    const password = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!password) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    let effectivePassword = env.PASSWORD as string | undefined;
    let useD1Password = false;
    try {
      await env.NOTESD.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)`);
      const row = await env.NOTESD.prepare(`SELECT value FROM settings WHERE key = 'password'`).first<{ value: string }>();
      const flagRow = await env.NOTESD.prepare(`SELECT value FROM settings WHERE key = 'password_set'`).first<{ value: string }>();
      useD1Password = (flagRow?.value === 'true');
      if (useD1Password && row?.value) effectivePassword = row.value;
    } catch (e) {
      console.error('Read password from D1 failed:', e);
    }

    if (!effectivePassword || password !== effectivePassword) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    const hasEnvPassword = Boolean(env.PASSWORD);
    
    const hasDbPassword = useD1Password && Boolean(effectivePassword);

    return Response.json({
      success: true,
      usingD1: true,
      usingPostgreSQL: false,
      hasEnvPassword,
      hasDbPassword,
      passwordSource: useD1Password ? 'd1' : 'env'
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
      }
    });

  } catch (error) {
    console.error('Password status API error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error)
    return new Response(JSON.stringify({ 
      error: "Internal server error",
      details: errorMessage 
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
};