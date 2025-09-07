export const onRequestGet: PagesFunction = async ({ env }) => {
  try {
    // 从 D1 获取
    const db = (env as any)?.DB as D1Database | undefined
    if (db) {
      // 确保表和索引存在（分两条语句执行，避免多语句解析问题）
      await db.prepare(
        `CREATE TABLE IF NOT EXISTS logs (
          id INTEGER PRIMARY KEY,
          level TEXT,
          message TEXT NOT NULL,
          meta TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )`
      ).run()
      await db.prepare(
        `CREATE INDEX IF NOT EXISTS logs_created_at_idx ON logs(created_at)`
      ).run()
      const result = await db
        .prepare('SELECT id, level, message, meta, created_at FROM logs ORDER BY datetime(created_at) DESC LIMIT 200')
        .all()
      return new Response(
        JSON.stringify({
          success: true,
          source: 'd1',
          count: result.results?.length || 0,
          items: result.results || [],
        }),
        { headers: { 'content-type': 'application/json; charset=utf-8' } }
      )
    }

    // 如果没有日志后端，返回空结果
    return new Response(
      JSON.stringify({ success: true, source: 'none', count: 0, items: [] }),
      { headers: { 'content-type': 'application/json; charset=utf-8' } }
    )
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error?.message || '日志获取失败' }),
      { status: 500, headers: { 'content-type': 'application/json; charset=utf-8' } }
    )
  }
}

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'Content-Type, Authorization',
    },
  })
}

