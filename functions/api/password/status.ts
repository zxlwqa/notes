export const onRequestGet: PagesFunction<{
  DB: D1Database;
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
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)`);
      const row: any = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'password'`).first();
      const flagRow: any = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'password_set'`).first();
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

    // 检查是否有环境变量密码
    const hasEnvPassword = Boolean(env.PASSWORD);
    
    // 检查数据库中是否有密码设置
    const hasDbPassword = useD1Password && Boolean(effectivePassword);

    return Response.json({
      success: true,
      usingD1: true, // Cloudflare Pages 使用 D1
      usingPostgreSQL: false, // Cloudflare Pages 不使用 PostgreSQL
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
    return new Response(JSON.stringify({ 
      error: "Internal server error",
      details: error.message 
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
};
