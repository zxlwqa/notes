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

      const items = (result.results || []).map((row: any) => {
        let detail = ''
        let parsed: any = null
        try {
          parsed = row.meta ? JSON.parse(row.meta) : null
        } catch {}

        // 规则：优先展示 title；其次展示 count/id；若 meta 是字符串则直接展示
        if (parsed && typeof parsed === 'object') {
          if (typeof parsed.title === 'string' && parsed.title) {
            detail = parsed.title
          } else if (typeof parsed.count === 'number') {
            detail = `数量：${parsed.count}`
          } else if (typeof parsed.id === 'string') {
            detail = parsed.id
          }
        } else if (typeof row.meta === 'string' && row.meta && row.meta[0] !== '{') {
          // 非 JSON 的纯文本
          detail = row.meta
        }

        return { ...row, detail }
      })

      return new Response(
        JSON.stringify({
          success: true,
          source: 'd1',
          count: items.length,
          items,
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

export const onRequestDelete: PagesFunction = async ({ env }) => {
  try {
    const db = (env as any)?.DB as D1Database | undefined
    if (!db) {
      return new Response(JSON.stringify({ success: false, error: 'Database not bound' }), {
        status: 500,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      })
    }
    await db.prepare(
      `CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY,
        level TEXT,
        message TEXT NOT NULL,
        meta TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`
    ).run()
    const res = await db.prepare('DELETE FROM logs').run()
    return new Response(
      JSON.stringify({ success: true, deleted: (res as any)?.meta?.changes ?? null }),
      { headers: { 'content-type': 'application/json; charset=utf-8' } }
    )
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error?.message || '清空日志失败' }),
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
