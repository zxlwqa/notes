export async function logToD1(env: any, level: string, message: string, meta?: any) {
  try {
    if (!env?.DB) return
    // 建表
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY,
        level TEXT,
        message TEXT NOT NULL,
        meta TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`
    ).run()
    await env.DB.prepare(
      `CREATE INDEX IF NOT EXISTS logs_created_at_idx ON logs(created_at)`
    ).run()
    // 插入
    let metaText: string | null = null
    if (typeof meta === 'string') {
      metaText = meta
    } else if (meta !== undefined) {
      metaText = JSON.stringify(meta)
    }
    await env.DB.prepare(
      `INSERT INTO logs(level, message, meta, created_at) VALUES(?, ?, ?, datetime('now'))`
    ).bind(level, message, metaText).run()
  } catch (e) {
    // 静默失败，避免影响主流程
    console.error('logToD1 error:', e)
  }
}
