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
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now','+8 hours') || '+08:00')
      )`
    ).run()
    await env.DB.prepare(
      `CREATE INDEX IF NOT EXISTS logs_created_at_idx ON logs(created_at)`
    ).run()
    // 插入
    const metaJson = meta ? JSON.stringify(meta) : null
    await env.DB.prepare(
      `INSERT INTO logs(level, message, meta, created_at) VALUES(?, ?, ?, strftime('%Y-%m-%dT%H:%M:%S','now','+8 hours') || '+08:00')`
    ).bind(level, message, metaJson).run()
  } catch (e) {
    // 静默失败，避免影响主流程
    console.error('logToD1 error:', e)
  }
}
